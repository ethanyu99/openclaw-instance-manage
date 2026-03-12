import type { InstancePublic, TaskSummary, WSMessage, InstanceStats, SandboxProgress, SandboxSSEEvent, TeamPublic, TeamTemplate, ClawRole, ShareToken, ShareDuration, ShareViewData, SessionRecord, SessionDetail, ExecutionRecord, SkillDefinition, SkillInstallResult } from '@shared/types';
import { getUserId, getAuthToken, type AuthUser } from './user';

const API_BASE = '/api';

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-User-Id': getUserId(),
    ...extra,
  };

  const token = getAuthToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return headers;
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
  const headers: Record<string, string> = { 'X-User-Id': getUserId() };
  const token = getAuthToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}/upload`, {
    method: 'POST',
    headers,
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

export async function addRoleToTeam(teamId: string, role: Omit<ClawRole, 'id'>): Promise<TeamPublic> {
  const res = await fetch(`${API_BASE}/teams/${teamId}/roles`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(role),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Failed to add role' }));
    throw new Error(body.error || 'Failed to add role');
  }
  return res.json();
}

export async function updateRole(teamId: string, roleId: string, data: Partial<Omit<ClawRole, 'id'>>): Promise<TeamPublic> {
  const res = await fetch(`${API_BASE}/teams/${teamId}/roles/${roleId}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Failed to update role' }));
    throw new Error(body.error || 'Failed to update role');
  }
  return res.json();
}

export async function deleteRole(teamId: string, roleId: string): Promise<TeamPublic> {
  const res = await fetch(`${API_BASE}/teams/${teamId}/roles/${roleId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Failed to delete role' }));
    throw new Error(body.error || 'Failed to delete role');
  }
  return res.json();
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

// ── Sandbox Config API ───────────────

export interface GitConfigPayload {
  pat: string;
  username?: string;
  gitName?: string;
  gitEmail?: string;
  host?: string;
}

export interface GitConfigResult {
  success: boolean;
  steps: string[];
  verified: boolean;
  verifyMessage: string;
}

export interface GitStatusResult {
  hasCredentials: boolean;
  gitName: string;
  gitEmail: string;
}

export async function configureSandboxGit(instanceId: string, data: GitConfigPayload): Promise<GitConfigResult> {
  const res = await fetch(`${API_BASE}/instances/${instanceId}/sandbox/configure/git`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Failed to configure git' }));
    throw new Error(body.error || 'Failed to configure git');
  }
  return res.json();
}

export interface TeamGitConfigResult {
  total: number;
  succeeded: number;
  failed: number;
  results: {
    instanceId: string;
    instanceName: string;
    success: boolean;
    verified: boolean;
    verifyMessage: string;
    error?: string;
  }[];
}

export interface TeamRoleGitStatus {
  roleId: string;
  roleName: string;
  isLead: boolean;
  instanceId: string | null;
  instanceName: string | null;
  isSandbox: boolean;
  hasCredentials: boolean | null;
  gitName: string;
  gitEmail: string;
  reason: 'unbound' | 'not_found' | 'no_endpoint' | 'connection_failed' | null;
}

export interface TeamGitStatusResult {
  totalRoles: number;
  configurable: number;
  configured: number;
  roleStatuses: TeamRoleGitStatus[];
}

export async function configureTeamGit(teamId: string, data: GitConfigPayload): Promise<TeamGitConfigResult> {
  const res = await fetch(`${API_BASE}/teams/${teamId}/configure/git`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Failed to configure team git' }));
    throw new Error(body.error || 'Failed to configure team git');
  }
  return res.json();
}

export async function getTeamGitStatus(teamId: string): Promise<TeamGitStatusResult> {
  const res = await fetch(`${API_BASE}/teams/${teamId}/configure/git/status`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Failed to check team git status' }));
    throw new Error(body.error || 'Failed to check team git status');
  }
  return res.json();
}

export async function getSandboxGitStatus(instanceId: string): Promise<GitStatusResult> {
  const res = await fetch(`${API_BASE}/instances/${instanceId}/sandbox/configure/git/status`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Failed to check git status' }));
    throw new Error(body.error || 'Failed to check git status');
  }
  return res.json();
}

export function createWebSocket(onMessage: (msg: WSMessage) => void): WebSocket {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const userId = getUserId();
  const token = getAuthToken();
  let wsUrl = `${protocol}//${window.location.host}/ws?userId=${encodeURIComponent(userId)}`;
  if (token) {
    wsUrl += `&token=${encodeURIComponent(token)}`;
  }
  const ws = new WebSocket(wsUrl);

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      onMessage(msg);
    } catch {
      // Malformed WS frame — safe to ignore
    }
  };

  return ws;
}

export function createShareWebSocket(shareToken: string, onMessage: (msg: WSMessage) => void): WebSocket {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${protocol}//${window.location.host}/ws?shareToken=${encodeURIComponent(shareToken)}`);

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      onMessage(msg);
    } catch {
      // Malformed WS frame — safe to ignore
    }
  };

  return ws;
}

// ── Share API ─────────────────────────

export async function createShareLink(data: {
  shareType: 'team' | 'instance';
  targetId: string;
  duration: ShareDuration;
}): Promise<{ shareToken: ShareToken }> {
  const res = await fetch(`${API_BASE}/share`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Failed to create share link' }));
    throw new Error(body.error || 'Failed to create share link');
  }
  return res.json();
}

export async function fetchShareTokens(): Promise<{ shareTokens: ShareToken[] }> {
  const res = await fetch(`${API_BASE}/share`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to fetch share tokens');
  return res.json();
}

export async function revokeShareToken(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/share/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to revoke share token');
}

export async function fetchShareView(token: string): Promise<ShareViewData> {
  const res = await fetch(`${API_BASE}/share/view/${token}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Share link is invalid or expired' }));
    throw new Error(body.error || 'Share link is invalid or expired');
  }
  return res.json();
}

// ── Session API ───────────────────────

export async function fetchSessions(): Promise<{ sessions: SessionRecord[] }> {
  const res = await fetch(`${API_BASE}/sessions`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to fetch sessions');
  return res.json();
}

export async function fetchSessionDetail(sessionKey: string): Promise<SessionDetail> {
  const res = await fetch(`${API_BASE}/sessions/${encodeURIComponent(sessionKey)}`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to fetch session detail');
  return res.json();
}

export async function fetchShareSessionDetail(shareToken: string, sessionKey: string): Promise<SessionDetail> {
  const res = await fetch(`${API_BASE}/share/view/${shareToken}/sessions/${encodeURIComponent(sessionKey)}`);
  if (!res.ok) throw new Error('Failed to fetch session detail');
  return res.json();
}

export async function deleteSessionApi(sessionKey: string): Promise<void> {
  const res = await fetch(`${API_BASE}/sessions/${encodeURIComponent(sessionKey)}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to delete session');
}

export async function clearSessionsApi(): Promise<void> {
  const res = await fetch(`${API_BASE}/sessions`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to clear sessions');
}

// ── Execution API ─────────────────────

export async function fetchExecutionsApi(): Promise<{ executions: ExecutionRecord[] }> {
  const res = await fetch(`${API_BASE}/executions`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to fetch executions');
  return res.json();
}

export async function fetchExecutionDetail(id: string): Promise<ExecutionRecord> {
  const res = await fetch(`${API_BASE}/executions/${id}`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to fetch execution');
  return res.json();
}

export async function deleteExecutionApi(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/executions/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to delete execution');
}

export async function clearExecutionsApi(): Promise<void> {
  const res = await fetch(`${API_BASE}/executions`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to clear executions');
}

// ── Skills API ────────────────────────

export async function fetchSkillRegistry(): Promise<{ skills: SkillDefinition[] }> {
  const res = await fetch(`${API_BASE}/skills`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to fetch skills');
  return res.json();
}

export async function searchSkillsApi(query: string): Promise<{ skills: SkillDefinition[] }> {
  const res = await fetch(`${API_BASE}/skills/search?q=${encodeURIComponent(query)}`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to search skills');
  return res.json();
}

export async function fetchInstanceSkills(instanceId: string): Promise<{ instanceId: string; skills: Array<SkillDefinition & { installedAt: string }> }> {
  const res = await fetch(`${API_BASE}/skills/instance/${instanceId}`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to fetch instance skills');
  return res.json();
}

export async function installSkills(instanceId: string, skillIds: string[]): Promise<{ total: number; succeeded: number; failed: number; results: SkillInstallResult[] }> {
  const res = await fetch(`${API_BASE}/skills/instance/${instanceId}/install`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ skillIds }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Failed to install skills' }));
    throw new Error(body.error || 'Failed to install skills');
  }
  return res.json();
}

export async function uninstallSkills(instanceId: string, skillIds: string[]): Promise<{ total: number; succeeded: number; failed: number; results: SkillInstallResult[] }> {
  const res = await fetch(`${API_BASE}/skills/instance/${instanceId}/uninstall`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ skillIds }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Failed to uninstall skills' }));
    throw new Error(body.error || 'Failed to uninstall skills');
  }
  return res.json();
}

// ── Remote Skills (SkillsMP) ─────────

export interface RemoteSkill {
  slug: string;
  name: string;
  description: string;
  author: string;
  repo: string;
  stars: number;
  updatedAt: string;
  githubUrl: string;
  skillUrl: string;
}

export type SkillsMPErrorCode =
  | 'MISSING_API_KEY' | 'INVALID_API_KEY' | 'MISSING_QUERY'
  | 'DAILY_QUOTA_EXCEEDED' | 'INTERNAL_ERROR' | 'NOT_CONFIGURED' | 'NETWORK_ERROR';

export class SkillsMPApiError extends Error {
  code: SkillsMPErrorCode;
  status: number;
  constructor(code: SkillsMPErrorCode, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export async function checkRemoteStatus(): Promise<{ configured: boolean }> {
  const res = await fetch(`${API_BASE}/skills/remote/status`, { headers: authHeaders() });
  if (!res.ok) return { configured: false };
  return res.json();
}

export async function searchRemoteSkills(
  query: string,
  mode: 'keyword' | 'ai' = 'keyword',
): Promise<{ skills: RemoteSkill[]; total: number; query: string }> {
  const res = await fetch(
    `${API_BASE}/skills/remote/search?q=${encodeURIComponent(query)}&mode=${mode}`,
    { headers: authHeaders() },
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Remote search failed', code: 'INTERNAL_ERROR' }));
    throw new SkillsMPApiError(
      (body.code as SkillsMPErrorCode) || 'INTERNAL_ERROR',
      body.error || 'Remote search failed',
      res.status,
    );
  }
  return res.json();
}

export async function fetchRemoteSkillContent(githubUrl: string): Promise<string> {
  const res = await fetch(
    `${API_BASE}/skills/remote/content?url=${encodeURIComponent(githubUrl)}`,
    { headers: authHeaders() },
  );
  if (!res.ok) throw new Error('Could not fetch remote SKILL.md');
  return res.text();
}

export async function installRemoteSkill(
  instanceId: string,
  slug: string,
  name: string,
  githubUrl?: string,
  skillMd?: string,
): Promise<SkillInstallResult> {
  const res = await fetch(`${API_BASE}/skills/instance/${instanceId}/install-remote`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ slug, name, rawUrl: githubUrl, skillMd }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Failed to install remote skill' }));
    throw new Error(body.error || 'Failed to install remote skill');
  }
  return res.json();
}

// ── Sandbox Files API ────────────────

export interface SandboxFileListResult {
  path: string;
  files: import('@shared/types').SandboxFileEntry[];
}

export interface SandboxFileReadResult {
  path: string;
  content: string;
  size: number;
}

export async function listSandboxFiles(
  instanceId: string,
  dirPath?: string,
  opts?: { depth?: number; hidden?: boolean },
): Promise<SandboxFileListResult> {
  const params = new URLSearchParams();
  if (dirPath) params.set('path', dirPath);
  if (opts?.depth) params.set('depth', String(opts.depth));
  if (opts?.hidden) params.set('hidden', 'true');
  const res = await fetch(`${API_BASE}/instances/${instanceId}/sandbox/files?${params}`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Failed to list files' }));
    throw new Error(body.error || 'Failed to list files');
  }
  return res.json();
}

export async function readSandboxFile(
  instanceId: string,
  filePath: string,
): Promise<SandboxFileReadResult> {
  const params = new URLSearchParams({ path: filePath });
  const res = await fetch(`${API_BASE}/instances/${instanceId}/sandbox/files/read?${params}`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Failed to read file' }));
    throw new Error(body.error || 'Failed to read file');
  }
  return res.json();
}

export async function fetchSkillReadme(skillId: string): Promise<string> {
  const res = await fetch(`${API_BASE}/skills/${skillId}/readme`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    throw new Error('Skill not found');
  }
  return res.text();
}

// ── Auth API ──────────────────────────

export async function loginWithGoogle(credential: string, clientUserId: string): Promise<{ token: string; user: AuthUser }> {
  const res = await fetch(`${API_BASE}/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credential, clientUserId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Google login failed' }));
    throw new Error(body.error || 'Google login failed');
  }
  return res.json();
}

export async function fetchCurrentUser(): Promise<{ user: AuthUser }> {
  const token = getAuthToken();
  if (!token) throw new Error('Not authenticated');
  const res = await fetch(`${API_BASE}/auth/me`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Session expired');
  return res.json();
}
