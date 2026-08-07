import { createHash } from 'node:crypto';
import type { Request } from 'express';
import { ipKeyGenerator, rateLimit, type Options } from 'express-rate-limit';
import type { AuthRequest } from './auth.js';
import { env } from '../config/env.js';
import { SharedRateLimitStore } from './shared-rate-limit-store.js';
import { logger, sanitizePathForLog } from '../utils/logger.js';

interface LimiterConfiguration {
    name: string;
    windowMs: number;
    limit: number;
    message: string;
    keyGenerator?: NonNullable<Options['keyGenerator']>;
    skipSuccessfulRequests?: boolean;
}

const normalizedIpKey = (request: Request): string => {
    const ip = request.ip || request.socket.remoteAddress || 'unknown';
    return `ip:${ipKeyGenerator(ip, 56)}`;
};

const authenticatedOrIpKey = (request: Request): string => {
    const authRequest = request as AuthRequest;
    return authRequest.user ? `user:${authRequest.user.id}` : normalizedIpKey(request);
};

const normalizedEmailFromRequest = (request: Request): string | null => {
    if (!request.body || typeof request.body !== 'object') return null;

    const body = request.body as Record<string, unknown>;
    if (typeof body.email !== 'string') return null;

    const email = body.email.trim().toLowerCase();
    return email.length > 0 && email.length <= 254 ? email : null;
};

const accountOrIpKey = (request: Request): string => {
    const email = normalizedEmailFromRequest(request);
    return email
        ? `account:${createHash('sha256').update(email).digest('hex')}`
        : normalizedIpKey(request);
};

const createLimiter = ({
    name,
    windowMs,
    limit,
    message,
    keyGenerator,
    skipSuccessfulRequests = false,
}: LimiterConfiguration) =>
    rateLimit({
        windowMs,
        limit,
        standardHeaders: 'draft-8',
        legacyHeaders: false,
        skipSuccessfulRequests,
        ...(keyGenerator ? { keyGenerator } : {}),
        store: new SharedRateLimitStore({ prefix: `${env.REDIS_KEY_PREFIX}rate-limit:${name}:` }),
        // The custom store uses Redis when healthy and a bounded process-local
        // counter when Redis is unavailable. Requests are never silently left
        // completely unthrottled because of a dependency outage.
        passOnStoreError: false,
        handler: (request, response) => {
            logger.warn('Rate limit exceeded', {
                limiter: name,
                path: sanitizePathForLog(request.originalUrl || request.path),
                method: request.method,
                ip: request.ip,
            });

            response.setHeader('Cache-Control', 'no-store');
            const requestId =
                typeof response.locals.requestId === 'string'
                    ? response.locals.requestId
                    : undefined;

            response.status(429).json({
                error: message,
                code: 'RATE_LIMIT_EXCEEDED',
                ...(requestId ? { requestId } : {}),
            });
        },
    });

/** Broad API protection. Route-specific limiters still apply after this one. */
export const apiLimiter = createLimiter({
    name: 'api',
    windowMs: 60_000,
    limit: 300,
    message: 'Too many API requests. Please try again shortly.',
    keyGenerator: normalizedIpKey,
});

/** Protects database-backed readiness checks without affecting liveness probes. */
export const readinessLimiter = createLimiter({
    name: 'readiness',
    windowMs: 60_000,
    limit: 30,
    message: 'Too many readiness checks.',
    keyGenerator: normalizedIpKey,
});


/** Restricts the private Prometheus scrape endpoint. */
export const metricsLimiter = createLimiter({
    name: 'metrics',
    windowMs: 60_000,
    limit: 120,
    message: 'Too many metrics requests.',
    keyGenerator: normalizedIpKey,
});

/** First login barrier: limits traffic from one public network. */
export const authenticationIpLimiter = createLimiter({
    name: 'authentication-ip',
    windowMs: 15 * 60_000,
    limit: 30,
    message: 'Too many authentication attempts. Please try again later.',
    keyGenerator: normalizedIpKey,
    skipSuccessfulRequests: true,
});

/** Second login barrier: protects a specific account across multiple IPs. */
export const authenticationAccountLimiter = createLimiter({
    name: 'authentication-account',
    windowMs: 15 * 60_000,
    limit: 10,
    message: 'Too many attempts for this account. Please try again later.',
    keyGenerator: accountOrIpKey,
    skipSuccessfulRequests: true,
});


/** Sensitive authenticated account operations are keyed to the account, not a shared IP. */
export const sensitiveAccountLimiter = createLimiter({
    name: 'sensitive-account',
    windowMs: 15 * 60_000,
    limit: 10,
    message: 'Too many security actions. Please try again later.',
    keyGenerator: authenticatedOrIpKey,
});

export const registrationLimiter = createLimiter({
    name: 'registration',
    windowMs: 60 * 60_000,
    limit: 10,
    message: 'Too many registration attempts. Please try again later.',
    keyGenerator: normalizedIpKey,
});

export const inviteLimiter = createLimiter({
    name: 'invite',
    windowMs: 60 * 60_000,
    limit: 50,
    message: 'Invite limit reached. Please try again later.',
    keyGenerator: authenticatedOrIpKey,
});

export const uploadLimiter = createLimiter({
    name: 'upload',
    windowMs: 60_000,
    limit: 30,
    message: 'Upload limit reached. Please wait a moment.',
    keyGenerator: authenticatedOrIpKey,
});

export const commentLimiter = createLimiter({
    name: 'comment',
    windowMs: 60_000,
    limit: 60,
    message: 'Comment limit reached. Please wait a moment.',
    keyGenerator: authenticatedOrIpKey,
});

export const secureUrlLimiter = createLimiter({
    name: 'secure-url',
    windowMs: 60_000,
    limit: 120,
    message: 'Secure URL limit reached. Please wait a moment.',
    keyGenerator: authenticatedOrIpKey,
});

export const aiLimiter = createLimiter({
    name: 'ai-summary',
    windowMs: 60_000,
    limit: 5,
    message: 'AI summary limit reached. Please try again in a minute.',
    keyGenerator: authenticatedOrIpKey,
});
