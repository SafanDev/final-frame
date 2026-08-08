const SONNER_RUNTIME_STYLE_HASHES = [
  "'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU='",
  "'sha256-CIxDM5jnsGiKqXs2v7NKCY5MzdR9gu6TtiMJrDw29AY='",
] as const;

export interface ContentSecurityPolicyOptions {
  nonce: string;
  apiUrl: string;
  siteUrl: string;
  storageOrigin: string;
  production: boolean;
  upgradeInsecureRequests: boolean;
}

function websocketOrigin(value: string): string {
  const url = new URL(value);
  return `${url.protocol === "https:" ? "wss:" : "ws:"}//${url.host}`;
}

function uniqueSources(values: readonly string[]): string {
  return Array.from(new Set(values.filter(Boolean))).join(" ");
}

export function createContentSecurityPolicy(options: ContentSecurityPolicyOptions): string {
  const apiOrigin = new URL(options.apiUrl).origin;
  const storageOrigin = new URL(options.storageOrigin).origin;
  const nonceSource = `'nonce-${options.nonce}'`;
  // Sonner 2.x creates an empty <style> node and then writes its pinned bundled
  // stylesheet into it. Production authorizes only those exact style bodies in
  // addition to request-nonced styles; arbitrary inline style elements remain blocked.
  const styleSources = options.production
    ? uniqueSources(["'self'", nonceSource, ...SONNER_RUNTIME_STYLE_HASHES])
    : "'self' 'unsafe-inline'";
  const directives = [
    "default-src 'self'",
    `script-src 'self' ${nonceSource} 'strict-dynamic'${options.production ? "" : " 'unsafe-eval'"}`,
    `style-src ${styleSources}`,
    `style-src-elem ${styleSources}`,
    "style-src-attr 'unsafe-inline'",
    `img-src ${uniqueSources(["'self'", "data:", "blob:", apiOrigin])}`,
    `media-src ${uniqueSources(["'self'", "blob:", apiOrigin])}`,
    "font-src 'self' data:",
    `connect-src ${uniqueSources(["'self'", apiOrigin, websocketOrigin(options.apiUrl), websocketOrigin(options.siteUrl), storageOrigin])}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "manifest-src 'self'",
  ];

  if (options.upgradeInsecureRequests) directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}
