import assert from 'node:assert/strict';
import test from 'node:test';
import { createBrowserTraceparent, isValidTraceparent } from '../../lib/observability/trace.ts';

test('creates valid W3C browser trace context', () => {
  const value = createBrowserTraceparent();
  assert.equal(isValidTraceparent(value), true);
});

test('rejects malformed trace context', () => {
  assert.equal(isValidTraceparent('00-00000000000000000000000000000000-0000000000000000-01'), false);
  assert.equal(isValidTraceparent('bad'), false);
});
