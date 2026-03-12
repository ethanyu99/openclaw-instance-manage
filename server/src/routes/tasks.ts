import { Router } from 'express';
import { store } from '../store';
import { AppError } from '../middleware/error-handler';

export const taskRouter = Router();

taskRouter.get('/', async (req, res) => {
  const ownerId = req.userContext!.userId;
  const instanceId = req.query.instanceId as string | undefined;
  const tasks = await store.getTasks(ownerId, instanceId);
  res.json(tasks);
});

taskRouter.get('/:id', async (req, res, next) => {
  try {
    const ownerId = req.userContext!.userId;
    const task = await store.getTask(req.params.id);
    if (!task || task.ownerId !== ownerId) throw new AppError(404, 'Task not found');
    res.json(task);
  } catch (err) { next(err); }
});
