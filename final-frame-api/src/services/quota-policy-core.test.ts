import assert from 'node:assert/strict';
import test from 'node:test';
import { exceedsByteLimit, hasReachedCountLimit } from './quota-policy-core.ts';

test('byte quotas allow the exact limit and reject one byte above it', () => {
  assert.equal(exceedsByteLimit(80n, 10n, 10n, 100n), false);
  assert.equal(exceedsByteLimit(80n, 10n, 11n, 100n), true);
});

test('byte quotas include pending reservations', () => {
  assert.equal(exceedsByteLimit(50n, 45n, 6n, 100n), true);
});

test('count quotas stop at the configured boundary', () => {
  assert.equal(hasReachedCountLimit(9, 10), false);
  assert.equal(hasReachedCountLimit(10, 10), true);
});

test('quota arithmetic rejects invalid values', () => {
  assert.throws(() => exceedsByteLimit(-1n, 0n, 0n, 100n), RangeError);
  assert.throws(() => hasReachedCountLimit(Number.NaN, 10), RangeError);
});
