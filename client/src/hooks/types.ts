import type { ExecutionGraph, ExecutionMetrics } from '@shared/types';

export interface ExecutionLog {
  executionId: string;
  message: string;
  type: string;
  timestamp: string;
  turnId?: string;
  role?: string;
}

export interface ExecutionTurnRecord {
  id: string;
  seq: number;
  role: string;
  instanceId: string;
  task: string;
  output: string;
  actionType?: string;
  actionSummary?: string;
  status: string;
  depth: number;
  parentTurnId: string | null;
  durationMs?: number;
  startedAt?: string;
  completedAt?: string;
  tokenUsage?: { prompt: number; completion: number };
}

export interface ExecutionEdgeRecord {
  from: string;
  to: string;
  actionType: string;
}

export interface ExecutionHistory {
  id: string;
  teamId: string;
  teamName: string;
  goal: string;
  turns: ExecutionTurnRecord[];
  edges: ExecutionEdgeRecord[];
  graph?: ExecutionGraph;
  metrics?: ExecutionMetrics;
  status: 'running' | 'completed' | 'failed' | 'timeout' | 'cancelled';
  summary?: string;
  createdAt: string;
  completedAt?: string;
}

export interface PendingExchange {
  instanceId: string;
  instanceName: string;
  content: string;
  timestamp: string;
}
