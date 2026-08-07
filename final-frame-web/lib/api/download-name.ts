/** Removes path separators, control characters, traversal runs and excess length. */
export function safeDownloadName(value: string, fallback: string): string {
  const normalized = value
    .replace(/[\\/\u0000-\u001F\u007F]/gu, "-")
    .replace(/\.{2,}/gu, ".")
    .trim()
    .slice(0, 180);
  return normalized || fallback;
}
