import type { Instance, InstancePublic, TaskSummary, Team, TeamPublic, ClawRole, TeamMemberSlot } from '../../shared/types';
import { v4 as uuid } from 'uuid';
import {
  loadInstances,
  loadTasks,
  loadTeams,
  loadRoles,
  saveInstance,
  deleteInstanceFromDB,
  saveTask,
  saveTeam,
  deleteTeamFromDB,
  saveRole,
  deleteRoleFromDB,
  deleteRolesByTeam,
} from './persistence';

let instances: Map<string, Instance> = new Map();
let tasks: Map<string, TaskSummary> = new Map();
let teams: Map<string, Team> = new Map();
let roles: Map<string, ClawRole> = new Map();
const rolesByTeam: Map<string, string[]> = new Map();
const tasksByInstance: Map<string, string[]> = new Map();
const sessionKeys: Map<string, string> = new Map();
const teamSessions: Map<string, string> = new Map();
const MAX_TEAM_HISTORY = 10;
const teamExecutionHistory: Map<string, Array<{ goal: string; summary: string; completedAt: string }>> = new Map();

function toPublic(inst: Instance): InstancePublic {
  const { apiKey, ...rest } = inst;
  const role = inst.roleId ? roles.get(inst.roleId) : undefined;
  return { ...rest, hasToken: !!inst.token, role };
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
  teams = await loadTeams();
  roles = await loadRoles();
  instances = await loadInstances();
  tasks = await loadTasks();

  await rebuildTeamIndexes();

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

  console.log(`[store] Loaded ${teams.size} teams, ${roles.size} roles, ${instances.size} instances, ${tasks.size} tasks from database`);
}

async function rebuildTeamIndexes() {
  const { getPool } = require('./db') as typeof import('./db');
  const pool = getPool();
  rolesByTeam.clear();

  try {
    const { rows } = await pool.query('SELECT id, team_id FROM roles');
    for (const row of rows) {
      const list = rolesByTeam.get(row.team_id) || [];
      list.push(row.id);
      rolesByTeam.set(row.team_id, list);
    }
  } catch (err) {
    console.error('[store] Failed to rebuild role indexes:', err);
  }

  // Rebuild team members from instances
  for (const team of teams.values()) {
    const teamRoleIds = rolesByTeam.get(team.id) || [];
    team.members = teamRoleIds.map(roleId => {
      const boundInstance = Array.from(instances.values()).find(
        i => i.teamId === team.id && i.roleId === roleId
      );
      return { roleId, instanceId: boundInstance?.id };
    });
  }
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

  updateInstance(id: string, data: Partial<Pick<Instance, 'name' | 'endpoint' | 'description' | 'status' | 'currentTask' | 'token' | 'sandboxId' | 'teamId' | 'roleId'>>): InstancePublic | undefined {
    const instance = instances.get(id);
    if (!instance) return undefined;

    const updateData: Partial<Instance> = { ...data, updatedAt: new Date().toISOString() };
    if (data.token === '') {
      updateData.token = undefined;
    }

    const updated = { ...instance, ...updateData };
    instances.set(id, updated);

    const hasConfigChange = data.name !== undefined || data.endpoint !== undefined
      || data.description !== undefined || data.token !== undefined || data.sandboxId !== undefined
      || data.teamId !== undefined || data.roleId !== undefined;
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

  // ── Team operations ──────────────────

  getTeams(ownerId: string): TeamPublic[] {
    return Array.from(teams.values())
      .filter(t => t.ownerId === ownerId)
      .map(t => this.toTeamPublic(t));
  },

  getTeam(ownerId: string, id: string): TeamPublic | undefined {
    const team = teams.get(id);
    if (!team || team.ownerId !== ownerId) return undefined;
    return this.toTeamPublic(team);
  },

  toTeamPublic(team: Team): TeamPublic {
    const teamRoleIds = rolesByTeam.get(team.id) || [];
    const teamRoles = teamRoleIds
      .map(rid => roles.get(rid))
      .filter((r): r is ClawRole => !!r);
    // Refresh members with current instance bindings
    team.members = teamRoleIds.map(roleId => {
      const boundInstance = Array.from(instances.values()).find(
        i => i.teamId === team.id && i.roleId === roleId
      );
      return { roleId, instanceId: boundInstance?.id };
    });
    return { ...team, roles: teamRoles };
  },

  createTeam(ownerId: string, data: { name: string; description: string }, roleDefs: Omit<ClawRole, 'id'>[]): TeamPublic {
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
    teams.set(teamId, team);
    saveTeam(team).catch(err => console.error('[store] Failed to persist team:', err));

    const createdRoles: ClawRole[] = [];
    const teamRoleIds: string[] = [];
    for (const def of roleDefs) {
      const roleId = uuid();
      const role: ClawRole = { id: roleId, ...def };
      roles.set(roleId, role);
      teamRoleIds.push(roleId);
      createdRoles.push(role);
      saveRole(role, teamId).catch(err => console.error('[store] Failed to persist role:', err));
    }
    rolesByTeam.set(teamId, teamRoleIds);

    team.members = teamRoleIds.map(roleId => ({ roleId }));
    return { ...team, roles: createdRoles };
  },

  updateTeam(id: string, data: Partial<Pick<Team, 'name' | 'description'>>): TeamPublic | undefined {
    const team = teams.get(id);
    if (!team) return undefined;
    const updated = { ...team, ...data, updatedAt: new Date().toISOString() };
    teams.set(id, updated);
    saveTeam(updated).catch(err => console.error('[store] Failed to persist team:', err));
    return this.toTeamPublic(updated);
  },

  deleteTeam(id: string): boolean {
    const team = teams.get(id);
    if (!team) return false;

    // Unbind instances from this team
    for (const inst of instances.values()) {
      if (inst.teamId === id) {
        const updated = { ...inst, teamId: undefined, roleId: undefined, updatedAt: new Date().toISOString() };
        instances.set(inst.id, updated);
        saveInstance(updated).catch(err => console.error('[store] Failed to persist instance:', err));
      }
    }

    // Remove roles
    const teamRoleIds = rolesByTeam.get(id) || [];
    for (const rid of teamRoleIds) {
      roles.delete(rid);
    }
    rolesByTeam.delete(id);
    deleteRolesByTeam(id).catch(err => console.error('[store] Failed to delete roles:', err));

    teams.delete(id);
    deleteTeamFromDB(id).catch(err => console.error('[store] Failed to delete team:', err));
    return true;
  },

  isTeamNameTaken(ownerId: string, name: string, excludeId?: string): boolean {
    return Array.from(teams.values()).some(
      t => t.ownerId === ownerId && t.name === name && t.id !== excludeId
    );
  },

  // ── Role operations ──────────────────

  getRole(id: string): ClawRole | undefined {
    return roles.get(id);
  },

  getRolesByTeam(teamId: string): ClawRole[] {
    const ids = rolesByTeam.get(teamId) || [];
    return ids.map(id => roles.get(id)).filter((r): r is ClawRole => !!r);
  },

  addRoleToTeam(teamId: string, roleDef: Omit<ClawRole, 'id'>): ClawRole | undefined {
    const team = teams.get(teamId);
    if (!team) return undefined;

    const roleId = uuid();
    const role: ClawRole = { id: roleId, ...roleDef };
    roles.set(roleId, role);

    const teamRoleIds = rolesByTeam.get(teamId) || [];
    teamRoleIds.push(roleId);
    rolesByTeam.set(teamId, teamRoleIds);

    team.members.push({ roleId });
    team.updatedAt = new Date().toISOString();
    teams.set(teamId, team);

    saveRole(role, teamId).catch(err => console.error('[store] Failed to persist role:', err));
    saveTeam(team).catch(err => console.error('[store] Failed to persist team:', err));
    return role;
  },

  updateRole(teamId: string, roleId: string, data: Partial<Omit<ClawRole, 'id'>>): ClawRole | undefined {
    const team = teams.get(teamId);
    if (!team) return undefined;
    const teamRoleIds = rolesByTeam.get(teamId) || [];
    if (!teamRoleIds.includes(roleId)) return undefined;

    const role = roles.get(roleId);
    if (!role) return undefined;

    const updated: ClawRole = { ...role, ...data };
    roles.set(roleId, updated);

    team.updatedAt = new Date().toISOString();
    teams.set(teamId, team);

    saveRole(updated, teamId).catch(err => console.error('[store] Failed to persist role:', err));
    saveTeam(team).catch(err => console.error('[store] Failed to persist team:', err));
    return updated;
  },

  deleteRole(teamId: string, roleId: string): boolean {
    const team = teams.get(teamId);
    if (!team) return false;
    const teamRoleIds = rolesByTeam.get(teamId) || [];
    if (!teamRoleIds.includes(roleId)) return false;

    // Unbind any instance from this role
    for (const inst of instances.values()) {
      if (inst.teamId === teamId && inst.roleId === roleId) {
        const updated = { ...inst, teamId: undefined, roleId: undefined, updatedAt: new Date().toISOString() };
        instances.set(inst.id, updated);
        saveInstance(updated).catch(err => console.error('[store] Failed to persist instance:', err));
      }
    }

    roles.delete(roleId);
    rolesByTeam.set(teamId, teamRoleIds.filter(id => id !== roleId));
    team.members = team.members.filter(m => m.roleId !== roleId);
    team.updatedAt = new Date().toISOString();
    teams.set(teamId, team);

    deleteRoleFromDB(roleId).catch(err => console.error('[store] Failed to delete role:', err));
    saveTeam(team).catch(err => console.error('[store] Failed to persist team:', err));
    return true;
  },

  // ── Instance-Team binding ────────────

  bindInstanceToRole(instanceId: string, teamId: string, roleId: string): InstancePublic | undefined {
    const inst = instances.get(instanceId);
    if (!inst) return undefined;
    const team = teams.get(teamId);
    if (!team) return undefined;
    const role = roles.get(roleId);
    if (!role) return undefined;

    // Unbind any other instance from this role in this team
    for (const other of instances.values()) {
      if (other.teamId === teamId && other.roleId === roleId && other.id !== instanceId) {
        const updated = { ...other, teamId: undefined, roleId: undefined, updatedAt: new Date().toISOString() };
        instances.set(other.id, updated);
        saveInstance(updated).catch(err => console.error('[store] Failed to persist instance:', err));
      }
    }

    return this.updateInstance(instanceId, { teamId, roleId });
  },

  unbindInstanceFromTeam(instanceId: string): InstancePublic | undefined {
    return this.updateInstance(instanceId, { teamId: undefined, roleId: undefined });
  },

  // ── Team session management ─────────

  getTeamSessionKey(ownerId: string, teamId: string, instanceId: string): string {
    const teamKey = `${ownerId}:${teamId}`;
    let prefix = teamSessions.get(teamKey);
    if (!prefix) {
      prefix = `team-${ownerId}-${teamId}`;
      teamSessions.set(teamKey, prefix);
    }
    return `${prefix}-${instanceId}`;
  },

  resetTeamSession(ownerId: string, teamId: string): void {
    const teamKey = `${ownerId}:${teamId}`;
    teamSessions.set(teamKey, `team-${ownerId}-${teamId}-${Date.now()}`);
  },

  addTeamExecutionSummary(ownerId: string, teamId: string, goal: string, summary: string): void {
    const key = `${ownerId}:${teamId}`;
    const history = teamExecutionHistory.get(key) || [];
    history.push({ goal, summary, completedAt: new Date().toISOString() });
    if (history.length > MAX_TEAM_HISTORY) {
      history.splice(0, history.length - MAX_TEAM_HISTORY);
    }
    teamExecutionHistory.set(key, history);
  },

  getTeamExecutionSummaries(ownerId: string, teamId: string): Array<{ goal: string; summary: string; completedAt: string }> {
    return teamExecutionHistory.get(`${ownerId}:${teamId}`) || [];
  },
};
