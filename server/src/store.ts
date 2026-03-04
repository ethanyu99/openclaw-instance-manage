import type { Instance, InstancePublic, TaskSummary } from '../../shared/types';
import { v4 as uuid } from 'uuid';
import {
  loadInstances,
  loadTasks,
  saveInstance,
  deleteInstanceFromDB,
  saveTask,
} from './persistence';

let instances: Map<string, Instance> = new Map();
let tasks: Map<string, TaskSummary> = new Map();
const tasksByInstance: Map<string, string[]> = new Map();
const sessionKeys: Map<string, string> = new Map();

function toPublic(inst: Instance): InstancePublic {
  const { apiKey, ...rest } = inst;
  return { ...rest, hasToken: !!inst.token };
}

function persistInstance(instance: Instance) {
  saveInstance(instance).catch(err =>
    console.error('[store] Failed to persist instance:', err)
  );
}

function persistTask(task: TaskSummary) {
  saveTask(task).catch(err =>
    console.error('[store] Failed to persist task:', err)
  );
}

export async function initStore() {
  instances = await loadInstances();
  tasks = await loadTasks();

  for (const id of instances.keys()) {
    tasksByInstance.set(id, []);
  }
  for (const task of tasks.values()) {
    const list = tasksByInstance.get(task.instanceId);
    if (list) {
      list.push(task.id);
    }
  }

  for (const task of tasks.values()) {
    if (task.status === 'running' || task.status === 'pending') {
      task.status = 'failed';
      task.summary = (task.summary || '') + '\n[Interrupted by server restart]';
      task.updatedAt = new Date().toISOString();
      persistTask(task);
    }
  }

  console.log(`[store] Loaded ${instances.size} instances, ${tasks.size} tasks from database`);
}

export const store = {
  getInstances(ownerId: string): InstancePublic[] {
    return Array.from(instances.values())
      .filter(i => i.ownerId === ownerId)
      .map(toPublic);
  },

  getInstanceRaw(id: string): Instance | undefined {
    return instances.get(id);
  },

  getInstanceRawForOwner(ownerId: string, id: string): Instance | undefined {
    const inst = instances.get(id);
    return inst?.ownerId === ownerId ? inst : undefined;
  },

  getInstance(ownerId: string, id: string): InstancePublic | undefined {
    const inst = instances.get(id);
    if (!inst || inst.ownerId !== ownerId) return undefined;
    return toPublic(inst);
  },

  createInstance(ownerId: string, data: Pick<Instance, 'name' | 'endpoint' | 'description'> & { token?: string; sandboxId?: string; apiKey?: string }): InstancePublic {
    const id = uuid();
    const now = new Date().toISOString();
    const instance: Instance = {
      id,
      ownerId,
      ...data,
      status: 'offline',
      createdAt: now,
      updatedAt: now,
    };
    instances.set(id, instance);
    tasksByInstance.set(id, []);
    persistInstance(instance);
    return toPublic(instance);
  },

  isNameTaken(ownerId: string, name: string, excludeId?: string): boolean {
    return Array.from(instances.values()).some(
      i => i.ownerId === ownerId && i.name === name && i.id !== excludeId,
    );
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

    const hasConfigChange = data.name !== undefined || data.endpoint !== undefined
      || data.description !== undefined || data.token !== undefined || data.sandboxId !== undefined;
    if (hasConfigChange) {
      persistInstance(updated);
    }
    return toPublic(updated);
  },

  deleteInstance(id: string): boolean {
    tasksByInstance.delete(id);
    const deleted = instances.delete(id);
    if (deleted) {
      deleteInstanceFromDB(id).catch(err =>
        console.error('[store] Failed to delete instance from DB:', err)
      );
    }
    return deleted;
  },

  getTasks(ownerId: string, instanceId?: string): TaskSummary[] {
    if (instanceId) {
      const ids = tasksByInstance.get(instanceId) || [];
      return ids.map(id => tasks.get(id)!).filter(t => t && t.ownerId === ownerId);
    }
    return Array.from(tasks.values()).filter(t => t.ownerId === ownerId);
  },

  getTask(id: string): TaskSummary | undefined {
    return tasks.get(id);
  },

  createTask(ownerId: string, instanceId: string, content: string, taskId?: string): TaskSummary {
    const id = taskId || uuid();
    const now = new Date().toISOString();
    const task: TaskSummary = {
      id,
      ownerId,
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

    persistTask(task);
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

    persistTask(updated);
    return updated;
  },

  getStats(ownerId: string) {
    const all = Array.from(instances.values()).filter(i => i.ownerId === ownerId);
    return {
      total: all.length,
      online: all.filter(i => i.status === 'online').length,
      busy: all.filter(i => i.status === 'busy').length,
      offline: all.filter(i => i.status === 'offline').length,
    };
  },

  getSessionKey(ownerId: string, instanceId: string): string {
    const compositeKey = `${ownerId}:${instanceId}`;
    const existing = sessionKeys.get(compositeKey);
    if (existing) return existing;
    const key = `${ownerId}-${instanceId}`;
    sessionKeys.set(compositeKey, key);
    return key;
  },

  resetSessionKey(ownerId: string, instanceId: string): string {
    const compositeKey = `${ownerId}:${instanceId}`;
    const key = `${ownerId}-${instanceId}-${Date.now()}`;
    sessionKeys.set(compositeKey, key);
    return key;
  },

  getOwnerByInstanceId(instanceId: string): string | undefined {
    return instances.get(instanceId)?.ownerId;
  },

  getAllInstancesRaw(): Instance[] {
    return Array.from(instances.values());
  },
};
