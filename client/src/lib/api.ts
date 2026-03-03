import type { InstancePublic, TaskSummary, WSMessage, InstanceStats, SandboxProgress, SandboxSSEEvent } from '@shared/types';

const API_BASE = '/api';

export async function fetchInstances(): Promise<{ instances: InstancePublic[]; stats: InstanceStats }> {
  const res = await fetch(`${API_BASE}/instances`);
  if (!res.ok) throw new Error('Failed to fetch instances');
  return res.json();
}

export async function createInstance(data: { name: string; endpoint: string; description: string; token?: string }): Promise<InstancePublic> {
  const res = await fetch(`${API_BASE}/instances`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Failed to create instance' }));
    throw new Error(body.error || 'Failed to create instance');
  }
  return res.json();
}

export async function updateInstance(id: string, data: { name?: string; endpoint?: string; description?: string; token?: string }): Promise<InstancePublic> {
  const res = await fetch(`${API_BASE}/instances/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Failed to update instance' }));
    throw new Error(body.error || 'Failed to update instance');
  }
  return res.json();
}

export async function deleteInstance(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/instances/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete instance');
}

export async function createSandboxInstance(
  data: {
    name: string;
    apiKey: string;
    gatewayToken?: string;
    description?: string;
  },
  onProgress?: (progress: SandboxProgress) => void,
): Promise<InstancePublic> {
  const res = await fetch(`${API_BASE}/instances/sandbox`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Failed to create sandbox' }));
    throw new Error(body.error || 'Failed to create sandbox');
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const raw = line.slice(6).trim();
      if (!raw) continue;

      let event: SandboxSSEEvent;
      try {
        event = JSON.parse(raw);
      } catch {
        continue;
      }

      if (event.type === 'progress' && event.step && event.message) {
        onProgress?.({ step: event.step, message: event.message, detail: event.detail });
      } else if (event.type === 'complete' && event.instance) {
        return event.instance;
      } else if (event.type === 'error') {
        throw new Error(event.error || 'Sandbox creation failed');
      }
    }
  }

  throw new Error('SSE stream ended without completion event');
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

export async function uploadFiles(files: File[]): Promise<{ url: string; key: string }[]> {
  const formData = new FormData();
  for (const file of files) {
    formData.append('files', file);
  }
  const res = await fetch(`${API_BASE}/upload`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Upload failed' }));
    throw new Error(body.error || 'Upload failed');
  }
  const data = await res.json();
  return data.files;
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
