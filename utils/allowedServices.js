import Hospital from '../models/Hospital.js';
import { cacheGet, cacheSet } from './cache.js';

const REDIS_KEY = 'allowed:services';
const TTL = 86400; // 24 hours

let inMemoryCache = null;

/**
 * Fetch all distinct services from verified hospitals, with caching.
 * @returns {Promise<string[]>}
 */
export async function getAllowedServices() {
  // 1. In-memory cache
  if (inMemoryCache) return inMemoryCache;

  // 2. Redis cache
  const cached = await cacheGet(REDIS_KEY);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed)) {
        inMemoryCache = parsed;
        return parsed;
      }
    } catch {
      // ignore parse errors, fall through
    }
  }

  // 3. Fetch from DB
  const services = await Hospital.distinct('services', { verified: true });
  // Ensure array, filter out empties
  const clean = [...new Set(services.map((s) => s.trim()).filter(Boolean))];

  // Update caches
  inMemoryCache = clean;
  await cacheSet(REDIS_KEY, JSON.stringify(clean), TTL);

  return clean;
}

/**
 * Force refresh the allowed services list (used by admin endpoint).
 */
export async function refreshAllowedServices() {
  inMemoryCache = null;
  await cacheSet(REDIS_KEY, '', 1); // invalidate Redis
  return getAllowedServices();
}
