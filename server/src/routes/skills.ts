import { Router } from 'express';
import { store } from '../store';
import { getSkillRegistry, getSkillById, searchSkills } from '../skill-registry';
import { skillLoader } from '../skill-loader';
import { installSkillToSandbox, uninstallSkillFromSandbox, batchInstallSkills, batchUninstallSkills, probeInstalledSkills, installRemoteSkillToSandbox } from '../skills';
import { getSkillsByInstance } from '../persistence';
import { searchSkillsMP, fetchRemoteSkillMd, isSkillsMPConfigured } from '../skillsmp-client';

export const skillsRouter = Router();

skillsRouter.get('/', (_req, res) => {
  const skills = getSkillRegistry();
  res.json({ skills });
});

skillsRouter.get('/search', (req, res) => {
  const q = (req.query.q as string) || '';
  if (!q) return res.json({ skills: getSkillRegistry() });
  const skills = searchSkills(q);
  res.json({ skills });
});

skillsRouter.get('/remote/status', (_req, res) => {
  res.json({ configured: isSkillsMPConfigured() });
});

skillsRouter.get('/remote/search', async (req, res) => {
  const q = (req.query.q as string) || '';
  if (!q) return res.status(400).json({ error: 'Query parameter q is required', code: 'MISSING_QUERY' });

  const mode = (req.query.mode as 'keyword' | 'ai') || 'keyword';
  const result = await searchSkillsMP(q, mode);

  if (!result.ok) {
    const { error } = result;
    const status = error.status || (error.code === 'NOT_CONFIGURED' ? 503 : 500);
    return res.status(status).json({ error: error.message, code: error.code });
  }

  res.json(result.data);
});

skillsRouter.get('/remote/content', async (req, res) => {
  const rawUrl = req.query.url as string;
  if (!rawUrl) return res.status(400).json({ error: 'url query parameter is required' });

  const content = await fetchRemoteSkillMd(rawUrl);
  if (!content) return res.status(404).json({ error: 'Could not retrieve SKILL.md content' });
  res.type('text/markdown').send(content);
});

skillsRouter.post('/instance/:instanceId/install-remote', async (req, res) => {
  const ownerId = req.userContext!.userId;
  const instance = await store.getInstanceRawForOwner(ownerId, req.params.instanceId);
  if (!instance) return res.status(404).json({ error: 'Instance not found' });

  if (!instance.sandboxId || !instance.apiKey) {
    return res.status(400).json({ error: 'Remote skill installation requires a sandbox instance' });
  }

  const { slug, name, rawUrl, skillMd } = req.body as {
    slug: string; name: string; rawUrl?: string; skillMd?: string;
  };
  if (!slug || !name) {
    return res.status(400).json({ error: 'slug and name are required' });
  }

  let content = skillMd;
  if (!content && rawUrl) {
    content = await fetchRemoteSkillMd(rawUrl) ?? undefined;
  }
  if (!content) {
    return res.status(404).json({ error: 'Could not fetch SKILL.md content' });
  }

  const result = await installRemoteSkillToSandbox(
    instance.sandboxId, instance.apiKey, instance.id, slug, name, content,
  );
  res.json(result);
});

skillsRouter.get('/:id/readme', (req, res) => {
  const content = skillLoader.getSkillMd(req.params.id);
  if (!content) return res.status(404).json({ error: 'Skill not found' });
  res.type('text/markdown').send(content);
});

skillsRouter.get('/instance/:instanceId', async (req, res) => {
  const ownerId = req.userContext!.userId;
  const instance = await store.getInstanceRawForOwner(ownerId, req.params.instanceId);
  if (!instance) return res.status(404).json({ error: 'Instance not found' });

  const installed = await getSkillsByInstance(instance.id);
  const skills = installed.map(is => {
    const def = getSkillById(is.skillId);
    return def ? { ...def, installedAt: is.installedAt } : null;
  }).filter(Boolean);

  res.json({ instanceId: instance.id, skills });
});

skillsRouter.post('/instance/:instanceId/install', async (req, res) => {
  const ownerId = req.userContext!.userId;
  const instance = await store.getInstanceRawForOwner(ownerId, req.params.instanceId);
  if (!instance) return res.status(404).json({ error: 'Instance not found' });

  if (!instance.sandboxId || !instance.apiKey) {
    return res.status(400).json({ error: 'Skill installation requires a sandbox instance' });
  }

  const { skillIds } = req.body as { skillIds: string[] };
  if (!skillIds || !Array.isArray(skillIds) || skillIds.length === 0) {
    return res.status(400).json({ error: 'skillIds array is required' });
  }

  const invalid = skillIds.filter(id => !getSkillById(id));
  if (invalid.length > 0) {
    return res.status(400).json({ error: `Unknown skill(s): ${invalid.join(', ')}` });
  }

  const results = await batchInstallSkills(instance.sandboxId, instance.apiKey, instance.id, skillIds);

  const succeeded = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  res.json({ total: results.length, succeeded, failed, results });
});

skillsRouter.post('/instance/:instanceId/uninstall', async (req, res) => {
  const ownerId = req.userContext!.userId;
  const instance = await store.getInstanceRawForOwner(ownerId, req.params.instanceId);
  if (!instance) return res.status(404).json({ error: 'Instance not found' });

  if (!instance.sandboxId || !instance.apiKey) {
    return res.status(400).json({ error: 'Skill uninstallation requires a sandbox instance' });
  }

  const { skillIds } = req.body as { skillIds: string[] };
  if (!skillIds || !Array.isArray(skillIds) || skillIds.length === 0) {
    return res.status(400).json({ error: 'skillIds array is required' });
  }

  const results = await batchUninstallSkills(instance.sandboxId, instance.apiKey, instance.id, skillIds);

  const succeeded = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  res.json({ total: results.length, succeeded, failed, results });
});

skillsRouter.post('/instance/:instanceId/sync', async (req, res) => {
  const ownerId = req.userContext!.userId;
  const instance = await store.getInstanceRawForOwner(ownerId, req.params.instanceId);
  if (!instance) return res.status(404).json({ error: 'Instance not found' });

  if (!instance.sandboxId || !instance.apiKey) {
    return res.status(400).json({ error: 'Sync requires a sandbox instance' });
  }

  const actualDirs = await probeInstalledSkills(instance.sandboxId, instance.apiKey);
  const registry = getSkillRegistry();
  const registryByName = new Map(registry.map(s => [s.name, s]));

  const foundSkillIds = actualDirs
    .map(dir => registryByName.get(dir)?.id)
    .filter((id): id is string => !!id);

  res.json({ instanceId: instance.id, installedSkillIds: foundSkillIds });
});
