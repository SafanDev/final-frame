import { Router, type Request, type Response } from 'express';
import { env } from '../config/env.js';
import { checkDatabaseReadiness } from '../config/prisma.js';
import { pingRedis } from '../config/redis.js';
import { readinessLimiter } from '../middleware/rate-limit.js';
import { runtimeState } from '../runtime/runtime-state.js';
import { metrics } from '../services/metrics.js';
import { logger } from '../utils/logger.js';

const router = Router();

const disableHealthCaching = (response: Response): void => {
  response.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  response.setHeader('Pragma', 'no-cache');
  response.setHeader('Expires', '0');
};

/**
 * Lightweight liveness probe. It deliberately avoids external dependencies so
 * the platform can distinguish a dead Node process from a temporary database
 * outage.
 */
router.get('/', (_request: Request, response: Response): void => {
  disableHealthCaching(response);
  response.status(200).json({
    status: 'ok',
    service: 'FinalFrame API',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

/**
 * Readiness probe for the database dependency. A short application timeout
 * keeps load balancers responsive while the route-specific limiter prevents
 * this public endpoint from becoming a database-amplification primitive.
 */
router.get(
  '/ready',
  readinessLimiter,
  async (_request: Request, response: Response): Promise<void> => {
    disableHealthCaching(response);

    if (!runtimeState.isReady()) {
      metrics.dependency('database', false);
      if (env.REDIS_REQUIRED) metrics.dependency('redis', false);
      response.status(503).json({
        status: 'unavailable',
        service: 'FinalFrame API',
        database: 'unknown',
        redis: env.REDIS_REQUIRED ? 'unknown' : 'optional',
        reason: runtimeState.isShuttingDown() ? 'shutting-down' : 'starting',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const withTimeout = async <T>(operation: Promise<T>, timeoutMs: number, message: string): Promise<T> => {
      let timeout: NodeJS.Timeout | undefined;
      try {
        const timeoutPromise = new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
          timeout.unref();
        });
        return await Promise.race([operation, timeoutPromise]);
      } finally {
        if (timeout) clearTimeout(timeout);
      }
    };

    let databaseReady = false;
    let redisConnected = false;

    try {
      // The dedicated readiness pool also enforces this deadline inside
      // PostgreSQL, so a timed-out HTTP probe cannot leave a query running.
      await checkDatabaseReadiness();
      databaseReady = true;
    } catch (error) {
      logger.error('Database readiness probe failed', { error });
    }

    if (env.REDIS_URL) {
      try {
        redisConnected = await withTimeout(
          pingRedis(),
          env.REDIS_READINESS_TIMEOUT_MS,
          'Redis readiness check timed out.',
        );
      } catch (error) {
        redisConnected = false;
        logger.error('Redis readiness probe failed', { error });
      }
    }

    metrics.dependency('database', databaseReady);
    const redisReady = !env.REDIS_REQUIRED || redisConnected;
    metrics.dependency('redis', redisConnected);

    const ready = databaseReady && redisReady;
    response.status(ready ? 200 : 503).json({
      status: ready ? 'ready' : 'unavailable',
      service: 'FinalFrame API',
      database: databaseReady ? 'connected' : 'disconnected',
      redis: env.REDIS_URL
        ? (redisConnected ? 'connected' : (env.REDIS_REQUIRED ? 'disconnected' : 'degraded'))
        : 'optional',
      timestamp: new Date().toISOString(),
    });
  },
);

export default router;
