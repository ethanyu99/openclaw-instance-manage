import type { TaskSummary } from '../../../shared/types';
import { v4 as uuid } from 'uuid';
import { getPool } from '../db';
import { getRedis } from '../redis';
import { saveTask, updateTaskOutput as updateTaskOutputDB } from '../persistence';
import { cacheDel, invalidateOwnerCaches, STATUS_TTL } from './cache';
import { rowToTask } from './row-mappers';

export const taskService = {
  async getTasks(ownerId: string, instanceId?: string): Promise<TaskSummary[]> {
    const pool = getPool();
    let query: string;
    let params: string[];

    if (instanceId) {
      query = 'SELECT * FROM tasks WHERE owner_id = $1 AND instance_id = $2 ORDER BY created_at ASC';
      params = [ownerId, instanceId];
    } else {
      query = 'SELECT * FROM tasks WHERE owner_id = $1 ORDER BY created_at ASC';
      params = [ownerId];
    }

    const { rows } = await pool.query(query, params);
    return rows.map(rowToTask);
  },

  async getTask(id: string): Promise<TaskSummary | undefined> {
    const pool = getPool();
    const { rows } = await pool.query('SELECT * FROM tasks WHERE id = $1', [id]);
    return rows.length > 0 ? rowToTask(rows[0]) : undefined;
  },

  async createTask(ownerId: string, instanceId: string, content: string, taskId?: string, sessionKey?: string): Promise<TaskSummary> {
    const id = taskId || uuid();
    const now = new Date().toISOString();
    const task: TaskSummary = { id, ownerId, instanceId, content, status: 'pending', sessionKey, createdAt: now, updatedAt: now };
    await saveTask(task);

    const redis = getRedis();
    await redis.set(`ocm:instance:currentTask:${instanceId}`, JSON.stringify(task), 'EX', STATUS_TTL);
    await cacheDel(`ocm:instance:raw:${instanceId}`);
    await invalidateOwnerCaches(ownerId);

    return task;
  },

  async updateTask(id: string, data: Partial<Pick<TaskSummary, 'status' | 'summary'>>): Promise<TaskSummary | undefined> {
    const pool = getPool();
    const { rows: existingRows } = await pool.query('SELECT * FROM tasks WHERE id = $1', [id]);
    if (existingRows.length === 0) return undefined;

    const existing = rowToTask(existingRows[0]);
    const updated = { ...existing, ...data, updatedAt: new Date().toISOString() };
    await saveTask(updated);

    const redis = getRedis();
    await redis.set(`ocm:instance:currentTask:${updated.instanceId}`, JSON.stringify(updated), 'EX', STATUS_TTL);

    if (data.status === 'completed' || data.status === 'failed' || data.status === 'cancelled') {
      await redis.set(`ocm:instance:status:${updated.instanceId}`, 'online', 'EX', STATUS_TTL);
    }

    await cacheDel(`ocm:instance:raw:${updated.instanceId}`);
    await invalidateOwnerCaches(updated.ownerId);

    return updated;
  },

  async updateTaskOutput(taskId: string, output: string): Promise<void> {
    await updateTaskOutputDB(taskId, output);
  },
};
