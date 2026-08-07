import assert from "node:assert/strict";
import test from "node:test";
import { createHstsHeader } from "../../lib/security/hsts-core.ts";

test("host-only HSTS is the safe default", () => {
  assert.equal(createHstsHeader({ enabled: true, scope: "host", maxAgeSeconds: 15_552_000, domainControlConfirmed: false }), "max-age=15552000");
});

test("subdomain and preload commitments require explicit domain governance", () => {
  assert.throws(() => createHstsHeader({ enabled: true, scope: "preload", maxAgeSeconds: 31_536_000, domainControlConfirmed: false }), /domain-control confirmation/);
  assert.equal(createHstsHeader({ enabled: true, scope: "preload", maxAgeSeconds: 31_536_000, domainControlConfirmed: true }), "max-age=31536000; includeSubDomains; preload");
});
