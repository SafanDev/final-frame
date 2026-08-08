import assert from "node:assert/strict";
import test from "node:test";
import { createContentSecurityPolicy } from "../../lib/security/csp-core.ts";

const policy = createContentSecurityPolicy({
  nonce: "test-nonce",
  apiUrl: "https://api.example.test/backend",
  siteUrl: "https://app.example.test",
  storageOrigin: "https://storage.example.test",
  production: true,
  upgradeInsecureRequests: true,
});

test("style elements require a request nonce while style attributes stay narrowly compatible", () => {
  assert.match(policy, /style-src 'self' 'nonce-test-nonce'/);
  assert.match(policy, /style-src-elem 'self' 'nonce-test-nonce'/);
  assert.match(policy, /style-src-attr 'unsafe-inline'/);
  assert.doesNotMatch(policy, /style-src 'self' 'unsafe-inline'/);
});

test("trusted API previews can render without exposing private storage", () => {
  const connect = policy.split("; ").find((directive) => directive.startsWith("connect-src"));
  const image = policy.split("; ").find((directive) => directive.startsWith("img-src"));
  const media = policy.split("; ").find((directive) => directive.startsWith("media-src"));
  assert.match(connect ?? "", /https:\/\/storage\.example\.test/);
  assert.match(image ?? "", /https:\/\/api\.example\.test/);
  assert.match(media ?? "", /https:\/\/api\.example\.test/);
  assert.doesNotMatch(image ?? "", /storage\.example\.test/);
  assert.doesNotMatch(media ?? "", /storage\.example\.test/);
});

test("development allows framework-injected style elements without weakening production", () => {
  const developmentPolicy = createContentSecurityPolicy({
    nonce: "dev-nonce",
    apiUrl: "http://localhost:5000",
    siteUrl: "http://localhost:3000",
    storageOrigin: "http://localhost:9000",
    production: false,
    upgradeInsecureRequests: false,
  });
  const style = developmentPolicy.split("; ").find((directive) => directive.startsWith("style-src "));
  const styleElement = developmentPolicy.split("; ").find((directive) => directive.startsWith("style-src-elem"));
  assert.match(style ?? "", /'unsafe-inline'/);
  assert.match(styleElement ?? "", /'unsafe-inline'/);
  assert.doesNotMatch(policy.split("; ").find((directive) => directive.startsWith("style-src ")) ?? "", /'unsafe-inline'/);
});
