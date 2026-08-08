import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getAssetStorageFootprint, getAssetsStorageFootprint } from './asset-storage-footprint.ts';

describe('getAssetStorageFootprint', () => {
  it('includes an active original, preview, and voice notes', () => {
    const result = getAssetStorageFootprint({
      storageKey: 'projects/p1/original.bin',
      previewKey: 'projects/p1/preview.webp',
      fileSize: 1_000,
      previewFileSize: 250,
      originalRetiredAt: null,
      comments: [
        { audioKey: 'projects/p1/voice-1.webm', audioFileSize: 100 },
        { audioKey: 'projects/p1/voice-2.webm', audioFileSize: 120 },
      ],
    });

    assert.deepEqual(result.objectKeys, [
      'projects/p1/original.bin',
      'projects/p1/preview.webp',
      'projects/p1/voice-1.webm',
      'projects/p1/voice-2.webm',
    ]);
    assert.equal(result.accountedBytes, 1_470n);
  });

  it('excludes a retired original while retaining derivative and voice storage', () => {
    const result = getAssetStorageFootprint({
      storageKey: 'projects/p1/rejected.bin',
      previewKey: 'projects/p1/preview.webp',
      fileSize: 2_000,
      previewFileSize: 300,
      originalRetiredAt: new Date('2026-07-27T00:00:00.000Z'),
      comments: [{ audioKey: 'projects/p1/voice.webm', audioFileSize: 75 }],
    });

    assert.deepEqual(result.objectKeys, [
      'projects/p1/preview.webp',
      'projects/p1/voice.webm',
    ]);
    assert.equal(result.accountedBytes, 375n);
  });

  it('deduplicates object keys, keeps the largest known size, and ignores sizes without keys', () => {
    const result = getAssetStorageFootprint({
      storageKey: 'projects/p1/original.bin',
      previewKey: 'projects/p1/original.bin',
      fileSize: 10,
      previewFileSize: 5,
      originalRetiredAt: null,
      comments: [
        { audioKey: 'projects/p1/original.bin', audioFileSize: 3 },
        { audioKey: null, audioFileSize: 99 },
      ],
    });

    assert.deepEqual(result.objectKeys, ['projects/p1/original.bin']);
    assert.equal(result.accountedBytes, 10n);
  });
});

it('deduplicates the same physical object across multiple asset rows', () => {
  const result = getAssetsStorageFootprint([
    {
      storageKey: 'projects/p1/shared-original.bin',
      previewKey: 'projects/p1/shared-preview.webp',
      fileSize: 1_000,
      previewFileSize: 100,
      originalRetiredAt: null,
      comments: [],
    },
    {
      storageKey: 'projects/p1/shared-original.bin',
      previewKey: 'projects/p1/shared-preview.webp',
      fileSize: 900,
      previewFileSize: 120,
      originalRetiredAt: null,
      comments: [
        { audioKey: 'projects/p1/shared-original.bin', audioFileSize: 50 },
      ],
    },
  ]);

  assert.deepEqual(result.objectKeys, [
    'projects/p1/shared-original.bin',
    'projects/p1/shared-preview.webp',
  ]);
  assert.equal(result.accountedBytes, 1_120n);
});
