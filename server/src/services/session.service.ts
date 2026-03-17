import { getRedis } from '../redis';
import { saveSession, autoSetSessionTopic } from '../persistence';
import type { SessionRecord } from '../../../shared/types';

export const sessionService = {
  async getSessionKey(ownerId: string, instanceId: string): Promise<string> {
    const redisKey = `ocm:session:${ownerId}:${instanceId}`;
    const existing = await getRedis().get(redisKey);
    if (existing) return existing;
    const key = `${ownerId}-${instanceId}`;
    await getRedis().set(redisKey, key);
    return key;
  },

  async resetSessionKey(ownerId: string, instanceId: string): Promise<string> {
    const redisKey = `ocm:session:${ownerId}:${instanceId}`;
    const key = `${ownerId}-${instanceId}-${Date.now()}`;
    await getRedis().set(redisKey, key);
    await getRedis().del(`ocm:teamUsage:${ownerId}:${instanceId}`);
    return key;
  },

  async markUsedByTeam(ownerId: string, instanceId: string): Promise<void> {
    await getRedis().set(`ocm:teamUsage:${ownerId}:${instanceId}`, '1', 'EX', 86400);
  },

  async wasUsedByTeam(ownerId: string, instanceId: string): Promise<boolean> {
    return (await getRedis().get(`ocm:teamUsage:${ownerId}:${instanceId}`)) === '1';
  },

  async ensureSession(ownerId: string, instanceId: string, instanceName: string, sessionKey: string, taskContent?: string): Promise<void> {
    const session: SessionRecord = {
      sessionKey, ownerId, instanceId, instanceName,
      topic: taskContent ? taskContent.slice(0, 100) : undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await saveSession(session);
    if (taskContent) await autoSetSessionTopic(sessionKey, taskContent);
  },
};
