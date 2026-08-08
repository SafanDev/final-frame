import { randomUUID } from 'node:crypto';
import { Prisma } from '../generated/prisma/client.js';
import { StorageDeletionStatus } from '../generated/prisma/enums.js';
import { env } from '../config/env.js';
import { prisma } from '../config/prisma.js';
import { abortMultipartUpload, deleteStorageObject, extractStorageKey } from '../config/storage.js';
import { logger } from '../utils/logger.js';

interface StorageTaskClient {
    storageDeletionTask: Pick<typeof prisma.storageDeletionTask, 'createMany'>;
}

export const queueStorageDeletion = async (
    fileReferences: readonly string[],
    client: StorageTaskClient = prisma,
): Promise<number> => {
    const objectKeys = [...new Set(fileReferences.filter(Boolean).map(extractStorageKey))];
    let queued = 0;

    for (let offset = 0; offset < objectKeys.length; offset += 500) {
        const batch = objectKeys.slice(offset, offset + 500);
        const result = await client.storageDeletionTask.createMany({
            data: batch.map((objectKey) => ({ objectKey })),
            skipDuplicates: true,
        });
        queued += result.count;
    }

    return queued;
};

interface ClaimedTask {
    id: string;
    objectKey: string;
    attempts: number;
}

const claimTasks = async (workerId: string): Promise<ClaimedTask[]> =>
    prisma.$transaction(async (transaction) => {
        const tasks = await transaction.$queryRaw<ClaimedTask[]>(Prisma.sql`
      SELECT "id", "objectKey", "attempts"
      FROM "StorageDeletionTask"
      WHERE (
        ("status" IN ('PENDING', 'FAILED') AND "nextAttemptAt" <= NOW())
        OR (
          "status" = 'PROCESSING'
          AND "lockedAt" < NOW() - (${env.STORAGE_CLEANUP_LOCK_MS} * INTERVAL '1 millisecond')
        )
      )
      ORDER BY "nextAttemptAt" ASC, "createdAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT ${env.STORAGE_CLEANUP_BATCH_SIZE}
    `);

        if (tasks.length === 0) return [];

        const ids = tasks.map((task) => task.id);
        await transaction.storageDeletionTask.updateMany({
            where: { id: { in: ids } },
            data: {
                status: StorageDeletionStatus.PROCESSING,
                lockedAt: new Date(),
                lockedBy: workerId,
                attempts: { increment: 1 },
            },
        });

        return tasks.map((task) => ({ ...task, attempts: task.attempts + 1 }));
    });

const errorMessage = (error: unknown): string =>
    (error instanceof Error ? error.message : String(error)).slice(0, 500);

const processClaimedTask = async (task: ClaimedTask, workerId: string): Promise<void> => {
    try {
        await deleteStorageObject(task.objectKey);
        await prisma.storageDeletionTask.deleteMany({
            where: { id: task.id, lockedBy: workerId },
        });
    } catch (error) {
        const abandoned = task.attempts >= env.STORAGE_CLEANUP_MAX_ATTEMPTS;
        const backoffMinutes = Math.min(2 ** Math.min(task.attempts, 10), 24 * 60);

        await prisma.storageDeletionTask.updateMany({
            where: { id: task.id, lockedBy: workerId },
            data: {
                status: abandoned
                    ? StorageDeletionStatus.ABANDONED
                    : StorageDeletionStatus.FAILED,
                lockedAt: null,
                lockedBy: null,
                lastError: errorMessage(error),
                nextAttemptAt: new Date(Date.now() + backoffMinutes * 60_000),
            },
        });

        logger.error('R2 deletion outbox task failed', {
            taskId: task.id,
            attempts: task.attempts,
            abandoned,
            error,
        });
    }
};

/** Processes one bounded, multi-instance-safe batch from the deletion outbox. */
export const processStorageDeletionBatch = async (
    workerId = `storage-${randomUUID()}`,
): Promise<number> => {
    const tasks = await claimTasks(workerId);

    for (let offset = 0; offset < tasks.length; offset += 5) {
        await Promise.all(tasks.slice(offset, offset + 5).map((task) => processClaimedTask(task, workerId)));
    }

    return tasks.length;
};

/**
 * Unconsumed reservations may still have an uploaded object. Move their keys to
 * the deletion outbox before removing the expired authorization records.
 */
export const queueExpiredUploadReservations = async (): Promise<number> => {
        const expired = await prisma.uploadReservation.findMany({
            where: {
                consumedAt: null,
                expiresAt: { lte: new Date() },
            },
            orderBy: { expiresAt: 'asc' },
            take: env.STORAGE_CLEANUP_BATCH_SIZE,
            select: {
                id: true,
                storageKey: true,
                multipartUploadId: true,
                multipartCompletedAt: true,
            },
        });

        for (const reservation of expired) {
            if (reservation.multipartUploadId && !reservation.multipartCompletedAt) {
                await abortMultipartUpload(reservation.storageKey, reservation.multipartUploadId).catch((error) => {
                    logger.warn('Unable to abort an expired multipart upload; it will be retried by storage lifecycle cleanup.', {
                        reservationId: reservation.id,
                        error,
                    });
                });
            }
        }

        await prisma.$transaction(async (transaction) => {
          if (expired.length > 0) {
            await queueStorageDeletion(
              expired
                .filter((item) => !item.multipartUploadId || item.multipartCompletedAt)
                .map((item) => item.storageKey),
              transaction,
            );
            await transaction.uploadReservation.deleteMany({
                where: { id: { in: expired.map((item) => item.id) }, consumedAt: null },
            });
          }

          // Consumed reservations are no longer authorization records. Retaining one
          // day is sufficient for diagnostics while keeping the table bounded.
          await transaction.uploadReservation.deleteMany({
            where: {
                consumedAt: { lte: new Date(Date.now() - 24 * 60 * 60 * 1_000) },
            },
          });
        });

        return expired.length;
};
