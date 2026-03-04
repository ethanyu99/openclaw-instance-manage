import type { InstancePublic, TaskSummary, WSMessage, InstanceStats, SandboxProgress, SandboxSSEEvent, TeamPublic, TeamTemplate, ClawRole } from '@shared/types';
import { getUserId } from './user';

const API_BASE = '/api';

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'X-User-Id': getUserId(),
    ...extra,
  };
}

export async function fetchInstances(): Promise<{ instances: InstancePublic[]; stats: InstanceStats }> {
  const res = await fetch(`${API_BASE}/instances`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to fetch instances');
  return res.json();
}

export async function createInstance(data: { name: string; endpoint: string; description: string; token?: string }): Promise<InstancePublic> {
  const res = await fetch(`${API_BASE}/instances`, {
    method: 'POST',
    headers: authHeaders(),
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
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Failed to update instance' }));
    throw new Error(body.error || 'Failed to update instance');
  }
  return res.json();
}

export async function deleteInstance(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/instances/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
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
    headers: authHeaders(),
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
  const res = await fetch(`${API_BASE}/instances/${id}/health`, {
    method: 'POST',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to check health');
  return res.json();
}

export async function fetchTasks(instanceId?: string): Promise<TaskSummary[]> {
  const url = instanceId ? `${API_BASE}/tasks?instanceId=${instanceId}` : `${API_BASE}/tasks`;
  const res = await fetch(url, {
    headers: authHeaders(),
  });
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
    headers: { 'X-User-Id': getUserId() },
    body: formData,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Upload failed' }));
    throw new Error(body.error || 'Upload failed');
  }
  const data = await res.json();
  return data.files;
}

// ── Team API ──────────────────────────

export async function fetchTeams(): Promise<{ teams: TeamPublic[] }> {
  const res = await fetch(`${API_BASE}/teams`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to fetch teams');
  return res.json();
}

export async function fetchTeamTemplates(): Promise<{ templates: TeamTemplate[] }> {
  const res = await fetch(`${API_BASE}/teams/templates`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to fetch templates');
  return res.json();
}

export async function fetchTeam(id: string): Promise<TeamPublic> {
  const res = await fetch(`${API_BASE}/teams/${id}`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to fetch team');
  return res.json();
}

export async function createTeam(data: {
  name: string;
  description?: string;
  templateId?: string;
  roles?: Omit<ClawRole, 'id'>[];
}): Promise<TeamPublic> {
  const res = await fetch(`${API_BASE}/teams`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Failed to create team' }));
    throw new Error(body.error || 'Failed to create team');
  }
  return res.json();
}

export async function updateTeam(id: string, data: { name?: string; description?: string }): Promise<TeamPublic> {
  const res = await fetch(`${API_BASE}/teams/${id}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Failed to update team' }));
    throw new Error(body.error || 'Failed to update team');
  }
  return res.json();
}

export async function deleteTeam(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/teams/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to delete team');
}

export async function bindInstanceToRole(teamId: string, instanceId: string, roleId: string): Promise<TeamPublic> {
  const res = await fetch(`${API_BASE}/teams/${teamId}/bind`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ instanceId, roleId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Failed to bind instance' }));
    throw new Error(body.error || 'Failed to bind instance');
  }
  return res.json();
}

export async function unbindInstance(teamId: string, instanceId: string): Promise<TeamPublic> {
  const res = await fetch(`${API_BASE}/teams/${teamId}/unbind`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ instanceId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Failed to unbind instance' }));
    throw new Error(body.error || 'Failed to unbind instance');
  }
  return res.json();
}

export function createWebSocket(onMessage: (msg: WSMessage) => void): WebSocket {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const userId = getUserId();
  const ws = new WebSocket(`${protocol}//${window.location.host}/ws?userId=${encodeURIComponent(userId)}`);

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
