import { createHash, randomBytes } from 'node:crypto';

const TOKEN_PATTERN = /^[a-f0-9]{64}$/;

export interface GeneratedSecurityToken {
  token: string;
  tokenHash: string;
}

export const hashSecurityToken = (token: string): string =>
  createHash('sha256').update(token, 'utf8').digest('hex');

export const generateSecurityToken = (): GeneratedSecurityToken => {
  const token = randomBytes(32).toString('hex');
  return { token, tokenHash: hashSecurityToken(token) };
};

export const normalizeAndHashSecurityToken = (token: string): string | null => {
  const normalized = token.trim().toLowerCase();
  return TOKEN_PATTERN.test(normalized) ? hashSecurityToken(normalized) : null;
};
