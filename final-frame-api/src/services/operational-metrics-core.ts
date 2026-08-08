export interface OperationalStatusCount {
  status: string;
  count: number;
}

const metricNamePattern = /^[a-zA-Z_:][a-zA-Z0-9_:]*$/u;

const escapeLabel = (value: string): string => value
  .replaceAll('\\', '\\\\')
  .replaceAll('\n', '\\n')
  .replaceAll('"', '\\"');

export const renderStatusGauge = (
  name: string,
  help: string,
  rows: readonly OperationalStatusCount[],
): string[] => {
  if (!metricNamePattern.test(name)) throw new Error('Invalid Prometheus metric name.');
  const lines = [`# HELP ${name} ${help}`, `# TYPE ${name} gauge`];
  const sorted = [...rows].sort((left, right) => left.status.localeCompare(right.status));
  for (const row of sorted) {
    if (!Number.isInteger(row.count) || row.count < 0) throw new Error('Operational metric counts must be non-negative integers.');
    lines.push(`${name}{status="${escapeLabel(row.status)}"} ${row.count}`);
  }
  return lines;
};

export const renderOperationalMetricSnapshot = (input: {
  storageDeletionTasks: readonly OperationalStatusCount[];
  projectDeletions: readonly OperationalStatusCount[];
  emailOutbox: readonly OperationalStatusCount[];
}): string => [
  '# HELP finalframe_operational_snapshot_success Whether the latest operational queue snapshot completed successfully.',
  '# TYPE finalframe_operational_snapshot_success gauge',
  'finalframe_operational_snapshot_success 1',
  ...renderStatusGauge(
    'finalframe_storage_deletion_tasks',
    'Storage deletion tasks by durable queue status.',
    input.storageDeletionTasks,
  ),
  ...renderStatusGauge(
    'finalframe_project_deletions',
    'Projects by deletion workflow status.',
    input.projectDeletions,
  ),
  ...renderStatusGauge(
    'finalframe_email_outbox_messages',
    'Email outbox messages by delivery status.',
    input.emailOutbox,
  ),
  '',
].join('\n');

export const renderOperationalMetricFailure = (): string => [
  '# HELP finalframe_operational_snapshot_success Whether the latest operational queue snapshot completed successfully.',
  '# TYPE finalframe_operational_snapshot_success gauge',
  'finalframe_operational_snapshot_success 0',
  '',
].join('\n');
