import { Router } from 'express';
import {
  loadSessionsByOwner,
  loadSessionDetail,
  deleteSessionFromDB,
  clearSessionsForOwner,
  updateSessionTopic,
} from '../persistence';
import { getRedis } from '../redis';
import { getPool } from '../db';
import { store } from '../store';

export const sessionRouter = Router();

sessionRouter.get('/active', async (req, res) => {
  const ownerId = req.userContext!.userId;
  try {
    const instances = await store.getInstances(ownerId);
    const redis = getRedis();

    // Batch get all session keys from Redis
    const redisKeys = instances.map(i => `ocm:session:${ownerId}:${i.id}`);
    const sessionKeys = redisKeys.length > 0 ? await redis.mget(...redisKeys) : [];

    // Get topics from DB for all non-null session keys
    const validKeys = sessionKeys.filter(Boolean) as string[];
    let topicMap: Record<string, string> = {};
    if (validKeys.length > 0) {
      const pool = getPool();
      const placeholders = validKeys.map((_, i) => `$${i + 1}`).join(',');
      const { rows } = await pool.query(
        `SELECT id, topic FROM sessions WHERE id IN (${placeholders})`,
        validKeys
      );
      for (const row of rows) {
        if (row.topic) topicMap[row.id] = row.topic;
      }
    }

    const activeSessions: Record<string, { sessionKey: string; topic?: string }> = {};
    for (let i = 0; i < instances.length; i++) {
      const key = sessionKeys[i];
      if (key) {
        activeSessions[instances[i].id] = {
          sessionKey: key,
          topic: topicMap[key] || undefined,
        };
      }
    }

    res.json({ activeSessions });
  } catch (err) {
    console.error('[sessions] Failed to load active sessions:', err);
    res.status(500).json({ error: 'Failed to load active sessions' });
  }
});

sessionRouter.get('/', async (req, res) => {
  const ownerId = req.userContext!.userId;
  try {
    const page = parseInt(req.query.page as string);
    if (page && page > 0) {
      // Paginated response
      const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 20, 1), 100);
      const offset = (page - 1) * limit;
      const pool = getPool();
      const [countResult, dataResult] = await Promise.all([
        pool.query('SELECT COUNT(*) FROM sessions WHERE owner_id = $1', [ownerId]),
        pool.query(
          'SELECT * FROM sessions WHERE owner_id = $1 ORDER BY updated_at DESC LIMIT $2 OFFSET $3',
          [ownerId, limit, offset]
        ),
      ]);
      const total = parseInt(countResult.rows[0].count);
      const sessions = dataResult.rows.map((row: any) => ({
        sessionKey: row.id,
        ownerId: row.owner_id,
        instanceId: row.instance_id,
        instanceName: row.instance_name,
        topic: row.topic || undefined,
        createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
        updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
      }));
      res.json({
        data: sessions,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit), hasMore: offset + limit < total },
      });
    } else {
      // Legacy: return all
      const sessions = await loadSessionsByOwner(ownerId);
      res.json({ sessions });
    }
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
