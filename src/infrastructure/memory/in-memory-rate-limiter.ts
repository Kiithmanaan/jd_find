import type { RateLimitResult, RateLimiter } from "../../application/ports.js";

interface Window {
  count: number;
  resetAt: number;
}

export class InMemoryRateLimiter implements RateLimiter {
  private readonly windows = new Map<string, Window>();

  constructor(private readonly now: () => number = Date.now) {}

  async consume(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
    const now = this.now();
    const existing = this.windows.get(key);

    if (!existing || existing.resetAt <= now) {
      this.windows.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
      return { allowed: true, retryAfterSeconds: 0 };
    }

    if (existing.count < limit) {
      existing.count += 1;
      return { allowed: true, retryAfterSeconds: 0 };
    }

    return { allowed: false, retryAfterSeconds: Math.ceil((existing.resetAt - now) / 1000) };
  }
}
