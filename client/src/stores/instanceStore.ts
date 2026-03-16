import { create } from 'zustand';
import type { InstancePublic, InstanceStats, WSMessage } from '@shared/types';
import { fetchInstances, fetchActiveSessions } from '@/lib/api';
import type { ActiveSessionInfo } from '@/lib/api';

interface PendingExchange {
  instanceId: string;
  instanceName: string;
  content: string;
  timestamp: string;
}

interface InstanceState {
  instances: InstancePublic[];
  taskStreams: Record<string, string>;
  stats: InstanceStats;
  activeSessions: Record<string, ActiveSessionInfo>;

  loadInstances: () => Promise<void>;
  loadActiveSessions: () => Promise<void>;
  handleWSMessage: (msg: WSMessage) => void;

  _notifyFn: ((title: string, body: string) => void) | null;
  setNotifyCallback: (fn: (title: string, body: string) => void) => void;

  _taskContentRef: Record<string, string>;
  _pendingExchanges: Record<string, PendingExchange>;
  _streamBuffer: Record<string, string>;
  _streamFlushTimer: ReturnType<typeof setTimeout> | null;
}

function computeStats(instances: InstancePublic[]): InstanceStats {
  return {
    total: instances.length,
    online: instances.filter(i => i.status === 'online').length,
    busy: instances.filter(i => i.status === 'busy').length,
    offline: instances.filter(i => i.status === 'offline').length,
  };
}

function setInstancesAndStats(instances: InstancePublic[]) {
  return { instances, stats: computeStats(instances) };
}

export const useInstanceStore = create<InstanceState>((set, get) => ({
  instances: [],
  taskStreams: {},
  stats: { total: 0, online: 0, busy: 0, offline: 0 },
  activeSessions: {},
  _notifyFn: null,
  _taskContentRef: {},
  _pendingExchanges: {},
  _streamBuffer: {},
  _streamFlushTimer: null,

  setNotifyCallback: (fn) => set({ _notifyFn: fn }),

  loadInstances: async () => {
    try {
      const data = await fetchInstances();
      set(setInstancesAndStats(data.instances));
    } catch (err) {
      console.warn('Failed to load instances:', err);
    }
  },

  loadActiveSessions: async () => {
    try {
      const { activeSessions } = await fetchActiveSessions();
      set({ activeSessions });
    } catch (err) {
      console.warn('Failed to load active sessions:', err);
    }
  },

  handleWSMessage: (msg) => {
    const state = get();

    switch (msg.type) {
      case 'instance:status': {
        if (msg.payload.instances) {
          set(setInstancesAndStats(msg.payload.instances));
        } else if (msg.payload.instanceId) {
          const updated = state.instances.map(inst =>
            inst.id === msg.payload.instanceId
              ? { ...inst, status: msg.payload.status }
              : inst
          );
          set(setInstancesAndStats(updated));
        }
        break;
      }

      case 'task:status': {
        const serverTaskId = msg.payload?.id || msg.taskId;
        if (serverTaskId) {
          delete state._pendingExchanges[serverTaskId];
        }

        if (msg.payload.status === 'running' || msg.payload.status === 'pending') {
          const updated = state.instances.map(inst => {
            if (inst.id !== msg.instanceId) return inst;
            const isNewTask = !inst.currentTask || inst.currentTask.id !== msg.payload.id;
            return {
              ...inst,
              currentTask: isNewTask ? msg.payload : { ...inst.currentTask, ...msg.payload },
              status: 'busy' as const,
            };
          });
          set(setInstancesAndStats(updated));

          if (msg.instanceId) {
            set(prev => {
              const next = { ...prev.taskStreams };
              delete next[msg.instanceId!];
              return { taskStreams: next };
            });
          }
        }
        break;
      }

      case 'task:stream': {
        const chunk = msg.payload.chunk || '';
        const instanceId = msg.instanceId!;

        // Buffer stream chunks and flush every 100ms
        state._streamBuffer[instanceId] = (state._streamBuffer[instanceId] || '') + chunk;

        if (msg.taskId) {
          state._taskContentRef[msg.taskId] = (state._taskContentRef[msg.taskId] || '') + chunk;
        }

        if (!state._streamFlushTimer) {
          state._streamFlushTimer = setTimeout(() => {
            const s = get();
            const buffer = { ...s._streamBuffer };
            s._streamBuffer = {};
            s._streamFlushTimer = null;

            set(prev => {
              const nextStreams = { ...prev.taskStreams };
              for (const [id, buffered] of Object.entries(buffer)) {
                nextStreams[id] = (nextStreams[id] || '') + buffered;
              }
              return { taskStreams: nextStreams };
            });
          }, 100);
        }

        if (msg.taskId && msg.payload.summary) {
          const updated = state.instances.map(inst =>
            inst.id === msg.instanceId && inst.currentTask
              ? { ...inst, currentTask: { ...inst.currentTask, summary: msg.payload.summary } }
              : inst
          );
          set(setInstancesAndStats(updated));
        }
        break;
      }

      case 'task:complete': {
        if (msg.taskId) delete state._taskContentRef[msg.taskId];
        const updated = state.instances.map(inst =>
          inst.id === msg.instanceId
            ? {
                ...inst,
                status: 'online' as const,
                currentTask: inst.currentTask
                  ? { ...inst.currentTask, status: 'completed' as const, summary: msg.payload.summary }
                  : undefined,
              }
            : inst
        );
        set(prev => {
          const streams = { ...prev.taskStreams };
          delete streams[msg.instanceId!];
          return { ...setInstancesAndStats(updated), taskStreams: streams };
        });
        get().loadInstances();
        state._notifyFn?.('Task Completed', msg.payload.summary || 'A task has finished');
        break;
      }

      case 'task:cancelled': {
        if (msg.taskId) delete state._taskContentRef[msg.taskId];
        const updated = state.instances.map(inst =>
          inst.id === msg.instanceId
            ? {
                ...inst,
                status: 'online' as const,
                currentTask: inst.currentTask
                  ? { ...inst.currentTask, status: 'cancelled' as const }
                  : undefined,
              }
            : inst
        );
        set(prev => {
          const streams = { ...prev.taskStreams };
          delete streams[msg.instanceId!];
          return { ...setInstancesAndStats(updated), taskStreams: streams };
        });
        get().loadInstances();
        break;
      }

      case 'task:error': {
        if (msg.taskId) delete state._taskContentRef[msg.taskId];
        const updated = state.instances.map(inst =>
          inst.id === msg.instanceId
            ? {
                ...inst,
                status: 'online' as const,
                currentTask: inst.currentTask
                  ? { ...inst.currentTask, status: 'failed' as const }
                  : undefined,
              }
            : inst
        );
        set(setInstancesAndStats(updated));
        get().loadInstances();
        state._notifyFn?.('Task Failed', msg.payload.error || 'A task has failed');
        break;
      }
    }
  },
}));
