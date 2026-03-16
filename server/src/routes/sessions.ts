import { Router } from 'express';
import {
  loadSessionsByOwner,
  loadSessionDetail,
  deleteSessionFromDB,
  clearSessionsForOwner,
  updateSessionTopic,
} from '../persistence';

export const sessionRouter = Router();

sessionRouter.get('/', async (req, res) => {
  const ownerId = req.userContext!.userId;
  try {
    const sessions = await loadSessionsByOwner(ownerId);
    res.json({ sessions });
  } catch (err) {
    console.error('[sessions] Failed to load sessions:', err);
    res.status(500).json({ error: 'Failed to load sessions' });
  }
});

sessionRouter.get('/:key', async (req, res) => {
  const ownerId = req.userContext!.userId;
  const { key } = req.params;
  try {
    const session = await loadSessionDetail(ownerId, key);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    res.json(session);
  } catch (err) {
    console.error('[sessions] Failed to load session detail:', err);
    res.status(500).json({ error: 'Failed to load session detail' });
  }
});

sessionRouter.patch('/:key/topic', async (req, res) => {
  const ownerId = req.userContext!.userId;
  const { key } = req.params;
  const { topic } = req.body;
  if (typeof topic !== 'string' || topic.length > 500) {
    res.status(400).json({ error: 'Invalid topic (max 500 chars)' });
    return;
  }
  try {
    const updated = await updateSessionTopic(ownerId, key, topic);
    if (!updated) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[sessions] Failed to update session topic:', err);
    res.status(500).json({ error: 'Failed to update session topic' });
  }
});

sessionRouter.delete('/:key', async (req, res) => {
  const ownerId = req.userContext!.userId;
  const { key } = req.params;
  try {
    const deleted = await deleteSessionFromDB(ownerId, key);
    if (!deleted) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[sessions] Failed to delete session:', err);
    res.status(500).json({ error: 'Failed to delete session' });
  }
});

sessionRouter.delete('/', async (req, res) => {
  const ownerId = req.userContext!.userId;
  try {
    await clearSessionsForOwner(ownerId);
    res.json({ ok: true });
  } catch (err) {
    console.error('[sessions] Failed to clear sessions:', err);
    res.status(500).json({ error: 'Failed to clear sessions' });
  }
});
