#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const deployment = process.env.DEPLOYMENT_ENVIRONMENT || "development";
const candidates = [
  `.env.${deployment}.local`,
  ".env.local",
  `.env.${deployment}`,
  ".env",
];

const parsed = {};
for (const name of candidates.reverse()) {
  const path = resolve(root, name);
  if (!existsSync(path)) continue;
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    parsed[match[1]] = value;
  }
}

const env = { ...parsed, ...process.env };
const errors = [];
const warnings = [];
const required = [
  "DEPLOYMENT_ENVIRONMENT",
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_API_URL",
  "NEXT_PUBLIC_STORAGE_ORIGIN",
  "NEXT_PUBLIC_SITE_NAME",
  "NEXT_PUBLIC_RELEASE_VERSION",
  "RELEASE_VERSION",
  "API_URL",
  "NEXTAUTH_URL",
  "NEXTAUTH_SECRET",
  "SESSION_COOKIE_NAME",
];

for (const key of required) {
  if (!env[key]?.trim()) errors.push(`${key} is required.`);
}

function readUrl(key) {
  const value = env[key];
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
    return url;
  } catch {
    errors.push(`${key} must be a valid HTTP or HTTPS URL.`);
    return null;
  }
}

function isPrivateServiceUrl(url) {
  const hostname = url.hostname.toLowerCase();
  return hostname === "localhost"
    || hostname === "127.0.0.1"
    || hostname === "::1"
    || !hostname.includes(".")
    || hostname.endsWith(".internal")
    || hostname.endsWith(".local");
}

const site = readUrl("NEXT_PUBLIC_SITE_URL");
const publicApi = readUrl("NEXT_PUBLIC_API_URL");
const storageOrigin = readUrl("NEXT_PUBLIC_STORAGE_ORIGIN");
const privateApi = readUrl("API_URL");
const auth = readUrl("NEXTAUTH_URL");

if (site && auth && site.origin !== auth.origin) {
  errors.push("NEXTAUTH_URL must use the same origin as NEXT_PUBLIC_SITE_URL.");
}
if (env.RELEASE_VERSION && env.NEXT_PUBLIC_RELEASE_VERSION && env.RELEASE_VERSION !== env.NEXT_PUBLIC_RELEASE_VERSION) {
  errors.push("RELEASE_VERSION must equal NEXT_PUBLIC_RELEASE_VERSION.");
}
if (env.NEXTAUTH_SECRET && Buffer.byteLength(env.NEXTAUTH_SECRET, "utf8") < 32) {
  errors.push("NEXTAUTH_SECRET must contain at least 32 UTF-8 bytes.");
}
if (env.NEXT_PUBLIC_TELEMETRY_SAMPLE_RATE) {
  const rate = Number(env.NEXT_PUBLIC_TELEMETRY_SAMPLE_RATE);
  if (!Number.isFinite(rate) || rate < 0 || rate > 1) errors.push("NEXT_PUBLIC_TELEMETRY_SAMPLE_RATE must be between 0 and 1.");
}
const hstsScope = env.HSTS_SCOPE || "host";
const hstsMaxAge = Number(env.HSTS_MAX_AGE_SECONDS || "15552000");
if (!["host", "include-subdomains", "preload"].includes(hstsScope)) errors.push("HSTS_SCOPE must be host, include-subdomains, or preload.");
if (!Number.isInteger(hstsMaxAge) || hstsMaxAge < 86_400 || hstsMaxAge > 63_072_000) errors.push("HSTS_MAX_AGE_SECONDS must be between one day and two years.");
if (hstsScope !== "host" && (env.HSTS_DOMAIN_CONTROL_CONFIRMED !== "true" || hstsMaxAge < 31_536_000)) {
  errors.push("HSTS subdomain/preload scope requires HSTS_DOMAIN_CONTROL_CONFIRMED=true and at least one year of max-age.");
}

if (deployment === "production") {
  for (const [key, url] of [["NEXT_PUBLIC_SITE_URL", site], ["NEXT_PUBLIC_API_URL", publicApi], ["API_URL", privateApi], ["NEXTAUTH_URL", auth]]) {
    const privateHttpApi = key === "API_URL" && url?.protocol === "http:" && isPrivateServiceUrl(url);
    if (url && url.protocol !== "https:" && !privateHttpApi) {
      errors.push(`${key} must use HTTPS, except API_URL may use HTTP for a private service hostname.`);
    }
  }
  if (site && publicApi) {
    const publicApiPath = publicApi.pathname.replace(/\/$/, "");
    if (publicApi.origin !== site.origin || publicApiPath !== "/backend") {
      errors.push("Production NEXT_PUBLIC_API_URL must use NEXT_PUBLIC_SITE_URL with the /backend path.");
    }
    if (publicApi.search || publicApi.hash) {
      errors.push("NEXT_PUBLIC_API_URL must not contain a query string or fragment.");
    }
  }
  if (storageOrigin) {
    if (storageOrigin.protocol !== "https:") {
      errors.push("NEXT_PUBLIC_STORAGE_ORIGIN must use HTTPS in production.");
    }
    if (storageOrigin.pathname !== "/" || storageOrigin.search || storageOrigin.hash || storageOrigin.username || storageOrigin.password) {
      errors.push("NEXT_PUBLIC_STORAGE_ORIGIN must be an origin without credentials, path, query, or fragment.");
    }
  }
  if (!env.SESSION_COOKIE_NAME?.startsWith("__Secure-")) {
    errors.push("SESSION_COOKIE_NAME must begin with __Secure- in production.");
  }
  const placeholder = /replace|example|your_|changeme|placeholder|\.\.\./i;
  if (placeholder.test(env.NEXTAUTH_SECRET || "")) errors.push("NEXTAUTH_SECRET still contains a placeholder value.");
  if (!env.RELEASE_VERSION || env.RELEASE_VERSION === "local" || placeholder.test(env.RELEASE_VERSION)) {
    errors.push("Production RELEASE_VERSION must be a unique release or commit identifier.");
  }
  if (!env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION) warnings.push("Google Search Console verification is not configured.");
  if (!env.NEXT_PUBLIC_BING_SITE_VERIFICATION) warnings.push("Bing Webmaster verification is not configured.");
}

for (const warning of warnings) console.warn(`WARN: ${warning}`);
if (errors.length) {
  console.error("FinalFrame environment validation failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log(`Environment valid for ${deployment}. No secret values were printed.`);
