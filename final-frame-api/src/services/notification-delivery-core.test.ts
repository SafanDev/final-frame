import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getNextDigestSchedule,
  isSupportedLocale,
  isSupportedTimeZone,
  mergeNotificationIds,
} from './notification-delivery-core.ts';

test('daily digests schedule the next local 08:00 across time zones', () => {
  const before = getNextDigestSchedule(new Date('2026-07-28T00:30:00.000Z'), 'Asia/Colombo');
  assert.equal(before.batchDate, '2026-07-28');
  assert.equal(before.nextAttemptAt.toISOString(), '2026-07-28T02:30:00.000Z');

  const after = getNextDigestSchedule(new Date('2026-07-28T04:00:00.000Z'), 'Asia/Colombo');
  assert.equal(after.batchDate, '2026-07-29');
  assert.equal(after.nextAttemptAt.toISOString(), '2026-07-29T02:30:00.000Z');
});

test('locale and time-zone preferences reject unsupported values', () => {
  assert.equal(isSupportedLocale('en-US'), true);
  assert.equal(isSupportedLocale('not_a_locale'), false);
  assert.equal(isSupportedTimeZone('UTC'), true);
  assert.equal(isSupportedTimeZone('Mars/Olympus'), false);
});

test('digest notification IDs are deduplicated and bounded', () => {
  assert.deepEqual(mergeNotificationIds(['a', 'b'], ['b', 'c']), ['a', 'b', 'c']);
  assert.deepEqual(mergeNotificationIds([], ['a', 'b', 'c'], 2), ['a', 'b']);
});
