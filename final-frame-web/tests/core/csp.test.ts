import assert from "node:assert/strict";
import test from "node:test";
import { createContentSecurityPolicy } from "../../lib/security/csp-core.ts";

const policy = createContentSecurityPolicy({
  nonce: "test-nonce",
  apiUrl: "https://app.example.test/backend",
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

test("private storage is allowed only for upload connections, not rendering", () => {
  const connect = policy.split("; ").find((directive) => directive.startsWith("connect-src"));
  const image = policy.split("; ").find((directive) => directive.startsWith("img-src"));
  const media = policy.split("; ").find((directive) => directive.startsWith("media-src"));
  assert.match(connect ?? "", /https:\/\/storage\.example\.test/);
  assert.doesNotMatch(image ?? "", /storage\.example\.test/);
  assert.doesNotMatch(media ?? "", /storage\.example\.test/);
});
