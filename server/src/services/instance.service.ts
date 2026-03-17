import type { Instance, InstancePublic, ClawRole } from '../../../shared/types';
import { v4 as uuid } from 'uuid';
import { getPool } from '../db';
import { getRedis } from '../redis';
import { saveInstance, deleteInstanceFromDB } from '../persistence';
import { cacheGet, cacheSet, cacheDel, invalidateOwnerCaches, STATUS_TTL } from './cache';
import { rowToInstance, rowToRole, toPublic } from './row-mappers';

export const instanceService = {
  async getInstances(ownerId: string): Promise<InstancePublic[]> {
    const cacheKey = `ocm:instances:owner:${ownerId}`;
    const cached = await cacheGet<InstancePublic[]>(cacheKey);
    if (cached) return cached;

    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT i.*, r.id as r_id, r.name as r_name, r.description as r_desc, r.capabilities as r_caps, r.is_lead as r_is_lead
       FROM instances i
       LEFT JOIN roles r ON i.role_id = r.id
       WHERE i.owner_id = $1
       ORDER BY i.created_at ASC`,
      [ownerId]
    );

    const redis = getRedis();
    const instances = rows.map(row => rowToInstance(row));

    if (instances.length > 0) {
      const statusKeys = instances.map(i => `ocm:instance:status:${i.id}`);
      const taskKeys = instances.map(i => `ocm:instance:currentTask:${i.id}`);
      const [statuses, tasks] = await Promise.all([
        redis.mget(...statusKeys),
        redis.mget(...taskKeys),
      ]);
      for (let idx = 0; idx < instances.length; idx++) {
        if (statuses[idx]) instances[idx].status = statuses[idx] as Instance['status'];
        if (tasks[idx]) instances[idx].currentTask = JSON.parse(tasks[idx]!);
      }
    }

    const result: InstancePublic[] = [];
    for (let idx = 0; idx < rows.length; idx++) {
      const row = rows[idx];
      const inst = instances[idx];
      const role = row.r_id ? rowToRole({ id: row.r_id, name: row.r_name, description: row.r_desc, capabilities: row.r_caps, is_lead: row.r_is_lead }) : undefined;
      result.push(toPublic(inst, role));
    }

    await cacheSet(cacheKey, result);
    return result;
  },

  async getInstanceRaw(id: string): Promise<Instance | undefined> {
    const cacheKey = `ocm:instance:raw:${id}`;
    const cached = await cacheGet<Instance>(cacheKey);
    if (cached) {
      const statusStr = await getRedis().get(`ocm:instance:status:${id}`);
      if (statusStr) cached.status = statusStr as Instance['status'];
      const ctStr = await getRedis().get(`ocm:instance:currentTask:${id}`);
      if (ctStr) cached.currentTask = JSON.parse(ctStr);
      return cached;
    }

    const pool = getPool();
    const { rows } = await pool.query('SELECT * FROM instances WHERE id = $1', [id]);
    if (rows.length === 0) return undefined;

    const inst = rowToInstance(rows[0]);
    const redis = getRedis();
    const statusStr = await redis.get(`ocm:instance:status:${inst.id}`);
    if (statusStr) inst.status = statusStr as Instance['status'];
    const ctStr = await redis.get(`ocm:instance:currentTask:${inst.id}`);
    if (ctStr) inst.currentTask = JSON.parse(ctStr);

    await cacheSet(cacheKey, inst);
    return inst;
  },

  async getInstanceRawForOwner(ownerId: string, id: string): Promise<Instance | undefined> {
    const inst = await instanceService.getInstanceRaw(id);
    return inst?.ownerId === ownerId ? inst : undefined;
  },

  async getInstance(ownerId: string, id: string): Promise<InstancePublic | undefined> {
    const inst = await instanceService.getInstanceRaw(id);
    if (!inst || inst.ownerId !== ownerId) return undefined;

    const pool = getPool();
    let role: ClawRole | undefined;
    if (inst.roleId) {
      const { rows } = await pool.query('SELECT * FROM roles WHERE id = $1', [inst.roleId]);
      if (rows.length > 0) role = rowToRole(rows[0]);
    }
    return toPublic(inst, role);
  },

  async createInstance(ownerId: string, data: Pick<Instance, 'name' | 'endpoint' | 'description'> & { token?: string; sandboxId?: string; apiKey?: string }): Promise<InstancePublic> {
    const id = uuid();
    const now = new Date().toISOString();
    const instance: Instance = { id, ownerId, ...data, status: 'offline', createdAt: now, updatedAt: now };
    await saveInstance(instance);
    await invalidateOwnerCaches(ownerId);
    return toPublic(instance);
  },

  async isNameTaken(ownerId: string, name: string, excludeId?: string): Promise<boolean> {
    const pool = getPool();
    if (excludeId) {
      const { rows } = await pool.query('SELECT 1 FROM instances WHERE owner_id = $1 AND name = $2 AND id != $3 LIMIT 1', [ownerId, name, excludeId]);
      return rows.length > 0;
    }
    const { rows } = await pool.query('SELECT 1 FROM instances WHERE owner_id = $1 AND name = $2 LIMIT 1', [ownerId, name]);
    return rows.length > 0;
  },

  async updateInstance(id: string, data: Partial<Pick<Instance, 'name' | 'endpoint' | 'description' | 'status' | 'currentTask' | 'token' | 'sandboxId' | 'teamId' | 'roleId'>>): Promise<InstancePublic | undefined> {
    const redis = getRedis();

    if (data.status !== undefined) {
      await redis.set(`ocm:instance:status:${id}`, data.status, 'EX', STATUS_TTL);
    }
    if (data.currentTask !== undefined) {
      if (data.currentTask) {
        await redis.set(`ocm:instance:currentTask:${id}`, JSON.stringify(data.currentTask), 'EX', STATUS_TTL);
      } else {
        await redis.del(`ocm:instance:currentTask:${id}`);
      }
    }

    const hasConfigChange = data.name !== undefined || data.endpoint !== undefined
      || data.description !== undefined || data.token !== undefined || data.sandboxId !== undefined
      || data.teamId !== undefined || data.roleId !== undefined;

    if (hasConfigChange) {
      const inst = await instanceService.getInstanceRaw(id);
      if (!inst) return undefined;

      const updateData: Partial<Instance> = { ...data, updatedAt: new Date().toISOString() };
      if (data.token === '') updateData.token = undefined;
      delete (updateData as any).status;
      delete (updateData as any).currentTask;

      const updated = { ...inst, ...updateData };
      await saveInstance(updated);
      await cacheDel(`ocm:instance:raw:${id}`);
      await invalidateOwnerCaches(inst.ownerId);
    } else {
      await cacheDel(`ocm:instance:raw:${id}`);
      const pool = getPool();
      const { rows } = await pool.query('SELECT owner_id FROM instances WHERE id = $1', [id]);
      if (rows.length > 0) await invalidateOwnerCaches(rows[0].owner_id);
    }

    return await instanceService.getInstance(
      (await instanceService.getInstanceRaw(id))?.ownerId || '',
      id
    );
  },

  async deleteInstance(id: string): Promise<boolean> {
    const pool = getPool();
    const { rows } = await pool.query('SELECT owner_id FROM instances WHERE id = $1', [id]);
    if (rows.length === 0) return false;

    const ownerId = rows[0].owner_id;
    await deleteInstanceFromDB(id);
    await cacheDel(`ocm:instance:raw:${id}`);
    await getRedis().del(`ocm:instance:status:${id}`, `ocm:instance:currentTask:${id}`);
    await invalidateOwnerCaches(ownerId);
    return true;
  },

  async getAllInstancesRaw(): Promise<Instance[]> {
    const pool = getPool();
    const { rows } = await pool.query('SELECT * FROM instances');
    const instances = rows.map(row => rowToInstance(row));

    if (instances.length > 0) {
      const redis = getRedis();
      const statusKeys = instances.map(i => `ocm:instance:status:${i.id}`);
      const statuses = await redis.mget(...statusKeys);
      for (let idx = 0; idx < instances.length; idx++) {
        if (statuses[idx]) instances[idx].status = statuses[idx] as Instance['status'];
      }
    }
    return instances;
  },

  async getOwnerByInstanceId(instanceId: string): Promise<string | undefined> {
    const pool = getPool();
    const { rows } = await pool.query('SELECT owner_id FROM instances WHERE id = $1', [instanceId]);
    return rows.length > 0 ? rows[0].owner_id : undefined;
  },
};
