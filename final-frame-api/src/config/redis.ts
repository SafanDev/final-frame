import { createClient } from 'redis';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

const buildClient = (url: string) => {
  const redisClient = createClient({
    url,
    socket: {
      connectTimeout: env.REDIS_CONNECT_TIMEOUT_MS,
      reconnectStrategy: (retries) => Math.min(250 * 2 ** Math.min(retries, 5), 5_000),
    },
    disableOfflineQueue: true,
  });

  redisClient.on('error', (error) => {
    logger.error('Redis client error', { error });
  });
  redisClient.on('reconnecting', () => {
    logger.warn('Redis client reconnecting');
  });
  redisClient.on('ready', () => {
    logger.info('Redis client ready');
  });

  return redisClient;
};

type RedisClient = ReturnType<typeof buildClient>;

let client: RedisClient | undefined;
let connectPromise: Promise<RedisClient | undefined> | undefined;

export const connectRedis = async (): Promise<RedisClient | undefined> => {
  const redisUrl = env.REDIS_URL;
  if (!redisUrl) return undefined;
  if (client?.isReady) return client;
  if (connectPromise) return connectPromise;

  connectPromise = (async () => {
    const redisClient = client ?? buildClient(redisUrl);
    client = redisClient;

    if (!redisClient.isOpen) {
      let timeout: NodeJS.Timeout | undefined;
      try {
        const timeoutPromise = new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(
            () => reject(new Error(`Redis did not become ready within ${env.REDIS_CONNECT_TIMEOUT_MS} ms.`)),
            env.REDIS_CONNECT_TIMEOUT_MS,
          );
          timeout.unref();
        });
        await Promise.race([redisClient.connect(), timeoutPromise]);
      } finally {
        if (timeout) clearTimeout(timeout);
      }
    }
    if (!redisClient.isReady) throw new Error('Redis connected without reaching the ready state.');
    return redisClient;
  })().catch((error: unknown) => {
    connectPromise = undefined;
    const failedClient = client;
    client = undefined;
    if (failedClient) {
      try { failedClient.destroy(); } catch { /* already closed */ }
    }
    if (env.REDIS_REQUIRED) throw error;
    logger.warn('Redis is unavailable; process-local safeguards will be used', { error });
    return undefined;
  });

  const connected = await connectPromise;
  connectPromise = undefined;
  return connected;
};

export const getRedisClient = (): RedisClient | undefined => client;
export const isRedisReady = (): boolean => client?.isReady === true;

export const pingRedis = async (): Promise<boolean> => {
  const redisClient = client;
  if (!redisClient?.isReady) return false;
  return (await redisClient.ping()) === 'PONG';
};

export const disconnectRedis = async (): Promise<void> => {
  const redisClient = client;
  client = undefined;
  connectPromise = undefined;
  if (!redisClient?.isOpen) return;

  try {
    await redisClient.close();
  } catch (error) {
    logger.warn('Redis close failed; destroying the connection', { error });
    redisClient.destroy();
  }
};
