import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import {
  AccountStatus,
  EmailDeliveryStatus,
  EmailOutboxType,
  InvitationStatus,
  NotificationDeliveryMode,
} from '../generated/prisma/enums.js';
import { logger } from '../utils/logger.js';
import { parseTraceparent } from './trace-context.js';
import {
  sendEmailVerification,
  sendNotificationEmail,
  sendPasswordReset,
  sendProjectInvitation,
} from './email.js';

const invitationPayloadSchema = z.object({
  invitationId: z.string().cuid(), projectTitle: z.string().min(1).max(100), inviteUrl: z.string().url(),
}).strict();
const accountTokenPayloadSchema = z.object({ tokenId: z.string().cuid(), actionUrl: z.string().url() }).strict();
const notificationPayloadSchema = z.object({
  mode: z.enum(['IMMEDIATE', 'DAILY_DIGEST']),
  notificationIds: z.array(z.string().cuid()).min(1).max(100),
  traceparent: z.string().regex(/^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/u).optional(),
}).strict();
const workerId = `email-${process.pid}-${randomUUID()}`;
const MAX_ATTEMPTS = 8;
const LOCK_TIMEOUT_MS = 5 * 60_000;
const retryDelayMs = (attempt: number): number => Math.min(
  24 * 60 * 60_000,
  30_000 * 2 ** Math.max(0, attempt - 1) + Math.floor(Math.random() * 10_000),
);

type Candidate = {
  id: string;
  type: EmailOutboxType;
  recipient: string;
  subject: string;
  payload: unknown;
  attempts: number;
  batchKey: string | null;
  userId: string | null;
};

const candidateSelect = {
  id: true,
  type: true,
  recipient: true,
  subject: true,
  payload: true,
  attempts: true,
  batchKey: true,
  userId: true,
} as const;

async function claimNext(): Promise<Candidate | null> {
  const now = new Date();
  const staleLock = new Date(Date.now() - LOCK_TIMEOUT_MS);
  return prisma.$transaction(async (transaction) => {
    const rows = await transaction.$queryRaw<Candidate[]>`
      SELECT "id", "type", "recipient", "subject", "payload", "attempts", "batchKey", "userId"
      FROM "EmailOutbox"
      WHERE "nextAttemptAt" <= ${now}
        AND (
          "status" IN ('PENDING', 'FAILED')
          OR ("status" = 'PROCESSING' AND "lockedAt" < ${staleLock})
        )
      ORDER BY "nextAttemptAt" ASC, "createdAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    `;
    const candidate = rows[0];
    if (!candidate) return null;
    await transaction.emailOutbox.update({
      where: { id: candidate.id },
      data: { status: EmailDeliveryStatus.PROCESSING, lockedAt: now, lockedBy: workerId, attempts: { increment: 1 } },
      select: { id: true },
    });
    return candidate;
  });
}

async function claimDigestPeers(candidate: Candidate): Promise<Candidate[]> {
  if (candidate.type !== EmailOutboxType.NOTIFICATION || !candidate.batchKey) return [candidate];
  const now = new Date();
  return prisma.$transaction(async (transaction) => {
    const peers = await transaction.emailOutbox.findMany({
      where: {
        id: { not: candidate.id },
        batchKey: candidate.batchKey,
        type: EmailOutboxType.NOTIFICATION,
        status: { in: [EmailDeliveryStatus.PENDING, EmailDeliveryStatus.FAILED] },
        nextAttemptAt: { lte: now },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 99,
      select: candidateSelect,
    });
    if (peers.length) {
      await transaction.emailOutbox.updateMany({
        where: { id: { in: peers.map((peer) => peer.id) }, status: { in: [EmailDeliveryStatus.PENDING, EmailDeliveryStatus.FAILED] } },
        data: { status: EmailDeliveryStatus.PROCESSING, lockedAt: now, lockedBy: workerId, attempts: { increment: 1 } },
      });
    }
    return [candidate, ...peers];
  });
}

async function invitationStillEligible(invitationId: string): Promise<boolean> {
  const invitation = await prisma.projectInvitation.findUnique({
    where: { id: invitationId },
    select: { status: true, expiresAt: true, revokedAt: true },
  });
  return Boolean(invitation && invitation.status === InvitationStatus.PENDING && !invitation.revokedAt && invitation.expiresAt > new Date());
}

async function accountTokenStillEligible(tokenId: string): Promise<boolean> {
  const token = await prisma.accountToken.findUnique({
    where: { id: tokenId },
    select: { usedAt: true, expiresAt: true, user: { select: { status: true } } },
  });
  return Boolean(token && !token.usedAt && token.expiresAt > new Date() && token.user.status !== AccountStatus.DELETED);
}

async function cancelItems(ids: readonly string[], reason: string, notificationIds: readonly string[] = []): Promise<void> {
  await prisma.$transaction(async (transaction) => {
    await transaction.emailOutbox.updateMany({
      where: { id: { in: [...ids] }, status: EmailDeliveryStatus.PROCESSING, lockedBy: workerId },
      data: { status: EmailDeliveryStatus.CANCELLED, lockedAt: null, lockedBy: null, lastError: reason, payload: { cancelled: true } },
    });
    if (notificationIds.length) {
      await transaction.notification.updateMany({
        where: { id: { in: [...notificationIds] } },
        data: { emailStatus: EmailDeliveryStatus.CANCELLED },
      });
    }
  });
}

async function loadNotificationDelivery(candidates: readonly Candidate[]) {
  const payloads = candidates.map((candidate) => notificationPayloadSchema.parse(candidate.payload));
  const mode = payloads[0]?.mode;
  if (!mode || payloads.some((payload) => payload.mode !== mode)) throw new Error('Notification batch contains incompatible delivery modes.');
  const userId = candidates[0]?.userId;
  if (!userId || candidates.some((candidate) => candidate.userId !== userId)) throw new Error('Notification batch has no stable recipient account.');
  const notificationIds = Array.from(new Set(payloads.flatMap((payload) => payload.notificationIds))).slice(0, 100);
  const traceparent = payloads.find((payload) => payload.traceparent)?.traceparent;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { status: true, notificationDelivery: true },
  });
  const expectedPreference = mode === 'IMMEDIATE' ? NotificationDeliveryMode.IMMEDIATE : NotificationDeliveryMode.DAILY_DIGEST;
  if (!user || user.status === AccountStatus.DELETED || user.notificationDelivery !== expectedPreference) {
    return { eligible: false as const, notificationIds, mode, traceparent };
  }
  const notifications = await prisma.notification.findMany({
    where: { id: { in: notificationIds }, recipientId: userId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true, title: true, body: true, href: true },
  });
  if (!notifications.length) return { eligible: false as const, notificationIds, mode, traceparent };
  return { eligible: true as const, notificationIds, mode, notifications, traceparent };
}

export async function processOneEmailOutboxItem(): Promise<boolean> {
  const claimed = await claimNext();
  if (!claimed) return false;
  const candidates = await claimDigestPeers(claimed);
  const ids = candidates.map((candidate) => candidate.id);
  const attempt = Math.max(...candidates.map((candidate) => candidate.attempts + 1));
  let notificationIds: string[] = [];
  let deliveryTraceId: string | undefined;
  try {
    let providerId: string;
    let sanitizedPayload: object;
    if (claimed.type === EmailOutboxType.PROJECT_INVITATION) {
      const payload = invitationPayloadSchema.parse(claimed.payload);
      if (!await invitationStillEligible(payload.invitationId)) {
        await cancelItems(ids, 'Invitation is no longer eligible for delivery.');
        return true;
      }
      const receipt = await sendProjectInvitation({ to: claimed.recipient, projectTitle: payload.projectTitle, inviteUrl: payload.inviteUrl });
      providerId = receipt.id;
      sanitizedPayload = { invitationId: payload.invitationId, delivered: true };
      await prisma.projectInvitation.updateMany({
        where: { id: payload.invitationId },
        data: { deliveryStatus: EmailDeliveryStatus.SENT, deliveryAttempts: attempt, providerMessageId: providerId, lastDeliveryError: null },
      });
    } else if (claimed.type === EmailOutboxType.EMAIL_VERIFICATION) {
      const payload = accountTokenPayloadSchema.parse(claimed.payload);
      if (!await accountTokenStillEligible(payload.tokenId)) {
        await cancelItems(ids, 'Verification token is no longer eligible for delivery.');
        return true;
      }
      const receipt = await sendEmailVerification({ to: claimed.recipient, verificationUrl: payload.actionUrl });
      providerId = receipt.id;
      sanitizedPayload = { tokenId: payload.tokenId, delivered: true };
    } else if (claimed.type === EmailOutboxType.PASSWORD_RESET) {
      const payload = accountTokenPayloadSchema.parse(claimed.payload);
      if (!await accountTokenStillEligible(payload.tokenId)) {
        await cancelItems(ids, 'Password reset token is no longer eligible for delivery.');
        return true;
      }
      const receipt = await sendPasswordReset({ to: claimed.recipient, resetUrl: payload.actionUrl });
      providerId = receipt.id;
      sanitizedPayload = { tokenId: payload.tokenId, delivered: true };
    } else if (claimed.type === EmailOutboxType.NOTIFICATION) {
      const delivery = await loadNotificationDelivery(candidates);
      notificationIds = delivery.notificationIds;
      deliveryTraceId = parseTraceparent(delivery.traceparent)?.traceId;
      if (!delivery.eligible) {
        await cancelItems(ids, 'Notification delivery preference or account eligibility changed.', notificationIds);
        return true;
      }
      const receipt = await sendNotificationEmail({
        to: claimed.recipient,
        items: delivery.notifications,
        digest: delivery.mode === 'DAILY_DIGEST',
      });
      providerId = receipt.id;
      sanitizedPayload = { mode: delivery.mode, notificationIds, delivered: true };
    } else {
      throw new Error(`Unsupported email outbox type: ${claimed.type}`);
    }

    await prisma.$transaction(async (transaction) => {
      const completed = await transaction.emailOutbox.updateMany({
        where: { id: { in: ids }, status: EmailDeliveryStatus.PROCESSING, lockedBy: workerId },
        data: { status: EmailDeliveryStatus.SENT, providerId, lockedAt: null, lockedBy: null, lastError: null, payload: sanitizedPayload },
      });
      if (notificationIds.length) {
        await transaction.notification.updateMany({
          where: { id: { in: notificationIds } },
          data: { emailStatus: EmailDeliveryStatus.SENT, emailedAt: new Date() },
        });
      }
      if (completed.count !== ids.length && ids.length === 1 && claimed.type !== EmailOutboxType.NOTIFICATION) {
        const deliveredAfterInvalidation = await transaction.emailOutbox.updateMany({
          where: { id: claimed.id, status: EmailDeliveryStatus.CANCELLED },
          data: {
            status: EmailDeliveryStatus.SENT,
            providerId,
            lockedAt: null,
            lockedBy: null,
            lastError: 'Delivered after link invalidation; the action link was already unusable.',
            payload: { ...sanitizedPayload, actionInvalidated: true },
          },
        });
        if (deliveredAfterInvalidation.count !== 1) logger.warn('Email outbox lock ownership changed before completion', { outboxId: claimed.id });
      }
    });
    logger.info('Email outbox delivery completed', {
      outboxId: claimed.id,
      batchKey: claimed.batchKey,
      type: claimed.type,
      traceId: deliveryTraceId,
    });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 2_000) : 'Unknown delivery failure';
    const abandoned = attempt >= MAX_ATTEMPTS;
    await prisma.$transaction(async (transaction) => {
      await transaction.emailOutbox.updateMany({
        where: { id: { in: ids }, status: EmailDeliveryStatus.PROCESSING, lockedBy: workerId },
        data: {
          status: abandoned ? EmailDeliveryStatus.ABANDONED : EmailDeliveryStatus.FAILED,
          nextAttemptAt: new Date(Date.now() + retryDelayMs(attempt)),
          lockedAt: null,
          lockedBy: null,
          lastError: message,
        },
      });
      if (notificationIds.length) {
        await transaction.notification.updateMany({
          where: { id: { in: notificationIds } },
          data: { emailStatus: abandoned ? EmailDeliveryStatus.ABANDONED : EmailDeliveryStatus.FAILED },
        });
      }
    });
    logger.warn('Email outbox delivery failed', {
      outboxId: claimed.id,
      batchKey: claimed.batchKey,
      type: claimed.type,
      attempt,
      abandoned,
      traceId: deliveryTraceId,
      error,
    });
    return true;
  }
}

export async function processEmailOutboxBatch(limit = 20): Promise<number> {
  let processed = 0;
  while (processed < limit && await processOneEmailOutboxItem()) processed += 1;
  return processed;
}
