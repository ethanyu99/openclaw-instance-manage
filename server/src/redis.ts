import Redis from 'ioredis';

let redis: Redis | null = null;
let subscriber: Redis | null = null;

export function getRedis(): Redis {
  if (!redis) throw new Error('Redis not initialized. Call initRedis() first.');
  return redis;
}

export function getSubscriber(): Redis {
  if (!subscriber) throw new Error('Redis subscriber not initialized. Call initRedis() first.');
  return subscriber;
}

export async function initRedis(): Promise<void> {
  const url = process.env.REDIS_URL || 'redis://localhost:6379';

  redis = new Redis(url, {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    retryStrategy(times) {
      if (times > 10) return null;
      return Math.min(times * 200, 2000);
    },
  });

  subscriber = new Redis(url, {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    retryStrategy(times) {
      if (times > 10) return null;
      return Math.min(times * 200, 2000);
    },
  });

  await Promise.all([redis.connect(), subscriber.connect()]);
  console.log('[redis] Connected');
}

export async function closeRedis(): Promise<void> {
  if (subscriber) {
    subscriber.disconnect();
    subscriber = null;
  }
  if (redis) {
    redis.disconnect();
    redis = null;
  }
}
