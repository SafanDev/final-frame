import { createHash } from 'node:crypto';
import { env } from '../config/env.js';
import { prisma } from '../config/prisma.js';
import { listStorageObjects } from '../config/storage.js';
import { StorageDeletionStatus } from '../generated/prisma/enums.js';
import { queueStorageDeletion } from './storage-cleanup.js';

interface AccountedStorageRow {
  ownerId: string;
  actualBytes: bigint;
  recordedBytes: bigint;
}

export interface StorageReconciliationReport {
  bucket: string;
  scannedObjects: number;
  scanTruncated: boolean;
  referencedObjects: number;
  missingReferencedObjects: number;
  orphanCandidates: number;
  queuedOrphans: number;
  abandonedDeletionTasks: number;
  accountingMismatches: number;
  accountingUpdates: number;
  missingReferenceSamples: string[];
  orphanSamples: string[];
  abandonedDeletionSamples: string[];
}

const keyFingerprint = (key: string): string =>
  createHash('sha256').update(key).digest('hex').slice(0, 16);

const collectReferencedKeys = async (): Promise<{ required: Set<string>; protectedKeys: Set<string> }> => {
  const required = new Set<string>();
  const protectedKeys = new Set<string>();

  const collectPages = async <T extends { id: string }>(
    queryPage: (afterId: string | undefined) => Promise<T[]>,
    readKeys: (item: T) => Array<string | null | undefined>,
    target: Set<string>,
  ): Promise<void> => {
    let afterId: string | undefined;
    while (true) {
      const page = await queryPage(afterId);
      for (const item of page) {
        for (const key of readKeys(item)) if (key) target.add(key);
      }
      if (page.length < 500) return;
      afterId = page.at(-1)?.id;
      if (!afterId) return;
    }
  };

  await collectPages(
    (afterId) => prisma.asset.findMany({
      ...(afterId ? { where: { id: { gt: afterId } } } : {}),
      orderBy: { id: 'asc' },
      take: 500,
      select: { id: true, storageKey: true, previewKey: true, originalRetiredAt: true },
    }),
    (asset) => [asset.originalRetiredAt ? null : asset.storageKey, asset.previewKey],
    required,
  );
  await collectPages(
    (afterId) => prisma.comment.findMany({
      where: { audioKey: { not: null }, ...(afterId ? { id: { gt: afterId } } : {}) },
      orderBy: { id: 'asc' },
      take: 500,
      select: { id: true, audioKey: true },
    }),
    (comment) => [comment.audioKey],
    required,
  );
  await collectPages(
    (afterId) => prisma.uploadReservation.findMany({
      where: { consumedAt: null, ...(afterId ? { id: { gt: afterId } } : {}) },
      orderBy: { id: 'asc' },
      take: 500,
      select: { id: true, storageKey: true },
    }),
    (reservation) => [reservation.storageKey],
    protectedKeys,
  );
  await collectPages(
    (afterId) => prisma.storageDeletionTask.findMany({
      ...(afterId ? { where: { id: { gt: afterId } } } : {}),
      orderBy: { id: 'asc' },
      take: 500,
      select: { id: true, objectKey: true },
    }),
    (task) => [task.objectKey],
    protectedKeys,
  );

  for (const key of required) protectedKeys.add(key);
  return { required, protectedKeys };
};

const loadAccountedStorage = async (): Promise<AccountedStorageRow[]> => {
  const rows = await prisma.$queryRaw<AccountedStorageRow[]>`
    SELECT
      u."id" AS "ownerId",
      COALESCE(a."bytes", 0)::bigint + COALESCE(c."bytes", 0)::bigint AS "actualBytes",
      u."storageUsedBytes" AS "recordedBytes"
    FROM "User" u
    LEFT JOIN (
      SELECT p."ownerId", SUM(
        CASE WHEN a."originalRetiredAt" IS NULL THEN a."fileSize"::bigint ELSE 0::bigint END
        + COALESCE(a."previewFileSize", 0)::bigint
      ) AS "bytes"
      FROM "Asset" a
      INNER JOIN "Project" p ON p."id" = a."projectId"
      GROUP BY p."ownerId"
    ) a ON a."ownerId" = u."id"
    LEFT JOIN (
      SELECT p."ownerId", SUM(COALESCE(c."audioFileSize", 0)::bigint) AS "bytes"
      FROM "Comment" c
      INNER JOIN "Asset" a ON a."id" = c."assetId"
      INNER JOIN "Project" p ON p."id" = a."projectId"
      WHERE c."audioKey" IS NOT NULL
      GROUP BY p."ownerId"
    ) c ON c."ownerId" = u."id"
    ORDER BY u."id" ASC
  `;
  return rows;
};

export const reconcileStorage = async (options: { apply: boolean }): Promise<StorageReconciliationReport> => {
  const [listed, referenced, accounting, abandonedTasks, abandonedDeletionTasks] = await Promise.all([
    listStorageObjects('projects/', env.STORAGE_RECONCILIATION_MAX_OBJECTS),
    collectReferencedKeys(),
    loadAccountedStorage(),
    prisma.storageDeletionTask.findMany({
      where: { status: StorageDeletionStatus.ABANDONED },
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      take: 20,
      select: { objectKey: true },
    }),
    prisma.storageDeletionTask.count({ where: { status: StorageDeletionStatus.ABANDONED } }),
  ]);

  const listedByKey = new Map(listed.objects.map((object) => [object.key, object]));
  const graceCutoff = Date.now() - env.STORAGE_RECONCILIATION_ORPHAN_GRACE_HOURS * 60 * 60 * 1_000;
  const missing = [...referenced.required].filter((key) => !listedByKey.has(key));
  const orphans = listed.objects.filter((object) =>
    !referenced.protectedKeys.has(object.key)
    && object.lastModified !== null
    && object.lastModified.getTime() <= graceCutoff,
  );
  const mismatches = accounting.filter((row) => row.actualBytes !== row.recordedBytes);

  let queuedOrphans = 0;
  let accountingUpdates = 0;
  if (options.apply) {
    if (listed.truncated) {
      throw new Error('Storage scan reached its configured object limit; refusing to apply an incomplete reconciliation.');
    }
    queuedOrphans = await queueStorageDeletion(orphans.map((object) => object.key));
    const accountingBatchSize = 100;
    for (let offset = 0; offset < mismatches.length; offset += accountingBatchSize) {
      const batch = mismatches.slice(offset, offset + accountingBatchSize);
      accountingUpdates += await prisma.$transaction(async (transaction) => {
        let updatedCount = 0;
        for (const row of batch) {
          const updated = await transaction.user.updateMany({
            where: { id: row.ownerId, storageUsedBytes: row.recordedBytes },
            data: { storageUsedBytes: row.actualBytes },
          });
          updatedCount += updated.count;
        }
        return updatedCount;
      });
    }
  }

  return {
    bucket: env.R2_BUCKET_NAME,
    scannedObjects: listed.objects.length,
    scanTruncated: listed.truncated,
    referencedObjects: referenced.required.size,
    missingReferencedObjects: missing.length,
    orphanCandidates: orphans.length,
    queuedOrphans,
    abandonedDeletionTasks,
    accountingMismatches: mismatches.length,
    accountingUpdates,
    missingReferenceSamples: missing.slice(0, 20).map(keyFingerprint),
    orphanSamples: orphans.slice(0, 20).map((object) => keyFingerprint(object.key)),
    abandonedDeletionSamples: abandonedTasks.map((task) => keyFingerprint(task.objectKey)),
  };
};
