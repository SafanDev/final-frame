import { createServer } from 'node:http';
import { createApp } from './app.js';
import { emailDeliveryEnabled, emailVerificationRequired, env } from './config/env.js';
import { disconnectPrisma, prisma } from './config/prisma.js';
import { disconnectRedis } from './config/redis.js';
import { destroyStorageClient } from './config/storage.js';
import { createSocketRuntime, type SocketRuntime } from './realtime/socket-server.js';
import { runtimeState } from './runtime/runtime-state.js';
import { logger } from './utils/logger.js';
import { AssetProcessingWorker } from './workers/asset-processing.worker.js';
import { EmailOutboxWorker } from './workers/email-outbox.worker.js';
import { ProjectDeletionWorker } from './workers/project-deletion.worker.js';
import { RetentionCleanupWorker } from './workers/retention-cleanup.worker.js';
import { StorageCleanupWorker } from './workers/storage-cleanup.worker.js';

const app = createApp();
const httpServer = createServer(app);
let socketRuntime: SocketRuntime | undefined;
const cleanupWorker = new StorageCleanupWorker();
const assetProcessingWorker = new AssetProcessingWorker((projectId) => {
  socketRuntime?.controller.refreshWorkspace(projectId, 'asset-processing-settled');
});
app.set('assetProcessingWorker', assetProcessingWorker);
const emailOutboxWorker = new EmailOutboxWorker();
const projectDeletionWorker = new ProjectDeletionWorker();
const retentionCleanupWorker = new RetentionCleanupWorker();

httpServer.requestTimeout = env.HTTP_REQUEST_TIMEOUT_MS;
httpServer.headersTimeout = env.HTTP_HEADERS_TIMEOUT_MS;
httpServer.keepAliveTimeout = env.HTTP_KEEP_ALIVE_TIMEOUT_MS;
httpServer.maxRequestsPerSocket = env.HTTP_MAX_REQUESTS_PER_SOCKET;

let shutdownPromise: Promise<void> | undefined;

const closeApplication = async (reason: string, requestedExitCode: number): Promise<void> => {
  if (shutdownPromise) return shutdownPromise;
  runtimeState.beginShutdown();

  shutdownPromise = (async () => {
    logger.info('Application shutdown started', { reason });

    const forcedExitTimer = setTimeout(() => {
      logger.error('Graceful shutdown timed out; forcing connection closure', {
        reason,
        timeoutMs: env.SHUTDOWN_TIMEOUT_MS,
      });

      httpServer.closeAllConnections();
      process.exit(1);
    }, env.SHUTDOWN_TIMEOUT_MS);
    forcedExitTimer.unref();

    const serverClose = new Promise<void>((resolve, reject) => {
      if (!httpServer.listening) {
        resolve();
        return;
      }
      httpServer.close((error) => {
        if (error) reject(error);
        else resolve();
      });
      httpServer.closeIdleConnections();
    });

    const results = await Promise.allSettled([
      serverClose,
      cleanupWorker.stop(),
      assetProcessingWorker.stop(),
      emailOutboxWorker.stop(),
      projectDeletionWorker.stop(),
      retentionCleanupWorker.stop(),
      socketRuntime?.close() ?? Promise.resolve(),
    ]);

    for (const result of results) {
      if (result.status === 'rejected') {
        logger.error('A shutdown component failed', { reason, error: result.reason });
      }
    }

    try {
      destroyStorageClient();
    } catch (error) {
      logger.warn('R2 client shutdown failed', { error });
    }

    try {
      await disconnectRedis();
    } catch (error) {
      logger.error('Redis shutdown failed', { error });
    }

    try {
      await disconnectPrisma();
    } catch (error) {
      logger.error('Database shutdown failed', { error });
    }

    clearTimeout(forcedExitTimer);
    process.exitCode = requestedExitCode;
    logger.info('Application shutdown completed', {
      reason,
      exitCode: requestedExitCode,
    });
  })();

  return shutdownPromise;
};

const listen = async (): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    const cleanupListeners = (): void => {
      httpServer.off('error', onStartupError);
      httpServer.off('close', onStartupClose);
    };
    const onStartupError = (error: Error): void => {
      cleanupListeners();
      reject(error);
    };
    const onStartupClose = (): void => {
      cleanupListeners();
      reject(new Error('HTTP server closed before startup completed.'));
    };

    httpServer.once('error', onStartupError);
    httpServer.once('close', onStartupClose);
    httpServer.listen(env.PORT, env.HOST, () => {
      cleanupListeners();
      resolve();
    });
  });
};

const start = async (): Promise<void> => {
  // Fail before opening a port when a required shared dependency is not
  // reachable. The platform can restart the process instead of routing traffic
  // to an instance that cannot honor authorization or collaboration limits.
  await prisma.$connect();
  if (runtimeState.isShuttingDown()) return;

  socketRuntime = await createSocketRuntime(httpServer);
  app.set('io', socketRuntime.io);
  app.set('realtimeController', socketRuntime.controller);
  if (runtimeState.isShuttingDown()) return;

  await listen();
  if (runtimeState.isShuttingDown()) return;

  runtimeState.markReady();
  cleanupWorker.start();
  assetProcessingWorker.start();
  if (emailDeliveryEnabled) emailOutboxWorker.start();
  projectDeletionWorker.start();
  retentionCleanupWorker.start();

  logger.info('FinalFrame API started', {
    host: env.HOST,
    port: env.PORT,
    environment: env.NODE_ENV,
    frontendOrigin: env.FRONTEND_URL,
    distributedRealtime: Boolean(env.REDIS_URL),
    emailDelivery: emailDeliveryEnabled,
    emailVerification: emailVerificationRequired,
  });

  httpServer.on('error', (error) => {
    logger.error('HTTP server error', { error });
    void closeApplication('HTTP_SERVER_ERROR', 1);
  });
};

process.once('SIGTERM', () => {
  void closeApplication('SIGTERM', 0);
});

process.once('SIGINT', () => {
  void closeApplication('SIGINT', 0);
});

process.once('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error });
  void closeApplication('UNCAUGHT_EXCEPTION', 1);
});

process.once('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', { reason });
  void closeApplication('UNHANDLED_REJECTION', 1);
});

void start().catch(async (error: unknown) => {
  logger.error('Application startup failed', { error });
  await closeApplication('STARTUP_FAILURE', 1);
});
