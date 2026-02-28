import { Router } from 'express';
import { store } from '../store';

export const instanceRouter = Router();

// GET all instances
instanceRouter.get('/', (_req, res) => {
  const instances = store.getInstances();
  const stats = store.getStats();
  res.json({ instances, stats });
});

// GET single instance
instanceRouter.get('/:id', (req, res) => {
  const instance = store.getInstance(req.params.id);
  if (!instance) return res.status(404).json({ error: 'Instance not found' });
  res.json(instance);
});

// POST create instance
instanceRouter.post('/', (req, res) => {
  const { name, endpoint, description } = req.body;
  if (!name || !endpoint) {
    return res.status(400).json({ error: 'name and endpoint are required' });
  }
  const instance = store.createInstance({ name, endpoint, description: description || '' });
  res.status(201).json(instance);
});

// PUT update instance
instanceRouter.put('/:id', (req, res) => {
  const { name, endpoint, description } = req.body;
  const instance = store.updateInstance(req.params.id, { name, endpoint, description });
  if (!instance) return res.status(404).json({ error: 'Instance not found' });
  res.json(instance);
});

// DELETE instance
instanceRouter.delete('/:id', (req, res) => {
  const deleted = store.deleteInstance(req.params.id);
  if (!deleted) return res.status(404).json({ error: 'Instance not found' });
  res.status(204).send();
});

// POST health check for an instance
instanceRouter.post('/:id/health', async (req, res) => {
  const instance = store.getInstance(req.params.id);
  if (!instance) return res.status(404).json({ error: 'Instance not found' });

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(`${instance.endpoint}/health`, {
      signal: controller.signal,
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
