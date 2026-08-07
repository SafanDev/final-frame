import assert from 'node:assert/strict';
import test from 'node:test';
import { metricsRouteTemplate, normalizeMetricsRoute } from './metrics-route.ts';
import { metrics } from './metrics.ts';

test('metrics route normalization replaces opaque identifiers and removes queries', () => {
  assert.equal(
    normalizeMetricsRoute({
      path: '/api/projects/clz123456789012345678901/assets/123456?token=secret',
      matched: true,
      status: 200,
    }),
    '/api/projects/:id/assets/:id',
  );
});

test('matched routes use the Express route template instead of attacker-controlled values', () => {
  assert.equal(
    metricsRouteTemplate({
      baseUrl: '/api/projects',
      routePath: '/:projectId/assets/:assetId',
      originalUrl: '/api/projects/x/assets/short-user-value',
      path: '/x/assets/short-user-value',
      status: 200,
    }),
    '/api/projects/:projectId/assets/:assetId',
  );
});

test('unmatched attacker paths use one bounded metrics label', () => {
  assert.equal(
    normalizeMetricsRoute({ path: '/anything-an-attacker-controls', matched: false, status: 404 }),
    '/__unmatched__',
  );
  assert.equal(
    normalizeMetricsRoute({ path: '/different-probe', matched: false, status: 500 }),
    '/__unknown__',
  );
});

test('worker metrics expose duration, progress and last-success signals', () => {
  const worker = 'test-worker-metrics';
  const startedAt = metrics.workerRun(worker);
  metrics.workerSuccess(worker, startedAt, 3);
  const output = metrics.render();

  assert.match(output, new RegExp(`finalframe_worker_processed_items_total\\{worker="${worker}"\\} 3`));
  assert.match(output, new RegExp(`finalframe_worker_last_success_timestamp_seconds\\{worker="${worker}"\\} [0-9]+`));
  assert.match(output, /finalframe_process_resident_memory_bytes [0-9]+/);
});
