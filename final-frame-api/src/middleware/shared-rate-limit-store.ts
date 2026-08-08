import {
  MemoryStore,
  type ClientRateLimitInfo,
  type IncrementResponse,
  type Options,
  type Store,
} from 'express-rate-limit';
import { getRedisClient } from '../config/redis.js';
import { logger } from '../utils/logger.js';

const incrementScript = `
local current = redis.call('INCR', KEYS[1])
local ttl = redis.call('PTTL', KEYS[1])
if current == 1 or ttl < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return {current, ttl}
`;

const decrementScript = `
local current = redis.call('GET', KEYS[1])
if not current then return 0 end
current = tonumber(current)
if current <= 1 then
  redis.call('DEL', KEYS[1])
  return 0
end
return redis.call('DECR', KEYS[1])
`;

interface SharedRateLimitStoreOptions {
  prefix: string;
}

export class SharedRateLimitStore implements Store {
  readonly prefix: string;
  readonly localKeys = false;
  private readonly fallback = new MemoryStore();
  private windowMs = 60_000;
  private lastFallbackWarningAt = 0;

  constructor(options: SharedRateLimitStoreOptions) {
    this.prefix = options.prefix;
  }

  init(options: Options): void {
    this.windowMs = options.windowMs;
    this.fallback.init(options);
  }

  private redisKey(key: string): string {
    return `${this.prefix}${key}`;
  }

  private warnFallback(error?: unknown): void {
    const now = Date.now();
    if (now - this.lastFallbackWarningAt < 60_000) return;
    this.lastFallbackWarningAt = now;
    logger.warn('Shared rate-limit store unavailable; using process-local fail-safe counters', {
      prefix: this.prefix,
      error,
    });
  }

  async increment(key: string): Promise<IncrementResponse> {
    const redis = getRedisClient();
    if (!redis?.isReady) {
      this.warnFallback();
      return this.fallback.increment(key);
    }

    try {
      const raw = await redis.eval(incrementScript, {
        keys: [this.redisKey(key)],
        arguments: [String(this.windowMs)],
      });
      if (!Array.isArray(raw) || raw.length < 2) throw new Error('Redis returned an invalid rate-limit response.');
      const totalHits = Number(raw[0]);
      const ttl = Number(raw[1]);
      if (!Number.isSafeInteger(totalHits) || totalHits < 1 || !Number.isFinite(ttl)) {
        throw new Error('Redis returned invalid rate-limit values.');
      }
      return { totalHits, resetTime: new Date(Date.now() + Math.max(0, ttl)) };
    } catch (error) {
      this.warnFallback(error);
      return this.fallback.increment(key);
    }
  }

  async decrement(key: string): Promise<void> {
    const redis = getRedisClient();
    if (!redis?.isReady) {
      await this.fallback.decrement(key);
      return;
    }
    try {
      await redis.eval(decrementScript, { keys: [this.redisKey(key)], arguments: [] });
    } catch (error) {
      this.warnFallback(error);
      await this.fallback.decrement(key);
    }
  }

  async resetKey(key: string): Promise<void> {
    const redis = getRedisClient();
    if (!redis?.isReady) {
      await this.fallback.resetKey(key);
      return;
    }
    try {
      await redis.del(this.redisKey(key));
    } catch (error) {
      this.warnFallback(error);
      await this.fallback.resetKey(key);
    }
  }

  async get(key: string): Promise<ClientRateLimitInfo | undefined> {
    const redis = getRedisClient();
    if (!redis?.isReady) return this.fallback.get(key);

    try {
      const [value, ttl] = await Promise.all([
        redis.get(this.redisKey(key)),
        redis.pTTL(this.redisKey(key)),
      ]);
      if (value === null) return undefined;
      const totalHits = Number(value);
      if (!Number.isSafeInteger(totalHits) || totalHits < 0) return undefined;
      return { totalHits, resetTime: new Date(Date.now() + Math.max(0, ttl)) };
    } catch (error) {
      this.warnFallback(error);
      return this.fallback.get(key);
    }
  }
}
