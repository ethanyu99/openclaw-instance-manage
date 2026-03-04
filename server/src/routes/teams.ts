import { Router } from 'express';
import { store } from '../store';
import { TEAM_TEMPLATES } from '../team-templates';

export const teamRouter = Router();

// List all teams for the current user
teamRouter.get('/', (req, res) => {
  const ownerId = req.userContext!.userId;
  const teams = store.getTeams(ownerId);
  res.json({ teams });
});

// Get team templates
teamRouter.get('/templates', (_req, res) => {
  res.json({ templates: TEAM_TEMPLATES });
});

// Get a single team
teamRouter.get('/:id', (req, res) => {
  const ownerId = req.userContext!.userId;
  const team = store.getTeam(ownerId, req.params.id);
  if (!team) return res.status(404).json({ error: 'Team not found' });
  res.json(team);
});

// Create a team (from scratch or from template)
teamRouter.post('/', (req, res) => {
  const ownerId = req.userContext!.userId;
  const { name, description, templateId, roles } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'name is required' });
  }
  if (store.isTeamNameTaken(ownerId, name)) {
    return res.status(400).json({ error: 'Team name must be unique' });
  }

  let roleDefs: { name: string; description: string; capabilities: string[]; isLead: boolean }[];

  if (templateId) {
    const template = TEAM_TEMPLATES.find(t => t.id === templateId);
    if (!template) {
      return res.status(400).json({ error: 'Template not found' });
    }
    roleDefs = template.roles;
  } else if (roles && Array.isArray(roles) && roles.length > 0) {
    roleDefs = roles;
  } else {
    return res.status(400).json({ error: 'Either templateId or roles array is required' });
  }

  const hasLead = roleDefs.some(r => r.isLead);
  if (!hasLead) {
    return res.status(400).json({ error: 'At least one role must be designated as Lead' });
  }

  const team = store.createTeam(ownerId, { name, description: description || '' }, roleDefs);
  res.status(201).json(team);
});

// Update team info
teamRouter.put('/:id', (req, res) => {
  const ownerId = req.userContext!.userId;
  const { name, description } = req.body;

  const existing = store.getTeam(ownerId, req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Team not found' });
  }
  if (name && store.isTeamNameTaken(ownerId, name, req.params.id)) {
    return res.status(400).json({ error: 'Team name must be unique' });
  }

  const updateData: { name?: string; description?: string } = {};
  if (name !== undefined) updateData.name = name;
  if (description !== undefined) updateData.description = description;

  const team = store.updateTeam(req.params.id, updateData);
  if (!team) return res.status(404).json({ error: 'Team not found' });
  res.json(team);
});

// Delete a team
teamRouter.delete('/:id', (req, res) => {
  const ownerId = req.userContext!.userId;
  const existing = store.getTeam(ownerId, req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Team not found' });
  }
  store.deleteTeam(req.params.id);
  res.status(204).send();
});

// Bind an instance to a role in a team
teamRouter.post('/:id/bind', (req, res) => {
  const ownerId = req.userContext!.userId;
  const { instanceId, roleId } = req.body;

  if (!instanceId || !roleId) {
    return res.status(400).json({ error: 'instanceId and roleId are required' });
  }

  const team = store.getTeam(ownerId, req.params.id);
  if (!team) {
    return res.status(404).json({ error: 'Team not found' });
  }

  const instance = store.getInstance(ownerId, instanceId);
  if (!instance) {
    return res.status(404).json({ error: 'Instance not found' });
  }

  const roleExists = team.roles.some(r => r.id === roleId);
  if (!roleExists) {
    return res.status(400).json({ error: 'Role does not belong to this team' });
  }

  const updated = store.bindInstanceToRole(instanceId, req.params.id, roleId);
  if (!updated) {
    return res.status(500).json({ error: 'Failed to bind instance' });
  }

  const refreshedTeam = store.getTeam(ownerId, req.params.id);
  res.json(refreshedTeam);
});

// Unbind an instance from its team
teamRouter.post('/:id/unbind', (req, res) => {
  const ownerId = req.userContext!.userId;
  const { instanceId } = req.body;

  if (!instanceId) {
    return res.status(400).json({ error: 'instanceId is required' });
  }

  const team = store.getTeam(ownerId, req.params.id);
  if (!team) {
    return res.status(404).json({ error: 'Team not found' });
  }

  store.unbindInstanceFromTeam(instanceId);

  const refreshedTeam = store.getTeam(ownerId, req.params.id);
  res.json(refreshedTeam);
});
