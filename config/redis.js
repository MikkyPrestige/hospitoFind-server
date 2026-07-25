import Redis from 'ioredis';

const isProduction = process.env.NODE_ENV === 'production';

const redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => {
    if (times > 3) return null;
    if (!isProduction) return null;
    return Math.min(times * 200, 2000);
  },
  lazyConnect: true,
  enableOfflineQueue: false,
});

// Silently handle errors in non‑production
redis.on('error', () => {
  if (isProduction) {
    console.error('Redis connection error');
  }
});

export default redis;
