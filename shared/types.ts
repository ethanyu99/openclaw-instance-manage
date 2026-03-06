// Shared types between server and client

// ──────────────────────────────────────
// Role & Team
// ──────────────────────────────────────

export interface ClawRole {
  id: string;
  name: string;
  description: string;
  capabilities: string[];
  isLead: boolean;
}

export interface TeamMemberSlot {
  roleId: string;
  instanceId?: string;
}

export interface Team {
  id: string;
  ownerId: string;
  name: string;
  description: string;
  members: TeamMemberSlot[];
  createdAt: string;
  updatedAt: string;
}

export type TeamPublic = Team & {
  roles: ClawRole[];
};

export interface TeamTemplate {
  id: string;
  name: string;
  description: string;
  roles: Omit<ClawRole, 'id'>[];
}

// ──────────────────────────────────────
// Instance
// ──────────────────────────────────────

export interface Instance {
  id: string;
  ownerId: string;
  name: string;
  endpoint: string;
  token?: string;
  apiKey?: string;
  description: string;
  status: 'online' | 'offline' | 'busy';
  sandboxId?: string;
  teamId?: string;
  roleId?: string;
  currentTask?: TaskSummary;
  createdAt: string;
  updatedAt: string;
}

export type InstancePublic = Omit<Instance, 'apiKey'> & {
  hasToken: boolean;
  role?: ClawRole;
};

export interface TaskSummary {
  id: string;
  ownerId: string;
  instanceId: string;
  content: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  summary?: string;
  sessionKey?: string;
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

// ──────────────────────────────────────
// Autonomous Collaboration Engine
// ──────────────────────────────────────

export interface ExecutionConfig {
  maxTurns: number;
  maxDepth: number;
  turnTimeoutMs: number;
  maxRetriesPerRole: number;
}

export interface ExecutionMetrics {
  totalTurns: number;
  totalDurationMs: number;
  turnsByRole: Record<string, number>;
  maxDepthReached: number;
  feedbackCycles: number;
  avgTurnDurationMs: number;
  tokenUsage: { prompt: number; completion: number };
}

export type ExecutionStatus = 'running' | 'completed' | 'failed' | 'timeout';

export interface Execution {
  id: string;
  teamId: string;
  ownerId: string;
  goal: string;
  status: ExecutionStatus;
  turns: Turn[];
  summary?: string;
  metrics: ExecutionMetrics;
  config: ExecutionConfig;
  createdAt: string;
  completedAt?: string;
}

export type TurnStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface Turn {
  id: string;
  executionId: string;
  seq: number;

  role: string;
  instanceId: string;

  parentTurnId: string | null;
  triggerAction: TurnAction | null;
  depth: number;

  task: string;

  output: string;
  action: TurnAction | null;

  status: TurnStatus;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
}

export interface DelegateAction {
  type: 'delegate';
  to: string;
  task: string;
  context: 'full' | 'summary' | 'none';
  message?: string;
}

export interface ReportAction {
  type: 'report';
  summary: string;
}

export interface FeedbackAction {
  type: 'feedback';
  to: string;
  issue: string;
  suggestion?: string;
}

export interface DoneAction {
  type: 'done';
  summary: string;
}

export interface MultiDelegateAction {
  type: 'multi_delegate';
  tasks: Array<{ to: string; task: string; context: 'full' | 'summary' | 'none' }>;
}

export type TurnAction =
  | DelegateAction
  | ReportAction
  | FeedbackAction
  | DoneAction
  | MultiDelegateAction;

export interface GraphNode {
  id: string;
  seq: number;
  role: string;
  instanceId: string;
  task: string;
  output: string;
  actionType: string;
  status: string;
  durationMs: number;
  depth: number;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  actionType: 'delegate' | 'report' | 'feedback' | 'done';
  label: string;
}

export interface ExecutionGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export type TurnSummary = Pick<Turn, 'id' | 'seq' | 'role' | 'instanceId' | 'task' | 'status' | 'depth' | 'parentTurnId' | 'durationMs'> & {
  actionType?: string;
  actionSummary?: string;
};

// ──────────────────────────────────────
// Share
// ──────────────────────────────────────

export interface ShareToken {
  id: string;
  token: string;
  ownerId: string;
  shareType: 'team' | 'instance';
  targetId: string;
  expiresAt: string;
  createdAt: string;
}

export type ShareDuration = '1h' | '3h' | '12h' | '1d' | '2d' | '3d';

export interface ShareViewData {
  shareType: 'team' | 'instance';
  ownerShortId: string;
  instances?: InstancePublic[];
  team?: TeamPublic;
  stats?: InstanceStats;
  expiresAt: string;
}

// WebSocket message types
export type WSMessageType =
  | 'task:dispatch'
  | 'task:status'
  | 'task:stream'
  | 'task:complete'
  | 'task:error'
  | 'task:cancel'
  | 'task:cancelled'
  | 'instance:status'
  | 'team:dispatch'
  | 'team:step'
  | 'team:complete'
  | 'team:error'
  | 'execution:started'
  | 'execution:turn_start'
  | 'execution:turn_stream'
  | 'execution:turn_complete'
  | 'execution:turn_failed'
  | 'execution:edge_created'
  | 'execution:warning'
  | 'execution:completed'
  | 'execution:timeout'
  | 'execution:cancel'
  | 'execution:cancelled';

export interface WSMessage {
  type: WSMessageType;
  payload: any;
  instanceId?: string;
  taskId?: string;
  teamId?: string;
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

export interface TeamDispatchPayload {
  teamId: string;
  content: string;
  newSession?: boolean;
  config?: Partial<ExecutionConfig>;
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

// ──────────────────────────────────────
// Session (server-persisted)
// ──────────────────────────────────────

export interface SessionRecord {
  sessionKey: string;
  ownerId: string;
  instanceId: string;
  instanceName: string;
  createdAt: string;
  updatedAt: string;
}

export interface SessionExchangeRecord {
  id: string;
  input: string;
  output?: string;
  summary?: string;
  status: TaskSummary['status'];
  timestamp: string;
  completedAt?: string;
}

export interface SessionDetail extends SessionRecord {
  exchanges: SessionExchangeRecord[];
}

// ──────────────────────────────────────
// Execution (server-persisted)
// ──────────────────────────────────────

export interface ExecutionRecord {
  id: string;
  ownerId: string;
  teamId: string;
  teamName: string;
  goal: string;
  summary?: string;
  status: ExecutionStatus | 'cancelled';
  turns: unknown[];
  edges: unknown[];
  graph?: ExecutionGraph;
  metrics?: ExecutionMetrics;
  createdAt: string;
  completedAt?: string;
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
