import type { RequestHandler } from 'express';
import { env } from '../config/env.js';
import { metrics } from '../services/metrics.js';
import { metricsRouteTemplate, normalizeMetricsRoute } from '../services/metrics-route.js';
import { logger, sanitizePathForLog } from '../utils/logger.js';

export { metricsRouteTemplate, normalizeMetricsRoute };

/**
 * Records low-cardinality HTTP metrics. Dynamic identifiers are replaced so a
 * single busy workspace cannot create an unbounded Prometheus label set.
 */
export const metricsMiddleware: RequestHandler = (request, response, next) => {
  const startedAt = process.hrtime.bigint();
  let finished = false;

  metrics.httpRequestStarted();

  const complete = (): void => {
    if (finished) return;
    finished = true;
    const elapsedNanoseconds = process.hrtime.bigint() - startedAt;
    const durationSeconds = Number(elapsedNanoseconds) / 1_000_000_000;
    const route = metricsRouteTemplate({
      baseUrl: request.baseUrl,
      routePath: request.route?.path,
      originalUrl: request.originalUrl,
      path: request.path,
      status: response.statusCode,
    });
    metrics.httpRequestFinished({
      method: request.method,
      route,
      status: response.statusCode,
      durationSeconds,
    });

    const durationMs = Math.round(durationSeconds * 1_000);
    const requestId = typeof response.locals.requestId === 'string' ? response.locals.requestId : undefined;
    const traceId = typeof response.locals.traceId === 'string' ? response.locals.traceId : undefined;
    const logDetails = {
      method: request.method,
      path: sanitizePathForLog(request.originalUrl || request.path),
      route,
      status: response.statusCode,
      durationMs,
      ...(requestId ? { requestId } : {}),
      ...(traceId ? { traceId } : {}),
    };
    if (response.statusCode >= 500) logger.error('API request failed', logDetails);
    else if (durationMs >= env.HTTP_SLOW_REQUEST_MS) logger.warn('Slow API request', logDetails);
    else logger.debug('API request completed', logDetails);
  };

  response.once('finish', complete);
  response.once('close', complete);
  next();
};
