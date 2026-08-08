import assert from 'node:assert/strict';
import test from 'node:test';
import { validatePublicSecurityHeaders, validateSecurityBaseUrl } from './deployed-security-lib.mjs';

test('deployed security validation accepts the expected hardened response headers', () => {
  const headers = new Headers({
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'permissions-policy': 'camera=()',
    'strict-transport-security': 'max-age=15552000',
    'content-security-policy': "default-src 'self'; script-src 'self' 'nonce-AbCd1234==' 'strict-dynamic'; object-src 'none'",
  });
  assert.deepEqual(validatePublicSecurityHeaders(headers, { https: true }), []);
  assert.equal(validateSecurityBaseUrl('https://staging.example.com/'), 'https://staging.example.com');
});

test('deployed security validation rejects unsafe scripts and remote HTTP', () => {
  const headers = new Headers({
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'permissions-policy': 'camera=()',
    'content-security-policy': "script-src 'self' 'unsafe-eval'",
  });
  assert.ok(validatePublicSecurityHeaders(headers, { https: true }).length >= 2);
  assert.throws(() => validateSecurityBaseUrl('http://staging.example.com'), /requires HTTPS/u);
});
