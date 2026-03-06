import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { InstancePublic, WSMessage, TurnSummary, ExecutionConfig, ExecutionMetrics, ExecutionGraph } from '@shared/types';
import { fetchInstances, createWebSocket, fetchExecutionsApi } from '@/lib/api';
import {
  type TeamExecutionHistory,
  getTeamExecutions,
} from '@/lib/storage';

interface PendingExchange {
  instanceId: string;
  instanceName: string;
  content: string;
  timestamp: string;
}

export interface ExecutionHistory {
  id: string;
  teamId: string;
  teamName: string;
  goal: string;
  turns: Array<{
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
  }>;
  edges: Array<{ from: string; to: string; actionType: string }>;
  graph?: ExecutionGraph;
  metrics?: ExecutionMetrics;
  status: 'running' | 'completed' | 'failed' | 'timeout' | 'cancelled';
  summary?: string;
  createdAt: string;
  completedAt?: string;
}

export function useInstanceManager() {
  const [instances, setInstances] = useState<InstancePublic[]>([]);
  const [taskStreams, setTaskStreams] = useState<Record<string, string>>({});

  const stats = useMemo(() => ({
    total: instances.length,
    online: instances.filter(i => i.status === 'online').length,
    busy: instances.filter(i => i.status === 'busy').length,
    offline: instances.filter(i => i.status === 'offline').length,
  }), [instances]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const taskContentRef = useRef<Record<string, string>>({});
  const pendingExchangesRef = useRef<Record<string, PendingExchange>>({});
  const instancesRef = useRef<InstancePublic[]>([]);

  // Keep instancesRef in sync for use inside callbacks without stale closure
  useEffect(() => {
    instancesRef.current = instances;
  }, [instances]);

  const loadInstances = useCallback(async () => {
    try {
      const data = await fetchInstances();
      setInstances(data.instances);
    } catch {
      // will retry on reconnect
    }
  }, []);

  const handleWSMessage = useCallback((msg: WSMessage) => {
    switch (msg.type) {
      case 'instance:status':
        if (msg.payload.instances) {
          setInstances(msg.payload.instances);
        } else if (msg.payload.instanceId) {
          setInstances(prev =>
            prev.map(inst =>
              inst.id === msg.payload.instanceId
                ? { ...inst, status: msg.payload.status }
                : inst
            )
          );
        }
        break;

      case 'task:status': {
        const serverTaskId = msg.payload?.id || msg.taskId;
        if (serverTaskId) {
          const pending = pendingExchangesRef.current[serverTaskId];
          if (pending) {
            delete pendingExchangesRef.current[serverTaskId];
          }
        }

        if (msg.payload.status === 'running' || msg.payload.status === 'pending') {
          setInstances(prev =>
            prev.map(inst => {
              if (inst.id !== msg.instanceId) return inst;
              const isNewTask = !inst.currentTask || inst.currentTask.id !== msg.payload.id;
              return {
                ...inst,
                currentTask: isNewTask ? msg.payload : { ...inst.currentTask, ...msg.payload },
                status: 'busy',
              };
            })
          );
          if (msg.instanceId) {
            setTaskStreams(prev => {
              const next = { ...prev };
              delete next[msg.instanceId!];
              return next;
            });
          }
        }
        break;
      }

      case 'task:stream': {
        const chunk = msg.payload.chunk || '';
        setTaskStreams(prev => ({
          ...prev,
          [msg.instanceId!]: (prev[msg.instanceId!] || '') + chunk,
        }));
        if (msg.taskId) {
          taskContentRef.current[msg.taskId] = (taskContentRef.current[msg.taskId] || '') + chunk;
        }
        if (msg.taskId && msg.payload.summary) {
          setInstances(prev =>
            prev.map(inst =>
              inst.id === msg.instanceId && inst.currentTask
                ? { ...inst, currentTask: { ...inst.currentTask, summary: msg.payload.summary } }
                : inst
            )
          );
        }
        break;
      }

      case 'task:complete':
        if (msg.taskId) {
          delete taskContentRef.current[msg.taskId];
        }
        setInstances(prev =>
          prev.map(inst =>
            inst.id === msg.instanceId
              ? { ...inst, status: 'online', currentTask: inst.currentTask ? { ...inst.currentTask, status: 'completed', summary: msg.payload.summary } : undefined }
              : inst
          )
        );
        setTaskStreams(prev => {
          const next = { ...prev };
          delete next[msg.instanceId!];
          return next;
        });
        loadInstances();
        notifyRef.current?.('Task Completed', msg.payload.summary || 'A task has finished');
        break;

      case 'task:cancelled':
        if (msg.taskId) {
          delete taskContentRef.current[msg.taskId];
        }
        setInstances(prev =>
          prev.map(inst =>
            inst.id === msg.instanceId
              ? { ...inst, status: 'online', currentTask: inst.currentTask ? { ...inst.currentTask, status: 'cancelled' } : undefined }
              : inst
          )
        );
        setTaskStreams(prev => {
          const next = { ...prev };
          delete next[msg.instanceId!];
          return next;
        });
        loadInstances();
        break;

      case 'task:error':
        if (msg.taskId) {
          delete taskContentRef.current[msg.taskId];
        }
        setInstances(prev =>
          prev.map(inst =>
            inst.id === msg.instanceId
              ? { ...inst, status: 'online', currentTask: inst.currentTask ? { ...inst.currentTask, status: 'failed' } : undefined }
              : inst
          )
        );
        loadInstances();
        notifyRef.current?.('Task Failed', msg.payload.error || 'A task has failed');
        break;

      // ── Autonomous Execution Events ──

      case 'execution:started': {
        const execId = msg.payload.executionId;
        activeExecutionRef.current = {
          id: execId,
          teamId: msg.payload.teamId || msg.teamId || '',
          teamName: msg.payload.teamName || '',
          goal: msg.payload.goal || '',
          turns: [],
          edges: [],
          status: 'running',
          createdAt: msg.timestamp,
        };
        setExecutionLogs(prev => [...prev, {
          executionId: execId,
          message: `Execution started: ${msg.payload.goal}`,
          type: 'execution:started',
          timestamp: msg.timestamp,
        }]);
        break;
      }

      case 'execution:turn_start': {
        const turn = msg.payload.turn as TurnSummary;
        if (activeExecutionRef.current) {
          const existing = activeExecutionRef.current.turns.find(t => t.id === turn.id);
          if (!existing) {
            activeExecutionRef.current.turns.push({
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
            });
          }
        }
        setExecutionLogs(prev => [...prev, {
          executionId: msg.payload.executionId,
          message: msg.payload.message || `Turn ${turn.seq}: ${turn.role} started`,
          type: 'execution:turn_start',
          timestamp: msg.timestamp,
          turnId: turn.id,
          role: turn.role,
        }]);
        break;
      }

      case 'execution:turn_stream': {
        const { turnId, chunk } = msg.payload;
        setExecutionStreams(prev => ({
          ...prev,
          [turnId]: (prev[turnId] || '') + chunk,
        }));
        if (activeExecutionRef.current) {
          const turnRec = activeExecutionRef.current.turns.find(t => t.id === turnId);
          if (turnRec) turnRec.output += chunk;
        }
        // Also update instance-level streams for UI
        if (msg.instanceId) {
          setTaskStreams(prev => ({
            ...prev,
            [msg.instanceId!]: (prev[msg.instanceId!] || '') + chunk,
          }));
        }
        break;
      }

      case 'execution:turn_complete': {
        const turn = msg.payload.turn as TurnSummary;
        if (activeExecutionRef.current) {
          const turnRec = activeExecutionRef.current.turns.find(t => t.id === turn.id);
          if (turnRec) {
            turnRec.status = 'completed';
            turnRec.completedAt = msg.timestamp;
            turnRec.durationMs = turn.durationMs;
            turnRec.actionType = turn.actionType;
            turnRec.actionSummary = turn.actionSummary;
          }
        }
        // Clear instance stream
        if (msg.instanceId) {
          setTaskStreams(prev => {
            const next = { ...prev };
            delete next[msg.instanceId!];
            return next;
          });
        }
        setExecutionStreams(prev => {
          const next = { ...prev };
          delete next[turn.id];
          return next;
        });
        setExecutionLogs(prev => [...prev, {
          executionId: msg.payload.executionId,
          message: `Turn ${turn.seq}: ${turn.role} completed${msg.payload.action ? ` → ${msg.payload.action.summary}` : ''}`,
          type: 'execution:turn_complete',
          timestamp: msg.timestamp,
          turnId: turn.id,
          role: turn.role,
        }]);
        break;
      }

      case 'execution:turn_failed': {
        const turn = msg.payload.turn as TurnSummary;
        if (activeExecutionRef.current) {
          const turnRec = activeExecutionRef.current.turns.find(t => t.id === turn.id);
          if (turnRec) {
            turnRec.status = 'failed';
            turnRec.completedAt = msg.timestamp;
            turnRec.output = msg.payload.error || '';
          }
        }
        setExecutionLogs(prev => [...prev, {
          executionId: msg.payload.executionId,
          message: `Turn ${turn.seq}: ${turn.role} FAILED — ${msg.payload.error}`,
          type: 'execution:turn_failed',
          timestamp: msg.timestamp,
          turnId: turn.id,
          role: turn.role,
        }]);
        break;
      }

      case 'execution:edge_created': {
        if (activeExecutionRef.current) {
          activeExecutionRef.current.edges.push({
            from: msg.payload.from,
            to: msg.payload.to,
            actionType: msg.payload.actionType,
          });
        }
        break;
      }

      case 'execution:warning': {
        setExecutionLogs(prev => [...prev, {
          executionId: msg.payload.executionId || '',
          message: `WARNING: ${msg.payload.message}`,
          type: 'execution:warning',
          timestamp: msg.timestamp,
        }]);
        break;
      }

      case 'execution:completed': {
        if (activeExecutionRef.current) {
          const exec = activeExecutionRef.current;
          exec.status = msg.payload.status === 'failed' ? 'failed' : 'completed';
          exec.completedAt = msg.timestamp;
          exec.summary = msg.payload.summary;
          exec.graph = msg.payload.graph;
          exec.metrics = msg.payload.metrics;
          if (msg.payload.teamName) exec.teamName = msg.payload.teamName;
          if (msg.payload.goal) exec.goal = msg.payload.goal;

          setExecutions(prev => [exec, ...prev.filter(e => e.id !== exec.id)]);
          activeExecutionRef.current = null;
        }
        setExecutionLogs(prev => [...prev, {
          executionId: msg.payload.executionId,
          message: `Execution completed: ${msg.payload.summary}`,
          type: 'execution:completed',
          timestamp: msg.timestamp,
        }]);
        notifyRef.current?.('Execution Completed', msg.payload.summary || 'Team execution finished');
        break;
      }

      case 'execution:timeout': {
        if (activeExecutionRef.current) {
          const exec = activeExecutionRef.current;
          exec.status = 'timeout';
          exec.completedAt = msg.timestamp;
          exec.graph = msg.payload.graph;
          exec.metrics = msg.payload.metrics;

          setExecutions(prev => [exec, ...prev.filter(e => e.id !== exec.id)]);
          activeExecutionRef.current = null;
        }
        setExecutionLogs(prev => [...prev, {
          executionId: msg.payload.executionId,
          message: `Execution TIMEOUT: ${msg.payload.message}`,
          type: 'execution:timeout',
          timestamp: msg.timestamp,
        }]);
        notifyRef.current?.('Execution Timeout', msg.payload.message || 'Execution timed out');
        break;
      }

      case 'execution:cancelled': {
        if (activeExecutionRef.current) {
          const exec = activeExecutionRef.current;
          exec.status = 'cancelled';
          exec.completedAt = msg.timestamp;
          exec.summary = msg.payload.summary;
          exec.graph = msg.payload.graph;
          exec.metrics = msg.payload.metrics;

          setExecutions(prev => [exec, ...prev.filter(e => e.id !== exec.id)]);
          activeExecutionRef.current = null;
        }
        setExecutionLogs(prev => [...prev, {
          executionId: msg.payload.executionId,
          message: `Execution cancelled: ${msg.payload.summary}`,
          type: 'execution:cancelled',
          timestamp: msg.timestamp,
        }]);
        break;
      }

      // Legacy team:error (pre-execution validation errors)
      case 'team:error': {
        setExecutionLogs(prev => [...prev, {
          executionId: '',
          message: `Team error: ${msg.payload.error || msg.payload.message || 'Unknown error'}`,
          type: 'team:error',
          timestamp: msg.timestamp,
        }]);
        break;
      }
    }
  }, [loadInstances]);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = createWebSocket(handleWSMessage);

    ws.onopen = () => {
      setConnected(true);
      loadInstances();
    };

    ws.onclose = () => {
      setConnected(false);
      reconnectTimer.current = setTimeout(connect, 3000);
    };

    ws.onerror = () => {
      ws.close();
    };

    wsRef.current = ws;
  }, [handleWSMessage, loadInstances]);

  useEffect(() => {
    loadInstances();
    connect();
    return () => {
      reconnectTimer.current && clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect, loadInstances]);

  // Legacy team execution state (kept for backward compat with history drawer)
  const [teamLogs, setTeamLogs] = useState<Array<{ teamId: string; message: string; phase: string; timestamp: string }>>([]);
  const [teamExecutions, setTeamExecutions] = useState<TeamExecutionHistory[]>(() => getTeamExecutions());

  const clearTeamLogs = useCallback(() => setTeamLogs([]), []);

  const refreshTeamExecutions = useCallback(() => {
    setTeamExecutions(getTeamExecutions());
  }, []);

  // Notification callback ref
  const notifyRef = useRef<((title: string, body: string) => void) | null>(null);

  // New autonomous execution state
  const [executionLogs, setExecutionLogs] = useState<Array<{
    executionId: string;
    message: string;
    type: string;
    timestamp: string;
    turnId?: string;
    role?: string;
  }>>([]);
  const [executionStreams, setExecutionStreams] = useState<Record<string, string>>({});
  const activeExecutionRef = useRef<ExecutionHistory | null>(null);
  const [executions, setExecutions] = useState<ExecutionHistory[]>([]);

  const clearExecutionLogs = useCallback(() => setExecutionLogs([]), []);

  const loadExecutions = useCallback(async () => {
    try {
      const data = await fetchExecutionsApi();
      setExecutions(data.executions as unknown as ExecutionHistory[]);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadExecutions();
  }, [loadExecutions]);

  const activeExecution = activeExecutionRef.current;

  const dispatchTeamTask = useCallback((teamId: string, content: string, newSession?: boolean, config?: Partial<ExecutionConfig>) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({
      type: 'team:dispatch',
      payload: { teamId, content, newSession: newSession || undefined, config: config || undefined },
      timestamp: new Date().toISOString(),
    }));
  }, []);

  const cancelTask = useCallback((taskId: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({
      type: 'task:cancel',
      payload: { taskId },
      timestamp: new Date().toISOString(),
    }));
  }, []);

  const cancelExecution = useCallback((executionId: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({
      type: 'execution:cancel',
      payload: { executionId },
      timestamp: new Date().toISOString(),
    }));
  }, []);

  const setNotifyCallback = useCallback((fn: (title: string, body: string) => void) => {
    notifyRef.current = fn;
  }, []);

  const dispatchTask = useCallback((instanceId: string, content: string, instanceName: string, newSession?: boolean, imageUrls?: string[]) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    const taskId = self.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    const now = new Date().toISOString();

    taskContentRef.current[taskId] = '';

    const displayContent = imageUrls?.length
      ? `${content}${content ? '\n' : ''}[${imageUrls.length} image(s) attached]`
      : content;

    pendingExchangesRef.current[taskId] = { instanceId, instanceName, content: displayContent, timestamp: now };

    wsRef.current.send(JSON.stringify({
      type: 'task:dispatch',
      payload: { instanceId, content, taskId, newSession, imageUrls },
      timestamp: now,
    }));
  }, []);

  return {
    instances,
    stats,
    taskStreams,
    connected,
    dispatchTask,
    dispatchTeamTask,
    cancelTask,
    cancelExecution,
    teamLogs,
    clearTeamLogs,
    teamExecutions,
    refreshTeamExecutions,
    refreshInstances: loadInstances,
    // Autonomous execution
    executionLogs,
    executionStreams,
    executions,
    activeExecution,
    clearExecutionLogs,
    refreshExecutions: loadExecutions,
    setNotifyCallback,
  };
}
