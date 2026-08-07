import { prisma } from '../config/prisma.js';
import { env } from '../config/env.js';
import {
  EmailDeliveryStatus,
  InvitationStatus,
} from '../generated/prisma/enums.js';

export interface RetentionCleanupResult {
  invitationsExpired: number;
  invitationsRemoved: number;
  accountTokensRemoved: number;
  notificationsRemoved: number;
  emailOutboxRemoved: number;
  mfaSetupsCleared: number;
}

const ids = <T extends { id: string }>(items: readonly T[]): string[] => items.map((item) => item.id);

/**
 * Runs one bounded cleanup pass. Each category selects at most one configured
 * batch before mutating, keeping transaction duration predictable on large
 * installations and making concurrent replicas safe through idempotent writes.
 */
export async function runRetentionCleanupBatch(
  now = new Date(),
): Promise<RetentionCleanupResult> {
  const tokenCutoff = new Date(now.getTime() - env.TOKEN_RETENTION_DAYS * 24 * 60 * 60_000);
  const notificationCutoff = new Date(now.getTime() - env.NOTIFICATION_RETENTION_DAYS * 24 * 60 * 60_000);
  const take = env.RETENTION_CLEANUP_BATCH_SIZE;

  return prisma.$transaction(async (transaction) => {
    const pendingInvitations = await transaction.projectInvitation.findMany({
      where: { status: InvitationStatus.PENDING, expiresAt: { lte: now } },
      orderBy: [{ expiresAt: 'asc' }, { id: 'asc' }],
      take,
      select: { id: true },
    });
    const expiredResult = pendingInvitations.length
      ? await transaction.projectInvitation.updateMany({
          where: { id: { in: ids(pendingInvitations) }, status: InvitationStatus.PENDING, expiresAt: { lte: now } },
          data: { status: InvitationStatus.EXPIRED },
        })
      : { count: 0 };

    const staleInvitations = await transaction.projectInvitation.findMany({
      where: {
        status: { in: [InvitationStatus.EXPIRED, InvitationStatus.REVOKED] },
        updatedAt: { lte: tokenCutoff },
      },
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      take,
      select: { id: true },
    });
    const invitationsRemoved = staleInvitations.length
      ? await transaction.projectInvitation.deleteMany({ where: { id: { in: ids(staleInvitations) } } })
      : { count: 0 };

    const staleTokens = await transaction.accountToken.findMany({
      where: {
        OR: [
          { expiresAt: { lte: tokenCutoff } },
          { usedAt: { not: null, lte: tokenCutoff } },
        ],
      },
      orderBy: [{ expiresAt: 'asc' }, { id: 'asc' }],
      take,
      select: { id: true },
    });
    const accountTokensRemoved = staleTokens.length
      ? await transaction.accountToken.deleteMany({ where: { id: { in: ids(staleTokens) } } })
      : { count: 0 };

    const staleNotifications = await transaction.notification.findMany({
      where: { createdAt: { lte: notificationCutoff } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take,
      select: { id: true },
    });
    const notificationsRemoved = staleNotifications.length
      ? await transaction.notification.deleteMany({ where: { id: { in: ids(staleNotifications) } } })
      : { count: 0 };

    const staleOutbox = await transaction.emailOutbox.findMany({
      where: {
        status: {
          in: [
            EmailDeliveryStatus.SENT,
            EmailDeliveryStatus.CANCELLED,
            EmailDeliveryStatus.ABANDONED,
          ],
        },
        updatedAt: { lte: tokenCutoff },
      },
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      take,
      select: { id: true },
    });
    const emailOutboxRemoved = staleOutbox.length
      ? await transaction.emailOutbox.deleteMany({ where: { id: { in: ids(staleOutbox) } } })
      : { count: 0 };

    const staleMfaSetups = await transaction.user.findMany({
      where: { mfaPendingExpiresAt: { lte: now } },
      orderBy: [{ mfaPendingExpiresAt: 'asc' }, { id: 'asc' }],
      take,
      select: { id: true },
    });
    const mfaSetupsCleared = staleMfaSetups.length
      ? await transaction.user.updateMany({
          where: { id: { in: ids(staleMfaSetups) }, mfaPendingExpiresAt: { lte: now } },
          data: {
            mfaPendingCiphertext: null,
            mfaPendingIv: null,
            mfaPendingTag: null,
            mfaPendingExpiresAt: null,
          },
        })
      : { count: 0 };

    return {
      invitationsExpired: expiredResult.count,
      invitationsRemoved: invitationsRemoved.count,
      accountTokensRemoved: accountTokensRemoved.count,
      notificationsRemoved: notificationsRemoved.count,
      emailOutboxRemoved: emailOutboxRemoved.count,
      mfaSetupsCleared: mfaSetupsCleared.count,
    };
  });
}
