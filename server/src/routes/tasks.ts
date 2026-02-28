import { Router } from 'express';
import { store } from '../store';

export const taskRouter = Router();

// GET tasks (optionally filter by instanceId)
taskRouter.get('/', (req, res) => {
  const instanceId = req.query.instanceId as string | undefined;
  const tasks = store.getTasks(instanceId);
  res.json(tasks);
});

// GET single task
taskRouter.get('/:id', (req, res) => {
  const task = store.getTask(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  res.json(task);
});
