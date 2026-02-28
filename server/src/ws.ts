import { WebSocketServer, WebSocket } from 'ws';
import type { WSMessage, TaskDispatchPayload } from '../../shared/types';
import { store } from './store';
import { logWS, createLogEntry } from './ws-logger';

const clients = new Set<WebSocket>();

function broadcast(message: WSMessage) {
  const data = JSON.stringify(message);
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

/**
 * Normalize endpoint to an HTTP base URL.
 * Accepts ws://, wss://, http://, https:// — always returns http(s)://
 */
function toHttpBase(endpoint: string): string {
  return endpoint
    .replace(/^ws:\/\//, 'http://')
    .replace(/^wss:\/\//, 'https://')
    .replace(/\/+$/, '');
}

/**
 * Dispatch a task to an OpenClaw instance via the OpenResponses HTTP API.
 * Uses `POST /v1/responses` with SSE streaming.
 * Docs: https://docs.openclaw.ai/gateway/openresponses-http-api
 */
async function dispatchToInstance(instanceId: string, taskId: string, content: string, _newSession?: boolean) {
  const instance = store.getInstanceRaw(instanceId);
  if (!instance) return;

  const sessionUser = store.getSessionKey(instanceId);

  store.updateInstance(instanceId, { status: 'busy' });
  store.updateTask(taskId, { status: 'running' });

  broadcast({
    type: 'instance:status',
    payload: { instanceId, status: 'busy' },
    instanceId,
    timestamp: new Date().toISOString(),
  });

  const updatedTask = store.getTask(taskId);
  broadcast({
    type: 'task:status',
    payload: updatedTask || { taskId, status: 'running' },
    instanceId,
    taskId,
    sessionKey: sessionUser,
    timestamp: new Date().toISOString(),
  });

  const baseUrl = toHttpBase(instance.endpoint);
  const url = `${baseUrl}/v1/responses`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-openclaw-agent-id': 'main',
  };
  if (instance.token) {
    headers['Authorization'] = `Bearer ${instance.token}`;
  }

  const body = JSON.stringify({
    model: 'openclaw',
    input: content,
    stream: true,
    user: sessionUser,
  });

  logWS(createLogEntry('outbound', instanceId, instance.name, body));

  let fullText = '';
  let receivedCompletion = false;

  try {
    const controller = new AbortController();
    // Agent tool execution (bash, file read) can take many minutes
    const timeout = setTimeout(() => controller.abort(), 600_000); // 10min max

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        ...headers,
        'Connection': 'keep-alive',
      },
      body,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errText = await response.text().catch(() => response.statusText);
      logWS(createLogEntry('inbound', instanceId, instance.name, `HTTP ${response.status}: ${errText}`));
      handleTaskFailure(instanceId, taskId, `HTTP ${response.status}: ${errText.slice(0, 200)}`, sessionUser);
      return;
    }

    if (!response.body) {
      handleTaskFailure(instanceId, taskId, 'No response body', sessionUser);
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();

          if (data === '[DONE]') {
            logWS(createLogEntry('inbound', instanceId, instance.name, '[DONE]'));
            continue;
          }

          try {
            const event = JSON.parse(data);
            logWS(createLogEntry('inbound', instanceId, instance.name, data));

            if (event.type === 'response.completed' || event.type === 'response.failed') {
              receivedCompletion = true;
            }

            handleSSEEvent(event, instanceId, taskId, fullText, sessionUser);

            if (event.type === 'response.output_text.delta' && event.delta) {
              fullText += event.delta;
            }
          } catch {
            // not JSON, skip
          }
        }
      }
    }

    // Finalize if stream ended without explicit completion event
    const task = store.getTask(taskId);
    if (task && task.status === 'running') {
      const summary = fullText.slice(0, 500) || 'Task completed';
      store.updateTask(taskId, { status: 'completed', summary });
      store.updateInstance(instanceId, { status: 'online' });
      broadcast({
        type: 'task:complete',
        payload: { taskId, status: 'completed', summary },
        instanceId,
        taskId,
        sessionKey: sessionUser,
        timestamp: new Date().toISOString(),
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logWS(createLogEntry('inbound', instanceId, instance.name, `Error: ${message}`));

    const task = store.getTask(taskId);
    if (task && task.status === 'running') {
      if (fullText.length > 0 && !receivedCompletion) {
        const summary = fullText.slice(0, 500) + '\n\n[Connection lost — agent may still be running]';
        store.updateTask(taskId, { status: 'completed', summary });
        store.updateInstance(instanceId, { status: 'online' });
        broadcast({
          type: 'task:complete',
          payload: { taskId, status: 'completed', summary },
          instanceId,
          taskId,
          sessionKey: sessionUser,
          timestamp: new Date().toISOString(),
        });
      } else {
        handleTaskFailure(instanceId, taskId, message, sessionUser);
      }
    }
  }
}

function handleSSEEvent(
  event: Record<string, unknown>,
  instanceId: string,
  taskId: string,
  _accumulatedText: string,
  sessionKey: string,
) {
  const eventType = event.type as string;

  switch (eventType) {
    case 'response.output_text.delta': {
      const delta = (event.delta as string) || '';
      if (delta) {
        broadcast({
          type: 'task:stream',
          payload: { instanceId, taskId, chunk: delta, summary: delta.slice(0, 200) },
          instanceId,
          taskId,
          sessionKey,
          timestamp: new Date().toISOString(),
        });
      }
      break;
    }

    case 'response.output_text.done': {
      const text = (event.text as string) || '';
      store.updateTask(taskId, { summary: text.slice(0, 500) });
      break;
    }

    case 'response.completed': {
      const output = event.response as Record<string, unknown> | undefined;
      let summary = '';
      if (output?.output && Array.isArray(output.output)) {
        for (const item of output.output) {
          if (item.type === 'message' && Array.isArray(item.content)) {
            for (const part of item.content) {
              if (part.type === 'output_text') {
                summary += part.text || '';
              }
            }
          }
        }
      }
      store.updateTask(taskId, { status: 'completed', summary: summary.slice(0, 500) || 'Completed' });
      store.updateInstance(instanceId, { status: 'online' });
      broadcast({
        type: 'task:complete',
        payload: { taskId, status: 'completed', summary: summary.slice(0, 500) },
        instanceId,
        taskId,
        sessionKey,
        timestamp: new Date().toISOString(),
      });
      break;
    }

    case 'response.failed': {
      const error = event.error as Record<string, unknown> | undefined;
      const message = (error?.message as string) || 'Agent run failed';
      handleTaskFailure(instanceId, taskId, message, sessionKey);
      break;
    }
  }
}

function handleTaskFailure(instanceId: string, taskId: string, error: string, sessionKey?: string) {
  store.updateTask(taskId, { status: 'failed', summary: error });
  store.updateInstance(instanceId, { status: 'online' });
  broadcast({
    type: 'task:error',
    payload: { taskId, error },
    instanceId,
    taskId,
    sessionKey,
    timestamp: new Date().toISOString(),
  });
}

export function setupWebSocket(wss: WebSocketServer) {
  wss.on('connection', (ws) => {
    clients.add(ws);

    ws.send(JSON.stringify({
      type: 'instance:status',
      payload: {
        instances: store.getInstances(),
        stats: store.getStats(),
      },
      timestamp: new Date().toISOString(),
    }));

    ws.on('message', (data) => {
      try {
        const msg: WSMessage = JSON.parse(data.toString());

        if (msg.type === 'task:dispatch') {
          const { instanceId, content, taskId: clientTaskId, newSession } = msg.payload as TaskDispatchPayload;

          if (newSession) {
            store.resetSessionKey(instanceId);
          }
          const sessionKey = store.getSessionKey(instanceId);

          const task = store.createTask(instanceId, content, clientTaskId || msg.taskId || undefined);

          broadcast({
            type: 'task:status',
            payload: { ...task },
            instanceId,
            taskId: task.id,
            sessionKey,
            timestamp: new Date().toISOString(),
          });

          dispatchToInstance(instanceId, task.id, content, false);
        }
      } catch {
        // ignore parse errors
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
    });
  });

  // Periodic health check via OpenResponses API probe
  setInterval(async () => {
    const instances = store.getInstances();
    for (const instance of instances) {
      try {
        const raw = store.getInstanceRaw(instance.id);
        const baseUrl = toHttpBase(instance.endpoint);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const headers: Record<string, string> = {};
        if (raw?.token) {
          headers['Authorization'] = `Bearer ${raw.token}`;
        }
        const response = await fetch(`${baseUrl}/api/health`, {
          signal: controller.signal,
          headers,
        });
        clearTimeout(timeout);

        const newStatus = response.ok
          ? (instance.status === 'busy' ? 'busy' : 'online')
          : 'offline';

        if (newStatus !== instance.status) {
          store.updateInstance(instance.id, { status: newStatus });
          broadcast({
            type: 'instance:status',
            payload: { instanceId: instance.id, status: newStatus },
            instanceId: instance.id,
            timestamp: new Date().toISOString(),
          });
        }
      } catch {
        if (instance.status !== 'offline') {
          store.updateInstance(instance.id, { status: 'offline' });
          broadcast({
            type: 'instance:status',
            payload: { instanceId: instance.id, status: 'offline' },
            instanceId: instance.id,
            timestamp: new Date().toISOString(),
          });
        }
      }
    }
  }, 30000);
}
