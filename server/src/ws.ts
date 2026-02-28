import { WebSocketServer, WebSocket } from 'ws';
import { WSMessage, TaskDispatchPayload } from '../../shared/types';
import { store } from './store';

const clients = new Set<WebSocket>();

// Broadcast to all connected clients
function broadcast(message: WSMessage) {
  const data = JSON.stringify(message);
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

// Connect to an openclaw instance via WebSocket and proxy messages
async function dispatchToInstance(instanceId: string, taskId: string, content: string) {
  const instance = store.getInstance(instanceId);
  if (!instance) return;

  store.updateInstance(instanceId, { status: 'busy' });
  store.updateTask(taskId, { status: 'running' });

  broadcast({
    type: 'instance:status',
    payload: { instanceId, status: 'busy' },
    instanceId,
    timestamp: new Date().toISOString(),
  });

  broadcast({
    type: 'task:status',
    payload: { taskId, status: 'running' },
    instanceId,
    taskId,
    timestamp: new Date().toISOString(),
  });

  // Try connecting to instance WS endpoint
  try {
    const wsUrl = instance.endpoint.replace(/^http/, 'ws') + '/ws';
    const instanceWs = new WebSocket(wsUrl);

    instanceWs.on('open', () => {
      instanceWs.send(JSON.stringify({ type: 'task', content, taskId }));
    });

    instanceWs.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'stream' || msg.type === 'chunk') {
          const summary = msg.summary || msg.content?.slice(0, 200);
          store.updateTask(taskId, { summary });
          broadcast({
            type: 'task:stream',
            payload: { instanceId, taskId, chunk: msg.content || '', summary },
            instanceId,
            taskId,
            timestamp: new Date().toISOString(),
          });
        } else if (msg.type === 'complete' || msg.type === 'done') {
          store.updateTask(taskId, { status: 'completed', summary: msg.summary || msg.content });
          store.updateInstance(instanceId, { status: 'online' });
          broadcast({
            type: 'task:complete',
            payload: { taskId, status: 'completed', summary: msg.summary || msg.content },
            instanceId,
            taskId,
            timestamp: new Date().toISOString(),
          });
          instanceWs.close();
        }
      } catch {
        // ignore parse errors
      }
    });

    instanceWs.on('error', () => {
      store.updateTask(taskId, { status: 'failed', summary: 'Connection error' });
      store.updateInstance(instanceId, { status: 'online' });
      broadcast({
        type: 'task:error',
        payload: { taskId, error: 'Connection to instance failed' },
        instanceId,
        taskId,
        timestamp: new Date().toISOString(),
      });
    });

    instanceWs.on('close', () => {
      const task = store.getTask(taskId);
      if (task && task.status === 'running') {
        store.updateTask(taskId, { status: 'completed', summary: task.summary || 'Task completed' });
        store.updateInstance(instanceId, { status: 'online' });
        broadcast({
          type: 'task:complete',
          payload: { taskId, status: 'completed' },
          instanceId,
          taskId,
          timestamp: new Date().toISOString(),
        });
      }
    });
  } catch {
    // If WS connection fails, simulate task completion for demo
    store.updateTask(taskId, { status: 'failed', summary: 'Cannot connect to instance' });
    store.updateInstance(instanceId, { status: 'offline' });
    broadcast({
      type: 'task:error',
      payload: { taskId, error: 'Cannot connect to instance' },
      instanceId,
      taskId,
      timestamp: new Date().toISOString(),
    });
  }
}

export function setupWebSocket(wss: WebSocketServer) {
  wss.on('connection', (ws) => {
    clients.add(ws);

    // Send initial state
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
          const { instanceId, content } = msg.payload as TaskDispatchPayload;
          const task = store.createTask(instanceId, content);

          // Notify all clients about new task
          broadcast({
            type: 'task:status',
            payload: { ...task },
            instanceId,
            taskId: task.id,
            timestamp: new Date().toISOString(),
          });

          // Dispatch to instance
          dispatchToInstance(instanceId, task.id, content);
        }
      } catch {
        // ignore parse errors
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
    });
  });

  // Periodic health check for all instances
  setInterval(async () => {
    const instances = store.getInstances();
    for (const instance of instances) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const response = await fetch(`${instance.endpoint}/health`, {
          signal: controller.signal,
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
  }, 30000); // every 30 seconds
}
