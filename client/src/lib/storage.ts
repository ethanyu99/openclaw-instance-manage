import type { Instance, TaskSummary } from '@shared/types';

const STORAGE_KEY = 'openclaw-task-history';

export interface TaskHistoryEntry {
  id: string;
  instanceId: string;
  instanceName: string;
  content: string;
  status: TaskSummary['status'];
  summary?: string;
  timestamp: string;
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
  }>;
}

export function getTaskHistory(): TaskHistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveTaskEntry(entry: TaskHistoryEntry): void {
  const history = getTaskHistory();
  const idx = history.findIndex(h => h.id === entry.id);
  if (idx >= 0) {
    history[idx] = entry;
  } else {
    history.unshift(entry);
  }
  // Keep last 100 entries
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(0, 100)));
}

export function updateTaskEntry(taskId: string, updates: Partial<TaskHistoryEntry>): void {
  const history = getTaskHistory();
  const idx = history.findIndex(h => h.id === taskId);
  if (idx >= 0) {
    history[idx] = { ...history[idx], ...updates };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  }
}

export function getInstanceHistory(instanceId: string): TaskHistoryEntry[] {
  return getTaskHistory().filter(h => h.instanceId === instanceId);
}

export function clearInstanceHistory(instanceId: string): void {
  const history = getTaskHistory().filter(h => h.instanceId !== instanceId);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
}

export function resolveInstanceByName(name: string, instances: Instance[]): Instance | undefined {
  const lower = name.toLowerCase();
  return instances.find(i => i.name.toLowerCase() === lower) ||
    instances.find(i => i.name.toLowerCase().startsWith(lower));
}
