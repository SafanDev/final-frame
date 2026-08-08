export const INVITATION_TOKEN_STORAGE_KEY = "finalframe.invitation-token";
export const INVITATION_TOKEN_PATTERN = /^[a-f0-9]{64}$/i;

export function normalizeInvitationToken(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase() ?? "";
  return INVITATION_TOKEN_PATTERN.test(normalized) ? normalized : null;
}

export function clearStoredInvitationToken(): void {
  try {
    window.sessionStorage.removeItem(INVITATION_TOKEN_STORAGE_KEY);
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }
}
