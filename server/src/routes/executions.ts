import { Router } from 'express';
import {
  loadExecutionsByOwner,
  loadExecutionById,
  deleteExecutionFromDB,
  clearExecutionsForOwner,
} from '../persistence';

export const executionRouter = Router();

executionRouter.get('/', async (req, res) => {
  const ownerId = req.userContext!.userId;
  try {
    const executions = await loadExecutionsByOwner(ownerId);
    res.json({ executions });
  } catch (err) {
    console.error('[executions] Failed to load executions:', err);
    res.status(500).json({ error: 'Failed to load executions' });
  }
});

executionRouter.get('/:id', async (req, res) => {
  const ownerId = req.userContext!.userId;
  const { id } = req.params;
  try {
    const execution = await loadExecutionById(ownerId, id);
    if (!execution) {
      res.status(404).json({ error: 'Execution not found' });
      return;
    }
    res.json(execution);
  } catch (err) {
    console.error('[executions] Failed to load execution:', err);
    res.status(500).json({ error: 'Failed to load execution' });
  }
});

executionRouter.delete('/:id', async (req, res) => {
  const ownerId = req.userContext!.userId;
  const { id } = req.params;
  try {
    const deleted = await deleteExecutionFromDB(ownerId, id);
    if (!deleted) {
      res.status(404).json({ error: 'Execution not found' });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[executions] Failed to delete execution:', err);
    res.status(500).json({ error: 'Failed to delete execution' });
  }
});

executionRouter.delete('/', async (req, res) => {
  const ownerId = req.userContext!.userId;
  try {
    await clearExecutionsForOwner(ownerId);
    res.json({ ok: true });
  } catch (err) {
    console.error('[executions] Failed to clear executions:', err);
    res.status(500).json({ error: 'Failed to clear executions' });
  }
});
