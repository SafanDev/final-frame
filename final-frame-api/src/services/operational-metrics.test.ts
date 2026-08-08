import assert from 'node:assert/strict';
import test from 'node:test';
import {
  renderOperationalMetricFailure,
  renderOperationalMetricSnapshot,
  renderStatusGauge,
} from './operational-metrics-core.ts';

test('operational queue metrics use fixed names and sorted status labels', () => {
  const output = renderOperationalMetricSnapshot({
    storageDeletionTasks: [
      { status: 'FAILED', count: 2 },
      { status: 'PENDING', count: 5 },
    ],
    projectDeletions: [{ status: 'ACTIVE', count: 8 }],
    emailOutbox: [{ status: 'ABANDONED', count: 1 }],
  });
  assert.match(output, /finalframe_operational_snapshot_success 1/u);
  assert.ok(output.indexOf('status="FAILED"') < output.indexOf('status="PENDING"'));
  assert.match(output, /finalframe_storage_deletion_tasks\{status="PENDING"\} 5/u);
  assert.match(output, /finalframe_email_outbox_messages\{status="ABANDONED"\} 1/u);
});

test('operational metric rendering rejects invalid names and counts', () => {
  assert.throws(() => renderStatusGauge('bad-name', 'Bad.', [],), /Invalid Prometheus metric name/u);
  assert.throws(() => renderStatusGauge('valid_name', 'Bad.', [{ status: 'FAILED', count: -1 }]), /non-negative integers/u);
  assert.match(renderOperationalMetricFailure(), /finalframe_operational_snapshot_success 0/u);
});
