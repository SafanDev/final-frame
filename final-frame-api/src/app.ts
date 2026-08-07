import compression from 'compression';
import cors from 'cors';
import express, { type Express, type RequestHandler } from 'express';
import helmet from 'helmet';
import { env, frontendOrigin } from './config/env.js';
import { apiNotFoundHandler, errorHandler } from './middleware/error.middleware.js';
import { verifyMutationOrigin } from './middleware/origin.js';
import { apiLimiter } from './middleware/rate-limit.js';
import { requestContextMiddleware } from './middleware/request-context.js';
import { metricsMiddleware } from './middleware/metrics.js';
import authRoutes from './routes/auth.routes.js';
import accountRoutes from './routes/account.routes.js';
import healthRoutes from './routes/health.routes.js';
import miscRoutes from './routes/misc.routes.js';
import metricsRoutes from './routes/metrics.routes.js';
import notificationRoutes from './routes/notification.routes.js';
import projectRoutes from './routes/project.routes.js';
import { disableResponseCaching } from './utils/http.js';

const disableApiCaching: RequestHandler = (_request, response, next) => {
  disableResponseCaching(response);
  next();
};

/** Builds the HTTP application without opening a network socket. */
export const createApp = (): Express => {
  const app = express();

  app.disable('x-powered-by');
  app.disable('etag');
  app.set('trust proxy', env.TRUST_PROXY_HOPS);

  app.use(requestContextMiddleware);
  app.use(metricsMiddleware);
  app.use(
    helmet({
      // The API returns JSON and redirects no browser pages. Helmet's remaining
      // defaults still provide MIME, referrer, framing and transport hardening.
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );
  app.use(
    cors({
      origin: frontendOrigin,
      credentials: true,
      methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'traceparent'],
      exposedHeaders: ['X-Request-Id', 'traceparent', 'X-Has-More', 'X-Next-Cursor', 'RateLimit'],
      maxAge: 600,
    }),
  );
  app.use(
    compression({
      threshold: 1_024,
      filter: (request, response) =>
        request.headers['x-no-compression'] === undefined && compression.filter(request, response),
    }),
  );

  // Liveness intentionally stays outside the general API limiter. Readiness has
  // its own tighter limiter because it performs a database query.
  app.use('/health', healthRoutes);
  app.use('/metrics', metricsRoutes);

  app.use('/api', apiLimiter);
  app.use('/api', verifyMutationOrigin);
  app.use(
    '/api',
    express.json({
      limit: env.API_JSON_BODY_LIMIT_BYTES,
      strict: true,
      type: ['application/json', 'application/*+json'],
    }),
  );
  app.use('/api', disableApiCaching);

  app.use('/api/auth', authRoutes);
  app.use('/api/account', accountRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/projects', projectRoutes);
  app.use('/api', miscRoutes);

  app.use('/api', apiNotFoundHandler);
  app.use(errorHandler);

  return app;
};
