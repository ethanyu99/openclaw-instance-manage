import type { SessionRecord, SessionDetail } from '@shared/types';
import { apiFetch } from './client';

export interface ActiveSessionInfo {
  sessionKey: string;
  topic?: string;
}

export async function fetchSessions(): Promise<{ sessions: SessionRecord[] }> {
  return apiFetch('/sessions');
}

export async function fetchSessionDetail(sessionKey: string): Promise<SessionDetail> {
  return apiFetch(`/sessions/${encodeURIComponent(sessionKey)}`);
}

export async function fetchShareSessionDetail(shareToken: string, sessionKey: string): Promise<SessionDetail> {
  return apiFetch(`/share/view/${shareToken}/sessions/${encodeURIComponent(sessionKey)}`);
}

export async function deleteSessionApi(sessionKey: string): Promise<void> {
  return apiFetch(`/sessions/${encodeURIComponent(sessionKey)}`, { method: 'DELETE' });
}

export async function clearSessionsApi(): Promise<void> {
  return apiFetch('/sessions', { method: 'DELETE' });
}

export async function updateSessionTopic(sessionKey: string, topic: string): Promise<void> {
  return apiFetch(`/sessions/${encodeURIComponent(sessionKey)}/topic`, {
    method: 'PATCH',
    body: JSON.stringify({ topic }),
  });
}

export async function fetchActiveSessions(): Promise<{ activeSessions: Record<string, ActiveSessionInfo> }> {
  return apiFetch('/sessions/active');
}
