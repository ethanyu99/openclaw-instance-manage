// Shared types between server and client

export interface Instance {
  id: string;
  name: string;
  endpoint: string;
  description: string;
  status: 'online' | 'offline' | 'busy';
  currentTask?: TaskSummary;
  createdAt: string;
  updatedAt: string;
}

export interface TaskSummary {
  id: string;
  instanceId: string;
  content: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  summary?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskMessage {
  id: string;
  taskId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}

export interface InstanceStats {
  total: number;
  online: number;
  busy: number;
  offline: number;
}

// WebSocket message types
export type WSMessageType =
  | 'task:dispatch'
  | 'task:status'
  | 'task:stream'
  | 'task:complete'
  | 'task:error'
  | 'instance:status';

export interface WSMessage {
  type: WSMessageType;
  payload: any;
  instanceId?: string;
  taskId?: string;
  timestamp: string;
}

export interface TaskDispatchPayload {
  instanceId: string;
  content: string;
}

export interface TaskStreamPayload {
  instanceId: string;
  taskId: string;
  chunk: string;
  summary?: string;
}

export interface InstanceStatusPayload {
  instanceId: string;
  status: Instance['status'];
}
