import Redis from "ioredis";

type RedisSingleton = {
  app?: Redis;
  queue?: Redis;
};

const globalForRedis = globalThis as typeof globalThis & {
  __jimeaningRedis?: RedisSingleton;
};

const REDIS_HOST = process.env.REDIS_HOST ?? "127.0.0.1";
const REDIS_PORT = parseInt(process.env.REDIS_PORT ?? "6379", 10) || 6379;

function buildBaseConfig() {
  return {
    host: REDIS_HOST,
    port: REDIS_PORT,
    enableReadyCheck: true,
    retryStrategy(times: number) {
      return Math.min(2 ** Math.min(times, 10) * 100, 30_000);
    },
  };
}

/** App client — fast-fail with maxRetries:2 for API routes */
function createAppRedis() {
  const client = new Redis({
    ...buildBaseConfig(),
    maxRetriesPerRequest: 2,
  });
  client.on("connect", () => console.log(`[Redis:app] connected ${REDIS_HOST}:${REDIS_PORT}`));
  client.on("error", (err) => console.error(`[Redis:app] error:`, err.message));
  return client;
}

/** Queue client — BullMQ requires maxRetries:null */
function createQueueRedis() {
  const client = new Redis({
    ...buildBaseConfig(),
    maxRetriesPerRequest: null,
  });
  client.on("connect", () => console.log(`[Redis:queue] connected ${REDIS_HOST}:${REDIS_PORT}`));
  client.on("error", (err) => console.error(`[Redis:queue] error:`, err.message));
  return client;
}

/** Subscriber — each caller gets a fresh connection (Redis sub mode is exclusive) */
export function createSubscriber() {
  const client = new Redis({
    ...buildBaseConfig(),
    maxRetriesPerRequest: null,
  });
  client.on("connect", () => console.log(`[Redis:sub] connected ${REDIS_HOST}:${REDIS_PORT}`));
  client.on("error", (err) => console.error(`[Redis:sub] error:`, err.message));
  return client;
}

const singleton = globalForRedis.__jimeaningRedis || {};
if (!globalForRedis.__jimeaningRedis) {
  globalForRedis.__jimeaningRedis = singleton;
}

/** App Redis — for caching, session, general use (maxRetries:2) */
export const redis = singleton.app || (singleton.app = createAppRedis());

/** Queue Redis — for BullMQ queues and workers (maxRetries:null) */
export const queueRedis = singleton.queue || (singleton.queue = createQueueRedis());
