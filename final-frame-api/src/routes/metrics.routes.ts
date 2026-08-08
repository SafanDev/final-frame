import { timingSafeEqual } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { env } from '../config/env.js';
import { metricsLimiter } from '../middleware/rate-limit.js';
import { metrics } from '../services/metrics.js';
import { collectOperationalMetrics } from '../services/operational-metrics.js';
import { renderOperationalMetricFailure } from '../services/operational-metrics-core.js';
import { logger } from '../utils/logger.js';

const router = Router();

const tokenMatches = (request: Request): boolean => {
  const configured = env.METRICS_BEARER_TOKEN;
  if (!configured) return false;
  const authorization = request.header('authorization');
  if (!authorization?.startsWith('Bearer ')) return false;
  const provided = authorization.slice('Bearer '.length).trim();
  const configuredBytes = Buffer.from(configured);
  const providedBytes = Buffer.from(provided);
  return configuredBytes.length === providedBytes.length
    && timingSafeEqual(configuredBytes, providedBytes);
};

router.get('/', metricsLimiter, async (request: Request, response: Response): Promise<void> => {
  response.setHeader('Cache-Control', 'no-store');
  if (!tokenMatches(request)) {
    response.status(404).end();
    return;
  }

  let operational = renderOperationalMetricFailure();
  try {
    operational = await collectOperationalMetrics();
  } catch (error) {
    logger.warn('Operational metrics snapshot failed', { error });
  }

  response.type('text/plain; version=0.0.4; charset=utf-8').send(`${metrics.render()}${operational}`);
});

export default router;
