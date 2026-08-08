import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeSingleByteRange } from './http-range.ts';

test('accepts bounded, open-ended, and suffix byte ranges', () => {
  assert.equal(normalizeSingleByteRange('bytes=0-499'), 'bytes=0-499');
  assert.equal(normalizeSingleByteRange(' bytes=500- '), 'bytes=500-');
  assert.equal(normalizeSingleByteRange('bytes=-500'), 'bytes=-500');
});

test('rejects multiple or malformed ranges', () => {
  assert.throws(() => normalizeSingleByteRange('bytes=0-1,4-5'));
  assert.throws(() => normalizeSingleByteRange('bytes=-'));
  assert.throws(() => normalizeSingleByteRange('items=0-5'));
  assert.throws(() => normalizeSingleByteRange('bytes=10-2'));
});
