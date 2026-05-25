import Redis from "ioredis";

const redis = new Redis(process.env.REDIS_URL || "redis://127.0.0.1:6379", {
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => {
    if (times > 5) return null; // stop retrying
    return Math.min(times * 100, 2000);
  },
  lazyConnect: true, // connect only when needed
});

export default redis;
