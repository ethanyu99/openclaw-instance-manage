import { apiFetch, authHeaders, API_BASE } from './client';

export interface GitConfigPayload {
  pat?: string;
  username?: string;
  gitName?: string;
  gitEmail?: string;
  host?: string;
  authMethod?: 'pat' | 'ssh';
  sshPrivateKey?: string;
  sshPublicKey?: string;
}

export interface GitConfigResult {
  success: boolean;
  steps: string[];
  verified: boolean;
  verifyMessage: string;
}

export interface GitStatusResult {
  hasCredentials: boolean;
  hasSshKeys?: boolean;
  gitName: string;
  gitEmail: string;
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
  hasSshKeys?: boolean | null;
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

export interface SandboxFileListResult {
  path: string;
  files: import('@shared/types').SandboxFileEntry[];
}

export interface SandboxFileReadResult {
  path: string;
  content: string;
  size: number;
}

export async function configureSandboxGit(instanceId: string, data: GitConfigPayload): Promise<GitConfigResult> {
  return apiFetch(`/instances/${instanceId}/sandbox/configure/git`, { method: 'POST', body: JSON.stringify(data) });
}

export async function getSandboxGitStatus(instanceId: string): Promise<GitStatusResult> {
  return apiFetch(`/instances/${instanceId}/sandbox/configure/git/status`);
}

export async function configureTeamGit(teamId: string, data: GitConfigPayload): Promise<TeamGitConfigResult> {
  return apiFetch(`/teams/${teamId}/configure/git`, { method: 'POST', body: JSON.stringify(data) });
}

export async function getTeamGitStatus(teamId: string): Promise<TeamGitStatusResult> {
  return apiFetch(`/teams/${teamId}/configure/git/status`);
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
  return apiFetch(`/instances/${instanceId}/sandbox/files?${params}`);
}

export async function readSandboxFile(instanceId: string, filePath: string): Promise<SandboxFileReadResult> {
  const params = new URLSearchParams({ path: filePath });
  return apiFetch(`/instances/${instanceId}/sandbox/files/read?${params}`);
}

async function triggerBlobDownload(url: string, filename: string): Promise<void> {
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) {
    let msg = `Download failed: ${res.statusText}`;
    try { const body = await res.json(); msg = body.error || msg; } catch { /* not JSON */ }
    throw new Error(msg);
  }
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(objectUrl);
}

export async function downloadSandboxFile(instanceId: string, filePath: string): Promise<void> {
  const params = new URLSearchParams({ path: filePath });
  const filename = filePath.split('/').pop() || 'download';
  const url = `${API_BASE}/instances/${instanceId}/sandbox/files/download?${params}`;
  return triggerBlobDownload(url, filename);
}

export async function downloadSandboxArchive(instanceId: string, dirPath?: string): Promise<void> {
  const params = new URLSearchParams();
  if (dirPath) params.set('path', dirPath);
  const baseName = (dirPath || 'workspace').split('/').pop() || 'workspace';
  const filename = `${baseName}-archive.tar.gz`;
  const url = `${API_BASE}/instances/${instanceId}/sandbox/files/download-archive?${params}`;
  return triggerBlobDownload(url, filename);
}

export async function uploadFileToSandbox(
  instanceId: string,
  fileName: string,
  content: string, // base64
  targetDir?: string,
): Promise<{ success: boolean; path: string; size: number }> {
  return apiFetch(`/instances/${instanceId}/sandbox/files/upload`, {
    method: 'POST',
    body: JSON.stringify({ fileName, content, filePath: targetDir }),
  });
}
