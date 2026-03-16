import { create } from 'zustand';
import type { WSMessage, ExecutionConfig } from '@shared/types';
import { createWebSocket } from '@/lib/api';
import { useInstanceStore } from './instanceStore';
import { useExecutionStore } from './executionStore';

const RECONNECT_DELAY_MS = 3000;

interface WSState {
  connected: boolean;
  _ws: WebSocket | null;
  _reconnectTimer: ReturnType<typeof setTimeout> | null;

  init: () => () => void;
  send: (data: object) => boolean;

  dispatchTask: (
    instanceId: string,
    content: string,
    instanceName: string,
    newSession?: boolean,
    imageUrls?: string[],
  ) => void;
  dispatchTeamTask: (
    teamId: string,
    content: string,
    newSession?: boolean,
    config?: Partial<ExecutionConfig>,
  ) => void;
  cancelTask: (taskId: string) => void;
  cancelExecution: (executionId: string) => void;
}

function routeMessage(msg: WSMessage) {
  if (msg.type.startsWith('execution:') || msg.type === 'team:error') {
    useExecutionStore.getState().handleWSMessage(msg);
  } else {
    useInstanceStore.getState().handleWSMessage(msg);
  }
}

export const useWSStore = create<WSState>((set, get) => ({
  connected: false,
  _ws: null,
  _reconnectTimer: null,

  send: (data) => {
    const ws = get()._ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify(data));
    return true;
  },

  init: () => {
    const connect = () => {
      const existing = get()._ws;
      if (existing?.readyState === WebSocket.OPEN) return;

      const ws = createWebSocket(routeMessage);

      ws.onopen = () => {
        set({ connected: true });
        useInstanceStore.getState().loadInstances();
        useInstanceStore.getState().loadActiveSessions();
      };

      ws.onclose = () => {
        set({ connected: false });
        const timer = setTimeout(connect, RECONNECT_DELAY_MS);
        set({ _reconnectTimer: timer });
      };

      ws.onerror = () => ws.close();

      set({ _ws: ws });
    };

    useInstanceStore.getState().loadInstances();
    useInstanceStore.getState().loadActiveSessions();
    useExecutionStore.getState().loadExecutions();
    connect();

    return () => {
      const { _ws, _reconnectTimer } = get();
      if (_reconnectTimer) clearTimeout(_reconnectTimer);
      _ws?.close();
      set({ _ws: null, _reconnectTimer: null, connected: false });
    };
  },

  dispatchTask: (instanceId, content, instanceName, newSession, imageUrls) => {
    const taskId = self.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    const now = new Date().toISOString();

    const store = useInstanceStore.getState();
    store._taskContentRef[taskId] = '';

    const displayContent = imageUrls?.length
      ? `${content}${content ? '\n' : ''}[${imageUrls.length} image(s) attached]`
      : content;

    store._pendingExchanges[taskId] = { instanceId, instanceName, content: displayContent, timestamp: now };

    get().send({
      type: 'task:dispatch',
      payload: { instanceId, content, taskId, newSession, imageUrls },
      timestamp: now,
    });
  },

  dispatchTeamTask: (teamId, content, newSession, config) => {
    if (newSession) useExecutionStore.getState().resetForNewDispatch();

    get().send({
      type: 'team:dispatch',
      payload: { teamId, content, newSession: newSession || undefined, config: config || undefined },
      timestamp: new Date().toISOString(),
    });
  },

  cancelTask: (taskId) => {
    get().send({
      type: 'task:cancel',
      payload: { taskId },
      timestamp: new Date().toISOString(),
    });
  },

  cancelExecution: (executionId) => {
    get().send({
      type: 'execution:cancel',
      payload: { executionId },
      timestamp: new Date().toISOString(),
    });
  },
}));
