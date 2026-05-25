import redis from "../config/redis.js";

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
  } catch {}
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
      await redis.set(key, payload, "PX", ttlMs);
      return;
    }
  } catch {}
  fallback.set(key, {
    value,
    expiry: Date.now() + ttlMs,
  });
};
