import redis from '../config/redis.js';

const fallback = new Map();

const isRedisAvailable = async () => {
  try {
    await redis.ping();
    return true;
  } catch {
    return false;
  }
};

export const cacheGet = async (key) => {
  try {
    if (await isRedisAvailable()) {
      const raw = await redis.get(key);
      return raw ? JSON.parse(raw) : null;
    }
  } catch {
    /* redis unavailable */
  }
  const entry = fallback.get(key);
  if (entry && Date.now() > entry.expiry) {
    fallback.delete(key);
    return null;
  }
  return entry?.value ?? null;
};

export const cacheSet = async (key, value, ttlMs = 600000) => {
  const payload = JSON.stringify(value);
  try {
    if (await isRedisAvailable()) {
      await redis.set(key, payload, 'PX', ttlMs);
      return;
    }
  } catch {
    /* redis unavailable */
  }
  fallback.set(key, {
    value,
    expiry: Date.now() + ttlMs,
  });
};

export const clearByPrefix = async (prefix) => {
  // Clear in-memory fallback
  for (const key of fallback.keys()) {
    if (key.startsWith(prefix)) {
      fallback.delete(key);
    }
  }

  // Clear Redis keys
  try {
    if (await isRedisAvailable()) {
      let cursor = '0';
      do {
        const reply = await redis.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 100);
        cursor = reply[0];
        const keys = reply[1];
        if (keys.length > 0) {
          await redis.del(keys);
        }
      } while (cursor !== '0');
    }
  } catch (err) {
    console.error('Redis clearByPrefix error:', err);
    // fall through, in-memory already cleared
  }
};
