import assert from 'node:assert/strict';
import test from 'node:test';
import { parseLoadPaths, percentile, summarizeLoadResults, validateLoadTarget } from './load-slo-lib.mjs';

test('load SLO statistics use deterministic nearest-rank percentiles', () => {
  assert.equal(percentile([100, 200, 300, 400], 0.95), 400);
  assert.deepEqual(summarizeLoadResults({ latencies: [10, 20, 30], failures: 1, total: 4 }), {
    total: 4,
    failures: 1,
    errorRate: 0.25,
    p50Ms: 20,
    p95Ms: 30,
    p99Ms: 30,
    maxMs: 30,
  });
});

test('load targets stay same-origin and remote targets require TLS', () => {
  assert.equal(validateLoadTarget('https://staging.example.com/'), 'https://staging.example.com');
  assert.equal(validateLoadTarget('http://127.0.0.1:3100'), 'http://127.0.0.1:3100');
  assert.throws(() => validateLoadTarget('http://staging.example.com'), /require HTTPS/u);
  assert.deepEqual(parseLoadPaths('/,/api/health,/backend/health,/'), ['/', '/api/health', '/backend/health']);
  assert.throws(() => parseLoadPaths('https://evil.example/'), /same-origin/u);
});
