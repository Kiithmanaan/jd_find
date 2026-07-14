import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryRateLimiter } from "../src/infrastructure/memory/in-memory-rate-limiter.js";
import { RedisRateLimiter, type RedisLikeClient } from "../src/infrastructure/redis/redis-rate-limiter.js";

test("InMemoryRateLimiter 在窗口内允许到达上限，超出后拒绝并返回 retryAfterSeconds", async () => {
  let now = 0;
  const limiter = new InMemoryRateLimiter(() => now);

  const first = await limiter.consume("key-1", 2, 60);
  const second = await limiter.consume("key-1", 2, 60);
  assert.equal(first.allowed, true);
  assert.equal(second.allowed, true);

  now = 1_000;
  const third = await limiter.consume("key-1", 2, 60);
  assert.equal(third.allowed, false);
  assert.equal(third.retryAfterSeconds, 59);
});

test("InMemoryRateLimiter 在窗口过期后重置计数", async () => {
  let now = 0;
  const limiter = new InMemoryRateLimiter(() => now);

  await limiter.consume("key-2", 1, 10);
  const blocked = await limiter.consume("key-2", 1, 10);
  assert.equal(blocked.allowed, false);

  now = 10_001;
  const afterReset = await limiter.consume("key-2", 1, 10);
  assert.equal(afterReset.allowed, true);
});

test("InMemoryRateLimiter 对不同 key 独立计数", async () => {
  const limiter = new InMemoryRateLimiter(() => 0);

  const keyA = await limiter.consume("key-a", 1, 60);
  const keyB = await limiter.consume("key-b", 1, 60);
  assert.equal(keyA.allowed, true);
  assert.equal(keyB.allowed, true);
});

function createFakeRedisClient(): RedisLikeClient & { store: Map<string, { value: number; expiresAt: number | null }> } {
  const store = new Map<string, { value: number; expiresAt: number | null }>();

  return {
    store,
    async incr(key: string) {
      const existing = store.get(key);
      const next = (existing?.value ?? 0) + 1;
      store.set(key, { value: next, expiresAt: existing?.expiresAt ?? null });
      return next;
    },
    async pttl(key: string) {
      const existing = store.get(key);
      if (!existing || existing.expiresAt === null) return -1;
      return existing.expiresAt;
    },
    async pexpire(key: string, milliseconds: number) {
      const existing = store.get(key);
      if (!existing) return 0;
      existing.expiresAt = milliseconds;
      return 1;
    },
  };
}

test("RedisRateLimiter 首次调用设置窗口过期时间并在超限时拒绝", async () => {
  const client = createFakeRedisClient();
  const limiter = new RedisRateLimiter(client);

  const first = await limiter.consume("plugin-key", 2, 30);
  assert.equal(first.allowed, true);
  assert.equal(client.store.get("ratelimit:plugin-key")?.expiresAt, 30_000);

  const second = await limiter.consume("plugin-key", 2, 30);
  assert.equal(second.allowed, true);

  const third = await limiter.consume("plugin-key", 2, 30);
  assert.equal(third.allowed, false);
  assert.equal(third.retryAfterSeconds, 30);
});

test("RedisRateLimiter 不会在已有过期时间的 key 上重复设置", async () => {
  const client = createFakeRedisClient();
  const limiter = new RedisRateLimiter(client);

  await limiter.consume("plugin-key-2", 5, 60);
  client.store.get("ratelimit:plugin-key-2")!.expiresAt = 12_345;

  await limiter.consume("plugin-key-2", 5, 60);
  assert.equal(client.store.get("ratelimit:plugin-key-2")?.expiresAt, 12_345);
});
