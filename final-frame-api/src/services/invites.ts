import { env } from '../config/env.js';
import { generateSecurityToken, normalizeAndHashSecurityToken } from './security-tokens.js';

export interface GeneratedInvite {
  token: string;
  tokenHash: string;
  expiresAt: Date;
  inviteUrl: string;
}

export const generateProjectInvite = (): GeneratedInvite => {
  const { token, tokenHash } = generateSecurityToken();
  const expiresAt = new Date(Date.now() + env.INVITE_TTL_HOURS * 60 * 60 * 1_000);
  const inviteUrl = new URL(`/invite#token=${token}`, env.FRONTEND_URL).toString();
  return { token, tokenHash, expiresAt, inviteUrl };
};

export const validateAndHashInviteToken = normalizeAndHashSecurityToken;
