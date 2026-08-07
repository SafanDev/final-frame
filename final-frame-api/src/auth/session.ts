import { hkdf } from '@panva/hkdf';
import { parseCookie } from 'cookie';
import { jwtDecrypt } from 'jose';
import { z } from 'zod';
import { env } from '../config/env.js';
import { prisma } from '../config/prisma.js';
import { AccountStatus } from '../generated/prisma/enums.js';
import { AuthenticationError } from '../errors/app-error.js';

export interface AuthenticatedUser {
  id: string;
  sessionVersion: number;
  name?: string;
  email?: string;
}

const tokenSchema = z
  .object({
    id: z.string().cuid().optional(),
    sub: z.string().cuid().optional(),
    sessionVersion: z.number().int().positive(),
    name: z.string().min(1).max(120).nullable().optional(),
    email: z.string().email().nullable().optional(),
    exp: z.number().int().positive().optional(),
  })
  .passthrough()
  .refine((token) => Boolean(token.id || token.sub), {
    message: 'Session token is missing a user identifier.',
  });

const reconstructCookieValue = (
  cookies: Readonly<Record<string, string | undefined>>,
  cookieName: string,
): string | null => {
  const chunks = Object.entries(cookies)
    .filter(([name, value]) => value !== undefined && name.startsWith(`${cookieName}.`))
    .map(([name, value]) => {
      const suffix = name.slice(cookieName.length + 1);
      return /^\d+$/.test(suffix) && value !== undefined
        ? { index: Number(suffix), value }
        : null;
    })
    .filter((entry): entry is { index: number; value: string } => entry !== null)
    .sort((left, right) => left.index - right.index);

  if (chunks.length > 0) {
    const continuous = chunks.every((chunk, expectedIndex) => chunk.index === expectedIndex);
    if (!continuous) return null;
    return chunks.map((chunk) => chunk.value).join('');
  }

  return cookies[cookieName] ?? null;
};

let encryptionKeyPromise: Promise<Uint8Array> | undefined;

const getNextAuthEncryptionKey = (): Promise<Uint8Array> => {
  const existing = encryptionKeyPromise;
  if (existing) return existing;

  const derived = hkdf(
    'sha256',
    env.NEXTAUTH_SECRET,
    '',
    'NextAuth.js Generated Encryption Key',
    32,
  );
  encryptionKeyPromise = derived;
  return derived;
};

/**
 * Decrypts the NextAuth cookie and revalidates revocable claims against the
 * database. Account status and session version are never trusted for the
 * lifetime of the JWT alone.
 */
export const decodeSessionCookieHeader = async (
  cookieHeader: string | undefined,
): Promise<AuthenticatedUser> => {
  if (!cookieHeader) throw new AuthenticationError();

  const cookies = parseCookie(cookieHeader);
  const token = reconstructCookieValue(cookies, env.SESSION_COOKIE_NAME);
  if (!token) throw new AuthenticationError('The session cookie is missing or incomplete.');

  let decryptedPayload: unknown;
  try {
    const encryptionKey = await getNextAuthEncryptionKey();
    const { payload } = await jwtDecrypt(token, encryptionKey, {
      clockTolerance: 15,
      keyManagementAlgorithms: ['dir'],
      contentEncryptionAlgorithms: ['A256GCM'],
    });
    decryptedPayload = payload;
  } catch {
    throw new AuthenticationError('The session is invalid or expired.');
  }

  const parsed = tokenSchema.safeParse(decryptedPayload);
  if (!parsed.success) throw new AuthenticationError('The session payload is invalid.');
  if (parsed.data.exp !== undefined && parsed.data.exp <= Math.floor(Date.now() / 1_000)) {
    throw new AuthenticationError('The session has expired.');
  }

  const userId = parsed.data.id ?? parsed.data.sub!;
  const account = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      status: true,
      sessionVersion: true,
      name: true,
      email: true,
    },
  });

  if (!account || account.status !== AccountStatus.ACTIVE) {
    throw new AuthenticationError('The account is unavailable.');
  }
  if (account.sessionVersion !== parsed.data.sessionVersion) {
    throw new AuthenticationError('The session has been revoked.');
  }

  return {
    id: account.id,
    sessionVersion: account.sessionVersion,
    name: account.name,
    email: account.email,
  };
};
