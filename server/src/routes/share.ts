import { Router } from 'express';
import type { ShareDuration } from '../../../shared/types';
import { store } from '../store';

const VALID_DURATIONS: ShareDuration[] = ['1h', '3h', '12h', '1d', '2d', '3d'];

export const shareRouter = Router();

shareRouter.post('/', async (req, res) => {
  const userId = req.userContext!.userId;
  const { shareType, targetId, duration } = req.body as {
    shareType: string;
    targetId: string;
    duration: string;
  };

  if (!shareType || !targetId || !duration) {
    res.status(400).json({ error: 'shareType, targetId, and duration are required' });
    return;
  }

  if (shareType !== 'team' && shareType !== 'instance') {
    res.status(400).json({ error: 'shareType must be "team" or "instance"' });
    return;
  }

  if (!VALID_DURATIONS.includes(duration as ShareDuration)) {
    res.status(400).json({ error: `duration must be one of: ${VALID_DURATIONS.join(', ')}` });
    return;
  }

  if (shareType === 'instance') {
    const inst = await store.getInstance(userId, targetId);
    if (!inst) {
      res.status(404).json({ error: 'Instance not found' });
      return;
    }
  } else {
    const team = await store.getTeam(userId, targetId);
    if (!team) {
      res.status(404).json({ error: 'Team not found' });
      return;
    }
  }

  const shareToken = await store.createShareToken(userId, shareType, targetId, duration as ShareDuration);
  res.json({ shareToken });
});

shareRouter.get('/', async (req, res) => {
  const userId = req.userContext!.userId;
  const tokens = await store.getShareTokensByOwner(userId);
  res.json({ shareTokens: tokens });
});

shareRouter.delete('/:id', async (req, res) => {
  const userId = req.userContext!.userId;
  const deleted = await store.deleteShareToken(userId, req.params.id);
  if (!deleted) {
    res.status(404).json({ error: 'Share token not found' });
    return;
  }
  res.json({ ok: true });
});

export const shareViewRouter = Router();

shareViewRouter.get('/:token', async (req, res) => {
  const st = await store.getShareTokenByToken(req.params.token);
  if (!st) {
    res.status(404).json({ error: 'Share link is invalid or expired' });
    return;
  }

  const ownerShortId = st.ownerId.slice(0, 8);

  if (st.shareType === 'instance') {
    const inst = await store.getInstance(st.ownerId, st.targetId);
    if (!inst) {
      res.status(404).json({ error: 'Shared instance no longer exists' });
      return;
    }
    const safeInstance = { ...inst, endpoint: '***', hasToken: false };
    res.json({
      shareType: 'instance',
      ownerShortId,
      instances: [safeInstance],
      stats: { total: 1, online: inst.status === 'online' ? 1 : 0, busy: inst.status === 'busy' ? 1 : 0, offline: inst.status === 'offline' ? 1 : 0 },
      expiresAt: st.expiresAt,
    });
  } else {
    const team = await store.getTeam(st.ownerId, st.targetId);
    if (!team) {
      res.status(404).json({ error: 'Shared team no longer exists' });
      return;
    }

    const allInstances = await store.getInstances(st.ownerId);
    const teamInstances = allInstances
      .filter(i => i.teamId === st.targetId)
      .map(i => ({ ...i, endpoint: '***', hasToken: false }));

    const stats = {
      total: teamInstances.length,
      online: teamInstances.filter(i => i.status === 'online').length,
      busy: teamInstances.filter(i => i.status === 'busy').length,
      offline: teamInstances.filter(i => i.status === 'offline').length,
    };

    res.json({
      shareType: 'team',
      ownerShortId,
      team,
      instances: teamInstances,
      stats,
      expiresAt: st.expiresAt,
    });
  }
});
