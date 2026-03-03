// Shared types between server and client

export interface Instance {
  id: string;
  name: string;
  endpoint: string;
  token?: string;
  apiKey?: string;
  description: string;
  status: 'online' | 'offline' | 'busy';
  sandboxId?: string;
  currentTask?: TaskSummary;
  createdAt: string;
  updatedAt: string;
}

export type InstancePublic = Omit<Instance, 'apiKey'> & { hasToken: boolean };

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
  sessionKey?: string;
  timestamp: string;
}

export interface TaskDispatchPayload {
  instanceId: string;
  content: string;
  taskId?: string;
  newSession?: boolean;
  imageUrls?: string[];
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

// OpenClaw Gateway Protocol types
export type OpenClawFrameType = 'req' | 'res' | 'event';

export interface OpenClawRequest {
  type: 'req';
  id: string;
  method: string;
  params: Record<string, unknown>;
}

export interface OpenClawResponse {
  type: 'res';
  id: string;
  ok: boolean;
  payload?: Record<string, unknown>;
  error?: { message: string; code?: string; details?: Record<string, unknown> };
}

export interface OpenClawEvent {
  type: 'event';
  event: string;
  payload: Record<string, unknown>;
  seq?: number;
  stateVersion?: number;
}

export type OpenClawFrame = OpenClawRequest | OpenClawResponse | OpenClawEvent;

// Sandbox creation progress types
export type SandboxProgressStep =
  | 'creating_sandbox'
  | 'sandbox_created'
  | 'writing_config'
  | 'config_written'
  | 'starting_gateway'
  | 'waiting_gateway'
  | 'gateway_ready'
  | 'starting_daemon'
  | 'daemon_started'
  | 'sandbox_ready';

export interface SandboxProgress {
  step: SandboxProgressStep;
  message: string;
  detail?: string;
}

export interface SandboxSSEEvent {
  type: 'progress' | 'complete' | 'error';
  step?: SandboxProgressStep;
  message?: string;
  detail?: string;
  instance?: InstancePublic;
  error?: string;
}

// WebSocket log entry
export interface WSLogEntry {
  timestamp: string;
  direction: 'outbound' | 'inbound';
  instanceId: string;
  instanceName: string;
  frameType: string;
  method?: string;
  event?: string;
  summary: string;
  raw: string;
}
