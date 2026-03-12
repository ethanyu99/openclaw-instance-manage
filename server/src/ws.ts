import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import type { WSMessage, TaskDispatchPayload, TeamDispatchPayload, ExecutionConfig } from '../../shared/types';
import { store } from './store';
import { logWS, createLogEntry } from './ws-logger';
import { dispatchToTeam, cancelExecution } from './team-dispatch';
import { verifyToken } from './auth';
import { getRedis, getSubscriber } from './redis';

const activeControllers = new Map<string, AbortController>();

interface WSClient {
  ws: WebSocket;
  userId: string;
  shareOwnerId?: string;
}

const clients = new Map<WebSocket, WSClient>();

// Redis Pub/Sub channel for cross-process WS broadcasting
const WS_CHANNEL_PREFIX = 'ocm:ws:';

function localBroadcastToOwner(ownerId: string, data: string) {
  for (const [ws, client] of clients) {
    if (client.userId === ownerId && ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  }
}

export function broadcastToOwner(ownerId: string, message: WSMessage) {
  const data = JSON.stringify(message);
  // Single delivery path: publish to Redis, subscriber handles local delivery.
  // This avoids double-delivery in single-process mode.
  getRedis().publish(`${WS_CHANNEL_PREFIX}${ownerId}`, data).catch(() => {
    // Redis unavailable — fall back to direct local delivery
    localBroadcastToOwner(ownerId, data);
  });
}

function toHttpBase(endpoint: string | undefined): string {
  if (!endpoint) return '';
  return endpoint
    .replace(/^ws:\/\//, 'http://')
    .replace(/^wss:\/\//, 'https://')
    .replace(/\/+$/, '');
}

function buildInput(content: string, imageUrls?: string[]): string | Array<Record<string, unknown>> {
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
    return [{ type: 'message', role: 'user', content: contentParts }];
  }
  return content;
}

interface StreamResult {
  fullText: string;
  receivedCompletion: boolean;
  error?: string;
}

async function streamInstance(
  ownerId: string,
  instanceId: string,
  taskId: string,
  instance: { endpoint: string; token?: string; name: string },
  sessionUser: string,
  input: string | Array<Record<string, unknown>>,
  controller: AbortController,
): Promise<StreamResult> {
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
    input,
    stream: true,
    user: sessionUser,
  });

  logWS(createLogEntry('outbound', instanceId, instance.name, body));

  let fullText = '';
  let receivedCompletion = false;

  try {
    const timeout = setTimeout(() => controller.abort(), 600_000);

    const response = await fetch(url, {
      method: 'POST',
      headers: { ...headers, 'Connection': 'keep-alive' },
      body,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errText = await response.text().catch(() => response.statusText);
      logWS(createLogEntry('inbound', instanceId, instance.name, `HTTP ${response.status}: ${errText}`));
      return { fullText, receivedCompletion, error: `HTTP ${response.status}: ${errText.slice(0, 200)}` };
    }

    if (!response.body) {
      return { fullText, receivedCompletion, error: 'No response body' };
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

            await handleSSEEvent(event, ownerId, instanceId, taskId, fullText, sessionUser);

            if (event.type === 'response.output_text.delta' && event.delta) {
              fullText += event.delta;
            }
          } catch {
            // not JSON, skip
          }
        }
      }
    }

    return { fullText, receivedCompletion };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logWS(createLogEntry('inbound', instanceId, instance.name, `Error: ${message}`));

    if (message === 'This operation was aborted') {
      return { fullText, receivedCompletion, error: '__cancelled__' };
    }
    if (fullText.length > 0 && !receivedCompletion) {
      return { fullText, receivedCompletion, error: '__connection_lost__' };
    }
    return { fullText, receivedCompletion, error: message };
  }
}

async function dispatchToInstance(ownerId: string, instanceId: string, taskId: string, content: string, _newSession?: boolean, imageUrls?: string[]) {
  const instance = await store.getInstanceRaw(instanceId);
  if (!instance || !instance.endpoint) return;

  const sessionUser = await store.getSessionKey(ownerId, instanceId);

  await store.ensureSession(ownerId, instanceId, instance.name, sessionUser);

  await store.updateInstance(instanceId, { status: 'busy' });
  await store.updateTask(taskId, { status: 'running' });

  broadcastToOwner(ownerId, {
    type: 'instance:status',
    payload: { instanceId, status: 'busy' },
    instanceId,
    timestamp: new Date().toISOString(),
  });

  const updatedTask = await store.getTask(taskId);
  broadcastToOwner(ownerId, {
    type: 'task:status',
    payload: updatedTask || { taskId, status: 'running' },
    instanceId,
    taskId,
    sessionKey: sessionUser,
    timestamp: new Date().toISOString(),
  });

  const input = buildInput(content, imageUrls);
  const controller = new AbortController();
  activeControllers.set(taskId, controller);

  try {
    let currentSessionKey = sessionUser;
    let result = await streamInstance(ownerId, instanceId, taskId, instance, currentSessionKey, input, controller);

    // Fallback: empty response with completion → likely stale session, reset and retry once
    if (!result.error && result.fullText.trim().length === 0) {
      console.warn(`[ws] dispatchToInstance got empty response for ${instance.name} (session=${currentSessionKey}), retrying with new session…`);
      broadcastToOwner(ownerId, {
        type: 'task:stream',
        payload: { instanceId, taskId, chunk: '\n\n[空响应，正在重置会话重试…]\n\n', summary: '' },
        instanceId,
        taskId,
        sessionKey: currentSessionKey,
        timestamp: new Date().toISOString(),
      });

      currentSessionKey = await store.resetSessionKey(ownerId, instanceId);
      await store.ensureSession(ownerId, instanceId, instance.name, currentSessionKey);

      const retryController = new AbortController();
      activeControllers.set(taskId, retryController);
      result = await streamInstance(ownerId, instanceId, taskId, instance, currentSessionKey, input, retryController);

      if (!result.error && result.fullText.trim().length === 0) {
        result.error = `No response from ${instance.name} (empty reply after session reset retry)`;
      }
    }

    if (result.error === '__cancelled__') {
      await store.updateTask(taskId, { status: 'cancelled', summary: 'Task cancelled by user' });
      await store.updateTaskOutput(taskId, result.fullText);
      await store.updateInstance(instanceId, { status: 'online' });
      broadcastToOwner(ownerId, {
        type: 'task:cancelled',
        payload: { taskId, status: 'cancelled', summary: 'Task cancelled by user' },
        instanceId,
        taskId,
        sessionKey: currentSessionKey,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (result.error === '__connection_lost__') {
      const summary = result.fullText.slice(0, 500) + '\n\n[Connection lost — agent may still be running]';
      await store.updateTask(taskId, { status: 'completed', summary });
      await store.updateTaskOutput(taskId, result.fullText);
      await store.updateInstance(instanceId, { status: 'online' });
      broadcastToOwner(ownerId, {
        type: 'task:complete',
        payload: { taskId, status: 'completed', summary },
        instanceId,
        taskId,
        sessionKey: currentSessionKey,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (result.error) {
      await handleTaskFailure(ownerId, instanceId, taskId, result.error, currentSessionKey);
      return;
    }

    // 始终用流式累积的完整内容覆盖 DB，避免 response.completed 事件里只有截断内容导致丢失
    if (result.fullText) {
      await store.updateTaskOutput(taskId, result.fullText);
    }
    const task = await store.getTask(taskId);
    if (task && task.status === 'running') {
      const summary = result.fullText.slice(0, 500) || 'Task completed';
      await store.updateTask(taskId, { status: 'completed', summary });
      await store.updateInstance(instanceId, { status: 'online' });
      broadcastToOwner(ownerId, {
        type: 'task:complete',
        payload: { taskId, status: 'completed', summary },
        instanceId,
        taskId,
        sessionKey: currentSessionKey,
        timestamp: new Date().toISOString(),
      });
    }
  } finally {
    activeControllers.delete(taskId);
  }
}

async function handleSSEEvent(
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
      await store.updateTask(taskId, { summary: text.slice(0, 500) });
      if (text) await store.updateTaskOutput(taskId, text);
      break;
    }

    case 'response.completed': {
      const output = event.response as Record<string, unknown> | undefined;
      let fullOutput = '';
      if (output?.output && Array.isArray(output.output)) {
        for (const item of output.output) {
          if (item.type === 'message' && Array.isArray(item.content)) {
            for (const part of item.content) {
              if (part.type === 'output_text') {
                fullOutput += part.text || '';
              }
            }
          }
        }
      }
      const summaryForTask = fullOutput.slice(0, 500) || 'Completed';
      await store.updateTask(taskId, { status: 'completed', summary: summaryForTask });
      await store.updateTaskOutput(taskId, fullOutput);
      await store.updateInstance(instanceId, { status: 'online' });
      broadcastToOwner(ownerId, {
        type: 'task:complete',
        payload: { taskId, status: 'completed', summary: summaryForTask },
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
      await handleTaskFailure(ownerId, instanceId, taskId, message, sessionKey);
      break;
    }
  }
}

async function handleTaskFailure(ownerId: string, instanceId: string, taskId: string, error: string, sessionKey?: string) {
  await store.updateTask(taskId, { status: 'failed', summary: error });
  await store.updateInstance(instanceId, { status: 'online' });
  broadcastToOwner(ownerId, {
    type: 'task:error',
    payload: { taskId, error },
    instanceId,
    taskId,
    sessionKey,
    timestamp: new Date().toISOString(),
  });
}

function extractAuthenticatedUserId(req: IncomingMessage): string | null {
  try {
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const token = url.searchParams.get('token');

    // Try JWT first
    if (token) {
      const payload = verifyToken(token);
      if (payload) return payload.userId;
    }

    // Try ACCESS_TOKEN — binds to fixed admin userId
    const accessToken = process.env.ACCESS_TOKEN;
    if (accessToken && token === accessToken) {
      return process.env.ADMIN_USER_ID || 'admin';
    }

    return null;
  } catch {
    return null;
  }
}

function extractShareToken(req: IncomingMessage): string | null {
  try {
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    return url.searchParams.get('shareToken');
  } catch {
    return null;
  }
}

function validateAccessToken(req: IncomingMessage): boolean {
  try {
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const token = url.searchParams.get('token');

    if (token) {
      const jwtPayload = verifyToken(token);
      if (jwtPayload) return true;
    }

    const accessToken = process.env.ACCESS_TOKEN;
    if (!accessToken) return true;
    return token === accessToken;
  } catch {
    return false;
  }
}

export function setupWebSocket(wss: WebSocketServer) {
  // Subscribe to Redis for cross-process WS messages
  const sub = getSubscriber();
  sub.psubscribe(`${WS_CHANNEL_PREFIX}*`);
  sub.on('pmessage', (_pattern, channel, data) => {
    const ownerId = channel.slice(WS_CHANNEL_PREFIX.length);
    localBroadcastToOwner(ownerId, data);
  });

  wss.on('connection', async (ws, req) => {
    if (!validateAccessToken(req)) {
      ws.close(4001, 'Unauthorized');
      return;
    }

    const shareTokenStr = extractShareToken(req);

    if (shareTokenStr) {
      const st = await store.getShareTokenByToken(shareTokenStr);
      if (!st) {
        ws.close(4003, 'Invalid or expired share token');
        return;
      }

      const shareOwnerId = st.ownerId;
      const shareTargetId = st.targetId;
      const shareType = st.shareType;

      clients.set(ws, {
        ws,
        userId: shareOwnerId,
        shareOwnerId,
      });

      const buildSharedInstances = async () => {
        if (shareType === 'instance') {
          const inst = await store.getInstance(shareOwnerId, shareTargetId);
          return inst ? [{ ...inst, endpoint: '***', hasToken: false }] : [];
        }
        const all = await store.getInstances(shareOwnerId);
        return all
          .filter(i => i.teamId === shareTargetId)
          .map(i => ({ ...i, endpoint: '***', hasToken: false }));
      };

      const getAllowedInstanceIds = async (): Promise<Set<string>> => {
        if (shareType === 'instance') return new Set([shareTargetId]);
        const all = await store.getInstances(shareOwnerId);
        return new Set(
          all.filter(i => i.teamId === shareTargetId).map(i => i.id)
        );
      };

      const instances = await buildSharedInstances();
      const stats = await store.getStats(shareOwnerId);
      ws.send(JSON.stringify({
        type: 'instance:status',
        payload: { instances, stats },
        timestamp: new Date().toISOString(),
      }));

      ws.on('message', (data) => {
        (async () => {
          try {
            const msg: WSMessage = JSON.parse(data.toString());

            if (msg.type === 'task:dispatch') {
              const { instanceId, content, taskId: clientTaskId, newSession, imageUrls } = msg.payload as TaskDispatchPayload;

              const allowedIds = await getAllowedInstanceIds();
              if (!allowedIds.has(instanceId)) return;

              const instance = await store.getInstanceRawForOwner(shareOwnerId, instanceId);
              if (!instance) return;

              if (newSession) {
                await store.resetSessionKey(shareOwnerId, instanceId);
              }
              const sessionKey = await store.getSessionKey(shareOwnerId, instanceId);

              const displayContent = imageUrls?.length
                ? `${content}${content ? '\n' : ''}[${imageUrls.length} image(s) attached]`
                : content;

              const task = await store.createTask(shareOwnerId, instanceId, displayContent, clientTaskId || msg.taskId || undefined, sessionKey);

              broadcastToOwner(shareOwnerId, {
                type: 'task:status',
                payload: { ...task },
                instanceId,
                taskId: task.id,
                sessionKey,
                timestamp: new Date().toISOString(),
              });

              dispatchToInstance(shareOwnerId, instanceId, task.id, content, false, imageUrls);
            }

            if (msg.type === 'team:dispatch' && shareType === 'team') {
              const { teamId, content, newSession, config } = msg.payload as TeamDispatchPayload;
              if (teamId !== shareTargetId) return;
              dispatchToTeam(shareOwnerId, teamId, content, broadcastToOwner, newSession, config);
            }
          } catch {
            // ignore parse errors
          }
        })();
      });

      ws.on('close', () => {
        clients.delete(ws);
      });
      return;
    }

    // Normal connection — userId derived from authenticated token, never from client query
    const userId = extractAuthenticatedUserId(req);
    if (!userId) {
      ws.close(4002, 'Authentication required — provide a valid token');
      return;
    }

    clients.set(ws, { ws, userId });

    const instances = await store.getInstances(userId);
    const stats = await store.getStats(userId);
    ws.send(JSON.stringify({
      type: 'instance:status',
      payload: { instances, stats },
      timestamp: new Date().toISOString(),
    }));

    ws.on('message', (data) => {
      (async () => {
        try {
          const msg: WSMessage = JSON.parse(data.toString());

          if (msg.type === 'task:dispatch') {
            const { instanceId, content, taskId: clientTaskId, newSession, imageUrls } = msg.payload as TaskDispatchPayload;

            const instance = await store.getInstanceRawForOwner(userId, instanceId);
            if (!instance) return;

            if (newSession) {
              await store.resetSessionKey(userId, instanceId);
            } else if (instance.teamId && await store.wasUsedByTeam(userId, instanceId)) {
              await store.resetSessionKey(userId, instanceId);
            }
            const sessionKey = await store.getSessionKey(userId, instanceId);

            const displayContent = imageUrls?.length
              ? `${content}${content ? '\n' : ''}[${imageUrls.length} image(s) attached]`
              : content;

            const task = await store.createTask(userId, instanceId, displayContent, clientTaskId || msg.taskId || undefined, sessionKey);

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

          if (msg.type === 'task:cancel') {
            const taskId = msg.payload?.taskId || msg.taskId;
            if (taskId) {
              const ctrl = activeControllers.get(taskId);
              if (ctrl) ctrl.abort();
            }
          }

          if (msg.type === 'team:dispatch') {
            const { teamId, content, newSession, config } = msg.payload as TeamDispatchPayload;
            dispatchToTeam(userId, teamId, content, broadcastToOwner, newSession, config);
          }

          if (msg.type === 'execution:cancel') {
            const executionId = msg.payload?.executionId;
            if (executionId) {
              cancelExecution(executionId);
            }
          }
        } catch {
          // ignore parse errors
        }
      })();
    });

    ws.on('close', () => {
      clients.delete(ws);
    });
  });

  // Periodic health check
  setInterval(async () => {
    const allInstances = await store.getAllInstancesRaw();
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

        const currentPublic = await store.getInstance(instance.ownerId, instance.id);
        const newStatus = response.ok
          ? (currentPublic?.status === 'busy' ? 'busy' : 'online')
          : 'offline';

        if (newStatus !== currentPublic?.status) {
          await store.updateInstance(instance.id, { status: newStatus });
          broadcastToOwner(instance.ownerId, {
            type: 'instance:status',
            payload: { instanceId: instance.id, status: newStatus },
            instanceId: instance.id,
            timestamp: new Date().toISOString(),
          });
        }
      } catch {
        const currentPublic = await store.getInstance(instance.ownerId, instance.id);
        if (currentPublic && currentPublic.status !== 'offline') {
          await store.updateInstance(instance.id, { status: 'offline' });
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
