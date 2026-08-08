import { prisma } from '../config/prisma.js';
import type { Prisma } from '../generated/prisma/client.js';
import { ActivityAction, ProjectDeletionStatus } from '../generated/prisma/enums.js';
import { recordActivity } from './activity.js';
import { getAssetsStorageFootprint } from './asset-storage-footprint.js';
import { queueStorageDeletion } from './storage-cleanup.js';
import { abortMultipartUpload } from '../config/storage.js';

const ASSET_BATCH_SIZE = 100;
const RESERVATION_BATCH_SIZE = 100;

interface DeletingProjectRow {
  id: string;
  ownerId: string;
}

async function subtractOwnerStorageUsage(
  transaction: Prisma.TransactionClient,
  ownerId: string,
  bytes: bigint,
): Promise<void> {
  if (bytes <= 0n) return;
  await transaction.$executeRaw`
    UPDATE "User"
    SET "storageUsedBytes" = GREATEST("storageUsedBytes" - ${bytes}, 0)
    WHERE "id" = ${ownerId}
  `;
}

/**
 * Processes one bounded deletion step while holding a row lock on the project.
 * The Project row, ApprovalEvent rows and ActivityLog rows remain as evidence;
 * mutable workspace content and private storage objects are removed in batches.
 */
async function processOneProjectDeletionStep(): Promise<boolean> {
  return prisma.$transaction(async (transaction) => {
    const rows = await transaction.$queryRaw<DeletingProjectRow[]>`
      SELECT "id", "ownerId"
      FROM "Project"
      WHERE "deletionStatus" = 'DELETING'
      ORDER BY "deletionRequestedAt" ASC, "id" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    `;
    const project = rows[0];
    if (!project) return false;

    const assets = await transaction.asset.findMany({
      where: { projectId: project.id },
      orderBy: { id: 'asc' },
      take: ASSET_BATCH_SIZE,
      select: {
        id: true,
        storageKey: true,
        previewKey: true,
        fileSize: true,
        previewFileSize: true,
        originalRetiredAt: true,
        comments: {
          where: { audioKey: { not: null } },
          select: { audioKey: true, audioFileSize: true },
        },
      },
    });

    if (assets.length > 0) {
      const footprint = getAssetsStorageFootprint(assets);
      await queueStorageDeletion(footprint.objectKeys, transaction);

      const accountedBytes = footprint.accountedBytes;
      await transaction.asset.deleteMany({ where: { id: { in: assets.map((asset) => asset.id) } } });
      await subtractOwnerStorageUsage(transaction, project.ownerId, accountedBytes);
      return true;
    }

    const reservations = await transaction.uploadReservation.findMany({
      where: { projectId: project.id },
      orderBy: { id: 'asc' },
      take: RESERVATION_BATCH_SIZE,
      select: {
        id: true,
        storageKey: true,
        multipartUploadId: true,
        multipartCompletedAt: true,
      },
    });
    if (reservations.length > 0) {
      for (const reservation of reservations) {
        if (reservation.multipartUploadId && !reservation.multipartCompletedAt) {
          await abortMultipartUpload(reservation.storageKey, reservation.multipartUploadId);
        }
      }
      await queueStorageDeletion(
        reservations
          .filter((reservation) => !reservation.multipartUploadId || reservation.multipartCompletedAt)
          .map((reservation) => reservation.storageKey),
        transaction,
      );
      await transaction.uploadReservation.deleteMany({
        where: { id: { in: reservations.map((reservation) => reservation.id) } },
      });
      return true;
    }

    await transaction.projectInvitation.deleteMany({ where: { projectId: project.id } });
    await transaction.notification.deleteMany({ where: { projectId: project.id } });
    await transaction.projectMember.deleteMany({ where: { projectId: project.id } });

    await recordActivity({
      projectId: project.id,
      userId: project.ownerId,
      action: ActivityAction.PROJECT_DELETED,
      message: 'Project content and private files were securely removed.',
    }, transaction);

    await transaction.project.update({
      where: { id: project.id },
      data: {
        title: 'Deleted project',
        description: null,
        finalAssetId: null,
        isArchived: true,
        archivedAt: new Date(),
        isDownloadUnlocked: false,
        aiEnabled: false,
        deletionStatus: ProjectDeletionStatus.DELETED,
        deletedAt: new Date(),
        version: { increment: 1 },
      },
      select: { id: true },
    });
    return true;
  });
}

export async function processProjectDeletionBatch(limit = 10): Promise<number> {
  let processed = 0;
  while (processed < limit && await processOneProjectDeletionStep()) processed += 1;
  return processed;
}
