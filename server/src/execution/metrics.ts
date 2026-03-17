/**
 * Pure functions for computing execution metrics and building graphs.
 * No side effects, no imports of store/redis.
 */
import type {
  Execution, Turn, TurnSummary, TurnAction,
  ExecutionMetrics, ExecutionGraph, GraphNode, GraphEdge,
} from '../../../shared/types';
import { describeAction } from './prompt-builder';

export function buildExecutionGraph(execution: Execution): ExecutionGraph {
  const nodes: GraphNode[] = execution.turns
    .filter(t => t.status === 'completed' || t.status === 'failed')
    .map(t => ({
      id: t.id,
      seq: t.seq,
      role: t.role,
      instanceId: t.instanceId,
      task: t.task.slice(0, 120),
      output: t.output.slice(0, 200),
      actionType: t.action?.type || 'none',
      status: t.status,
      durationMs: t.durationMs || 0,
      depth: t.depth,
    }));

  const edges: GraphEdge[] = execution.turns
    .filter(t => t.parentTurnId)
    .map(t => ({
      id: `${t.parentTurnId}->${t.id}`,
      from: t.parentTurnId!,
      to: t.id,
      actionType: (t.triggerAction?.type || 'delegate') as GraphEdge['actionType'],
      label: t.triggerAction
        ? describeAction(t.triggerAction).slice(0, 60)
        : t.task.slice(0, 60),
    }));

  return { nodes, edges };
}

export function computeMetrics(execution: Execution): ExecutionMetrics {
  const completed = execution.turns.filter(t => t.status === 'completed');
  const turnsByRole: Record<string, number> = {};
  let feedbackCycles = 0;
  let maxDepth = 0;
  let totalPrompt = 0;
  let totalCompletion = 0;

  for (const t of completed) {
    turnsByRole[t.role] = (turnsByRole[t.role] || 0) + 1;
    if (t.depth > maxDepth) maxDepth = t.depth;
    if (t.action?.type === 'feedback') feedbackCycles++;
    if (t.tokenUsage) {
      totalPrompt += t.tokenUsage.prompt;
      totalCompletion += t.tokenUsage.completion;
    }
  }

  const totalDuration = execution.completedAt
    ? new Date(execution.completedAt).getTime() - new Date(execution.createdAt).getTime()
    : Date.now() - new Date(execution.createdAt).getTime();

  const durations = completed.map(t => t.durationMs || 0);
  const avgTurnDurationMs = durations.length > 0
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : 0;

  return {
    totalTurns: completed.length,
    totalDurationMs: totalDuration,
    turnsByRole,
    maxDepthReached: maxDepth,
    feedbackCycles,
    avgTurnDurationMs,
    tokenUsage: { prompt: totalPrompt, completion: totalCompletion },
  };
}

export function toTurnSummary(turn: Turn): TurnSummary {
  return {
    id: turn.id,
    seq: turn.seq,
    role: turn.role,
    instanceId: turn.instanceId,
    task: turn.task.slice(0, 200),
    status: turn.status,
    depth: turn.depth,
    parentTurnId: turn.parentTurnId,
    durationMs: turn.durationMs,
    actionType: turn.action?.type,
    actionSummary: turn.action ? describeAction(turn.action).slice(0, 100) : undefined,
  };
}
