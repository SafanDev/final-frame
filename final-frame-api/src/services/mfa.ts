import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { env } from '../config/env.js';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const TOTP_PERIOD_SECONDS = 30;
const TOTP_DIGITS = 6;
const ALLOWED_WINDOW = 1;

export interface EncryptedMfaSecret {
  ciphertext: string;
  iv: string;
  tag: string;
}

const encryptionKey = createHash('sha256').update(env.MFA_ENCRYPTION_KEY, 'utf8').digest();

function encodeBase32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

function decodeBase32(value: string): Uint8Array {
  const normalized = value.toUpperCase().replace(/=+$/u, '').replace(/\s+/gu, '');
  let bits = 0;
  let buffer = 0;
  const bytes: number[] = [];
  for (const character of normalized) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index < 0) throw new Error('Invalid base32 secret.');
    buffer = (buffer << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((buffer >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Uint8Array.from(bytes);
}

function hotp(secret: Uint8Array, counter: bigint): string {
  const counterBytes = Buffer.alloc(8);
  counterBytes.writeBigUInt64BE(counter);
  const digest = createHmac('sha1', secret).update(counterBytes).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary = (
    ((digest[offset]! & 0x7f) << 24) |
    ((digest[offset + 1]! & 0xff) << 16) |
    ((digest[offset + 2]! & 0xff) << 8) |
    (digest[offset + 3]! & 0xff)
  ) >>> 0;
  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, '0');
}

export const generateMfaSecret = (): string => encodeBase32(randomBytes(20));

export const encryptMfaSecret = (secret: string): EncryptedMfaSecret => {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey, iv);
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return {
    ciphertext: ciphertext.toString('base64url'),
    iv: iv.toString('base64url'),
    tag: cipher.getAuthTag().toString('base64url'),
  };
};

export const decryptMfaSecret = (encrypted: EncryptedMfaSecret): string => {
  const decipher = createDecipheriv(
    'aes-256-gcm',
    encryptionKey,
    Buffer.from(encrypted.iv, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(encrypted.tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
};

export const buildOtpAuthUrl = (email: string, secret: string): string => {
  const label = encodeURIComponent(`${env.MFA_ISSUER}:${email}`);
  const issuer = encodeURIComponent(env.MFA_ISSUER);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_PERIOD_SECONDS}`;
};

export const verifyTotp = (
  secretValue: string,
  codeValue: string,
  now = Date.now(),
): bigint | null => {
  const code = codeValue.replace(/[\s-]/gu, '');
  if (!/^\d{6}$/u.test(code)) return null;
  const secret = decodeBase32(secretValue);
  const currentCounter = BigInt(Math.floor(now / 1_000 / TOTP_PERIOD_SECONDS));
  for (let offset = -ALLOWED_WINDOW; offset <= ALLOWED_WINDOW; offset += 1) {
    const counter = currentCounter + BigInt(offset);
    if (counter < 0n) continue;
    const expected = Buffer.from(hotp(secret, counter), 'utf8');
    const supplied = Buffer.from(code, 'utf8');
    if (expected.length === supplied.length && timingSafeEqual(expected, supplied)) return counter;
  }
  return null;
};

export const generateRecoveryCodes = (count = 10): string[] =>
  Array.from({ length: count }, () => {
    const raw = randomBytes(6).toString('hex').toUpperCase();
    return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
  });

export const hashRecoveryCode = (code: string): string =>
  createHash('sha256')
    .update(`${env.MFA_RECOVERY_PEPPER}:${code.replace(/[\s-]/gu, '').toUpperCase()}`, 'utf8')
    .digest('hex');
