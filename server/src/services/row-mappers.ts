import type { Instance, TaskSummary, Team, ClawRole, ShareToken } from '../../../shared/types';

export function rowToInstance(row: any): Instance {
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

export function rowToTask(row: any): TaskSummary {
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

export function rowToRole(row: any): ClawRole {
  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    capabilities: row.capabilities || [],
    isLead: row.is_lead,
  };
}

export function rowToTeam(row: any): Team {
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

export function rowToShareToken(row: any): ShareToken {
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

export function toPublic(inst: Instance, role?: ClawRole) {
  const { apiKey, ...rest } = inst;
  return { ...rest, hasToken: !!inst.token, role };
}
