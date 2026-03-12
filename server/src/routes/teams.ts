import { Router } from 'express';
import { store } from '../store';
import { TEAM_TEMPLATES } from '../team-templates';
import type { ClawRole } from '../../../shared/types';
import { AppError } from '../middleware/error-handler';

export const teamRouter = Router();

teamRouter.get('/', async (req, res) => {
  const ownerId = req.userContext!.userId;
  const teams = await store.getTeams(ownerId);
  res.json({ teams });
});

teamRouter.get('/templates', (_req, res) => {
  res.json({ templates: TEAM_TEMPLATES });
});

teamRouter.get('/:id', async (req, res, next) => {
  try {
    const ownerId = req.userContext!.userId;
    const team = await store.getTeam(ownerId, req.params.id);
    if (!team) throw new AppError(404, 'Team not found');
    res.json(team);
  } catch (err) { next(err); }
});

teamRouter.post('/', async (req, res, next) => {
  try {
    const ownerId = req.userContext!.userId;
    const { name, description, templateId, roles } = req.body;

    if (!name) throw new AppError(400, 'name is required');
    if (await store.isTeamNameTaken(ownerId, name)) throw new AppError(400, 'Team name must be unique', 'DUPLICATE_NAME');

    let roleDefs: { name: string; description: string; capabilities: string[]; isLead: boolean }[];

    if (templateId) {
      const template = TEAM_TEMPLATES.find(t => t.id === templateId);
      if (!template) throw new AppError(400, 'Template not found');
      roleDefs = template.roles;
    } else if (roles && Array.isArray(roles) && roles.length > 0) {
      roleDefs = roles;
    } else {
      throw new AppError(400, 'Either templateId or roles array is required');
    }

    if (!roleDefs.some(r => r.isLead)) throw new AppError(400, 'At least one role must be designated as Lead');

    const team = await store.createTeam(ownerId, { name, description: description || '' }, roleDefs);
    res.status(201).json(team);
  } catch (err) { next(err); }
});

teamRouter.put('/:id', async (req, res) => {
  const ownerId = req.userContext!.userId;
  const { name, description } = req.body;

  const existing = await store.getTeam(ownerId, req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Team not found' });
  }
  if (name && await store.isTeamNameTaken(ownerId, name, req.params.id)) {
    return res.status(400).json({ error: 'Team name must be unique' });
  }

  const updateData: { name?: string; description?: string } = {};
  if (name !== undefined) updateData.name = name;
  if (description !== undefined) updateData.description = description;

  const team = await store.updateTeam(req.params.id, updateData);
  if (!team) return res.status(404).json({ error: 'Team not found' });
  res.json(team);
});

teamRouter.delete('/:id', async (req, res) => {
  const ownerId = req.userContext!.userId;
  const existing = await store.getTeam(ownerId, req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Team not found' });
  }
  await store.deleteTeam(req.params.id);
  res.status(204).send();
});

teamRouter.post('/:id/roles', async (req, res) => {
  const ownerId = req.userContext!.userId;
  const { name, description, capabilities, isLead } = req.body;

  const team = await store.getTeam(ownerId, req.params.id);
  if (!team) return res.status(404).json({ error: 'Team not found' });

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Role name is required' });
  }

  if (isLead) {
    const existingLead = team.roles.find(r => r.isLead);
    if (existingLead) {
      return res.status(400).json({ error: `Role "${existingLead.name}" is already Lead. Remove its Lead status first.` });
    }
  }

  const role = await store.addRoleToTeam(req.params.id, {
    name: name.trim(),
    description: (description || '').trim(),
    capabilities: Array.isArray(capabilities) ? capabilities : [],
    isLead: !!isLead,
  });

  if (!role) return res.status(500).json({ error: 'Failed to add role' });

  const refreshedTeam = await store.getTeam(ownerId, req.params.id);
  res.status(201).json(refreshedTeam);
});

teamRouter.put('/:id/roles/:roleId', async (req, res) => {
  const ownerId = req.userContext!.userId;
  const { name, description, capabilities, isLead } = req.body;

  const team = await store.getTeam(ownerId, req.params.id);
  if (!team) return res.status(404).json({ error: 'Team not found' });

  const existingRole = team.roles.find(r => r.id === req.params.roleId);
  if (!existingRole) return res.status(404).json({ error: 'Role not found in this team' });

  if (isLead && !existingRole.isLead) {
    const existingLead = team.roles.find(r => r.isLead && r.id !== req.params.roleId);
    if (existingLead) {
      return res.status(400).json({ error: `Role "${existingLead.name}" is already Lead. Remove its Lead status first.` });
    }
  }

  const updateData: Partial<Omit<ClawRole, 'id'>> = {};
  if (name !== undefined) updateData.name = name.trim();
  if (description !== undefined) updateData.description = description.trim();
  if (capabilities !== undefined) updateData.capabilities = capabilities;
  if (isLead !== undefined) updateData.isLead = isLead;

  const updated = await store.updateRole(req.params.id, req.params.roleId, updateData);
  if (!updated) return res.status(500).json({ error: 'Failed to update role' });

  const refreshedTeam = await store.getTeam(ownerId, req.params.id);
  res.json(refreshedTeam);
});

teamRouter.delete('/:id/roles/:roleId', async (req, res) => {
  const ownerId = req.userContext!.userId;

  const team = await store.getTeam(ownerId, req.params.id);
  if (!team) return res.status(404).json({ error: 'Team not found' });

  const role = team.roles.find(r => r.id === req.params.roleId);
  if (!role) return res.status(404).json({ error: 'Role not found in this team' });

  if (team.roles.length <= 2) {
    return res.status(400).json({ error: 'Team must have at least 2 roles' });
  }

  if (role.isLead) {
    const otherLeads = team.roles.filter(r => r.isLead && r.id !== req.params.roleId);
    if (otherLeads.length === 0) {
      return res.status(400).json({ error: 'Cannot delete the only Lead role. Assign another role as Lead first.' });
    }
  }

  const deleted = await store.deleteRole(req.params.id, req.params.roleId);
  if (!deleted) return res.status(500).json({ error: 'Failed to delete role' });

  const refreshedTeam = await store.getTeam(ownerId, req.params.id);
  res.json(refreshedTeam);
});

teamRouter.post('/:id/bind', async (req, res) => {
  const ownerId = req.userContext!.userId;
  const { instanceId, roleId } = req.body;

  if (!instanceId || !roleId) {
    return res.status(400).json({ error: 'instanceId and roleId are required' });
  }

  const team = await store.getTeam(ownerId, req.params.id);
  if (!team) {
    return res.status(404).json({ error: 'Team not found' });
  }

  const instance = await store.getInstance(ownerId, instanceId);
  if (!instance) {
    return res.status(404).json({ error: 'Instance not found' });
  }

  const roleExists = team.roles.some(r => r.id === roleId);
  if (!roleExists) {
    return res.status(400).json({ error: 'Role does not belong to this team' });
  }

  const updated = await store.bindInstanceToRole(instanceId, req.params.id, roleId);
  if (!updated) {
    return res.status(500).json({ error: 'Failed to bind instance' });
  }

  const refreshedTeam = await store.getTeam(ownerId, req.params.id);
  res.json(refreshedTeam);
});

teamRouter.post('/:id/unbind', async (req, res) => {
  const ownerId = req.userContext!.userId;
  const { instanceId } = req.body;

  if (!instanceId) {
    return res.status(400).json({ error: 'instanceId is required' });
  }

  const team = await store.getTeam(ownerId, req.params.id);
  if (!team) {
    return res.status(404).json({ error: 'Team not found' });
  }

  await store.unbindInstanceFromTeam(instanceId);

  const refreshedTeam = await store.getTeam(ownerId, req.params.id);
  res.json(refreshedTeam);
});
