export function safeRelativeCallback(
  value: string | string[] | null | undefined,
  fallback = "/app",
): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//")) {
    return fallback;
  }

  try {
    const parsed = new URL(candidate, "https://finalframe.invalid");
    if (parsed.origin !== "https://finalframe.invalid") return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

export function loginHref(callbackUrl: string): string {
  return `/login?callbackUrl=${encodeURIComponent(safeRelativeCallback(callbackUrl))}`;
}

export function registerHref(callbackUrl: string): string {
  return `/register?callbackUrl=${encodeURIComponent(safeRelativeCallback(callbackUrl))}`;
}
