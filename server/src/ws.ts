import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import type { WSMessage, TaskDispatchPayload } from '../../shared/types';
import { store } from './store';
import { logWS, createLogEntry } from './ws-logger';

interface WSClient {
  ws: WebSocket;
  userId: string;
}

const clients = new Map<WebSocket, WSClient>();

function broadcastToOwner(ownerId: string, message: WSMessage) {
  const data = JSON.stringify(message);
  for (const [ws, client] of clients) {
    if (client.userId === ownerId && ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  }
}

function toHttpBase(endpoint: string | undefined): string {
  if (!endpoint) return '';
  return endpoint
    .replace(/^ws:\/\//, 'http://')
    .replace(/^wss:\/\//, 'https://')
    .replace(/\/+$/, '');
}

async function dispatchToInstance(ownerId: string, instanceId: string, taskId: string, content: string, _newSession?: boolean, imageUrls?: string[]) {
  const instance = store.getInstanceRaw(instanceId);
  if (!instance || !instance.endpoint) return;

  const sessionUser = store.getSessionKey(ownerId, instanceId);

  store.updateInstance(instanceId, { status: 'busy' });
  store.updateTask(taskId, { status: 'running' });

  broadcastToOwner(ownerId, {
    type: 'instance:status',
    payload: { instanceId, status: 'busy' },
    instanceId,
    timestamp: new Date().toISOString(),
  });

  const updatedTask = store.getTask(taskId);
  broadcastToOwner(ownerId, {
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

  let input: string | Array<Record<string, unknown>>;
  if (imageUrls?.length) {
    const contentParts: Array<Record<string, unknown>> = [];
    if (content) {
      contentParts.push({ type: 'input_text', text: content });
    }
    for (const imgUrl of imageUrls) {
      contentParts.push({
        type: 'input_image',
        source: { type: 'url', url: imgUrl },
      });
    }
    input = [{ type: 'message', role: 'user', content: contentParts }];
  } else {
    input = content;
  }

  const body = JSON.stringify({
    model: 'openclaw',
    input,
    stream: true,
    user: sessionUser,
  });

  logWS(createLogEntry('outbound', instanceId, instance.name, body));

  let fullText = '';
  let receivedCompletion = false;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 600_000);

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
      handleTaskFailure(ownerId, instanceId, taskId, `HTTP ${response.status}: ${errText.slice(0, 200)}`, sessionUser);
      return;
    }

    if (!response.body) {
      handleTaskFailure(ownerId, instanceId, taskId, 'No response body', sessionUser);
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

            handleSSEEvent(event, ownerId, instanceId, taskId, fullText, sessionUser);

            if (event.type === 'response.output_text.delta' && event.delta) {
              fullText += event.delta;
            }
          } catch {
            // not JSON, skip
          }
        }
      }
    }

    const task = store.getTask(taskId);
    if (task && task.status === 'running') {
      const summary = fullText.slice(0, 500) || 'Task completed';
      store.updateTask(taskId, { status: 'completed', summary });
      store.updateInstance(instanceId, { status: 'online' });
      broadcastToOwner(ownerId, {
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
        broadcastToOwner(ownerId, {
          type: 'task:complete',
          payload: { taskId, status: 'completed', summary },
          instanceId,
          taskId,
          sessionKey: sessionUser,
          timestamp: new Date().toISOString(),
        });
      } else {
        handleTaskFailure(ownerId, instanceId, taskId, message, sessionUser);
      }
    }
  }
}

function handleSSEEvent(
  event: Record<string, unknown>,
  ownerId: string,
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
        broadcastToOwner(ownerId, {
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
      broadcastToOwner(ownerId, {
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
      handleTaskFailure(ownerId, instanceId, taskId, message, sessionKey);
      break;
    }
  }
}

function handleTaskFailure(ownerId: string, instanceId: string, taskId: string, error: string, sessionKey?: string) {
  store.updateTask(taskId, { status: 'failed', summary: error });
  store.updateInstance(instanceId, { status: 'online' });
  broadcastToOwner(ownerId, {
    type: 'task:error',
    payload: { taskId, error },
    instanceId,
    taskId,
    sessionKey,
    timestamp: new Date().toISOString(),
  });
}

function extractUserId(req: IncomingMessage): string | null {
  try {
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    return url.searchParams.get('userId');
  } catch {
    return null;
  }
}

function validateAccessToken(req: IncomingMessage): boolean {
  const accessToken = process.env.ACCESS_TOKEN;
  if (!accessToken) return true;
  try {
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    return url.searchParams.get('token') === accessToken;
  } catch {
    return false;
  }
}

export function setupWebSocket(wss: WebSocketServer) {
  wss.on('connection', (ws, req) => {
    if (!validateAccessToken(req)) {
      ws.close(4001, 'Unauthorized');
      return;
    }

    const userId = extractUserId(req);
    if (!userId) {
      ws.close(4002, 'userId required');
      return;
    }

    clients.set(ws, { ws, userId });

    ws.send(JSON.stringify({
      type: 'instance:status',
      payload: {
        instances: store.getInstances(userId),
        stats: store.getStats(userId),
      },
      timestamp: new Date().toISOString(),
    }));

    ws.on('message', (data) => {
      try {
        const msg: WSMessage = JSON.parse(data.toString());

        if (msg.type === 'task:dispatch') {
          const { instanceId, content, taskId: clientTaskId, newSession, imageUrls } = msg.payload as TaskDispatchPayload;

          const instance = store.getInstanceRawForOwner(userId, instanceId);
          if (!instance) return;

          if (newSession) {
            store.resetSessionKey(userId, instanceId);
          }
          const sessionKey = store.getSessionKey(userId, instanceId);

          const displayContent = imageUrls?.length
            ? `${content}${content ? '\n' : ''}[${imageUrls.length} image(s) attached]`
            : content;

          const task = store.createTask(userId, instanceId, displayContent, clientTaskId || msg.taskId || undefined);

          broadcastToOwner(userId, {
            type: 'task:status',
            payload: { ...task },
            instanceId,
            taskId: task.id,
            sessionKey,
            timestamp: new Date().toISOString(),
          });

          dispatchToInstance(userId, instanceId, task.id, content, false, imageUrls);
        }
      } catch {
        // ignore parse errors
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
    });
  });

  // Periodic health check — runs for all instances globally
  setInterval(async () => {
    const allInstances = store.getAllInstancesRaw();
    for (const instance of allInstances) {
      try {
        if (!instance.endpoint) continue;
        const baseUrl = toHttpBase(instance.endpoint);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const headers: Record<string, string> = {};
        if (instance.token) {
          headers['Authorization'] = `Bearer ${instance.token}`;
        }
        const response = await fetch(`${baseUrl}/`, {
          signal: controller.signal,
          headers,
        });
        clearTimeout(timeout);

        const currentPublic = store.getInstance(instance.ownerId, instance.id);
        const newStatus = response.ok
          ? (currentPublic?.status === 'busy' ? 'busy' : 'online')
          : 'offline';

        if (newStatus !== currentPublic?.status) {
          store.updateInstance(instance.id, { status: newStatus });
          broadcastToOwner(instance.ownerId, {
            type: 'instance:status',
            payload: { instanceId: instance.id, status: newStatus },
            instanceId: instance.id,
            timestamp: new Date().toISOString(),
          });
        }
      } catch {
        const currentPublic = store.getInstance(instance.ownerId, instance.id);
        if (currentPublic && currentPublic.status !== 'offline') {
          store.updateInstance(instance.id, { status: 'offline' });
          broadcastToOwner(instance.ownerId, {
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
