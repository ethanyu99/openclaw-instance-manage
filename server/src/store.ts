/**
 * Store facade — delegates to domain-specific service modules.
 * All existing imports of `store` continue to work unchanged.
 */
import { getPool } from './db';
import { getRedis } from './redis';
import { instanceService } from './services/instance.service';
import { taskService } from './services/task.service';
import { teamService } from './services/team.service';
import { sessionService } from './services/session.service';
import { shareService } from './services/share.service';
import { cacheGet, cacheSet } from './services/cache';

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

  // Flush stale Redis caches
  try {
    const redis = getRedis();
    let cursor = '0';
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', 'ocm:*', 'COUNT', 100);
      cursor = next;
      if (keys.length > 0) await redis.del(...keys);
    } while (cursor !== '0');
  } catch { /* Redis may not be available yet */ }

  console.log('[store] Initialized (DB-first mode)');
}

export const store = {
  // ── Instance ──
  getInstances: instanceService.getInstances,
  getInstanceRaw: instanceService.getInstanceRaw,
  getInstanceRawForOwner: instanceService.getInstanceRawForOwner,
  getInstance: instanceService.getInstance,
  createInstance: instanceService.createInstance,
  isNameTaken: instanceService.isNameTaken,
  updateInstance: instanceService.updateInstance,
  deleteInstance: instanceService.deleteInstance,
  getAllInstancesRaw: instanceService.getAllInstancesRaw,
  getOwnerByInstanceId: instanceService.getOwnerByInstanceId,

  // ── Task ──
  getTasks: taskService.getTasks,
  getTask: taskService.getTask,
  createTask: taskService.createTask,
  updateTask: taskService.updateTask,
  updateTaskOutput: taskService.updateTaskOutput,

  // ── Stats ──
  async getStats(ownerId: string) {
    const cacheKey = `ocm:stats:owner:${ownerId}`;
    const cached = await cacheGet<{ total: number; online: number; busy: number; offline: number }>(cacheKey);
    if (cached) return cached;

    const instances = await instanceService.getInstances(ownerId);
    const stats = {
      total: instances.length,
      online: instances.filter(i => i.status === 'online').length,
      busy: instances.filter(i => i.status === 'busy').length,
      offline: instances.filter(i => i.status === 'offline').length,
    };
    await cacheSet(cacheKey, stats, 10);
    return stats;
  },

  // ── Session ──
  getSessionKey: sessionService.getSessionKey,
  resetSessionKey: sessionService.resetSessionKey,
  markUsedByTeam: sessionService.markUsedByTeam,
  wasUsedByTeam: sessionService.wasUsedByTeam,
  ensureSession: sessionService.ensureSession,

  // ── Team ──
  getTeams: teamService.getTeams,
  getTeam: teamService.getTeam,
  buildTeamPublic: teamService.buildTeamPublic,
  createTeam: teamService.createTeam,
  updateTeam: teamService.updateTeam,
  deleteTeam: teamService.deleteTeam,
  isTeamNameTaken: teamService.isTeamNameTaken,
  getRole: teamService.getRole,
  getRolesByTeam: teamService.getRolesByTeam,
  addRoleToTeam: teamService.addRoleToTeam,
  updateRole: teamService.updateRole,
  deleteRole: teamService.deleteRole,
  bindInstanceToRole: teamService.bindInstanceToRole,
  unbindInstanceFromTeam: teamService.unbindInstanceFromTeam,
  getTeamSessionKey: teamService.getTeamSessionKey,
  resetTeamSession: teamService.resetTeamSession,
  addTeamExecutionSummary: teamService.addTeamExecutionSummary,
  getTeamExecutionSummaries: teamService.getTeamExecutionSummaries,

  // ── Share ──
  createShareToken: shareService.createShareToken,
  getShareTokenByToken: shareService.getShareTokenByToken,
  getShareTokensByOwner: shareService.getShareTokensByOwner,
  deleteShareToken: shareService.deleteShareToken,
  cleanExpiredShareTokens: shareService.cleanExpiredShareTokens,
};
