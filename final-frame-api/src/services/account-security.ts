import bcrypt from 'bcryptjs';
import type { Prisma } from '../generated/prisma/client.js';
import { AppError } from '../errors/app-error.js';
import { decryptMfaSecret, hashRecoveryCode, verifyTotp } from './mfa.js';

interface SecurityUser {
  id: string;
  passwordHash: string;
  mfaEnabled: boolean;
  mfaSecretCiphertext: string | null;
  mfaSecretIv: string | null;
  mfaSecretTag: string | null;
  mfaLastUsedCounter: bigint | null;
}

const invalidSecurityConfirmation = (): AppError => new AppError({
  statusCode: 401,
  code: 'SECURITY_CONFIRMATION_FAILED',
  message: 'Password or second-factor confirmation failed.',
  clientMessage: 'The password or verification code is incorrect.',
});

/**
 * Confirms a sensitive account operation. TOTP counters and recovery codes are
 * consumed atomically so one code cannot authorize concurrent operations.
 */
export const confirmSensitiveAccountOperation = async (
  transaction: Prisma.TransactionClient,
  user: SecurityUser,
  password: string,
  mfaCode?: string,
): Promise<void> => {
  const passwordMatches = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatches) throw invalidSecurityConfirmation();
  if (!user.mfaEnabled) return;
  if (!mfaCode) throw new AppError({
    statusCode: 409,
    code: 'MFA_REQUIRED',
    message: 'A second factor is required for this account operation.',
    clientMessage: 'Enter an authenticator or recovery code.',
  });

  const normalizedCode = mfaCode.replace(/[\s-]/gu, '');
  if (/^\d{6}$/u.test(normalizedCode) && user.mfaSecretCiphertext && user.mfaSecretIv && user.mfaSecretTag) {
    const secret = decryptMfaSecret({
      ciphertext: user.mfaSecretCiphertext,
      iv: user.mfaSecretIv,
      tag: user.mfaSecretTag,
    });
    const counter = verifyTotp(secret, normalizedCode);
    if (counter !== null && (user.mfaLastUsedCounter === null || counter > user.mfaLastUsedCounter)) {
      const consumed = await transaction.user.updateMany({
        where: {
          id: user.id,
          OR: [{ mfaLastUsedCounter: null }, { mfaLastUsedCounter: { lt: counter } }],
        },
        data: { mfaLastUsedCounter: counter },
      });
      if (consumed.count === 1) return;
    }
  } else {
    const consumed = await transaction.mfaRecoveryCode.updateMany({
      where: {
        userId: user.id,
        codeHash: hashRecoveryCode(mfaCode),
        usedAt: null,
      },
      data: { usedAt: new Date() },
    });
    if (consumed.count === 1) return;
  }

  throw invalidSecurityConfirmation();
};
