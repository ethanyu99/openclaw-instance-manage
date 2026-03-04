import { getPool } from './db';
import type { Instance, TaskSummary, Team, ClawRole, TeamMemberSlot } from '../../shared/types';

// ── Teams ──────────────────────────────

export async function loadTeams(): Promise<Map<string, Team>> {
  const pool = getPool();
  const map = new Map<string, Team>();
  try {
    const { rows } = await pool.query('SELECT * FROM teams ORDER BY created_at ASC');
    for (const row of rows) {
      const team: Team = {
        id: row.id,
        ownerId: row.owner_id,
        name: row.name,
        description: row.description || '',
        members: [],
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
      };
      map.set(team.id, team);
    }
  } catch (err) {
    console.error('[persistence] Failed to load teams from PG:', err);
  }
  return map;
}

export async function saveTeam(team: Team): Promise<void> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO teams (id, owner_id, name, description, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       description = EXCLUDED.description,
       updated_at = EXCLUDED.updated_at`,
    [team.id, team.ownerId, team.name, team.description, team.createdAt, team.updatedAt]
  );
}

export async function deleteTeamFromDB(id: string): Promise<void> {
  const pool = getPool();
  await pool.query('DELETE FROM teams WHERE id = $1', [id]);
}

// ── Roles ──────────────────────────────

export async function loadRoles(): Promise<Map<string, ClawRole>> {
  const pool = getPool();
  const map = new Map<string, ClawRole>();
  try {
    const { rows } = await pool.query('SELECT * FROM roles ORDER BY created_at ASC');
    for (const row of rows) {
      const role: ClawRole = {
        id: row.id,
        name: row.name,
        description: row.description || '',
        capabilities: row.capabilities || [],
        isLead: row.is_lead,
      };
      map.set(role.id, role);
    }
  } catch (err) {
    console.error('[persistence] Failed to load roles from PG:', err);
  }
  return map;
}

export async function saveRole(role: ClawRole, teamId: string): Promise<void> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO roles (id, team_id, name, description, capabilities, is_lead)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       description = EXCLUDED.description,
       capabilities = EXCLUDED.capabilities,
       is_lead = EXCLUDED.is_lead`,
    [role.id, teamId, role.name, role.description, role.capabilities, role.isLead]
  );
}

export async function deleteRoleFromDB(id: string): Promise<void> {
  const pool = getPool();
  await pool.query('DELETE FROM roles WHERE id = $1', [id]);
}

export async function deleteRolesByTeam(teamId: string): Promise<void> {
  const pool = getPool();
  await pool.query('DELETE FROM roles WHERE team_id = $1', [teamId]);
}

// ── Instances ──────────────────────────

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
        teamId: row.team_id || undefined,
        roleId: row.role_id || undefined,
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
    `INSERT INTO instances (id, owner_id, name, endpoint, token, api_key, description, sandbox_id, team_id, role_id, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       endpoint = EXCLUDED.endpoint,
       token = EXCLUDED.token,
       api_key = EXCLUDED.api_key,
       description = EXCLUDED.description,
       sandbox_id = EXCLUDED.sandbox_id,
       team_id = EXCLUDED.team_id,
       role_id = EXCLUDED.role_id,
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
      instance.teamId || null,
      instance.roleId || null,
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
