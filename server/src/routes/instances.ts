import { Router } from 'express';
import { store } from '../store';
import { createSandbox, killSandbox } from '../sandbox';

export const instanceRouter = Router();

instanceRouter.get('/', async (req, res) => {
  const ownerId = req.userContext!.userId;
  const instances = await store.getInstances(ownerId);
  const stats = await store.getStats(ownerId);
  res.json({ instances, stats });
});

instanceRouter.get('/:id', async (req, res) => {
  const ownerId = req.userContext!.userId;
  const instance = await store.getInstance(ownerId, req.params.id);
  if (!instance) return res.status(404).json({ error: 'Instance not found' });
  res.json(instance);
});

instanceRouter.post('/', async (req, res) => {
  const ownerId = req.userContext!.userId;
  const { name, endpoint, description, token } = req.body;
  if (!name || !endpoint) {
    return res.status(400).json({ error: 'name and endpoint are required' });
  }
  if (await store.isNameTaken(ownerId, name)) {
    return res.status(400).json({ error: 'Instance name must be unique' });
  }
  const instance = await store.createInstance(ownerId, {
    name,
    endpoint,
    description: description || '',
    token: token || undefined,
  });
  res.status(201).json(instance);
});

instanceRouter.put('/:id', async (req, res) => {
  const ownerId = req.userContext!.userId;
  const { name, endpoint, description, token } = req.body;

  if (!await store.getInstance(ownerId, req.params.id)) {
    return res.status(404).json({ error: 'Instance not found' });
  }

  if (name && await store.isNameTaken(ownerId, name, req.params.id)) {
    return res.status(400).json({ error: 'Instance name must be unique' });
  }
  
  const updateData: any = {};
  if (name !== undefined) updateData.name = name;
  if (endpoint !== undefined) updateData.endpoint = endpoint;
  if (description !== undefined) updateData.description = description;
  if (token !== undefined) updateData.token = token;

  const instance = await store.updateInstance(req.params.id, updateData);
  if (!instance) return res.status(404).json({ error: 'Instance not found' });
  res.json(instance);
});

instanceRouter.delete('/:id', async (req, res) => {
  const ownerId = req.userContext!.userId;
  const instance = await store.getInstanceRawForOwner(ownerId, req.params.id);
  if (!instance) return res.status(404).json({ error: 'Instance not found' });

  if (instance.sandboxId) {
    try {
      await killSandbox(instance.sandboxId, instance.apiKey);
    } catch (err) {
      console.warn(`[sandbox] Failed to kill sandbox ${instance.sandboxId}:`, err);
    }
  }

  await store.deleteInstance(req.params.id);
  res.status(204).send();
});

instanceRouter.post('/sandbox', async (req, res) => {
  const ownerId = req.userContext!.userId;
  const { name, apiKey, gatewayToken, description } = req.body;
  if (!name || !apiKey) {
    return res.status(400).json({ error: 'name and apiKey are required' });
  }

  if (await store.isNameTaken(ownerId, name)) {
    return res.status(400).json({ error: 'Instance name must be unique' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    const result = await createSandbox(apiKey, gatewayToken || undefined, (progress) => {
      res.write(`data: ${JSON.stringify({ type: 'progress', step: progress.step, message: progress.message, detail: progress.detail })}\n\n`);
    });
    const instance = await store.createInstance(ownerId, {
      name,
      endpoint: result.endpoint,
      description: description || '',
      token: result.gatewayToken,
      sandboxId: result.sandboxId,
      apiKey,
    });
    res.write(`data: ${JSON.stringify({ type: 'complete', instance })}\n\n`);
    res.end();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create sandbox';
    console.error('[sandbox] Create failed:', message);
    res.write(`data: ${JSON.stringify({ type: 'error', error: message })}\n\n`);
    res.end();
  }
});

function toHttpBase(endpoint: string | undefined): string {
  if (!endpoint) return '';
  return endpoint
    .replace(/^ws:\/\//, 'http://')
    .replace(/^wss:\/\//, 'https://')
    .replace(/\/+$/, '');
}

instanceRouter.post('/:id/health', async (req, res) => {
  const ownerId = req.userContext!.userId;
  const instance = await store.getInstanceRawForOwner(ownerId, req.params.id);
  if (!instance) return res.status(404).json({ error: 'Instance not found' });
  if (!instance.endpoint) {
    await store.updateInstance(instance.id, { status: 'offline' });
    return res.json({ status: 'offline', error: 'No endpoint configured' });
  }

  const baseUrl = toHttpBase(instance.endpoint);
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const headers: Record<string, string> = {};
    if (instance.token) {
      headers['Authorization'] = `Bearer ${instance.token}`;
    }
    const response = await fetch(`${baseUrl}/`, {
      signal: controller.signal,
      headers,
    });
    clearTimeout(timeout);

    if (response.ok) {
      await store.updateInstance(instance.id, { status: 'online' });
      res.json({ status: 'online' });
    } else {
      await store.updateInstance(instance.id, { status: 'offline' });
      res.json({ status: 'offline' });
    }
  } catch {
    await store.updateInstance(instance.id, { status: 'offline' });
    res.json({ status: 'offline' });
  }
});
