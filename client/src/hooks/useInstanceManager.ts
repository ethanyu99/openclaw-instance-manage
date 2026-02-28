import { useState, useEffect, useRef, useCallback } from 'react';
import type { InstancePublic, WSMessage, InstanceStats } from '@shared/types';
import { fetchInstances, createWebSocket } from '@/lib/api';
import { addExchangeToSession, updateExchange, type SessionExchange } from '@/lib/storage';

interface PendingExchange {
  instanceId: string;
  instanceName: string;
  content: string;
  timestamp: string;
}

export function useInstanceManager() {
  const [instances, setInstances] = useState<InstancePublic[]>([]);
  const [stats, setStats] = useState<InstanceStats>({ total: 0, online: 0, busy: 0, offline: 0 });
  const [taskStreams, setTaskStreams] = useState<Record<string, string>>({});
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();
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
      setStats(data.stats);
    } catch {
      // will retry on reconnect
    }
  }, []);

  const handleWSMessage = useCallback((msg: WSMessage) => {
    switch (msg.type) {
      case 'instance:status':
        if (msg.payload.instances) {
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

      case 'task:status': {
        // Create session exchange entry when we get sessionKey from server
        const serverTaskId = msg.payload?.id || msg.taskId;
        if (msg.sessionKey && serverTaskId) {
          const pending = pendingExchangesRef.current[serverTaskId];
          if (pending) {
            const exchange: SessionExchange = {
              id: serverTaskId,
              input: pending.content,
              status: msg.payload?.status || 'pending',
              timestamp: pending.timestamp,
            };
            addExchangeToSession(msg.sessionKey, pending.instanceId, pending.instanceName, exchange);
            delete pendingExchangesRef.current[serverTaskId];
          } else if (msg.payload?.content) {
            // Server-created task (e.g., after reconnect)
            const inst = instancesRef.current.find(i => i.id === msg.instanceId);
            const exchange: SessionExchange = {
              id: serverTaskId,
              input: msg.payload.content,
              status: msg.payload.status || 'pending',
              timestamp: msg.payload.createdAt || new Date().toISOString(),
            };
            addExchangeToSession(msg.sessionKey, msg.instanceId!, inst?.name || msg.instanceId!, exchange);
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
          updateExchange(msg.taskId, { summary: msg.payload.summary });
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
          const output = taskContentRef.current[msg.taskId] || msg.payload.summary || '';
          updateExchange(msg.taskId, {
            status: 'completed',
            summary: msg.payload.summary,
            output,
            completedAt: new Date().toISOString(),
          });
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
        break;

      case 'task:error':
        if (msg.taskId) {
          const output = taskContentRef.current[msg.taskId] || '';
          updateExchange(msg.taskId, {
            status: 'failed',
            summary: msg.payload.error,
            output: output || undefined,
            completedAt: new Date().toISOString(),
          });
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

  const dispatchTask = useCallback((instanceId: string, content: string, instanceName: string, newSession?: boolean) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    const taskId = self.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    const now = new Date().toISOString();

    taskContentRef.current[taskId] = '';

    // Store pending exchange — will be committed when server replies with sessionKey
    pendingExchangesRef.current[taskId] = { instanceId, instanceName, content, timestamp: now };

    wsRef.current.send(JSON.stringify({
      type: 'task:dispatch',
      payload: { instanceId, content, taskId, newSession },
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
