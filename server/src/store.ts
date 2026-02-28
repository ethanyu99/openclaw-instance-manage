import { Instance, TaskSummary } from '../../shared/types';
import { v4 as uuid } from 'uuid';

// In-memory store (first version)
const instances: Map<string, Instance> = new Map();
const tasks: Map<string, TaskSummary> = new Map();
const tasksByInstance: Map<string, string[]> = new Map();

export const store = {
  // Instance operations
  getInstances(): Instance[] {
    return Array.from(instances.values());
  },

  getInstance(id: string): Instance | undefined {
    return instances.get(id);
  },

  createInstance(data: Pick<Instance, 'name' | 'endpoint' | 'description'>): Instance {
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
    return instance;
  },

  updateInstance(id: string, data: Partial<Pick<Instance, 'name' | 'endpoint' | 'description' | 'status' | 'currentTask'>>): Instance | undefined {
    const instance = instances.get(id);
    if (!instance) return undefined;
    const updated = { ...instance, ...data, updatedAt: new Date().toISOString() };
    instances.set(id, updated);
    return updated;
  },

  deleteInstance(id: string): boolean {
    tasksByInstance.delete(id);
    return instances.delete(id);
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

  createTask(instanceId: string, content: string): TaskSummary {
    const id = uuid();
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

    // Update instance current task
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

    // Update instance current task
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
};
