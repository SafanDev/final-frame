import { env } from '../config/env.js';
import { getRedisClient } from '../config/redis.js';
import { logger } from '../utils/logger.js';

interface AttemptRecord {
  count: number;
  resetAt: number;
}

const localAttempts = new Map<string, AttemptRecord>();
const localLeases = new Map<string, Set<string>>();
let lastRedisWarningAt = 0;
let localOperationCount = 0;

const attemptScript = `
local current = redis.call('INCR', KEYS[1])
local ttl = redis.call('PTTL', KEYS[1])
if current == 1 or ttl < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
if current > tonumber(ARGV[2]) then return 0 end
return 1
`;

const acquireLeaseScript = `
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])
local existing = redis.call('ZSCORE', KEYS[1], ARGV[3])
if existing then
  redis.call('ZADD', KEYS[1], ARGV[2], ARGV[3])
  redis.call('PEXPIRE', KEYS[1], ARGV[4])
  return 1
end
local count = redis.call('ZCARD', KEYS[1])
if count >= tonumber(ARGV[5]) then return 0 end
redis.call('ZADD', KEYS[1], ARGV[2], ARGV[3])
redis.call('PEXPIRE', KEYS[1], ARGV[4])
return 1
`;

const renewLeaseScript = `
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])
if not redis.call('ZSCORE', KEYS[1], ARGV[3]) then return 0 end
redis.call('ZADD', KEYS[1], ARGV[2], ARGV[3])
redis.call('PEXPIRE', KEYS[1], ARGV[4])
return 1
`;

const warnRedisFallback = (operation: string, error?: unknown): void => {
  const now = Date.now();
  if (now - lastRedisWarningAt < 60_000) return;
  lastRedisWarningAt = now;
  logger.warn('Distributed socket guard unavailable; using process-local safeguards', {
    operation,
    error,
  });
};

const namespacedKey = (namespace: string, key: string): string =>
  `${env.REDIS_KEY_PREFIX}socket-guard:${namespace}:${key}`;

const pruneLocalAttempts = (now: number): void => {
  localOperationCount += 1;
  if (localOperationCount % 500 !== 0) return;
  for (const [key, record] of localAttempts) {
    if (record.resetAt <= now) localAttempts.delete(key);
  }
};

const rememberLocalLease = (namespace: string, key: string, memberId: string): void => {
  const localKey = `${namespace}:${key}`;
  const members = localLeases.get(localKey) ?? new Set<string>();
  members.add(memberId);
  localLeases.set(localKey, members);
};

const consumeLocalAttempt = (key: string, limit: number, windowMs: number, now: number): boolean => {
  pruneLocalAttempts(now);
  const current = localAttempts.get(key);
  if (!current || current.resetAt <= now) {
    localAttempts.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (current.count >= limit) return false;
  current.count += 1;
  return true;
};

export const consumeDistributedAttempt = async (
  namespace: string,
  key: string,
  limit: number,
  windowMs: number,
): Promise<boolean> => {
  const redis = getRedisClient();
  if (!redis?.isReady) {
    warnRedisFallback('attempt');
    return consumeLocalAttempt(`${namespace}:${key}`, limit, windowMs, Date.now());
  }

  try {
    const result = await redis.eval(attemptScript, {
      keys: [namespacedKey(namespace, key)],
      arguments: [String(windowMs), String(limit)],
    });
    return Number(result) === 1;
  } catch (error) {
    warnRedisFallback('attempt', error);
    return consumeLocalAttempt(`${namespace}:${key}`, limit, windowMs, Date.now());
  }
};

export const acquireDistributedLease = async (
  namespace: string,
  key: string,
  memberId: string,
  limit: number,
  ttlMs: number,
): Promise<boolean> => {
  const redis = getRedisClient();
  if (!redis?.isReady) {
    warnRedisFallback('lease-acquire');
    const localKey = `${namespace}:${key}`;
    const members = localLeases.get(localKey) ?? new Set<string>();
    if (!members.has(memberId) && members.size >= limit) return false;
    rememberLocalLease(namespace, key, memberId);
    return true;
  }

  const now = Date.now();
  try {
    const result = await redis.eval(acquireLeaseScript, {
      keys: [namespacedKey(namespace, key)],
      arguments: [String(now), String(now + ttlMs), memberId, String(ttlMs * 2), String(limit)],
    });
    const acquired = Number(result) === 1;
    if (acquired) rememberLocalLease(namespace, key, memberId);
    return acquired;
  } catch (error) {
    warnRedisFallback('lease-acquire', error);
    const localKey = `${namespace}:${key}`;
    const members = localLeases.get(localKey) ?? new Set<string>();
    if (!members.has(memberId) && members.size >= limit) return false;
    rememberLocalLease(namespace, key, memberId);
    return true;
  }
};

export const renewDistributedLease = async (
  namespace: string,
  key: string,
  memberId: string,
  ttlMs: number,
): Promise<boolean> => {
  const localMembers = localLeases.get(`${namespace}:${key}`);
  const redis = getRedisClient();
  if (!redis?.isReady) return localMembers?.has(memberId) === true;

  try {
    const now = Date.now();
    const renewed = await redis.eval(renewLeaseScript, {
      keys: [namespacedKey(namespace, key)],
      arguments: [String(now), String(now + ttlMs), memberId, String(ttlMs * 2)],
    });
    return Number(renewed) === 1;
  } catch (error) {
    warnRedisFallback('lease-renew', error);
    return localMembers?.has(memberId) === true;
  }
};

export const releaseDistributedLease = async (
  namespace: string,
  key: string,
  memberId: string,
): Promise<void> => {
  const localKey = `${namespace}:${key}`;
  const members = localLeases.get(localKey);
  members?.delete(memberId);
  if (members?.size === 0) localLeases.delete(localKey);

  const redis = getRedisClient();
  if (!redis?.isReady) return;
  try {
    await redis.zRem(namespacedKey(namespace, key), memberId);
  } catch (error) {
    warnRedisFallback('lease-release', error);
  }
};
