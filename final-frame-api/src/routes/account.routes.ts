import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Router, type Response } from 'express';
import { z } from 'zod';
import { emailDeliveryEnabled, env } from '../config/env.js';
import { prisma } from '../config/prisma.js';
import { AppError, ConflictError, NotFoundError } from '../errors/app-error.js';
import {
  AccountStatus,
  ActivityAction,
  EmailDeliveryStatus,
  EmailOutboxType,
  InvitationStatus,
  NotificationDeliveryMode,
  ProjectDeletionStatus,
} from '../generated/prisma/enums.js';
import { getAuthenticatedUser, requireAuth, type AuthRequest } from '../middleware/auth.js';
import { sensitiveAccountLimiter } from '../middleware/rate-limit.js';
import { confirmSensitiveAccountOperation } from '../services/account-security.js';
import { streamAccountExport } from '../services/account-export.js';
import { cancelOutboxByPayloadReference } from '../services/outbox-cancellation.js';
import {
  buildOtpAuthUrl,
  decryptMfaSecret,
  encryptMfaSecret,
  generateMfaSecret,
  generateRecoveryCodes,
  hashRecoveryCode,
  verifyTotp,
} from '../services/mfa.js';
import { isSupportedLocale, isSupportedTimeZone } from '../services/notification-delivery-core.js';
import { emitProjectDeleted } from '../services/realtime.js';
import { runSerializableTransaction } from '../services/transaction.js';
import { disableResponseCaching } from '../utils/http.js';

const router = Router();
const password = z.string().min(1).max(128).refine((value) => Buffer.byteLength(value, 'utf8') <= 72, 'Password cannot exceed 72 UTF-8 bytes.');
const mfaCode = z.string().trim().min(6).max(32).optional();
const passwordConfirmationSchema = z.object({ password, mfaCode }).strict();
const accountDeletionSchema = passwordConfirmationSchema.extend({ confirmation: z.literal('DELETE') }).strict();
const enableMfaSchema = z.object({ code: z.string().trim().regex(/^\d{6}$/u, 'Enter the six-digit authenticator code.') }).strict();
const accountPreferencesSchema = z.object({
  notificationDelivery: z.nativeEnum(NotificationDeliveryMode),
  locale: z.string().trim().min(2).max(35).refine(isSupportedLocale, 'Choose a supported locale.'),
  timeZone: z.string().trim().min(1).max(100).refine(isSupportedTimeZone, 'Choose a supported IANA time zone.'),
}).strict();

const accountSelect = {
  id: true,
  name: true,
  email: true,
  storageUsedBytes: true,
  monthlyAiRequests: true,
  quotaResetAt: true,
  status: true,
  emailVerifiedAt: true,
  lastLoginAt: true,
  mfaEnabled: true,
  notificationDelivery: true,
  locale: true,
  timeZone: true,
  createdAt: true,
  updatedAt: true,
} as const;

const securitySelect = {
  id: true,
  passwordHash: true,
  mfaEnabled: true,
  mfaSecretCiphertext: true,
  mfaSecretIv: true,
  mfaSecretTag: true,
  mfaLastUsedCounter: true,
} as const;

router.get('/', requireAuth, async (request: AuthRequest, response: Response): Promise<void> => {
  const user = getAuthenticatedUser(request);
  const account = await prisma.user.findUnique({ where: { id: user.id }, select: accountSelect });
  if (!account || account.status === AccountStatus.DELETED) throw new NotFoundError('Account not found.');
  const recoveryCodesRemaining = account.mfaEnabled
    ? await prisma.mfaRecoveryCode.count({ where: { userId: user.id, usedAt: null } })
    : 0;
  disableResponseCaching(response);
  response.status(200).json({
    ...account,
    storageUsedBytes: account.storageUsedBytes.toString(),
    recoveryCodesRemaining,
  });
});

router.patch('/preferences', requireAuth, async (request: AuthRequest, response: Response): Promise<void> => {
  const authenticated = getAuthenticatedUser(request);
  const input = accountPreferencesSchema.parse(request.body);
  const locale = Intl.getCanonicalLocales(input.locale)[0] ?? input.locale;
  const notificationDelivery = emailDeliveryEnabled
    ? input.notificationDelivery
    : NotificationDeliveryMode.IN_APP_ONLY;
  await runSerializableTransaction(async (transaction) => {
    const account = await transaction.user.findUnique({
      where: { id: authenticated.id },
      select: { id: true, notificationDelivery: true },
    });
    if (!account) throw new NotFoundError('Account not found.');
    const deliveryChanged = account.notificationDelivery !== notificationDelivery;
    await transaction.user.update({
      where: { id: account.id },
      data: { notificationDelivery, locale, timeZone: input.timeZone },
      select: { id: true },
    });
    if (deliveryChanged) {
      await transaction.emailOutbox.updateMany({
        where: {
          userId: account.id,
          type: EmailOutboxType.NOTIFICATION,
          status: { in: [EmailDeliveryStatus.PENDING, EmailDeliveryStatus.FAILED] },
        },
        data: {
          status: EmailDeliveryStatus.CANCELLED,
          lastError: 'Cancelled because notification delivery preferences changed.',
          payload: { cancelled: true },
        },
      });
      await transaction.notification.updateMany({
        where: {
          recipientId: account.id,
          emailStatus: { in: [EmailDeliveryStatus.PENDING, EmailDeliveryStatus.FAILED] },
        },
        data: { emailStatus: EmailDeliveryStatus.CANCELLED },
      });
    }
  });
  disableResponseCaching(response);
  response.status(200).json({
    message: 'Account preferences updated.',
    notificationDelivery,
    locale,
    timeZone: input.timeZone,
  });
});

router.post('/mfa/setup', requireAuth, sensitiveAccountLimiter, async (request: AuthRequest, response: Response): Promise<void> => {
  const authenticated = getAuthenticatedUser(request);
  const input = passwordConfirmationSchema.pick({ password: true }).parse(request.body);
  const account = await prisma.user.findUnique({ where: { id: authenticated.id }, select: { ...securitySelect, email: true } });
  if (!account) throw new NotFoundError('Account not found.');
  if (account.mfaEnabled) throw new ConflictError('Multi-factor authentication is already enabled.');
  if (!await bcrypt.compare(input.password, account.passwordHash)) {
    throw new AppError({ statusCode: 401, code: 'PASSWORD_INCORRECT', message: 'Password confirmation failed.', clientMessage: 'The password is incorrect.' });
  }

  const secret = generateMfaSecret();
  const encrypted = encryptMfaSecret(secret);
  const expiresAt = new Date(Date.now() + env.MFA_SETUP_TTL_MINUTES * 60_000);
  await prisma.user.update({
    where: { id: account.id },
    data: {
      mfaPendingCiphertext: encrypted.ciphertext,
      mfaPendingIv: encrypted.iv,
      mfaPendingTag: encrypted.tag,
      mfaPendingExpiresAt: expiresAt,
    },
    select: { id: true },
  });

  disableResponseCaching(response);
  response.status(200).json({ secret, otpAuthUrl: buildOtpAuthUrl(account.email, secret), expiresAt });
});

router.post('/mfa/enable', requireAuth, sensitiveAccountLimiter, async (request: AuthRequest, response: Response): Promise<void> => {
  const authenticated = getAuthenticatedUser(request);
  const input = enableMfaSchema.parse(request.body);
  const recoveryCodes = generateRecoveryCodes();

  await runSerializableTransaction(async (transaction) => {
    const account = await transaction.user.findUnique({
      where: { id: authenticated.id },
      select: {
        id: true, mfaEnabled: true, mfaPendingCiphertext: true, mfaPendingIv: true,
        mfaPendingTag: true, mfaPendingExpiresAt: true,
      },
    });
    if (!account) throw new NotFoundError('Account not found.');
    if (account.mfaEnabled) throw new ConflictError('Multi-factor authentication is already enabled.');
    if (!account.mfaPendingCiphertext || !account.mfaPendingIv || !account.mfaPendingTag || !account.mfaPendingExpiresAt || account.mfaPendingExpiresAt <= new Date()) {
      throw new AppError({ statusCode: 410, code: 'MFA_SETUP_EXPIRED', message: 'MFA setup expired.', clientMessage: 'Start the authenticator setup again.' });
    }
    const secret = decryptMfaSecret({ ciphertext: account.mfaPendingCiphertext, iv: account.mfaPendingIv, tag: account.mfaPendingTag });
    const counter = verifyTotp(secret, input.code);
    if (counter === null) throw new AppError({ statusCode: 400, code: 'INVALID_MFA_CODE', message: 'Invalid TOTP code.', clientMessage: 'The authenticator code is incorrect.' });

    const enabled = await transaction.user.updateMany({
      where: { id: account.id, mfaEnabled: false, mfaPendingExpiresAt: { gt: new Date() } },
      data: {
        mfaEnabled: true,
        mfaSecretCiphertext: account.mfaPendingCiphertext,
        mfaSecretIv: account.mfaPendingIv,
        mfaSecretTag: account.mfaPendingTag,
        mfaPendingCiphertext: null,
        mfaPendingIv: null,
        mfaPendingTag: null,
        mfaPendingExpiresAt: null,
        mfaLastUsedCounter: counter,
        sessionVersion: { increment: 1 },
      },
    });
    if (enabled.count !== 1) throw new ConflictError('The account security settings changed. Start again.');
    await transaction.mfaRecoveryCode.deleteMany({ where: { userId: account.id } });
    await transaction.mfaRecoveryCode.createMany({
      data: recoveryCodes.map((code) => ({ userId: account.id, codeHash: hashRecoveryCode(code) })),
    });
  });

  disableResponseCaching(response);
  response.status(200).json({ message: 'Multi-factor authentication is enabled. Sign in again.', recoveryCodes, sessionRevoked: true });
});

router.post('/mfa/disable', requireAuth, sensitiveAccountLimiter, async (request: AuthRequest, response: Response): Promise<void> => {
  const authenticated = getAuthenticatedUser(request);
  const input = passwordConfirmationSchema.parse(request.body);
  await runSerializableTransaction(async (transaction) => {
    const account = await transaction.user.findUnique({ where: { id: authenticated.id }, select: securitySelect });
    if (!account) throw new NotFoundError('Account not found.');
    if (!account.mfaEnabled) throw new ConflictError('Multi-factor authentication is not enabled.');
    await confirmSensitiveAccountOperation(transaction, account, input.password, input.mfaCode);
    await transaction.user.update({
      where: { id: account.id },
      data: {
        mfaEnabled: false,
        mfaSecretCiphertext: null,
        mfaSecretIv: null,
        mfaSecretTag: null,
        mfaPendingCiphertext: null,
        mfaPendingIv: null,
        mfaPendingTag: null,
        mfaPendingExpiresAt: null,
        mfaLastUsedCounter: null,
        sessionVersion: { increment: 1 },
      },
      select: { id: true },
    });
    await transaction.mfaRecoveryCode.deleteMany({ where: { userId: account.id } });
  });
  disableResponseCaching(response);
  response.status(200).json({ message: 'Multi-factor authentication is disabled. Sign in again.', sessionRevoked: true });
});

router.post('/sessions/revoke', requireAuth, sensitiveAccountLimiter, async (request: AuthRequest, response: Response): Promise<void> => {
  const authenticated = getAuthenticatedUser(request);
  const input = passwordConfirmationSchema.parse(request.body);
  await runSerializableTransaction(async (transaction) => {
    const account = await transaction.user.findUnique({ where: { id: authenticated.id }, select: securitySelect });
    if (!account) throw new NotFoundError('Account not found.');
    await confirmSensitiveAccountOperation(transaction, account, input.password, input.mfaCode);
    await transaction.user.update({ where: { id: account.id }, data: { sessionVersion: { increment: 1 } }, select: { id: true } });
  });
  disableResponseCaching(response);
  response.status(200).json({ message: 'All sessions were revoked. Sign in again.', sessionRevoked: true });
});

router.post('/export', requireAuth, sensitiveAccountLimiter, async (request: AuthRequest, response: Response): Promise<void> => {
  const authenticated = getAuthenticatedUser(request);
  const input = passwordConfirmationSchema.parse(request.body);

  await runSerializableTransaction(async (transaction) => {
    const account = await transaction.user.findUnique({ where: { id: authenticated.id }, select: securitySelect });
    if (!account) throw new NotFoundError('Account not found.');
    await confirmSensitiveAccountOperation(transaction, account, input.password, input.mfaCode);
  });

  try {
    await streamAccountExport(response, authenticated.id);
  } catch (error) {
    if (response.headersSent) {
      response.destroy(error instanceof Error ? error : new Error('Account export failed.'));
      return;
    }
    throw error;
  }
});

router.delete('/', requireAuth, sensitiveAccountLimiter, async (request: AuthRequest, response: Response): Promise<void> => {
  const authenticated = getAuthenticatedUser(request);
  const input = accountDeletionSchema.parse(request.body);
  const disabledPasswordHash = await bcrypt.hash(randomBytes(48).toString('base64url'), env.BCRYPT_ROUNDS);
  const deletion = await runSerializableTransaction(async (transaction) => {
    const account = await transaction.user.findUnique({
      where: { id: authenticated.id },
      select: { ...securitySelect, email: true },
    });
    if (!account) throw new NotFoundError('Account not found.');
    await confirmSensitiveAccountOperation(transaction, account, input.password, input.mfaCode);

    const ownedProjects = await transaction.project.findMany({
      where: { ownerId: account.id, deletionStatus: ProjectDeletionStatus.ACTIVE },
      select: { id: true },
    });
    const now = new Date();
    if (ownedProjects.length > 0) {
      await transaction.project.updateMany({
        where: { id: { in: ownedProjects.map((project) => project.id) }, deletionStatus: ProjectDeletionStatus.ACTIVE },
        data: { deletionStatus: ProjectDeletionStatus.DELETING, deletionRequestedAt: now, isArchived: true, archivedAt: now, version: { increment: 1 } },
      });
      await transaction.activityLog.createMany({
        data: ownedProjects.map((project) => ({
          projectId: project.id,
          userId: account.id,
          action: ActivityAction.ACCOUNT_DELETION_REQUESTED,
          details: { message: 'The project owner requested account deletion.' },
        })),
      });
    }

    await transaction.projectMember.deleteMany({ where: { userId: account.id } });
    const pendingInvitations = await transaction.projectInvitation.findMany({
      where: {
        status: InvitationStatus.PENDING,
        OR: [{ createdById: account.id }, { invitedEmail: account.email }],
      },
      select: { id: true, createdById: true, deliveryStatus: true },
    });
    if (pendingInvitations.length > 0) {
      await transaction.projectInvitation.updateMany({
        where: { id: { in: pendingInvitations.map((invitation) => invitation.id) } },
        data: { status: InvitationStatus.REVOKED, revokedAt: now },
      });
      const undeliveredIds = pendingInvitations
        .filter((invitation) => invitation.deliveryStatus !== EmailDeliveryStatus.SENT)
        .map((invitation) => invitation.id);
      if (undeliveredIds.length > 0) {
        await transaction.projectInvitation.updateMany({
          where: { id: { in: undeliveredIds } },
          data: { deliveryStatus: EmailDeliveryStatus.CANCELLED },
        });
      }
      const invitationIdsByCreator = new Map<string, string[]>();
      for (const invitation of pendingInvitations) {
        const ids = invitationIdsByCreator.get(invitation.createdById) ?? [];
        ids.push(invitation.id);
        invitationIdsByCreator.set(invitation.createdById, ids);
      }
      for (const [creatorId, invitationIds] of invitationIdsByCreator) {
        await cancelOutboxByPayloadReference(transaction, {
          type: EmailOutboxType.PROJECT_INVITATION,
          userId: creatorId,
          referenceField: 'invitationId',
          referenceIds: invitationIds,
          reason: 'The invited account was deleted before this message was used.',
        });
      }
    }
    await transaction.accountToken.deleteMany({ where: { userId: account.id } });
    await transaction.mfaRecoveryCode.deleteMany({ where: { userId: account.id } });
    await transaction.notification.deleteMany({ where: { recipientId: account.id } });
    await transaction.emailOutbox.updateMany({
      where: {
        userId: account.id,
        status: { in: [EmailDeliveryStatus.PENDING, EmailDeliveryStatus.FAILED, EmailDeliveryStatus.PROCESSING] },
      },
      data: {
        status: EmailDeliveryStatus.CANCELLED,
        lockedAt: null,
        lockedBy: null,
        lastError: 'The account was deleted before this message was delivered.',
        payload: { cancelled: true },
      },
    });

    const anonymizedEmail = `deleted-${account.id}@deleted.invalid`;
    await transaction.user.update({
      where: { id: account.id },
      data: {
        name: 'Deleted FinalFrame account',
        email: anonymizedEmail,
        passwordHash: disabledPasswordHash,
        status: AccountStatus.DELETED,
        deletedAt: now,
        deletionRequestedAt: now,
        emailVerifiedAt: null,
        mfaEnabled: false,
        mfaSecretCiphertext: null,
        mfaSecretIv: null,
        mfaSecretTag: null,
        mfaPendingCiphertext: null,
        mfaPendingIv: null,
        mfaPendingTag: null,
        mfaPendingExpiresAt: null,
        mfaLastUsedCounter: null,
        sessionVersion: { increment: 1 },
      },
      select: { id: true },
    });
    return { projectIds: ownedProjects.map((project) => project.id) };
  });

  await Promise.all(deletion.projectIds.map((projectId) => emitProjectDeleted(request, projectId)));
  disableResponseCaching(response);
  response.status(202).json({ message: 'Account access was removed and private project files were queued for deletion.', sessionRevoked: true });
});

export default router;
