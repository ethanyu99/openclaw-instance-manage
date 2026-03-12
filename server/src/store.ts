import type { Instance, InstancePublic, TaskSummary, Team, TeamPublic, ClawRole, ShareToken, ShareDuration } from '../../shared/types';
import { v4 as uuid } from 'uuid';
import crypto from 'crypto';
import { getPool } from './db';
import { getRedis } from './redis';
import {
  saveInstance,
  deleteInstanceFromDB,
  saveTask,
  saveTeam,
  deleteTeamFromDB,
  saveRole,
  deleteRoleFromDB,
  deleteRolesByTeam,
  saveShareToken,
  deleteShareTokenFromDB,
  cleanExpiredShareTokens as cleanExpiredShareTokensDB,
  saveSession,
  updateTaskOutput as updateTaskOutputDB,
} from './persistence';
import type { SessionRecord } from '../../shared/types';

const SHARE_DURATION_MS: Record<ShareDuration, number> = {
  '1h': 3600000,
  '3h': 10800000,
  '12h': 43200000,
  '1d': 86400000,
  '2d': 172800000,
  '3d': 259200000,
  '1w': 604800000,
  '1M': 2592000000,
  'permanent': 100 * 365.25 * 86400000,
};

const MAX_TEAM_HISTORY = 10;

const CACHE_TTL = 30; // seconds
const STATUS_TTL = 120; // seconds — status survives a bit longer than health check interval

function toPublic(inst: Instance, role?: ClawRole): InstancePublic {
  const { apiKey, ...rest } = inst;
  return { ...rest, hasToken: !!inst.token, role };
}

function rowToInstance(row: any): Instance {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    endpoint: row.endpoint,
    token: row.token || undefined,
    apiKey: row.api_key || undefined,
    description: row.description || '',
    sandboxId: row.sandbox_id || undefined,
    teamId: row.team_id || undefined,
    roleId: row.role_id || undefined,
    status: 'offline',
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };
}

function rowToTask(row: any): TaskSummary {
  return {
    id: row.id,
    ownerId: row.owner_id,
    instanceId: row.instance_id,
    content: row.content,
    status: row.status,
    summary: row.summary || undefined,
    sessionKey: row.session_key || undefined,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };
}

function rowToRole(row: any): ClawRole {
  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    capabilities: row.capabilities || [],
    isLead: row.is_lead,
  };
}

function rowToTeam(row: any): Team {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    description: row.description || '',
    members: [],
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };
}

function rowToShareToken(row: any): ShareToken {
  return {
    id: row.id,
    token: row.token,
    ownerId: row.owner_id,
    shareType: row.share_type,
    targetId: row.target_id,
    expiresAt: row.expires_at instanceof Date ? row.expires_at.toISOString() : row.expires_at,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

// Redis cache helpers
async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const val = await getRedis().get(key);
    return val ? JSON.parse(val) : null;
  } catch {
    return null;
  }
}

async function cacheSet(key: string, value: unknown, ttl = CACHE_TTL): Promise<void> {
  try {
    await getRedis().set(key, JSON.stringify(value), 'EX', ttl);
  } catch { /* best-effort */ }
}

async function cacheDel(key: string): Promise<void> {
  try {
    await getRedis().del(key);
  } catch { /* best-effort */ }
}

async function invalidateOwnerCaches(ownerId: string): Promise<void> {
  await Promise.all([
    cacheDel(`ocm:instances:owner:${ownerId}`),
    cacheDel(`ocm:stats:owner:${ownerId}`),
  ]);
}

export async function initStore() {
  const pool = getPool();

  // Mark interrupted tasks
  const result = await pool.query(
    `UPDATE tasks SET status = 'failed', summary = COALESCE(summary, '') || E'\\n[Interrupted by server restart]', updated_at = NOW()
     WHERE status IN ('running', 'pending')
     RETURNING id`
  );
  if (result.rowCount && result.rowCount > 0) {
    console.log(`[store] Marked ${result.rowCount} interrupted tasks as failed`);
  }

  // Flush stale Redis caches using SCAN (non-blocking) instead of KEYS
  try {
    const redis = getRedis();
    let cursor = '0';
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', 'ocm:*', 'COUNT', 100);
      cursor = next;
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } while (cursor !== '0');
  } catch { /* Redis may not be available yet */ }

  console.log('[store] Initialized (DB-first mode)');
}

export const store = {
  // ── Instance operations ──────────────────

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

    // Batch Redis lookups with mget instead of N individual GET calls
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
    const inst = await this.getInstanceRaw(id);
    return inst?.ownerId === ownerId ? inst : undefined;
  },

  async getInstance(ownerId: string, id: string): Promise<InstancePublic | undefined> {
    const inst = await this.getInstanceRaw(id);
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
    const instance: Instance = {
      id,
      ownerId,
      ...data,
      status: 'offline',
      createdAt: now,
      updatedAt: now,
    };
    await saveInstance(instance);
    await invalidateOwnerCaches(ownerId);
    return toPublic(instance);
  },

  async isNameTaken(ownerId: string, name: string, excludeId?: string): Promise<boolean> {
    const pool = getPool();
    if (excludeId) {
      const { rows } = await pool.query(
        'SELECT 1 FROM instances WHERE owner_id = $1 AND name = $2 AND id != $3 LIMIT 1',
        [ownerId, name, excludeId]
      );
      return rows.length > 0;
    }
    const { rows } = await pool.query(
      'SELECT 1 FROM instances WHERE owner_id = $1 AND name = $2 LIMIT 1',
      [ownerId, name]
    );
    return rows.length > 0;
  },

  async updateInstance(id: string, data: Partial<Pick<Instance, 'name' | 'endpoint' | 'description' | 'status' | 'currentTask' | 'token' | 'sandboxId' | 'teamId' | 'roleId'>>): Promise<InstancePublic | undefined> {
    const redis = getRedis();

    // Handle ephemeral state in Redis
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

    // Persist config changes to DB
    const hasConfigChange = data.name !== undefined || data.endpoint !== undefined
      || data.description !== undefined || data.token !== undefined || data.sandboxId !== undefined
      || data.teamId !== undefined || data.roleId !== undefined;

    if (hasConfigChange) {
      const inst = await this.getInstanceRaw(id);
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
      // Just invalidate cache for status/currentTask changes
      await cacheDel(`ocm:instance:raw:${id}`);
      // Need ownerId for cache invalidation
      const pool = getPool();
      const { rows } = await pool.query('SELECT owner_id FROM instances WHERE id = $1', [id]);
      if (rows.length > 0) await invalidateOwnerCaches(rows[0].owner_id);
    }

    return await this.getInstance(
      (await this.getInstanceRaw(id))?.ownerId || '',
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

  // ── Task operations ──────────────────

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
    const task: TaskSummary = {
      id,
      ownerId,
      instanceId,
      content,
      status: 'pending',
      sessionKey,
      createdAt: now,
      updatedAt: now,
    };
    await saveTask(task);

    // Update instance currentTask in Redis
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

    // Update instance currentTask
    const redis = getRedis();
    await redis.set(`ocm:instance:currentTask:${updated.instanceId}`, JSON.stringify(updated), 'EX', STATUS_TTL);

    if (data.status === 'completed' || data.status === 'failed' || data.status === 'cancelled') {
      await redis.set(`ocm:instance:status:${updated.instanceId}`, 'online', 'EX', STATUS_TTL);
    }

    await cacheDel(`ocm:instance:raw:${updated.instanceId}`);
    await invalidateOwnerCaches(updated.ownerId);

    return updated;
  },

  async getStats(ownerId: string) {
    const cacheKey = `ocm:stats:owner:${ownerId}`;
    const cached = await cacheGet<{ total: number; online: number; busy: number; offline: number }>(cacheKey);
    if (cached) return cached;

    const instances = await this.getInstances(ownerId);
    const stats = {
      total: instances.length,
      online: instances.filter(i => i.status === 'online').length,
      busy: instances.filter(i => i.status === 'busy').length,
      offline: instances.filter(i => i.status === 'offline').length,
    };
    await cacheSet(cacheKey, stats, 10);
    return stats;
  },

  // ── Session keys (Redis-backed) ──────────────────

  async getSessionKey(ownerId: string, instanceId: string): Promise<string> {
    const redisKey = `ocm:session:${ownerId}:${instanceId}`;
    const existing = await getRedis().get(redisKey);
    if (existing) return existing;

    const key = `${ownerId}-${instanceId}`;
    await getRedis().set(redisKey, key);
    return key;
  },

  async resetSessionKey(ownerId: string, instanceId: string): Promise<string> {
    const redisKey = `ocm:session:${ownerId}:${instanceId}`;
    const key = `${ownerId}-${instanceId}-${Date.now()}`;
    await getRedis().set(redisKey, key);
    await getRedis().del(`ocm:teamUsage:${ownerId}:${instanceId}`);
    return key;
  },

  async markUsedByTeam(ownerId: string, instanceId: string): Promise<void> {
    await getRedis().set(`ocm:teamUsage:${ownerId}:${instanceId}`, '1', 'EX', 86400);
  },

  async wasUsedByTeam(ownerId: string, instanceId: string): Promise<boolean> {
    const val = await getRedis().get(`ocm:teamUsage:${ownerId}:${instanceId}`);
    return val === '1';
  },

  async getOwnerByInstanceId(instanceId: string): Promise<string | undefined> {
    const pool = getPool();
    const { rows } = await pool.query('SELECT owner_id FROM instances WHERE id = $1', [instanceId]);
    return rows.length > 0 ? rows[0].owner_id : undefined;
  },

  async getAllInstancesRaw(): Promise<Instance[]> {
    const pool = getPool();
    const { rows } = await pool.query('SELECT * FROM instances');
    const instances = rows.map(row => rowToInstance(row));

    // Batch Redis lookups with mget instead of N individual GET calls
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

  // ── Team operations ──────────────────

  async getTeams(ownerId: string): Promise<TeamPublic[]> {
    const pool = getPool();
    const { rows } = await pool.query('SELECT * FROM teams WHERE owner_id = $1 ORDER BY created_at ASC', [ownerId]);
    const teams: TeamPublic[] = [];
    for (const row of rows) {
      const team = rowToTeam(row);
      teams.push(await this.buildTeamPublic(team));
    }
    return teams;
  },

  async getTeam(ownerId: string, id: string): Promise<TeamPublic | undefined> {
    const pool = getPool();
    const { rows } = await pool.query('SELECT * FROM teams WHERE id = $1 AND owner_id = $2', [id, ownerId]);
    if (rows.length === 0) return undefined;
    const team = rowToTeam(rows[0]);
    return await this.buildTeamPublic(team);
  },

  async buildTeamPublic(team: Team): Promise<TeamPublic> {
    const pool = getPool();
    // Single JOIN query instead of 2 separate queries (roles + instances)
    const { rows } = await pool.query(
      `SELECT r.*, i.id AS bound_instance_id
       FROM roles r
       LEFT JOIN instances i ON i.team_id = r.team_id AND i.role_id = r.id
       WHERE r.team_id = $1
       ORDER BY r.created_at ASC`,
      [team.id]
    );
    const roles = rows.map(rowToRole);
    const instanceByRole = new Map<string, string>();
    for (const row of rows) {
      if (row.bound_instance_id) {
        instanceByRole.set(row.id, row.bound_instance_id);
      }
    }

    team.members = roles.map(r => ({
      roleId: r.id,
      instanceId: instanceByRole.get(r.id),
    }));

    return { ...team, roles };
  },

  async createTeam(ownerId: string, data: { name: string; description: string }, roleDefs: Omit<ClawRole, 'id'>[]): Promise<TeamPublic> {
    const teamId = uuid();
    const now = new Date().toISOString();
    const team: Team = {
      id: teamId,
      ownerId,
      name: data.name,
      description: data.description,
      members: [],
      createdAt: now,
      updatedAt: now,
    };
    await saveTeam(team);

    const createdRoles: ClawRole[] = [];
    for (const def of roleDefs) {
      const roleId = uuid();
      const role: ClawRole = { id: roleId, ...def };
      await saveRole(role, teamId);
      createdRoles.push(role);
    }

    team.members = createdRoles.map(r => ({ roleId: r.id }));
    return { ...team, roles: createdRoles };
  },

  async updateTeam(id: string, data: Partial<Pick<Team, 'name' | 'description'>>): Promise<TeamPublic | undefined> {
    const pool = getPool();
    const { rows } = await pool.query('SELECT * FROM teams WHERE id = $1', [id]);
    if (rows.length === 0) return undefined;

    const team = rowToTeam(rows[0]);
    const updated = { ...team, ...data, updatedAt: new Date().toISOString() };
    await saveTeam(updated);
    return await this.buildTeamPublic(updated);
  },

  async deleteTeam(id: string): Promise<boolean> {
    const pool = getPool();
    const { rows } = await pool.query('SELECT * FROM teams WHERE id = $1', [id]);
    if (rows.length === 0) return false;

    const ownerId = rows[0].owner_id;

    // Unbind instances
    await pool.query(
      'UPDATE instances SET team_id = NULL, role_id = NULL, updated_at = NOW() WHERE team_id = $1',
      [id]
    );

    await deleteRolesByTeam(id);
    await deleteTeamFromDB(id);
    await invalidateOwnerCaches(ownerId);
    return true;
  },

  async isTeamNameTaken(ownerId: string, name: string, excludeId?: string): Promise<boolean> {
    const pool = getPool();
    const { rows } = await pool.query(
      'SELECT 1 FROM teams WHERE owner_id = $1 AND name = $2 AND id != $3 LIMIT 1',
      [ownerId, name, excludeId || '']
    );
    return rows.length > 0;
  },

  // ── Role operations ──────────────────

  async getRole(id: string): Promise<ClawRole | undefined> {
    const pool = getPool();
    const { rows } = await pool.query('SELECT * FROM roles WHERE id = $1', [id]);
    return rows.length > 0 ? rowToRole(rows[0]) : undefined;
  },

  async getRolesByTeam(teamId: string): Promise<ClawRole[]> {
    const pool = getPool();
    const { rows } = await pool.query('SELECT * FROM roles WHERE team_id = $1 ORDER BY created_at ASC', [teamId]);
    return rows.map(rowToRole);
  },

  async addRoleToTeam(teamId: string, roleDef: Omit<ClawRole, 'id'>): Promise<ClawRole | undefined> {
    const pool = getPool();
    const { rows } = await pool.query('SELECT * FROM teams WHERE id = $1', [teamId]);
    if (rows.length === 0) return undefined;

    const roleId = uuid();
    const role: ClawRole = { id: roleId, ...roleDef };
    await saveRole(role, teamId);

    const team = rowToTeam(rows[0]);
    team.updatedAt = new Date().toISOString();
    await saveTeam(team);

    return role;
  },

  async updateRole(teamId: string, roleId: string, data: Partial<Omit<ClawRole, 'id'>>): Promise<ClawRole | undefined> {
    const pool = getPool();
    const { rows: teamRows } = await pool.query('SELECT * FROM teams WHERE id = $1', [teamId]);
    if (teamRows.length === 0) return undefined;

    const { rows: roleRows } = await pool.query('SELECT * FROM roles WHERE id = $1 AND team_id = $2', [roleId, teamId]);
    if (roleRows.length === 0) return undefined;

    const existing = rowToRole(roleRows[0]);
    const updated: ClawRole = { ...existing, ...data };
    await saveRole(updated, teamId);

    const team = rowToTeam(teamRows[0]);
    team.updatedAt = new Date().toISOString();
    await saveTeam(team);

    return updated;
  },

  async deleteRole(teamId: string, roleId: string): Promise<boolean> {
    const pool = getPool();
    const { rows: teamRows } = await pool.query('SELECT * FROM teams WHERE id = $1', [teamId]);
    if (teamRows.length === 0) return false;

    const { rows: roleRows } = await pool.query('SELECT * FROM roles WHERE id = $1 AND team_id = $2', [roleId, teamId]);
    if (roleRows.length === 0) return false;

    // Unbind instances from this role
    await pool.query(
      'UPDATE instances SET team_id = NULL, role_id = NULL, updated_at = NOW() WHERE team_id = $1 AND role_id = $2',
      [teamId, roleId]
    );

    await deleteRoleFromDB(roleId);

    const team = rowToTeam(teamRows[0]);
    team.updatedAt = new Date().toISOString();
    await saveTeam(team);

    const ownerId = teamRows[0].owner_id;
    await invalidateOwnerCaches(ownerId);
    return true;
  },

  // ── Instance-Team binding ────────────

  async bindInstanceToRole(instanceId: string, teamId: string, roleId: string): Promise<InstancePublic | undefined> {
    const pool = getPool();

    // Verify all entities exist
    const { rows: instRows } = await pool.query('SELECT * FROM instances WHERE id = $1', [instanceId]);
    if (instRows.length === 0) return undefined;
    const { rows: teamRows } = await pool.query('SELECT 1 FROM teams WHERE id = $1', [teamId]);
    if (teamRows.length === 0) return undefined;
    const { rows: roleRows } = await pool.query('SELECT 1 FROM roles WHERE id = $1', [roleId]);
    if (roleRows.length === 0) return undefined;

    // Unbind any other instance from this role
    await pool.query(
      'UPDATE instances SET team_id = NULL, role_id = NULL, updated_at = NOW() WHERE team_id = $1 AND role_id = $2 AND id != $3',
      [teamId, roleId, instanceId]
    );

    return await this.updateInstance(instanceId, { teamId, roleId });
  },

  async unbindInstanceFromTeam(instanceId: string): Promise<InstancePublic | undefined> {
    return await this.updateInstance(instanceId, { teamId: undefined, roleId: undefined });
  },

  // ── Team session management (Redis) ─────────

  async getTeamSessionKey(ownerId: string, teamId: string, instanceId: string): Promise<string> {
    const redisKey = `ocm:teamSession:${ownerId}:${teamId}`;
    let prefix = await getRedis().get(redisKey);
    if (!prefix) {
      prefix = `team-${ownerId}-${teamId}`;
      await getRedis().set(redisKey, prefix);
    }
    return `${prefix}-${instanceId}`;
  },

  async resetTeamSession(ownerId: string, teamId: string): Promise<void> {
    const redisKey = `ocm:teamSession:${ownerId}:${teamId}`;
    await getRedis().set(redisKey, `team-${ownerId}-${teamId}-${Date.now()}`);
  },

  async addTeamExecutionSummary(ownerId: string, teamId: string, goal: string, summary: string): Promise<void> {
    const redisKey = `ocm:teamExecHistory:${ownerId}:${teamId}`;
    const entry = JSON.stringify({ goal, summary, completedAt: new Date().toISOString() });
    const redis = getRedis();
    await redis.rpush(redisKey, entry);
    await redis.ltrim(redisKey, -MAX_TEAM_HISTORY, -1);
  },

  async getTeamExecutionSummaries(ownerId: string, teamId: string): Promise<Array<{ goal: string; summary: string; completedAt: string }>> {
    const redisKey = `ocm:teamExecHistory:${ownerId}:${teamId}`;
    const entries = await getRedis().lrange(redisKey, 0, -1);
    return entries.map(e => JSON.parse(e));
  },

  // ── Share token operations ─────────

  async createShareToken(ownerId: string, shareType: 'team' | 'instance', targetId: string, duration: ShareDuration): Promise<ShareToken> {
    const id = uuid();
    const token = crypto.randomBytes(32).toString('hex');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + SHARE_DURATION_MS[duration]);

    const st: ShareToken = {
      id,
      token,
      ownerId,
      shareType,
      targetId,
      expiresAt: expiresAt.toISOString(),
      createdAt: now.toISOString(),
    };

    await saveShareToken(st);

    // Cache token->id mapping with TTL matching expiration
    const ttlSec = Math.ceil(SHARE_DURATION_MS[duration] / 1000);
    await cacheSet(`ocm:shareToken:${token}`, st, ttlSec);

    return st;
  },

  async getShareTokenByToken(token: string): Promise<ShareToken | undefined> {
    // Try Redis cache first
    const cached = await cacheGet<ShareToken>(`ocm:shareToken:${token}`);
    if (cached) {
      if (new Date(cached.expiresAt) < new Date()) {
        await cacheDel(`ocm:shareToken:${token}`);
        await deleteShareTokenFromDB(cached.id);
        return undefined;
      }
      return cached;
    }

    // Fall back to DB
    const pool = getPool();
    const { rows } = await pool.query(
      'SELECT * FROM share_tokens WHERE token = $1 AND expires_at > NOW()',
      [token]
    );
    if (rows.length === 0) return undefined;

    const st = rowToShareToken(rows[0]);
    const ttl = Math.ceil((new Date(st.expiresAt).getTime() - Date.now()) / 1000);
    if (ttl > 0) await cacheSet(`ocm:shareToken:${token}`, st, ttl);
    return st;
  },

  async getShareTokensByOwner(ownerId: string): Promise<ShareToken[]> {
    const pool = getPool();
    const { rows } = await pool.query(
      'SELECT * FROM share_tokens WHERE owner_id = $1 AND expires_at > NOW() ORDER BY created_at ASC',
      [ownerId]
    );
    return rows.map(rowToShareToken);
  },

  async deleteShareToken(ownerId: string, id: string): Promise<boolean> {
    const pool = getPool();
    const { rows } = await pool.query('SELECT * FROM share_tokens WHERE id = $1 AND owner_id = $2', [id, ownerId]);
    if (rows.length === 0) return false;

    await cacheDel(`ocm:shareToken:${rows[0].token}`);
    await deleteShareTokenFromDB(id);
    return true;
  },

  // ── Session persistence ─────────

  async ensureSession(ownerId: string, instanceId: string, instanceName: string, sessionKey: string): Promise<void> {
    const session: SessionRecord = {
      sessionKey,
      ownerId,
      instanceId,
      instanceName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await saveSession(session);
  },

  async updateTaskOutput(taskId: string, output: string): Promise<void> {
    await updateTaskOutputDB(taskId, output);
  },

  async cleanExpiredShareTokens(): Promise<void> {
    await cleanExpiredShareTokensDB();
  },
};
