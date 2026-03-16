import { getPool } from './db';
import type { Instance, TaskSummary, Team, ClawRole, TeamMemberSlot, ShareToken, SessionRecord, SessionDetail, SessionExchangeRecord, ExecutionRecord, InstanceSkill } from '../../shared/types';

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

export async function saveTask(task: TaskSummary & { output?: string }): Promise<void> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO tasks (id, owner_id, instance_id, content, status, summary, session_key, output, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (id) DO UPDATE SET
       status = EXCLUDED.status,
       summary = EXCLUDED.summary,
       session_key = COALESCE(EXCLUDED.session_key, tasks.session_key),
       output = COALESCE(EXCLUDED.output, tasks.output),
       updated_at = EXCLUDED.updated_at`,
    [
      task.id,
      task.ownerId,
      task.instanceId,
      task.content,
      task.status,
      task.summary || null,
      task.sessionKey || null,
      task.output || null,
      task.createdAt,
      task.updatedAt,
    ]
  );
}

// ── Share Tokens ──────────────────────

export async function loadShareTokens(): Promise<Map<string, ShareToken>> {
  const pool = getPool();
  const map = new Map<string, ShareToken>();
  try {
    const { rows } = await pool.query(
      'SELECT * FROM share_tokens WHERE expires_at > NOW() ORDER BY created_at ASC'
    );
    for (const row of rows) {
      const st: ShareToken = {
        id: row.id,
        token: row.token,
        ownerId: row.owner_id,
        shareType: row.share_type,
        targetId: row.target_id,
        expiresAt: row.expires_at.toISOString(),
        createdAt: row.created_at.toISOString(),
      };
      map.set(st.id, st);
    }
  } catch (err) {
    console.error('[persistence] Failed to load share tokens from PG:', err);
  }
  return map;
}

export async function saveShareToken(st: ShareToken): Promise<void> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO share_tokens (id, token, owner_id, share_type, target_id, expires_at, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (id) DO NOTHING`,
    [st.id, st.token, st.ownerId, st.shareType, st.targetId, st.expiresAt, st.createdAt]
  );
}

export async function deleteShareTokenFromDB(id: string): Promise<void> {
  const pool = getPool();
  await pool.query('DELETE FROM share_tokens WHERE id = $1', [id]);
}

export async function cleanExpiredShareTokens(): Promise<number> {
  const pool = getPool();
  const result = await pool.query('DELETE FROM share_tokens WHERE expires_at < NOW()');
  return result.rowCount || 0;
}

// ── Sessions ──────────────────────────

export async function saveSession(session: SessionRecord): Promise<void> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO sessions (id, owner_id, instance_id, instance_name, topic, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (id) DO UPDATE SET
       instance_name = EXCLUDED.instance_name,
       topic = COALESCE(sessions.topic, EXCLUDED.topic),
       updated_at = EXCLUDED.updated_at`,
    [session.sessionKey, session.ownerId, session.instanceId, session.instanceName, session.topic || null, session.createdAt, session.updatedAt]
  );
}

export async function loadSessionsByOwner(ownerId: string): Promise<SessionRecord[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    'SELECT * FROM sessions WHERE owner_id = $1 ORDER BY updated_at DESC LIMIT 100',
    [ownerId]
  );
  return rows.map(row => ({
    sessionKey: row.id,
    ownerId: row.owner_id,
    instanceId: row.instance_id,
    instanceName: row.instance_name,
    topic: row.topic || undefined,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }));
}

export async function loadSessionDetail(ownerId: string, sessionKey: string): Promise<SessionDetail | null> {
  const pool = getPool();
  const { rows: sessionRows } = await pool.query(
    'SELECT * FROM sessions WHERE id = $1 AND owner_id = $2',
    [sessionKey, ownerId]
  );
  if (sessionRows.length === 0) return null;

  const row = sessionRows[0];
  const { rows: taskRows } = await pool.query(
    'SELECT * FROM tasks WHERE session_key = $1 AND owner_id = $2 ORDER BY created_at ASC',
    [sessionKey, ownerId]
  );

  const exchanges: SessionExchangeRecord[] = taskRows.map(t => ({
    id: t.id,
    input: t.content,
    output: t.output || undefined,
    summary: t.summary || undefined,
    status: t.status,
    timestamp: t.created_at.toISOString(),
    completedAt: t.status === 'completed' || t.status === 'failed' || t.status === 'cancelled'
      ? t.updated_at.toISOString() : undefined,
  }));

  return {
    sessionKey: row.id,
    ownerId: row.owner_id,
    instanceId: row.instance_id,
    instanceName: row.instance_name,
    topic: row.topic || undefined,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    exchanges,
  };
}

export async function deleteSessionFromDB(ownerId: string, sessionKey: string): Promise<boolean> {
  const pool = getPool();
  await pool.query('DELETE FROM tasks WHERE session_key = $1 AND owner_id = $2', [sessionKey, ownerId]);
  const result = await pool.query('DELETE FROM sessions WHERE id = $1 AND owner_id = $2', [sessionKey, ownerId]);
  return (result.rowCount || 0) > 0;
}

export async function clearSessionsForOwner(ownerId: string): Promise<void> {
  const pool = getPool();
  await pool.query(
    'DELETE FROM tasks WHERE owner_id = $1 AND session_key IS NOT NULL',
    [ownerId]
  );
  await pool.query('DELETE FROM sessions WHERE owner_id = $1', [ownerId]);
}

export async function updateSessionTopic(ownerId: string, sessionKey: string, topic: string): Promise<boolean> {
  const pool = getPool();
  const result = await pool.query(
    'UPDATE sessions SET topic = $1, updated_at = NOW() WHERE id = $2 AND owner_id = $3',
    [topic, sessionKey, ownerId]
  );
  return (result.rowCount || 0) > 0;
}

export async function autoSetSessionTopic(sessionKey: string, firstMessage: string): Promise<void> {
  const pool = getPool();
  // Only set topic if it's currently null (don't override manual edits)
  const truncated = firstMessage.slice(0, 100);
  await pool.query(
    'UPDATE sessions SET topic = $1 WHERE id = $2 AND topic IS NULL',
    [truncated, sessionKey]
  );
}

export async function updateTaskOutput(taskId: string, output: string): Promise<void> {
  const pool = getPool();
  await pool.query(
    'UPDATE tasks SET output = $1, updated_at = NOW() WHERE id = $2',
    [output, taskId]
  );
}

// ── Executions ──────────────────────────

export async function saveExecution(exec: ExecutionRecord): Promise<void> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO executions (id, owner_id, team_id, team_name, goal, summary, status, turns, edges, graph, metrics, created_at, completed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     ON CONFLICT (id) DO UPDATE SET
       summary = EXCLUDED.summary,
       status = EXCLUDED.status,
       turns = EXCLUDED.turns,
       edges = EXCLUDED.edges,
       graph = EXCLUDED.graph,
       metrics = EXCLUDED.metrics,
       completed_at = EXCLUDED.completed_at`,
    [
      exec.id, exec.ownerId, exec.teamId, exec.teamName,
      exec.goal, exec.summary || null, exec.status,
      JSON.stringify(exec.turns), JSON.stringify(exec.edges),
      exec.graph ? JSON.stringify(exec.graph) : null,
      exec.metrics ? JSON.stringify(exec.metrics) : null,
      exec.createdAt, exec.completedAt || null,
    ]
  );
}

export async function loadExecutionsByOwner(ownerId: string): Promise<ExecutionRecord[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    'SELECT * FROM executions WHERE owner_id = $1 ORDER BY created_at DESC LIMIT 50',
    [ownerId]
  );
  return rows.map(row => ({
    id: row.id,
    ownerId: row.owner_id,
    teamId: row.team_id,
    teamName: row.team_name,
    goal: row.goal,
    summary: row.summary || undefined,
    status: row.status,
    turns: row.turns || [],
    edges: row.edges || [],
    graph: row.graph || undefined,
    metrics: row.metrics || undefined,
    createdAt: row.created_at.toISOString(),
    completedAt: row.completed_at?.toISOString() || undefined,
  }));
}

export async function loadExecutionById(ownerId: string, id: string): Promise<ExecutionRecord | null> {
  const pool = getPool();
  const { rows } = await pool.query(
    'SELECT * FROM executions WHERE id = $1 AND owner_id = $2',
    [id, ownerId]
  );
  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    id: row.id,
    ownerId: row.owner_id,
    teamId: row.team_id,
    teamName: row.team_name,
    goal: row.goal,
    summary: row.summary || undefined,
    status: row.status,
    turns: row.turns || [],
    edges: row.edges || [],
    graph: row.graph || undefined,
    metrics: row.metrics || undefined,
    createdAt: row.created_at.toISOString(),
    completedAt: row.completed_at?.toISOString() || undefined,
  };
}

export async function deleteExecutionFromDB(ownerId: string, id: string): Promise<boolean> {
  const pool = getPool();
  const result = await pool.query('DELETE FROM executions WHERE id = $1 AND owner_id = $2', [id, ownerId]);
  return (result.rowCount || 0) > 0;
}

export async function clearExecutionsForOwner(ownerId: string): Promise<void> {
  const pool = getPool();
  await pool.query('DELETE FROM executions WHERE owner_id = $1', [ownerId]);
}

// ── Instance Skills ──────────────────────

export async function loadInstanceSkills(): Promise<InstanceSkill[]> {
  const pool = getPool();
  try {
    const { rows } = await pool.query('SELECT * FROM instance_skills ORDER BY installed_at ASC');
    return rows.map(row => ({
      instanceId: row.instance_id,
      skillId: row.skill_id,
      installedAt: row.installed_at.toISOString(),
    }));
  } catch (err) {
    console.error('[persistence] Failed to load instance skills from PG:', err);
    return [];
  }
}

export async function saveInstanceSkill(instanceId: string, skillId: string): Promise<void> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO instance_skills (instance_id, skill_id, installed_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (instance_id, skill_id) DO NOTHING`,
    [instanceId, skillId]
  );
}

export async function deleteInstanceSkill(instanceId: string, skillId: string): Promise<void> {
  const pool = getPool();
  await pool.query(
    'DELETE FROM instance_skills WHERE instance_id = $1 AND skill_id = $2',
    [instanceId, skillId]
  );
}

export async function getSkillsByInstance(instanceId: string): Promise<InstanceSkill[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    'SELECT * FROM instance_skills WHERE instance_id = $1 ORDER BY installed_at ASC',
    [instanceId]
  );
  return rows.map(row => ({
    instanceId: row.instance_id,
    skillId: row.skill_id,
    installedAt: row.installed_at.toISOString(),
  }));
}
