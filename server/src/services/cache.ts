import { getRedis } from '../redis';

const CACHE_TTL = 30;
export const STATUS_TTL = 120;

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const val = await getRedis().get(key);
    return val ? JSON.parse(val) : null;
  } catch {
    return null;
  }
}

export async function cacheSet(key: string, value: unknown, ttl = CACHE_TTL): Promise<void> {
  try {
    await getRedis().set(key, JSON.stringify(value), 'EX', ttl);
  } catch { /* best-effort */ }
}

export async function cacheDel(key: string): Promise<void> {
  try {
    await getRedis().del(key);
  } catch { /* best-effort */ }
}

export async function invalidateOwnerCaches(ownerId: string): Promise<void> {
  await Promise.all([
    cacheDel(`ocm:instances:owner:${ownerId}`),
    cacheDel(`ocm:stats:owner:${ownerId}`),
  ]);
}
