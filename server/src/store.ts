import type { Instance, InstancePublic, TaskSummary } from '../../shared/types';
import { v4 as uuid } from 'uuid';
import { loadInstances, saveInstances } from './persistence';

const instances: Map<string, Instance> = loadInstances();
const tasks: Map<string, TaskSummary> = new Map();
const tasksByInstance: Map<string, string[]> = new Map();
const sessionKeys: Map<string, string> = new Map();

for (const id of instances.keys()) {
  tasksByInstance.set(id, []);
}

function persist() {
  saveInstances(instances);
}

function toPublic(inst: Instance): InstancePublic {
  const { token, apiKey, ...rest } = inst;
  return { ...rest, hasToken: !!token };
}

export const store = {
  getInstances(): InstancePublic[] {
    return Array.from(instances.values()).map(toPublic);
  },

  getInstanceRaw(id: string): Instance | undefined {
    return instances.get(id);
  },

  getInstance(id: string): InstancePublic | undefined {
    const inst = instances.get(id);
    return inst ? toPublic(inst) : undefined;
  },

  createInstance(data: Pick<Instance, 'name' | 'endpoint' | 'description'> & { token?: string; sandboxId?: string; apiKey?: string }): InstancePublic {
    const id = uuid();
    const now = new Date().toISOString();
    const instance: Instance = {
      id,
      ...data,
      status: 'offline',
      createdAt: now,
      updatedAt: now,
    };
    instances.set(id, instance);
    tasksByInstance.set(id, []);
    persist();
    return toPublic(instance);
  },

  updateInstance(id: string, data: Partial<Pick<Instance, 'name' | 'endpoint' | 'description' | 'status' | 'currentTask' | 'token' | 'sandboxId'>>): InstancePublic | undefined {
    const instance = instances.get(id);
    if (!instance) return undefined;

    const updateData: Partial<Instance> = { ...data, updatedAt: new Date().toISOString() };
    if (data.token === '') {
      updateData.token = undefined;
    }

    const updated = { ...instance, ...updateData };
    instances.set(id, updated);

    if (data.name !== undefined || data.endpoint !== undefined || data.description !== undefined || data.token !== undefined) {
      persist();
    }
    return toPublic(updated);
  },

  deleteInstance(id: string): boolean {
    tasksByInstance.delete(id);
    const deleted = instances.delete(id);
    if (deleted) persist();
    return deleted;
  },

  // Task operations
  getTasks(instanceId?: string): TaskSummary[] {
    if (instanceId) {
      const ids = tasksByInstance.get(instanceId) || [];
      return ids.map(id => tasks.get(id)!).filter(Boolean);
    }
    return Array.from(tasks.values());
  },

  getTask(id: string): TaskSummary | undefined {
    return tasks.get(id);
  },

  createTask(instanceId: string, content: string, taskId?: string): TaskSummary {
    const id = taskId || uuid();
    const now = new Date().toISOString();
    const task: TaskSummary = {
      id,
      instanceId,
      content,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    };
    tasks.set(id, task);
    const instanceTasks = tasksByInstance.get(instanceId) || [];
    instanceTasks.push(id);
    tasksByInstance.set(instanceId, instanceTasks);

    const instance = instances.get(instanceId);
    if (instance) {
      instances.set(instanceId, { ...instance, currentTask: task, updatedAt: now });
    }

    return task;
  },

  updateTask(id: string, data: Partial<Pick<TaskSummary, 'status' | 'summary'>>): TaskSummary | undefined {
    const task = tasks.get(id);
    if (!task) return undefined;
    const updated = { ...task, ...data, updatedAt: new Date().toISOString() };
    tasks.set(id, updated);

    if (data.status === 'completed' || data.status === 'failed') {
      const instance = instances.get(task.instanceId);
      if (instance && instance.currentTask?.id === id) {
        instances.set(task.instanceId, {
          ...instance,
          currentTask: updated,
          status: 'online',
          updatedAt: new Date().toISOString(),
        });
      }
    } else {
      const instance = instances.get(task.instanceId);
      if (instance) {
        instances.set(task.instanceId, {
          ...instance,
          currentTask: updated,
          updatedAt: new Date().toISOString(),
        });
      }
    }

    return updated;
  },

  getStats() {
    const all = Array.from(instances.values());
    return {
      total: all.length,
      online: all.filter(i => i.status === 'online').length,
      busy: all.filter(i => i.status === 'busy').length,
      offline: all.filter(i => i.status === 'offline').length,
    };
  },

  // Session key management — controls OpenResponses `user` field for session reuse
  getSessionKey(instanceId: string): string {
    const existing = sessionKeys.get(instanceId);
    if (existing) return existing;
    const key = `manager-${instanceId}`;
    sessionKeys.set(instanceId, key);
    return key;
  },

  resetSessionKey(instanceId: string): string {
    const key = `manager-${instanceId}-${Date.now()}`;
    sessionKeys.set(instanceId, key);
    return key;
  },
};
