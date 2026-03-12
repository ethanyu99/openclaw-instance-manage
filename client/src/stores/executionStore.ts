import { create } from 'zustand';
import type { WSMessage, TurnSummary } from '@shared/types';
import { fetchExecutionsApi } from '@/lib/api';
import type { ExecutionLog, ExecutionHistory } from '@/hooks/types';
import { useInstanceStore } from './instanceStore';

interface ExecutionState {
  executionLogs: ExecutionLog[];
  executionStreams: Record<string, string>;
  executions: ExecutionHistory[];
  activeExecution: ExecutionHistory | null;

  clearExecutionLogs: () => void;
  loadExecutions: () => Promise<void>;
  resetForNewDispatch: () => void;
  handleWSMessage: (msg: WSMessage) => void;

  _streamBuffer: Record<string, string>;
  _streamFlushTimer: ReturnType<typeof setTimeout> | null;
}

// ── Individual message handlers ──

function handleExecutionStarted(msg: WSMessage, set: Function) {
  const execId = msg.payload.executionId;
  const newExec: ExecutionHistory = {
    id: execId,
    teamId: msg.payload.teamId || msg.teamId || '',
    teamName: msg.payload.teamName || '',
    goal: msg.payload.goal || '',
    turns: [],
    edges: [],
    status: 'running',
    createdAt: msg.timestamp,
  };
  set((prev: ExecutionState) => ({
    activeExecution: newExec,
    executionLogs: [
      ...prev.executionLogs,
      {
        executionId: execId,
        message: `Execution started: ${msg.payload.goal}`,
        type: 'execution:started',
        timestamp: msg.timestamp,
      },
    ],
  }));
}

function handleTurnStart(msg: WSMessage, set: Function) {
  const turn = msg.payload.turn as TurnSummary;
  set((prev: ExecutionState) => {
    const active = prev.activeExecution;
    const log: ExecutionLog = {
      executionId: msg.payload.executionId,
      message: msg.payload.message || `Turn ${turn.seq}: ${turn.role} started`,
      type: 'execution:turn_start',
      timestamp: msg.timestamp,
      turnId: turn.id,
      role: turn.role,
    };

    if (active && !active.turns.some(t => t.id === turn.id)) {
      return {
        activeExecution: {
          ...active,
          turns: [
            ...active.turns,
            {
              id: turn.id,
              seq: turn.seq,
              role: turn.role,
              instanceId: turn.instanceId,
              task: turn.task,
              output: '',
              status: 'running',
              depth: turn.depth,
              parentTurnId: turn.parentTurnId,
              startedAt: msg.timestamp,
            },
          ],
        },
        executionLogs: [...prev.executionLogs, log],
      };
    }
    return { executionLogs: [...prev.executionLogs, log] };
  });
}

function handleTurnStream(msg: WSMessage, set: Function, get: Function) {
  const { turnId, chunk } = msg.payload;
  const state = get() as ExecutionState;

  // Buffer chunks and flush every 100ms
  state._streamBuffer[turnId] = (state._streamBuffer[turnId] || '') + chunk;

  if (!state._streamFlushTimer) {
    state._streamFlushTimer = setTimeout(() => {
      const s = get() as ExecutionState;
      const buffer = { ...s._streamBuffer };
      s._streamBuffer = {};
      s._streamFlushTimer = null;

      set((prev: ExecutionState) => {
        const active = prev.activeExecution;
        const nextStreams = { ...prev.executionStreams };

        for (const [id, buffered] of Object.entries(buffer)) {
          nextStreams[id] = (nextStreams[id] || '') + buffered;
        }

        const updatedActive = active
          ? {
              ...active,
              turns: active.turns.map(t => {
                const buffered = buffer[t.id];
                return buffered ? { ...t, output: t.output + buffered } : t;
              }),
            }
          : null;

        return {
          activeExecution: updatedActive,
          executionStreams: nextStreams,
        };
      });

      // Also flush to instance store
      for (const [, buffered] of Object.entries(buffer)) {
        if (msg.instanceId) {
          useInstanceStore.setState(prev => ({
            taskStreams: {
              ...prev.taskStreams,
              [msg.instanceId!]: (prev.taskStreams[msg.instanceId!] || '') + buffered,
            },
          }));
        }
      }
    }, 100);
  }
}

function handleTurnComplete(msg: WSMessage, set: Function) {
  const turn = msg.payload.turn as TurnSummary;
  set((prev: ExecutionState) => {
    const active = prev.activeExecution;
    const updatedActive = active
      ? {
          ...active,
          turns: active.turns.map(t =>
            t.id === turn.id
              ? {
                  ...t,
                  status: 'completed',
                  completedAt: msg.timestamp,
                  durationMs: turn.durationMs,
                  actionType: turn.actionType,
                  actionSummary: turn.actionSummary,
                }
              : t
          ),
        }
      : null;

    const streams = { ...prev.executionStreams };
    delete streams[turn.id];

    return {
      activeExecution: updatedActive,
      executionStreams: streams,
      executionLogs: [
        ...prev.executionLogs,
        {
          executionId: msg.payload.executionId,
          message: `Turn ${turn.seq}: ${turn.role} completed${msg.payload.action ? ` → ${msg.payload.action.summary}` : ''}`,
          type: 'execution:turn_complete',
          timestamp: msg.timestamp,
          turnId: turn.id,
          role: turn.role,
        },
      ],
    };
  });
  if (msg.instanceId) {
    useInstanceStore.setState(prev => {
      const streams = { ...prev.taskStreams };
      delete streams[msg.instanceId!];
      return { taskStreams: streams };
    });
  }
}

function handleTurnFailed(msg: WSMessage, set: Function) {
  const turn = msg.payload.turn as TurnSummary;
  set((prev: ExecutionState) => {
    const active = prev.activeExecution;
    const updatedActive = active
      ? {
          ...active,
          turns: active.turns.map(t =>
            t.id === turn.id
              ? { ...t, status: 'failed', completedAt: msg.timestamp, output: msg.payload.error || '' }
              : t
          ),
        }
      : null;
    return {
      activeExecution: updatedActive,
      executionLogs: [
        ...prev.executionLogs,
        {
          executionId: msg.payload.executionId,
          message: `Turn ${turn.seq}: ${turn.role} FAILED — ${msg.payload.error}`,
          type: 'execution:turn_failed',
          timestamp: msg.timestamp,
          turnId: turn.id,
          role: turn.role,
        },
      ],
    };
  });
}

function handleEdgeCreated(msg: WSMessage, set: Function) {
  set((prev: ExecutionState) => {
    const active = prev.activeExecution;
    if (!active) return {};
    return {
      activeExecution: {
        ...active,
        edges: [
          ...active.edges,
          { from: msg.payload.from, to: msg.payload.to, actionType: msg.payload.actionType },
        ],
      },
    };
  });
}

function handleExecutionWarning(msg: WSMessage, set: Function) {
  set((prev: ExecutionState) => ({
    executionLogs: [
      ...prev.executionLogs,
      {
        executionId: msg.payload.executionId || '',
        message: `WARNING: ${msg.payload.message}`,
        type: 'execution:warning',
        timestamp: msg.timestamp,
      },
    ],
  }));
}

function handleExecutionCompleted(msg: WSMessage, set: Function) {
  const notifyFn = useInstanceStore.getState()._notifyFn;
  set((prev: ExecutionState) => {
    const active = prev.activeExecution;
    if (active) {
      const finalized: ExecutionHistory = {
        ...active,
        status: msg.payload.status === 'failed' ? 'failed' : 'completed',
        completedAt: msg.timestamp,
        summary: msg.payload.summary,
        graph: msg.payload.graph,
        metrics: msg.payload.metrics,
        teamName: msg.payload.teamName || active.teamName,
        goal: msg.payload.goal || active.goal,
      };
      return {
        activeExecution: null,
        executions: [finalized, ...prev.executions.filter(e => e.id !== finalized.id)],
        executionLogs: [
          ...prev.executionLogs,
          {
            executionId: msg.payload.executionId,
            message: `Execution completed: ${msg.payload.summary}`,
            type: 'execution:completed',
            timestamp: msg.timestamp,
          },
        ],
      };
    }
    return {};
  });
  notifyFn?.('Execution Completed', msg.payload.summary || 'Team execution finished');
}

function handleExecutionTimeout(msg: WSMessage, set: Function) {
  const notifyFn = useInstanceStore.getState()._notifyFn;
  set((prev: ExecutionState) => {
    const active = prev.activeExecution;
    if (active) {
      const finalized: ExecutionHistory = {
        ...active,
        status: 'timeout',
        completedAt: msg.timestamp,
        graph: msg.payload.graph,
        metrics: msg.payload.metrics,
      };
      return {
        activeExecution: null,
        executions: [finalized, ...prev.executions.filter(e => e.id !== finalized.id)],
        executionLogs: [
          ...prev.executionLogs,
          {
            executionId: msg.payload.executionId,
            message: `Execution TIMEOUT: ${msg.payload.message}`,
            type: 'execution:timeout',
            timestamp: msg.timestamp,
          },
        ],
      };
    }
    return {};
  });
  notifyFn?.('Execution Timeout', msg.payload.message || 'Execution timed out');
}

function handleExecutionCancelled(msg: WSMessage, set: Function) {
  set((prev: ExecutionState) => {
    const active = prev.activeExecution;
    if (active) {
      const finalized: ExecutionHistory = {
        ...active,
        status: 'cancelled',
        completedAt: msg.timestamp,
        summary: msg.payload.summary,
        graph: msg.payload.graph,
        metrics: msg.payload.metrics,
      };
      return {
        activeExecution: null,
        executions: [finalized, ...prev.executions.filter(e => e.id !== finalized.id)],
        executionLogs: [
          ...prev.executionLogs,
          {
            executionId: msg.payload.executionId,
            message: `Execution cancelled: ${msg.payload.summary}`,
            type: 'execution:cancelled',
            timestamp: msg.timestamp,
          },
        ],
      };
    }
    return {};
  });
}

function handleTeamError(msg: WSMessage, set: Function) {
  set((prev: ExecutionState) => ({
    executionLogs: [
      ...prev.executionLogs,
      {
        executionId: '',
        message: `Team error: ${msg.payload.error || msg.payload.message || 'Unknown error'}`,
        type: 'team:error',
        timestamp: msg.timestamp,
      },
    ],
  }));
}

// ── Store ──

export const useExecutionStore = create<ExecutionState>((set, get) => ({
  executionLogs: [],
  executionStreams: {},
  executions: [],
  activeExecution: null,
  _streamBuffer: {},
  _streamFlushTimer: null,

  clearExecutionLogs: () => set({ executionLogs: [] }),

  loadExecutions: async () => {
    try {
      const data = await fetchExecutionsApi();
      set({ executions: data.executions as unknown as ExecutionHistory[] });
    } catch (err) {
      console.warn('Failed to load executions:', err);
    }
  },

  resetForNewDispatch: () =>
    set({ executionLogs: [], executionStreams: {}, activeExecution: null }),

  handleWSMessage: (msg) => {
    switch (msg.type) {
      case 'execution:started':     return handleExecutionStarted(msg, set);
      case 'execution:turn_start':  return handleTurnStart(msg, set);
      case 'execution:turn_stream': return handleTurnStream(msg, set, get);
      case 'execution:turn_complete': return handleTurnComplete(msg, set);
      case 'execution:turn_failed': return handleTurnFailed(msg, set);
      case 'execution:edge_created': return handleEdgeCreated(msg, set);
      case 'execution:warning':     return handleExecutionWarning(msg, set);
      case 'execution:completed':   return handleExecutionCompleted(msg, set);
      case 'execution:timeout':     return handleExecutionTimeout(msg, set);
      case 'execution:cancelled':   return handleExecutionCancelled(msg, set);
      case 'team:error':            return handleTeamError(msg, set);
    }
  },
}));
