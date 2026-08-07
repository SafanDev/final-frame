import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

// Readiness uses a dedicated one-connection pool with a server-side statement
// timeout. A Promise.race alone would return quickly while leaving a stalled
// PostgreSQL statement running in the background, allowing public probes to
// accumulate hidden work during a database incident.
const readinessPool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 1,
  allowExitOnIdle: true,
  connectionTimeoutMillis: env.READINESS_TIMEOUT_MS,
  idleTimeoutMillis: 30_000,
  query_timeout: env.READINESS_TIMEOUT_MS,
  statement_timeout: env.READINESS_TIMEOUT_MS,
  application_name: 'finalframe-readiness',
});

readinessPool.on('error', (error) => {
  logger.error('PostgreSQL readiness pool error', { error });
});

const createPrismaClient = (): PrismaClient => {
  const adapter = new PrismaPg({
    connectionString: env.DATABASE_URL,
    max: env.DB_MAX_CONNECTIONS,
    connectionTimeoutMillis: env.DB_CONNECTION_TIMEOUT_MS,
    idleTimeoutMillis: env.DB_IDLE_TIMEOUT_MS,
    query_timeout: env.DB_QUERY_TIMEOUT_MS,
    statement_timeout: env.DB_STATEMENT_TIMEOUT_MS,
  }, {
    onPoolError: (error) => {
      logger.error('PostgreSQL pool error', { error });
    },
    onConnectionError: (error) => {
      logger.error('PostgreSQL connection error', { error });
    },
  });

  const client = new PrismaClient({
    adapter,
    log: [
      { emit: 'event', level: 'error' },
      { emit: 'event', level: 'warn' },
    ],
  });

  client.$on('error', (event) => {
    logger.error('Prisma client error', {
      message: event.message,
      target: event.target,
    });
  });

  client.$on('warn', (event) => {
    logger.warn('Prisma client warning', {
      message: event.message,
      target: event.target,
    });
  });

  return client;
};

declare global {
  // Development hot reloads must reuse one client and one underlying pool.
  // eslint-disable-next-line no-var
  var finalFramePrisma: PrismaClient | undefined;
}

export const prisma = globalThis.finalFramePrisma ?? createPrismaClient();

if (env.NODE_ENV !== 'production') {
  globalThis.finalFramePrisma = prisma;
}

export const checkDatabaseReadiness = async (): Promise<void> => {
  await readinessPool.query('SELECT 1');
};

export const disconnectPrisma = async (): Promise<void> => {
  const results = await Promise.allSettled([
    prisma.$disconnect(),
    readinessPool.end(),
  ]);
  const rejected = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
  if (rejected) throw rejected.reason;
};
