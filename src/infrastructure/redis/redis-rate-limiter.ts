import type { RateLimitResult, RateLimiter } from "../../application/ports.js";

export interface RedisLikeClient {
  incr(key: string): Promise<number>;
  pttl(key: string): Promise<number>;
  pexpire(key: string, milliseconds: number): Promise<number>;
}

export class RedisRateLimiter implements RateLimiter {
  constructor(
    private readonly client: RedisLikeClient,
    private readonly keyPrefix = "ratelimit:",
  ) {}

  async consume(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
    const redisKey = `${this.keyPrefix}${key}`;
    const count = await this.client.incr(redisKey);
    let ttlMs = await this.client.pttl(redisKey);

    if (ttlMs < 0) {
      ttlMs = windowSeconds * 1000;
      await this.client.pexpire(redisKey, ttlMs);
    }

    if (count > limit) {
      return { allowed: false, retryAfterSeconds: Math.ceil(ttlMs / 1000) };
    }

    return { allowed: true, retryAfterSeconds: 0 };
  }
}
