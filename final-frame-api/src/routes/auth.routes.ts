import { Router, type Request, type Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { emailDeliveryEnabled, emailVerificationRequired, env } from '../config/env.js';
import { prisma } from '../config/prisma.js';
import { AppError, ConflictError } from '../errors/app-error.js';
import { Prisma } from '../generated/prisma/client.js';
import {
  AccountStatus,
  AccountTokenType,
  EmailDeliveryStatus,
  EmailOutboxType,
  NotificationDeliveryMode,
} from '../generated/prisma/enums.js';
import {
  authenticationAccountLimiter,
  authenticationIpLimiter,
  registrationLimiter,
} from '../middleware/rate-limit.js';
import { decryptMfaSecret, hashRecoveryCode, verifyTotp } from '../services/mfa.js';
import { generateSecurityToken, normalizeAndHashSecurityToken } from '../services/security-tokens.js';
import { runSerializableTransaction } from '../services/transaction.js';
import { disableResponseCaching } from '../utils/http.js';
import { logger } from '../utils/logger.js';
import { buildRegistrationAcceptedResponse } from '../services/registration-privacy.js';
import { cancelOutboxByPayloadReference } from '../services/outbox-cancellation.js';

const router = Router();
const DUMMY_PASSWORD = 'FinalFrame-Dummy-Password-Only';
const STATIC_ROUNDS_12_DUMMY_HASH = '$2b$12$S4XL.xL9rY6BaXhMHH.IFuPfqnc5Wh27J.6GhTqXmoDD2mM753e92';
const dummyPasswordHashPromise = env.BCRYPT_ROUNDS === 12
  ? Promise.resolve(STATIC_ROUNDS_12_DUMMY_HASH)
  : bcrypt.hash(DUMMY_PASSWORD, env.BCRYPT_ROUNDS);

const normalizedEmailSchema = z.string().trim().max(254).email('Enter a valid email address.').transform((value) => value.toLowerCase());
const passwordSchema = z.string().min(12, 'Use at least 12 characters.').max(128, 'Password is too long.').superRefine((value, context) => {
  if (Buffer.byteLength(value, 'utf8') > 72) context.addIssue({ code: 'custom', message: 'Password cannot exceed 72 UTF-8 bytes.' });
  const categories = [/[a-z]/u.test(value), /[A-Z]/u.test(value), /\d/u.test(value), /[^A-Za-z0-9]/u.test(value)].filter(Boolean).length;
  if (categories < 3) context.addIssue({ code: 'custom', message: 'Use at least three of: lowercase, uppercase, numbers and symbols.' });
});
const registerSchema = z.object({
  name: z.string().trim().min(2).max(80).refine((value) => !/[\u0000-\u001F\u007F]/u.test(value), 'Name contains invalid characters.'),
  email: normalizedEmailSchema,
  password: passwordSchema,
}).strict();
const loginSchema = z.object({
  email: normalizedEmailSchema,
  password: z.string().min(1).max(128).refine((value) => Buffer.byteLength(value, 'utf8') <= 72, 'Password cannot exceed 72 UTF-8 bytes.'),
  mfaCode: z.string().trim().min(6).max(32).optional(),
}).strict();
const tokenSchema = z.object({ token: z.string().trim().min(1).max(256) }).strict();
const requestResetSchema = z.object({ email: normalizedEmailSchema }).strict();
const requestVerificationSchema = requestResetSchema;
const resetPasswordSchema = z.object({ token: z.string().trim().min(1).max(256), password: passwordSchema }).strict();

const publicUserSelect = {
  id: true,
  name: true,
  email: true,
  status: true,
  emailVerifiedAt: true,
  sessionVersion: true,
  mfaEnabled: true,
  createdAt: true,
  updatedAt: true,
} as const;

const invalidCredentialsError = (): AppError => new AppError({
  statusCode: 401,
  code: 'INVALID_CREDENTIALS',
  message: 'Invalid email address, password or verification code.',
  clientMessage: 'Email, password or verification code is incorrect.',
});

async function createAccountTokenAndEmail(
  transaction: Prisma.TransactionClient,
  input: { userId: string; email: string; type: AccountTokenType },
): Promise<void> {
  const { token, tokenHash } = generateSecurityToken();
  const isVerification = input.type === AccountTokenType.EMAIL_VERIFICATION;
  const expiresAt = new Date(Date.now() + (isVerification
    ? env.EMAIL_VERIFICATION_TTL_HOURS * 60 * 60_000
    : env.PASSWORD_RESET_TTL_MINUTES * 60_000));
  const supersededTokens = await transaction.accountToken.findMany({
    where: { userId: input.userId, type: input.type, usedAt: null },
    select: { id: true },
  });
  if (supersededTokens.length > 0) {
    await cancelOutboxByPayloadReference(transaction, {
      type: isVerification ? EmailOutboxType.EMAIL_VERIFICATION : EmailOutboxType.PASSWORD_RESET,
      userId: input.userId,
      referenceField: 'tokenId',
      referenceIds: supersededTokens.map((item) => item.id),
      reason: 'A newer account-security link replaced this message.',
    });
    await transaction.accountToken.deleteMany({
      where: { id: { in: supersededTokens.map((item) => item.id) } },
    });
  }
  const accountToken = await transaction.accountToken.create({
    data: { userId: input.userId, type: input.type, tokenHash, expiresAt },
    select: { id: true },
  });
  const actionUrl = new URL(isVerification ? '/verify-email' : '/reset-password', env.FRONTEND_URL);
  actionUrl.hash = `token=${token}`;
  await transaction.emailOutbox.create({
    data: {
      type: isVerification ? EmailOutboxType.EMAIL_VERIFICATION : EmailOutboxType.PASSWORD_RESET,
      recipient: input.email,
      subject: isVerification ? 'Verify your FinalFrame email' : 'Reset your FinalFrame password',
      payload: { tokenId: accountToken.id, actionUrl: actionUrl.toString() },
      status: EmailDeliveryStatus.PENDING,
      userId: input.userId,
    },
    select: { id: true },
  });
}

router.get('/capabilities', (_request: Request, response: Response): void => {
  disableResponseCaching(response);
  response.status(200).json({
    emailDelivery: emailDeliveryEnabled,
    emailVerificationRequired,
  });
});

router.post('/register', registrationLimiter, async (request: Request, response: Response): Promise<void> => {
  const input = registerSchema.parse(request.body);
  const acceptedResponse = buildRegistrationAcceptedResponse(emailVerificationRequired);
  const existing = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
  if (existing) {
    await bcrypt.compare(DUMMY_PASSWORD, await dummyPasswordHashPromise);
    disableResponseCaching(response);
    response.status(202).json(acceptedResponse);
    return;
  }

  const passwordHash = await bcrypt.hash(input.password, env.BCRYPT_ROUNDS);
  try {
    const user = await runSerializableTransaction(async (transaction) => {
      const created = await transaction.user.create({
        data: {
          name: input.name,
          email: input.email,
          passwordHash,
          status: emailVerificationRequired ? AccountStatus.PENDING_VERIFICATION : AccountStatus.ACTIVE,
          emailVerifiedAt: null,
          notificationDelivery: emailDeliveryEnabled ? NotificationDeliveryMode.IMMEDIATE : NotificationDeliveryMode.IN_APP_ONLY,
        },
        select: publicUserSelect,
      });
      if (emailVerificationRequired) {
        await createAccountTokenAndEmail(transaction, { userId: created.id, email: created.email, type: AccountTokenType.EMAIL_VERIFICATION });
      }
      return created;
    });
    logger.info('User account registered', { userId: user.id, ip: request.ip });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error;
  }

  disableResponseCaching(response);
  response.status(202).json(acceptedResponse);
});

router.post('/login', authenticationIpLimiter, authenticationAccountLimiter, async (request: Request, response: Response): Promise<void> => {
  const input = loginSchema.parse(request.body);
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    select: {
      ...publicUserSelect,
      passwordHash: true,
      mfaSecretCiphertext: true,
      mfaSecretIv: true,
      mfaSecretTag: true,
      mfaLastUsedCounter: true,
    },
  });
  const passwordMatches = await bcrypt.compare(input.password, user?.passwordHash ?? await dummyPasswordHashPromise);
  if (!user || !passwordMatches || user.status === AccountStatus.DELETED) throw invalidCredentialsError();
  if (user.status === AccountStatus.SUSPENDED) throw new AppError({ statusCode: 403, code: 'ACCOUNT_SUSPENDED', message: 'The account is suspended.', clientMessage: 'This account is unavailable. Contact support.' });
  if (user.status === AccountStatus.PENDING_VERIFICATION && emailVerificationRequired) throw new AppError({ statusCode: 403, code: 'EMAIL_NOT_VERIFIED', message: 'The email address has not been verified.', clientMessage: 'Verify your email before signing in.' });

  if (user.mfaEnabled) {
    if (!input.mfaCode) throw new AppError({ statusCode: 409, code: 'MFA_REQUIRED', message: 'A second factor is required.', clientMessage: 'Enter your authenticator or recovery code.' });
    const normalizedCode = input.mfaCode.replace(/[\s-]/gu, '');
    let secondFactorAccepted = false;
    if (/^\d{6}$/u.test(normalizedCode) && user.mfaSecretCiphertext && user.mfaSecretIv && user.mfaSecretTag) {
      const secret = decryptMfaSecret({ ciphertext: user.mfaSecretCiphertext, iv: user.mfaSecretIv, tag: user.mfaSecretTag });
      const counter = verifyTotp(secret, normalizedCode);
      if (counter !== null && (user.mfaLastUsedCounter === null || counter > user.mfaLastUsedCounter)) {
        const updated = await prisma.user.updateMany({
          where: { id: user.id, OR: [{ mfaLastUsedCounter: null }, { mfaLastUsedCounter: { lt: counter } }] },
          data: { mfaLastUsedCounter: counter },
        });
        secondFactorAccepted = updated.count === 1;
      }
    } else {
      const recoveryHash = hashRecoveryCode(input.mfaCode);
      const consumed = await prisma.mfaRecoveryCode.updateMany({
        where: { userId: user.id, codeHash: recoveryHash, usedAt: null },
        data: { usedAt: new Date() },
      });
      secondFactorAccepted = consumed.count === 1;
    }
    if (!secondFactorAccepted) throw invalidCredentialsError();
  }

  if (bcrypt.getRounds(user.passwordHash) < env.BCRYPT_ROUNDS) {
    void bcrypt.hash(input.password, env.BCRYPT_ROUNDS).then((upgradedHash) => prisma.user.updateMany({
      where: { id: user.id, passwordHash: user.passwordHash }, data: { passwordHash: upgradedHash },
    })).catch((error) => logger.warn('Password hash upgrade failed', { userId: user.id, error }));
  }
  const activatePendingAccount = user.status === AccountStatus.PENDING_VERIFICATION && !emailVerificationRequired;
  if (activatePendingAccount) {
    await runSerializableTransaction(async (transaction) => {
      const tokens = await transaction.accountToken.findMany({
        where: { userId: user.id, type: AccountTokenType.EMAIL_VERIFICATION, usedAt: null },
        select: { id: true },
      });
      await cancelOutboxByPayloadReference(transaction, {
        type: EmailOutboxType.EMAIL_VERIFICATION,
        userId: user.id,
        referenceField: 'tokenId',
        referenceIds: tokens.map((token) => token.id),
        reason: 'Email verification is not required in the current configuration.',
      });
      await transaction.accountToken.deleteMany({
        where: { id: { in: tokens.map((token) => token.id) } },
      });
      await transaction.user.update({
        where: { id: user.id },
        data: {
          status: AccountStatus.ACTIVE,
          notificationDelivery: NotificationDeliveryMode.IN_APP_ONLY,
          lastLoginAt: new Date(),
        },
        select: { id: true },
      });
    });
  } else {
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() }, select: { id: true } });
  }
  const {
    passwordHash: _passwordHash,
    mfaSecretCiphertext: _ciphertext,
    mfaSecretIv: _iv,
    mfaSecretTag: _tag,
    mfaLastUsedCounter: _counter,
    ...safeUser
  } = user;
  disableResponseCaching(response);
  response.status(200).json({
    message: 'Signed in.',
    user: activatePendingAccount ? { ...safeUser, status: AccountStatus.ACTIVE } : safeUser,
  });
});

router.post('/verify-email', authenticationIpLimiter, async (request: Request, response: Response): Promise<void> => {
  const { token } = tokenSchema.parse(request.body);
  const tokenHash = normalizeAndHashSecurityToken(token);
  if (!tokenHash) throw new AppError({ statusCode: 400, code: 'INVALID_TOKEN', message: 'Invalid verification token.' });
  const verified = await runSerializableTransaction(async (transaction) => {
    const accountToken = await transaction.accountToken.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        userId: true,
        type: true,
        expiresAt: true,
        usedAt: true,
        user: { select: { status: true } },
      },
    });
    if (
      !accountToken
      || accountToken.type !== AccountTokenType.EMAIL_VERIFICATION
      || accountToken.usedAt
      || accountToken.expiresAt <= new Date()
      || accountToken.user.status !== AccountStatus.PENDING_VERIFICATION
    ) return false;

    const activated = await transaction.user.updateMany({
      where: { id: accountToken.userId, status: AccountStatus.PENDING_VERIFICATION },
      data: { status: AccountStatus.ACTIVE, emailVerifiedAt: new Date(), sessionVersion: { increment: 1 } },
    });
    if (activated.count !== 1) return false;
    const consumed = await transaction.accountToken.updateMany({ where: { id: accountToken.id, usedAt: null }, data: { usedAt: new Date() } });
    if (consumed.count !== 1) throw new ConflictError('The verification link was already used.');
    return true;
  });
  if (!verified) throw new AppError({ statusCode: 400, code: 'INVALID_OR_EXPIRED_TOKEN', message: 'The verification link is invalid or expired.', clientMessage: 'This verification link is invalid or expired.' });
  disableResponseCaching(response);
  response.status(200).json({ message: 'Email verified. You can sign in now.' });
});

router.post('/verify-email/request', authenticationIpLimiter, authenticationAccountLimiter, async (request: Request, response: Response): Promise<void> => {
  const { email } = requestVerificationSchema.parse(request.body);
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true, status: true } });
  if (emailDeliveryEnabled && user?.status === AccountStatus.PENDING_VERIFICATION) {
    await runSerializableTransaction((transaction) => createAccountTokenAndEmail(transaction, {
      userId: user.id,
      email: user.email,
      type: AccountTokenType.EMAIL_VERIFICATION,
    }));
  } else {
    await bcrypt.compare(DUMMY_PASSWORD, await dummyPasswordHashPromise);
  }
  disableResponseCaching(response);
  response.status(202).json({ message: 'If verification is still required, a new link has been sent.' });
});

router.post('/password-reset/request', authenticationIpLimiter, authenticationAccountLimiter, async (request: Request, response: Response): Promise<void> => {
  const { email } = requestResetSchema.parse(request.body);
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true, status: true } });
  if (emailDeliveryEnabled && user && user.status !== AccountStatus.DELETED) {
    await runSerializableTransaction((transaction) => createAccountTokenAndEmail(transaction, { userId: user.id, email: user.email, type: AccountTokenType.PASSWORD_RESET }));
  } else {
    await bcrypt.compare(DUMMY_PASSWORD, await dummyPasswordHashPromise);
  }
  disableResponseCaching(response);
  response.status(202).json({ message: emailDeliveryEnabled
    ? 'If an eligible account exists, a reset link has been sent.'
    : 'Email password reset is not available. Sign in to change your password from account settings.' });
});

router.post('/password-reset/confirm', authenticationIpLimiter, async (request: Request, response: Response): Promise<void> => {
  const input = resetPasswordSchema.parse(request.body);
  const tokenHash = normalizeAndHashSecurityToken(input.token);
  if (!tokenHash) throw new AppError({ statusCode: 400, code: 'INVALID_TOKEN', message: 'Invalid password reset token.' });
  const passwordHash = await bcrypt.hash(input.password, env.BCRYPT_ROUNDS);
  const reset = await runSerializableTransaction(async (transaction) => {
    const accountToken = await transaction.accountToken.findUnique({ where: { tokenHash }, select: { id: true, userId: true, type: true, expiresAt: true, usedAt: true } });
    if (!accountToken || accountToken.type !== AccountTokenType.PASSWORD_RESET || accountToken.usedAt || accountToken.expiresAt <= new Date()) return false;
    const consumed = await transaction.accountToken.updateMany({ where: { id: accountToken.id, usedAt: null }, data: { usedAt: new Date() } });
    if (consumed.count !== 1) return false;
    await transaction.user.update({
      where: { id: accountToken.userId },
      data: { passwordHash, passwordChangedAt: new Date(), sessionVersion: { increment: 1 } },
      select: { id: true },
    });
    await transaction.accountToken.updateMany({ where: { userId: accountToken.userId, usedAt: null }, data: { usedAt: new Date() } });
    return true;
  });
  if (!reset) throw new AppError({ statusCode: 400, code: 'INVALID_OR_EXPIRED_TOKEN', message: 'The reset link is invalid or expired.', clientMessage: 'This reset link is invalid or expired.' });
  disableResponseCaching(response);
  response.status(200).json({ message: 'Password changed. Sign in again on every device.' });
});

export default router;
