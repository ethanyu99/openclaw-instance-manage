import type { Instance, TaskSummary, WSMessage, InstanceStats } from '@shared/types';

const API_BASE = '/api';

export async function fetchInstances(): Promise<{ instances: Instance[]; stats: InstanceStats }> {
  const res = await fetch(`${API_BASE}/instances`);
  if (!res.ok) throw new Error('Failed to fetch instances');
  return res.json();
}

export async function createInstance(data: { name: string; endpoint: string; description: string }): Promise<Instance> {
  const res = await fetch(`${API_BASE}/instances`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create instance');
  return res.json();
}

export async function updateInstance(id: string, data: { name?: string; endpoint?: string; description?: string }): Promise<Instance> {
  const res = await fetch(`${API_BASE}/instances/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update instance');
  return res.json();
}

export async function deleteInstance(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/instances/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete instance');
}

export async function checkHealth(id: string): Promise<{ status: string }> {
  const res = await fetch(`${API_BASE}/instances/${id}/health`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to check health');
  return res.json();
}

export async function fetchTasks(instanceId?: string): Promise<TaskSummary[]> {
  const url = instanceId ? `${API_BASE}/tasks?instanceId=${instanceId}` : `${API_BASE}/tasks`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch tasks');
  return res.json();
}

export function createWebSocket(onMessage: (msg: WSMessage) => void): WebSocket {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      onMessage(msg);
    } catch {
      // ignore
    }
  };

  return ws;
}
