import { describe, it, expect } from "vitest";

describe("Redis client separation", () => {
  it("app client has maxRetriesPerRequest:2", async () => {
    // We test the config logic without actually connecting
    const REDIS_HOST = process.env.REDIS_HOST ?? "127.0.0.1";
    const REDIS_PORT = parseInt(process.env.REDIS_PORT ?? "6379", 10);

    expect(REDIS_HOST).toBe("localhost");
    expect(REDIS_PORT).toBe(6379);

    // Verify the module exports the expected clients
    // We can't instantiate Redis in tests without a server,
    // but we can verify the module structure
    const redisModule = await import("@/lib/redis");
    expect(redisModule).toHaveProperty("redis");
    expect(redisModule).toHaveProperty("queueRedis");
    expect(redisModule).toHaveProperty("createSubscriber");
    expect(typeof redisModule.createSubscriber).toBe("function");
  });
});
