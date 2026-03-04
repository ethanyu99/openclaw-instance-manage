import { getPool } from './db';
import type { Instance, TaskSummary } from '../../shared/types';

export async function loadInstances(): Promise<Map<string, Instance>> {
  const pool = getPool();
  const map = new Map<string, Instance>();
  try {
    const { rows } = await pool.query('SELECT * FROM instances ORDER BY created_at ASC');
    for (const row of rows) {
      const instance: Instance = {
        id: row.id,
        ownerId: row.owner_id,
        name: row.name,
        endpoint: row.endpoint,
        token: row.token || undefined,
        apiKey: row.api_key || undefined,
        description: row.description || '',
        sandboxId: row.sandbox_id || undefined,
        status: 'offline',
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
      };
      map.set(instance.id, instance);
    }
  } catch (err) {
    console.error('[persistence] Failed to load instances from PG:', err);
  }
  return map;
}

export async function saveInstance(instance: Instance): Promise<void> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO instances (id, owner_id, name, endpoint, token, api_key, description, sandbox_id, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       endpoint = EXCLUDED.endpoint,
       token = EXCLUDED.token,
       api_key = EXCLUDED.api_key,
       description = EXCLUDED.description,
       sandbox_id = EXCLUDED.sandbox_id,
       updated_at = EXCLUDED.updated_at`,
    [
      instance.id,
      instance.ownerId,
      instance.name,
      instance.endpoint,
      instance.token || null,
      instance.apiKey || null,
      instance.description,
      instance.sandboxId || null,
      instance.createdAt,
      instance.updatedAt,
    ]
  );
}

export async function deleteInstanceFromDB(id: string): Promise<void> {
  const pool = getPool();
  await pool.query('DELETE FROM instances WHERE id = $1', [id]);
}

export async function loadTasks(): Promise<Map<string, TaskSummary>> {
  const pool = getPool();
  const map = new Map<string, TaskSummary>();
  try {
    const { rows } = await pool.query('SELECT * FROM tasks ORDER BY created_at ASC');
    for (const row of rows) {
      const task: TaskSummary = {
        id: row.id,
        ownerId: row.owner_id,
        instanceId: row.instance_id,
        content: row.content,
        status: row.status,
        summary: row.summary || undefined,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
      };
      map.set(task.id, task);
    }
  } catch (err) {
    console.error('[persistence] Failed to load tasks from PG:', err);
  }
  return map;
}

export async function saveTask(task: TaskSummary): Promise<void> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO tasks (id, owner_id, instance_id, content, status, summary, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (id) DO UPDATE SET
       status = EXCLUDED.status,
       summary = EXCLUDED.summary,
       updated_at = EXCLUDED.updated_at`,
    [
      task.id,
      task.ownerId,
      task.instanceId,
      task.content,
      task.status,
      task.summary || null,
      task.createdAt,
      task.updatedAt,
    ]
  );
}
