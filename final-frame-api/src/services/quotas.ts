import { env } from '../config/env.js';
import { AppError } from '../errors/app-error.js';
import { InvitationStatus } from '../generated/prisma/enums.js';
import type { Prisma } from '../generated/prisma/client.js';
import { exceedsByteLimit, hasReachedCountLimit } from './quota-policy-core.js';

interface LockedAccountRow {
  id: string;
  storageUsedBytes: bigint;
  monthlyAiRequests: number;
  quotaResetAt: Date;
}

const quotaError = (message: string, code = 'ACCOUNT_LIMIT_REACHED') => new AppError({
  statusCode: 409,
  code,
  message,
  clientMessage: message,
});

async function lockGlobalQuota(transaction: Prisma.TransactionClient): Promise<void> {
  await transaction.$queryRaw<Array<{ lockAcquired: number }>>`
    WITH lock_acquired AS (
      SELECT pg_advisory_xact_lock(1179010637, 1)
    )
    SELECT 1::integer AS "lockAcquired"
    FROM lock_acquired
  `;
}

async function lockAccount(
  transaction: Prisma.TransactionClient,
  ownerId: string,
): Promise<LockedAccountRow> {
  const rows = await transaction.$queryRaw<LockedAccountRow[]>`
    SELECT "id", "storageUsedBytes", "monthlyAiRequests", "quotaResetAt"
    FROM "User"
    WHERE "id" = ${ownerId}
    FOR UPDATE
  `;
  const account = rows[0];
  if (!account) throw quotaError('The project owner account is unavailable.', 'ACCOUNT_UNAVAILABLE');
  return account;
}

async function globalStorageUsed(transaction: Prisma.TransactionClient): Promise<bigint> {
  const aggregate = await transaction.user.aggregate({ _sum: { storageUsedBytes: true } });
  return aggregate._sum.storageUsedBytes ?? 0n;
}

export async function requireProjectCapacity(
  transaction: Prisma.TransactionClient,
  ownerId: string,
): Promise<void> {
  await lockGlobalQuota(transaction);
  await lockAccount(transaction, ownerId);
  const [accountCount, globalCount] = await Promise.all([
    transaction.project.count({ where: { ownerId, deletionStatus: { not: 'DELETED' } } }),
    transaction.project.count({ where: { deletionStatus: { not: 'DELETED' } } }),
  ]);
  if (hasReachedCountLimit(accountCount, env.FREE_MAX_PROJECTS)) throw quotaError('This account has reached its project limit.');
  if (hasReachedCountLimit(globalCount, env.GLOBAL_MAX_PROJECTS)) {
    throw quotaError('The service has reached its project limit. Try again after an old project is removed.', 'SERVICE_LIMIT_REACHED');
  }
}

export async function requireMemberCapacity(
  transaction: Prisma.TransactionClient,
  projectId: string,
  ownerId: string,
): Promise<void> {
  await lockAccount(transaction, ownerId);
  const count = await transaction.projectMember.count({ where: { projectId } });
  if (hasReachedCountLimit(count, env.FREE_MAX_PROJECT_MEMBERS)) throw quotaError('This project has reached its Client limit.');
}

export async function requirePendingInviteCapacity(
  transaction: Prisma.TransactionClient,
  projectId: string,
  ownerId: string,
): Promise<void> {
  await lockAccount(transaction, ownerId);
  const count = await transaction.projectInvitation.count({
    where: { projectId, status: InvitationStatus.PENDING, expiresAt: { gt: new Date() } },
  });
  if (hasReachedCountLimit(count, env.FREE_MAX_PENDING_INVITES)) throw quotaError('This project has reached its pending invitation limit.');
}

export async function requireCommentCapacity(
  transaction: Prisma.TransactionClient,
  projectId: string,
  ownerId: string,
): Promise<void> {
  await lockAccount(transaction, ownerId);
  const count = await transaction.comment.count({ where: { asset: { projectId }, isDeleted: false } });
  if (hasReachedCountLimit(count, env.FREE_MAX_COMMENTS_PER_PROJECT)) throw quotaError('This project has reached its feedback limit.');
}

export async function requireUploadReservationCapacity(
  transaction: Prisma.TransactionClient,
  ownerId: string,
  additionalBytes: number | bigint,
): Promise<void> {
  await lockGlobalQuota(transaction);
  const account = await lockAccount(transaction, ownerId);
  const now = new Date();
  const [accountPending, globalPending, usedGlobally] = await Promise.all([
    transaction.uploadReservation.aggregate({
      where: {
        consumedAt: null,
        expiresAt: { gt: now },
        project: { ownerId },
      },
      _sum: { fileSize: true },
    }),
    transaction.uploadReservation.aggregate({
      where: { consumedAt: null, expiresAt: { gt: now } },
      _sum: { fileSize: true },
    }),
    globalStorageUsed(transaction),
  ]);
  const bytes = BigInt(additionalBytes);
  const accountReservedBytes = BigInt(accountPending._sum.fileSize ?? 0);
  const globalReservedBytes = BigInt(globalPending._sum.fileSize ?? 0);
  if (exceedsByteLimit(account.storageUsedBytes, accountReservedBytes, bytes, BigInt(env.FREE_MAX_STORAGE_BYTES))) {
    throw quotaError('This account does not have enough available storage for this upload.');
  }
  if (exceedsByteLimit(usedGlobally, globalReservedBytes, bytes, BigInt(env.GLOBAL_MAX_STORAGE_BYTES))) {
    throw quotaError('The service storage limit has been reached. Remove files before uploading more.', 'SERVICE_STORAGE_LIMIT_REACHED');
  }
}

export async function requireStorageCapacity(
  transaction: Prisma.TransactionClient,
  ownerId: string,
  additionalBytes: number | bigint,
): Promise<void> {
  await lockGlobalQuota(transaction);
  const account = await lockAccount(transaction, ownerId);
  const bytes = BigInt(additionalBytes);
  if (exceedsByteLimit(account.storageUsedBytes, 0n, bytes, BigInt(env.FREE_MAX_STORAGE_BYTES))) {
    throw quotaError('This account does not have enough storage for this file.');
  }
  const usedGlobally = await globalStorageUsed(transaction);
  if (exceedsByteLimit(usedGlobally, 0n, bytes, BigInt(env.GLOBAL_MAX_STORAGE_BYTES))) {
    throw quotaError('The service storage limit has been reached. Remove files before uploading more.', 'SERVICE_STORAGE_LIMIT_REACHED');
  }
}

export async function consumeStorageCapacity(
  transaction: Prisma.TransactionClient,
  ownerId: string,
  additionalBytes: number | bigint,
): Promise<void> {
  await lockGlobalQuota(transaction);
  const account = await lockAccount(transaction, ownerId);
  const bytes = BigInt(additionalBytes);
  if (exceedsByteLimit(account.storageUsedBytes, 0n, bytes, BigInt(env.FREE_MAX_STORAGE_BYTES))) {
    throw quotaError('This account does not have enough storage for this file.');
  }
  const usedGlobally = await globalStorageUsed(transaction);
  if (exceedsByteLimit(usedGlobally, 0n, bytes, BigInt(env.GLOBAL_MAX_STORAGE_BYTES))) {
    throw quotaError('The service storage limit has been reached. Remove files before uploading more.', 'SERVICE_STORAGE_LIMIT_REACHED');
  }
  await transaction.user.update({
    where: { id: ownerId },
    data: { storageUsedBytes: { increment: bytes } },
    select: { id: true },
  });
}

export async function addStorageUsage(
  transaction: Prisma.TransactionClient,
  ownerId: string,
  bytes: number | bigint,
): Promise<void> {
  await lockAccount(transaction, ownerId);
  await transaction.user.update({
    where: { id: ownerId },
    data: { storageUsedBytes: { increment: BigInt(bytes) } },
    select: { id: true },
  });
}

export async function removeStorageUsage(
  transaction: Prisma.TransactionClient,
  ownerId: string,
  bytes: number | bigint,
): Promise<void> {
  const account = await lockAccount(transaction, ownerId);
  const next = account.storageUsedBytes - BigInt(bytes);
  await transaction.user.update({
    where: { id: ownerId },
    data: { storageUsedBytes: next > 0n ? next : 0n },
    select: { id: true },
  });
}

export async function reserveAiRequest(
  transaction: Prisma.TransactionClient,
  ownerId: string,
): Promise<void> {
  const account = await lockAccount(transaction, ownerId);
  const now = new Date();
  const resetAt = account.quotaResetAt;
  const sameMonth = resetAt.getUTCFullYear() === now.getUTCFullYear() && resetAt.getUTCMonth() === now.getUTCMonth();
  const current = sameMonth ? account.monthlyAiRequests : 0;
  if (hasReachedCountLimit(current, env.FREE_MAX_AI_REQUESTS_PER_MONTH)) {
    throw quotaError('This account has reached its monthly AI summary limit.');
  }
  await transaction.user.update({
    where: { id: ownerId },
    data: {
      monthlyAiRequests: current + 1,
      quotaResetAt: sameMonth ? resetAt : now,
    },
    select: { id: true },
  });
}

export async function refundAiRequest(
  transaction: Prisma.TransactionClient,
  ownerId: string,
): Promise<void> {
  const account = await lockAccount(transaction, ownerId);
  await transaction.user.update({
    where: { id: ownerId },
    data: { monthlyAiRequests: Math.max(0, account.monthlyAiRequests - 1) },
    select: { id: true },
  });
}