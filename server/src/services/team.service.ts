import type { Team, TeamPublic, ClawRole } from '../../../shared/types';
import { v4 as uuid } from 'uuid';
import { getPool } from '../db';
import { getRedis } from '../redis';
import { saveTeam, deleteTeamFromDB, saveRole, deleteRoleFromDB, deleteRolesByTeam } from '../persistence';
import { invalidateOwnerCaches } from './cache';
import { rowToTeam, rowToRole } from './row-mappers';
import { instanceService } from './instance.service';

const MAX_TEAM_HISTORY = 10;

export const teamService = {
  async getTeams(ownerId: string): Promise<TeamPublic[]> {
    const pool = getPool();
    const { rows } = await pool.query('SELECT * FROM teams WHERE owner_id = $1 ORDER BY created_at ASC', [ownerId]);
    const teams: TeamPublic[] = [];
    for (const row of rows) {
      teams.push(await teamService.buildTeamPublic(rowToTeam(row)));
    }
    return teams;
  },

  async getTeam(ownerId: string, id: string): Promise<TeamPublic | undefined> {
    const pool = getPool();
    const { rows } = await pool.query('SELECT * FROM teams WHERE id = $1 AND owner_id = $2', [id, ownerId]);
    if (rows.length === 0) return undefined;
    return await teamService.buildTeamPublic(rowToTeam(rows[0]));
  },

  async buildTeamPublic(team: Team): Promise<TeamPublic> {
    const pool = getPool();
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
      if (row.bound_instance_id) instanceByRole.set(row.id, row.bound_instance_id);
    }
    team.members = roles.map(r => ({ roleId: r.id, instanceId: instanceByRole.get(r.id) }));
    return { ...team, roles };
  },

  async createTeam(ownerId: string, data: { name: string; description: string }, roleDefs: Omit<ClawRole, 'id'>[]): Promise<TeamPublic> {
    const teamId = uuid();
    const now = new Date().toISOString();
    const team: Team = { id: teamId, ownerId, name: data.name, description: data.description, members: [], createdAt: now, updatedAt: now };
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
    return await teamService.buildTeamPublic(updated);
  },

  async deleteTeam(id: string): Promise<boolean> {
    const pool = getPool();
    const { rows } = await pool.query('SELECT * FROM teams WHERE id = $1', [id]);
    if (rows.length === 0) return false;
    const ownerId = rows[0].owner_id;
    await pool.query('UPDATE instances SET team_id = NULL, role_id = NULL, updated_at = NOW() WHERE team_id = $1', [id]);
    await deleteRolesByTeam(id);
    await deleteTeamFromDB(id);
    await invalidateOwnerCaches(ownerId);
    return true;
  },

  async isTeamNameTaken(ownerId: string, name: string, excludeId?: string): Promise<boolean> {
    const pool = getPool();
    const { rows } = await pool.query('SELECT 1 FROM teams WHERE owner_id = $1 AND name = $2 AND id != $3 LIMIT 1', [ownerId, name, excludeId || '']);
    return rows.length > 0;
  },

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
    await pool.query('UPDATE instances SET team_id = NULL, role_id = NULL, updated_at = NOW() WHERE team_id = $1 AND role_id = $2', [teamId, roleId]);
    await deleteRoleFromDB(roleId);
    const team = rowToTeam(teamRows[0]);
    team.updatedAt = new Date().toISOString();
    await saveTeam(team);
    await invalidateOwnerCaches(teamRows[0].owner_id);
    return true;
  },

  async bindInstanceToRole(instanceId: string, teamId: string, roleId: string): Promise<ReturnType<typeof instanceService.updateInstance>> {
    const pool = getPool();
    const { rows: instRows } = await pool.query('SELECT * FROM instances WHERE id = $1', [instanceId]);
    if (instRows.length === 0) return undefined;
    const { rows: teamRows } = await pool.query('SELECT 1 FROM teams WHERE id = $1', [teamId]);
    if (teamRows.length === 0) return undefined;
    const { rows: roleRows } = await pool.query('SELECT 1 FROM roles WHERE id = $1', [roleId]);
    if (roleRows.length === 0) return undefined;
    await pool.query('UPDATE instances SET team_id = NULL, role_id = NULL, updated_at = NOW() WHERE team_id = $1 AND role_id = $2 AND id != $3', [teamId, roleId, instanceId]);
    return await instanceService.updateInstance(instanceId, { teamId, roleId });
  },

  async unbindInstanceFromTeam(instanceId: string): ReturnType<typeof instanceService.updateInstance> {
    return await instanceService.updateInstance(instanceId, { teamId: undefined, roleId: undefined });
  },

  async getTeamSessionKey(ownerId: string, teamId: string, instanceId: string): Promise<string> {
    const redisKey = `ocm:teamSession:${ownerId}:${teamId}`;
    let prefix = await getRedis().get(redisKey);
    if (!prefix) { prefix = `team-${ownerId}-${teamId}`; await getRedis().set(redisKey, prefix); }
    return `${prefix}-${instanceId}`;
  },

  async resetTeamSession(ownerId: string, teamId: string): Promise<void> {
    await getRedis().set(`ocm:teamSession:${ownerId}:${teamId}`, `team-${ownerId}-${teamId}-${Date.now()}`);
  },

  async addTeamExecutionSummary(ownerId: string, teamId: string, goal: string, summary: string): Promise<void> {
    const redisKey = `ocm:teamExecHistory:${ownerId}:${teamId}`;
    const entry = JSON.stringify({ goal, summary, completedAt: new Date().toISOString() });
    const redis = getRedis();
    await redis.rpush(redisKey, entry);
    await redis.ltrim(redisKey, -MAX_TEAM_HISTORY, -1);
  },

  async getTeamExecutionSummaries(ownerId: string, teamId: string): Promise<Array<{ goal: string; summary: string; completedAt: string }>> {
    const entries = await getRedis().lrange(`ocm:teamExecHistory:${ownerId}:${teamId}`, 0, -1);
    return entries.map(e => JSON.parse(e));
  },
};
