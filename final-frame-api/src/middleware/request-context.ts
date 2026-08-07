import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import { createTraceContext } from '../services/trace-context.js';

const validRequestIdPattern = /^[A-Za-z0-9._:-]{8,128}$/;

/**
 * Assigns a stable request ID to every response. A valid upstream ID is kept so
 * reverse-proxy and application logs can be correlated end to end; malformed
 * values are discarded instead of being reflected into response headers.
 */
export const requestContextMiddleware: RequestHandler = (request, response, next) => {
  const incoming = request.header('x-request-id');
  const requestId = incoming && validRequestIdPattern.test(incoming)
    ? incoming
    : randomUUID();
  const trace = createTraceContext(request.header('traceparent'));

  response.locals.requestId = requestId;
  response.locals.traceId = trace.traceId;
  response.locals.spanId = trace.spanId;
  response.locals.traceparent = trace.traceparent;
  response.setHeader('X-Request-Id', requestId);
  response.setHeader('traceparent', trace.traceparent);
  next();
};
