import assert from 'node:assert/strict';
import test from 'node:test';
import { UnsafeFileError } from '../errors/unsafe-file-error.ts';
import { assertPdfPageLimit, assertVisualMediaLimits } from './media-safety.ts';

const limits = {
  imageMaximumPixels: 50_000_000,
  videoMaximumPixels: 8_847_360,
  videoMaximumDurationSeconds: 3_600,
};

test('PDF page limits accept bounded documents and reject malformed or oversized files', () => {
  assert.equal(assertPdfPageLimit('Title: Example\nPages:          12\n', 500), 12);
  assert.throws(() => assertPdfPageLimit('Title: Missing pages', 500), UnsafeFileError);
  assert.throws(() => assertPdfPageLimit('Pages: 501', 500), /at most 500 pages/);
});

test('image limits require valid bounded dimensions', () => {
  assert.deepEqual(assertVisualMediaLimits({
    probeJson: JSON.stringify({ streams: [{ codec_type: 'video', width: 4_000, height: 3_000 }] }),
    mimeType: 'image/png',
    ...limits,
  }), { width: 4_000, height: 3_000 });

  assert.throws(() => assertVisualMediaLimits({
    probeJson: JSON.stringify({ streams: [{ codec_type: 'video', width: 20_000, height: 20_000 }] }),
    mimeType: 'image/png',
    ...limits,
  }), /pixel safety limit/);
});

test('video limits require bounded dimensions and a verified duration', () => {
  assert.deepEqual(assertVisualMediaLimits({
    probeJson: JSON.stringify({
      streams: [{ codec_type: 'video', width: 1_920, height: 1_080 }],
      format: { duration: '125.5' },
    }),
    mimeType: 'video/mp4',
    ...limits,
  }), { width: 1_920, height: 1_080, durationSeconds: 125.5 });

  assert.throws(() => assertVisualMediaLimits({
    probeJson: JSON.stringify({
      streams: [{ codec_type: 'video', width: 1_920, height: 1_080 }],
      format: { duration: '3601' },
    }),
    mimeType: 'video/mp4',
    ...limits,
  }), /at most 3600 seconds/);
  assert.throws(() => assertVisualMediaLimits({
    probeJson: '{not-json}',
    mimeType: 'video/mp4',
    ...limits,
  }), UnsafeFileError);
});
