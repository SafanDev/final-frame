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
  const directives = [
    "default-src 'self'",
    `script-src 'self' ${nonceSource} 'strict-dynamic'${options.production ? "" : " 'unsafe-eval'"}`,
    `style-src 'self' ${nonceSource}`,
    `style-src-elem 'self' ${nonceSource}`,
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
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
