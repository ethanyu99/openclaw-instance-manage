import { useState, useEffect, useRef, useCallback } from 'react';
import type { Instance, WSMessage, InstanceStats } from '@shared/types';
import { fetchInstances, createWebSocket } from '@/lib/api';
import { saveTaskEntry, updateTaskEntry, type TaskHistoryEntry } from '@/lib/storage';

export function useInstanceManager() {
  const [instances, setInstances] = useState<Instance[]>([]);
  const [stats, setStats] = useState<InstanceStats>({ total: 0, online: 0, busy: 0, offline: 0 });
  const [taskStreams, setTaskStreams] = useState<Record<string, string>>({});
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();

  const loadInstances = useCallback(async () => {
    try {
      const data = await fetchInstances();
      setInstances(data.instances);
      setStats(data.stats);
    } catch {
      // will retry on reconnect
    }
  }, []);

  const handleWSMessage = useCallback((msg: WSMessage) => {
    switch (msg.type) {
      case 'instance:status':
        if (msg.payload.instances) {
          // Initial state
          setInstances(msg.payload.instances);
          setStats(msg.payload.stats);
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

      case 'task:status':
        if (msg.payload.status === 'running' || msg.payload.status === 'pending') {
          setInstances(prev =>
            prev.map(inst =>
              inst.id === msg.instanceId
                ? { ...inst, currentTask: msg.payload, status: 'busy' }
                : inst
            )
          );
        }
        break;

      case 'task:stream':
        setTaskStreams(prev => ({
          ...prev,
          [msg.instanceId!]: (prev[msg.instanceId!] || '') + (msg.payload.chunk || ''),
        }));
        if (msg.taskId && msg.payload.summary) {
          updateTaskEntry(msg.taskId, { summary: msg.payload.summary });
          setInstances(prev =>
            prev.map(inst =>
              inst.id === msg.instanceId && inst.currentTask
                ? { ...inst, currentTask: { ...inst.currentTask, summary: msg.payload.summary } }
                : inst
            )
          );
        }
        break;

      case 'task:complete':
        if (msg.taskId) {
          updateTaskEntry(msg.taskId, {
            status: 'completed',
            summary: msg.payload.summary,
          });
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
        break;

      case 'task:error':
        if (msg.taskId) {
          updateTaskEntry(msg.taskId, {
            status: 'failed',
            summary: msg.payload.error,
          });
        }
        setInstances(prev =>
          prev.map(inst =>
            inst.id === msg.instanceId
              ? { ...inst, status: 'online', currentTask: inst.currentTask ? { ...inst.currentTask, status: 'failed' } : undefined }
              : inst
          )
        );
        loadInstances();
        break;
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
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect, loadInstances]);

  const dispatchTask = useCallback((instanceId: string, content: string, instanceName: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    const taskId = crypto.randomUUID();
    const now = new Date().toISOString();

    // Save to localStorage
    const entry: TaskHistoryEntry = {
      id: taskId,
      instanceId,
      instanceName,
      content,
      status: 'pending',
      timestamp: now,
      messages: [{ role: 'user', content, timestamp: now }],
    };
    saveTaskEntry(entry);

    wsRef.current.send(JSON.stringify({
      type: 'task:dispatch',
      payload: { instanceId, content },
      timestamp: now,
    }));
  }, []);

  return {
    instances,
    stats,
    taskStreams,
    connected,
    dispatchTask,
    refreshInstances: loadInstances,
  };
}
