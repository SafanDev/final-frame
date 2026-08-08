import bcrypt from 'bcryptjs';
import { prisma, disconnectPrisma } from '../config/prisma.js';
import { AccountStatus } from '../generated/prisma/enums.js';
import { env } from '../config/env.js';

const required = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
};

const validatePassword = (name: string, password: string): void => {
  if (Buffer.byteLength(password, 'utf8') > 72 || password.length < 12) {
    throw new Error(`${name} must satisfy the application password length policy.`);
  }
};

const upsertE2eUser = async (input: {
  email: string;
  password: string;
  name: string;
  passwordVariable: string;
}): Promise<{ id: string; email: string }> => {
  validatePassword(input.passwordVariable, input.password);
  const passwordHash = await bcrypt.hash(input.password, env.BCRYPT_ROUNDS);
  const user = await prisma.user.upsert({
    where: { email: input.email },
    create: {
      name: input.name,
      email: input.email,
      passwordHash,
      status: AccountStatus.ACTIVE,
      emailVerifiedAt: new Date(),
    },
    update: {
      name: input.name,
      passwordHash,
      status: AccountStatus.ACTIVE,
      emailVerifiedAt: new Date(),
      deletionRequestedAt: null,
      deletedAt: null,
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
    select: { id: true, email: true },
  });
  await prisma.mfaRecoveryCode.deleteMany({ where: { userId: user.id } });
  return user;
};

const main = async (): Promise<void> => {
  if (env.NODE_ENV !== 'test' || process.env.E2E_SEED_CONFIRM !== 'true') {
    throw new Error('E2E seeding is allowed only with NODE_ENV=test and E2E_SEED_CONFIRM=true.');
  }

  const designer = await upsertE2eUser({
    email: required('E2E_EMAIL').toLowerCase(),
    password: required('E2E_PASSWORD'),
    passwordVariable: 'E2E_PASSWORD',
    name: process.env.E2E_NAME?.trim() || 'FinalFrame E2E Project Owner',
  });
  const client = await upsertE2eUser({
    email: required('E2E_CLIENT_EMAIL').toLowerCase(),
    password: required('E2E_CLIENT_PASSWORD'),
    passwordVariable: 'E2E_CLIENT_PASSWORD',
    name: process.env.E2E_CLIENT_NAME?.trim() || 'FinalFrame E2E Client',
  });

  process.stdout.write(`${JSON.stringify({ seeded: true, users: [designer, client] })}\n`);
};

void main()
  .finally(disconnectPrisma)
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'E2E seed failed.'}\n`);
    process.exitCode = 1;
  });
