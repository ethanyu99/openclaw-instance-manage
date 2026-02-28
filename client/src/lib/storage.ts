import type { InstancePublic, TaskSummary } from '@shared/types';

const SESSIONS_KEY = 'openclaw-sessions';

export interface SessionExchange {
  id: string;
  input: string;
  output?: string;
  summary?: string;
  status: TaskSummary['status'];
  timestamp: string;
  completedAt?: string;
}

export interface SessionHistory {
  sessionKey: string;
  instanceId: string;
  instanceName: string;
  createdAt: string;
  updatedAt: string;
  exchanges: SessionExchange[];
}

export function getSessions(): SessionHistory[] {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveSessions(sessions: SessionHistory[]): void {
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions.slice(0, 100)));
}

export function getSessionByKey(sessionKey: string): SessionHistory | undefined {
  return getSessions().find(s => s.sessionKey === sessionKey);
}

export function getExchangeById(taskId: string): { session: SessionHistory; exchange: SessionExchange } | undefined {
  for (const session of getSessions()) {
    const exchange = session.exchanges.find(e => e.id === taskId);
    if (exchange) return { session, exchange };
  }
  return undefined;
}

export function addExchangeToSession(
  sessionKey: string,
  instanceId: string,
  instanceName: string,
  exchange: SessionExchange,
): void {
  const sessions = getSessions();
  const idx = sessions.findIndex(s => s.sessionKey === sessionKey);
  const now = new Date().toISOString();

  if (idx >= 0) {
    sessions[idx].exchanges.push(exchange);
    sessions[idx].updatedAt = now;
    // Move to front
    const [session] = sessions.splice(idx, 1);
    sessions.unshift(session);
  } else {
    sessions.unshift({
      sessionKey,
      instanceId,
      instanceName,
      createdAt: now,
      updatedAt: now,
      exchanges: [exchange],
    });
  }

  saveSessions(sessions);
}

export function updateExchange(
  taskId: string,
  updates: Partial<Pick<SessionExchange, 'status' | 'summary' | 'output' | 'completedAt'>>,
): void {
  const sessions = getSessions();
  for (const session of sessions) {
    const ex = session.exchanges.find(e => e.id === taskId);
    if (ex) {
      Object.assign(ex, updates);
      session.updatedAt = new Date().toISOString();
      saveSessions(sessions);
      return;
    }
  }
}

export function clearSessions(): void {
  localStorage.setItem(SESSIONS_KEY, JSON.stringify([]));
}

export function deleteSession(sessionKey: string): void {
  const sessions = getSessions().filter(s => s.sessionKey !== sessionKey);
  saveSessions(sessions);
}

export function resolveInstanceByName(name: string, instances: InstancePublic[]): InstancePublic | undefined {
  const lower = name.toLowerCase();
  return instances.find(i => i.name.toLowerCase() === lower) ||
    instances.find(i => i.name.toLowerCase().startsWith(lower));
}
