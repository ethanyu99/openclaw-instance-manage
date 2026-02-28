import { Router } from 'express';
import { store } from '../store';

export const instanceRouter = Router();

instanceRouter.get('/', (_req, res) => {
  const instances = store.getInstances();
  const stats = store.getStats();
  res.json({ instances, stats });
});

instanceRouter.get('/:id', (req, res) => {
  const instance = store.getInstance(req.params.id);
  if (!instance) return res.status(404).json({ error: 'Instance not found' });
  res.json(instance);
});

instanceRouter.post('/', (req, res) => {
  const { name, endpoint, description, token } = req.body;
  if (!name || !endpoint) {
    return res.status(400).json({ error: 'name and endpoint are required' });
  }
  const instance = store.createInstance({
    name,
    endpoint,
    description: description || '',
    token: token || undefined,
  });
  res.status(201).json(instance);
});

instanceRouter.put('/:id', (req, res) => {
  const { name, endpoint, description, token } = req.body;
  const instance = store.updateInstance(req.params.id, { name, endpoint, description, token });
  if (!instance) return res.status(404).json({ error: 'Instance not found' });
  res.json(instance);
});

instanceRouter.delete('/:id', (req, res) => {
  const deleted = store.deleteInstance(req.params.id);
  if (!deleted) return res.status(404).json({ error: 'Instance not found' });
  res.status(204).send();
});

function toHttpBase(endpoint: string): string {
  return endpoint
    .replace(/^ws:\/\//, 'http://')
    .replace(/^wss:\/\//, 'https://')
    .replace(/\/+$/, '');
}

instanceRouter.post('/:id/health', async (req, res) => {
  const instance = store.getInstanceRaw(req.params.id);
  if (!instance) return res.status(404).json({ error: 'Instance not found' });

  const baseUrl = toHttpBase(instance.endpoint);
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const headers: Record<string, string> = {};
    if (instance.token) {
      headers['Authorization'] = `Bearer ${instance.token}`;
    }
    const response = await fetch(`${baseUrl}/api/health`, {
      signal: controller.signal,
      headers,
    });
    clearTimeout(timeout);

    if (response.ok) {
      store.updateInstance(instance.id, { status: 'online' });
      res.json({ status: 'online' });
    } else {
      store.updateInstance(instance.id, { status: 'offline' });
      res.json({ status: 'offline' });
    }
  } catch {
    store.updateInstance(instance.id, { status: 'offline' });
    res.json({ status: 'offline' });
  }
});
