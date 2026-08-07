import { setTimeout as delay } from 'node:timers/promises';
import { Prisma } from '../generated/prisma/client.js';
import { prisma } from '../config/prisma.js';

const retryableTransactionCodes = new Set(['P2034']);

/**
 * Executes state-sensitive mutations at SERIALIZABLE isolation and retries the
 * transaction conflicts PostgreSQL can legitimately produce under concurrency.
 */
export const runSerializableTransaction = async <T>(
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
    maximumAttempts = 4,
): Promise<T> => {
    let lastError: unknown;

    for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
        try {
            return await prisma.$transaction(operation, {
                isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
                maxWait: 10_000,
                timeout: 30_000,
            });
        } catch (error) {
            lastError = error;

            const retryable =
                error instanceof Prisma.PrismaClientKnownRequestError &&
                retryableTransactionCodes.has(error.code);

            if (!retryable || attempt === maximumAttempts) throw error;

            // Small jitter prevents concurrent retries from repeatedly colliding.
            await delay(25 * attempt + Math.floor(Math.random() * 50));
        }
    }

    throw lastError;
};
