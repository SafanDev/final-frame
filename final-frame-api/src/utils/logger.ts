import { env } from '../config/env.js';

const LEVEL_WEIGHT = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
} as const;

type LogLevel = keyof typeof LEVEL_WEIGHT;
type LogMeta = Readonly<Record<string, unknown>>;

const configuredLevel: LogLevel = env.LOG_LEVEL;
const configuredWeight = LEVEL_WEIGHT[configuredLevel];
const sensitiveKeyPattern = /password|passphrase|token|authorization|cookie|session|secret|api[-_]?key|credential|jwt/i;
const emailKeyPattern = /email/i;
const jwtLikePattern = /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}(?:\.[A-Za-z0-9_-]{10,})?\b/g;
const bearerPattern = /\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi;
const longTokenPattern = /\b[a-f0-9]{48,}\b/gi;

const maskEmail = (value: string): string => {
  const separator = value.lastIndexOf('@');
  if (separator <= 0) return '[REDACTED_EMAIL]';

  const local = value.slice(0, separator);
  const domain = value.slice(separator + 1);
  return `${local.slice(0, 1)}***@${domain}`;
};

const sanitizeString = (value: string): string => {
  let sanitized = value
    .replace(bearerPattern, 'Bearer [REDACTED]')
    .replace(jwtLikePattern, '[REDACTED_JWT]')
    .replace(longTokenPattern, '[REDACTED_TOKEN]');

  try {
    const url = new URL(sanitized);
    if (url.username) url.username = '[REDACTED]';
    if (url.password) url.password = '[REDACTED]';
    for (const key of [...url.searchParams.keys()]) {
      if (sensitiveKeyPattern.test(key) || key.toLowerCase().startsWith('x-amz-')) {
        url.searchParams.set(key, '[REDACTED]');
      }
    }
    if (url.hash.length > 1) {
      const fragment = new URLSearchParams(url.hash.slice(1));
      let changed = false;
      for (const key of [...fragment.keys()]) {
        if (sensitiveKeyPattern.test(key) || key.toLowerCase().startsWith('x-amz-')) {
          fragment.set(key, '[REDACTED]');
          changed = true;
        }
      }
      if (changed) url.hash = fragment.toString();
    }
    sanitized = url.toString();
  } catch {
    // Most logged strings are not URLs. No action is needed.
  }

  return sanitized;
};

const sanitizeValue = (
  value: unknown,
  ancestors: Set<object>,
  depth = 0,
): unknown => {
  if (depth > 12) return '[MAX_DEPTH_REACHED]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return sanitizeString(value);
  if (typeof value === 'bigint') return value.toString();
  if (typeof value !== 'object') return value;

  if (value instanceof Date) return value.toISOString();

  if (value instanceof Error) {
    return sanitizeValue(
      {
        name: value.name,
        message: value.message,
        stack: value.stack,
        cause: value.cause,
      },
      ancestors,
      depth + 1,
    );
  }

  if (ancestors.has(value)) return '[CIRCULAR_REFERENCE]';
  ancestors.add(value);

  try {
    if (Array.isArray(value)) {
      return value.slice(0, 100).map((entry) => sanitizeValue(entry, ancestors, depth + 1));
    }

    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value).slice(0, 100)) {
      if (sensitiveKeyPattern.test(key)) {
        result[key] = '[REDACTED]';
      } else if (emailKeyPattern.test(key) && typeof entry === 'string') {
        result[key] = maskEmail(entry);
      } else {
        result[key] = sanitizeValue(entry, ancestors, depth + 1);
      }
    }
    return result;
  } finally {
    ancestors.delete(value);
  }
};

export const sanitizePathForLog = (rawPath: string): string => {
  const withoutQuery = rawPath.split('?')[0] ?? rawPath;
  return withoutQuery
    .replace(/(\/invite\/)[A-Za-z0-9_-]{16,}/gi, '$1[REDACTED_TOKEN]')
    .replace(/(\/api\/auth\/callback\/)[^/]+/gi, '$1[REDACTED_PROVIDER]');
};

const write = (level: LogLevel, message: string, meta: LogMeta = {}): void => {
  if (LEVEL_WEIGHT[level] < configuredWeight) return;

  const payload = sanitizeValue(
    {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...meta,
    },
    new Set<object>(),
  );

  const serialized = JSON.stringify(payload);
  if (level === 'error') console.error(serialized);
  else if (level === 'warn') console.warn(serialized);
  else console.log(serialized);
};

export const logger = Object.freeze({
  debug: (message: string, meta?: LogMeta) => write('debug', message, meta),
  info: (message: string, meta?: LogMeta) => write('info', message, meta),
  warn: (message: string, meta?: LogMeta) => write('warn', message, meta),
  error: (message: string, meta?: LogMeta) => write('error', message, meta),
});
