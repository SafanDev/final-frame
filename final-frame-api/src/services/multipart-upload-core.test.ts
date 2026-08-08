import assert from 'node:assert/strict';
import test from 'node:test';
import { createMultipartPartPlan, validateCompleteMultipartParts } from './multipart-upload-core.ts';

const MiB = 1024 * 1024;

test('multipart plans preserve exact byte coverage', () => {
  assert.deepEqual(createMultipartPartPlan(20 * MiB + 7, 8 * MiB), [
    { partNumber: 1, offset: 0, fileSize: 8 * MiB },
    { partNumber: 2, offset: 8 * MiB, fileSize: 8 * MiB },
    { partNumber: 3, offset: 16 * MiB, fileSize: 4 * MiB + 7 },
  ]);
});

test('multipart completion rejects gaps, duplicates, and wrong sizes', () => {
  const good = [
    { partNumber: 1, etag: '"one"', fileSize: 8 * MiB },
    { partNumber: 2, etag: '"two"', fileSize: 2 * MiB },
  ];
  assert.deepEqual(validateCompleteMultipartParts(good, 10 * MiB, 8 * MiB), good);
  assert.throws(() => validateCompleteMultipartParts(good.slice(0, 1), 10 * MiB, 8 * MiB));
  assert.throws(() => validateCompleteMultipartParts([...good, good[0]!], 10 * MiB, 8 * MiB));
  assert.throws(() => validateCompleteMultipartParts([{ ...good[0]!, fileSize: 7 * MiB }, good[1]!], 10 * MiB, 8 * MiB));
});
