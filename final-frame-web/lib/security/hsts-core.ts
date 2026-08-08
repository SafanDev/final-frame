export type HstsScope = "host" | "include-subdomains" | "preload";

export interface HstsPolicyOptions {
  enabled: boolean;
  scope: HstsScope;
  maxAgeSeconds: number;
  domainControlConfirmed: boolean;
}

export function createHstsHeader(options: HstsPolicyOptions): string | null {
  if (!options.enabled) return null;
  if (!Number.isInteger(options.maxAgeSeconds) || options.maxAgeSeconds < 86_400 || options.maxAgeSeconds > 63_072_000) {
    throw new Error("HSTS max age must be an integer between one day and two years.");
  }
  if (options.scope !== "host") {
    if (!options.domainControlConfirmed) {
      throw new Error("HSTS subdomain or preload scope requires explicit domain-control confirmation.");
    }
    if (options.maxAgeSeconds < 31_536_000) {
      throw new Error("HSTS subdomain or preload scope requires at least one year of max-age.");
    }
  }

  const values = [`max-age=${options.maxAgeSeconds}`];
  if (options.scope === "include-subdomains" || options.scope === "preload") values.push("includeSubDomains");
  if (options.scope === "preload") values.push("preload");
  return values.join("; ");
}
