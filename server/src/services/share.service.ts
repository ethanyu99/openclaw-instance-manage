import type { ShareToken, ShareDuration } from '../../../shared/types';
import { v4 as uuid } from 'uuid';
import crypto from 'crypto';
import { getPool } from '../db';
import { saveShareToken, deleteShareTokenFromDB, cleanExpiredShareTokens as cleanExpiredShareTokensDB } from '../persistence';
import { cacheGet, cacheSet, cacheDel } from './cache';
import { rowToShareToken } from './row-mappers';

const SHARE_DURATION_MS: Record<ShareDuration, number> = {
  '1h': 3600000, '3h': 10800000, '12h': 43200000, '1d': 86400000,
  '2d': 172800000, '3d': 259200000, '1w': 604800000, '1M': 2592000000,
  'permanent': 100 * 365.25 * 86400000,
};

export const shareService = {
  async createShareToken(ownerId: string, shareType: 'team' | 'instance', targetId: string, duration: ShareDuration): Promise<ShareToken> {
    const id = uuid();
    const token = crypto.randomBytes(32).toString('hex');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + SHARE_DURATION_MS[duration]);
    const st: ShareToken = { id, token, ownerId, shareType, targetId, expiresAt: expiresAt.toISOString(), createdAt: now.toISOString() };
    await saveShareToken(st);
    await cacheSet(`ocm:shareToken:${token}`, st, Math.ceil(SHARE_DURATION_MS[duration] / 1000));
    return st;
  },

  async getShareTokenByToken(token: string): Promise<ShareToken | undefined> {
    const cached = await cacheGet<ShareToken>(`ocm:shareToken:${token}`);
    if (cached) {
      if (new Date(cached.expiresAt) < new Date()) {
        await cacheDel(`ocm:shareToken:${token}`);
        await deleteShareTokenFromDB(cached.id);
        return undefined;
      }
      return cached;
    }
    const pool = getPool();
    const { rows } = await pool.query('SELECT * FROM share_tokens WHERE token = $1 AND expires_at > NOW()', [token]);
    if (rows.length === 0) return undefined;
    const st = rowToShareToken(rows[0]);
    const ttl = Math.ceil((new Date(st.expiresAt).getTime() - Date.now()) / 1000);
    if (ttl > 0) await cacheSet(`ocm:shareToken:${token}`, st, ttl);
    return st;
  },

  async getShareTokensByOwner(ownerId: string): Promise<ShareToken[]> {
    const pool = getPool();
    const { rows } = await pool.query('SELECT * FROM share_tokens WHERE owner_id = $1 AND expires_at > NOW() ORDER BY created_at ASC', [ownerId]);
    return rows.map(rowToShareToken);
  },

  async deleteShareToken(ownerId: string, id: string): Promise<boolean> {
    const pool = getPool();
    const { rows } = await pool.query('SELECT * FROM share_tokens WHERE id = $1 AND owner_id = $2', [id, ownerId]);
    if (rows.length === 0) return false;
    await cacheDel(`ocm:shareToken:${rows[0].token}`);
    await deleteShareTokenFromDB(id);
    return true;
  },

  async cleanExpiredShareTokens(): Promise<void> {
    await cleanExpiredShareTokensDB();
  },
};
