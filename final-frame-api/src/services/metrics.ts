type MetricLabels = Readonly<Record<string, string | number | boolean>>;

interface CounterEntry {
  labels: MetricLabels;
  value: number;
}

interface HistogramEntry {
  labels: MetricLabels;
  count: number;
  sum: number;
  buckets: number[];
}

const escapeLabel = (value: string): string => value
  .replaceAll('\\', '\\\\')
  .replaceAll('\n', '\\n')
  .replaceAll('"', '\\"');

const labelKey = (labels: MetricLabels): string => Object.entries(labels)
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([key, value]) => `${key}=${String(value)}`)
  .join('|');

const renderLabels = (labels: MetricLabels): string => {
  const entries = Object.entries(labels).sort(([left], [right]) => left.localeCompare(right));
  if (entries.length === 0) return '';
  return `{${entries.map(([key, value]) => `${key}="${escapeLabel(String(value))}"`).join(',')}}`;
};

class Counter {
  readonly entries = new Map<string, CounterEntry>();

  increment(labels: MetricLabels = {}, amount = 1): void {
    const key = labelKey(labels);
    const current = this.entries.get(key);
    if (current) current.value += amount;
    else this.entries.set(key, { labels, value: amount });
  }
}

class Gauge {
  readonly entries = new Map<string, CounterEntry>();

  set(labels: MetricLabels = {}, value: number): void {
    this.entries.set(labelKey(labels), { labels, value });
  }

  increment(labels: MetricLabels = {}, amount = 1): void {
    const key = labelKey(labels);
    const current = this.entries.get(key);
    this.entries.set(key, { labels, value: (current?.value ?? 0) + amount });
  }
}

class Histogram {
  readonly entries = new Map<string, HistogramEntry>();
  readonly boundaries: readonly number[];

  constructor(boundaries: readonly number[]) {
    this.boundaries = boundaries;
  }

  observe(labels: MetricLabels, value: number): void {
    const key = labelKey(labels);
    const current = this.entries.get(key) ?? {
      labels,
      count: 0,
      sum: 0,
      buckets: this.boundaries.map(() => 0),
    };
    current.count += 1;
    current.sum += value;
    this.boundaries.forEach((boundary, index) => {
      if (value <= boundary) current.buckets[index] = (current.buckets[index] ?? 0) + 1;
    });
    this.entries.set(key, current);
  }
}

const httpRequests = new Counter();
const httpDuration = new Histogram([0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60]);
const httpInFlight = new Gauge();
const socketConnections = new Gauge();
const socketAuthenticationFailures = new Counter();
const workerRuns = new Counter();
const workerFailures = new Counter();
const workerProcessed = new Counter();
const workerDuration = new Histogram([0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, 120, 300]);
const workerLastRunTimestamp = new Gauge();
const workerLastSuccessTimestamp = new Gauge();
const dependencyReady = new Gauge();

const processStartedAtSeconds = Math.floor(Date.now() / 1_000 - process.uptime());

const renderProcessMetrics = (): string[] => {
  const memory = process.memoryUsage();
  return [
    '# HELP finalframe_process_start_time_seconds Unix timestamp when this API process started.',
    '# TYPE finalframe_process_start_time_seconds gauge',
    `finalframe_process_start_time_seconds ${processStartedAtSeconds}`,
    '# HELP finalframe_process_uptime_seconds API process uptime in seconds.',
    '# TYPE finalframe_process_uptime_seconds gauge',
    `finalframe_process_uptime_seconds ${process.uptime()}`,
    '# HELP finalframe_process_resident_memory_bytes Resident memory used by this API process.',
    '# TYPE finalframe_process_resident_memory_bytes gauge',
    `finalframe_process_resident_memory_bytes ${memory.rss}`,
    '# HELP finalframe_process_heap_used_bytes JavaScript heap used by this API process.',
    '# TYPE finalframe_process_heap_used_bytes gauge',
    `finalframe_process_heap_used_bytes ${memory.heapUsed}`,
    '# HELP finalframe_process_external_memory_bytes Memory used by native objects associated with JavaScript.',
    '# TYPE finalframe_process_external_memory_bytes gauge',
    `finalframe_process_external_memory_bytes ${memory.external}`,
  ];
};

const renderCounter = (name: string, help: string, counter: Counter | Gauge): string[] => {
  const lines = [`# HELP ${name} ${help}`, `# TYPE ${name} ${counter instanceof Gauge ? 'gauge' : 'counter'}`];
  for (const entry of counter.entries.values()) lines.push(`${name}${renderLabels(entry.labels)} ${entry.value}`);
  return lines;
};

const renderHistogram = (name: string, help: string, histogram: Histogram): string[] => {
  const lines = [`# HELP ${name} ${help}`, `# TYPE ${name} histogram`];
  for (const entry of histogram.entries.values()) {
    histogram.boundaries.forEach((boundary, index) => {
      lines.push(`${name}_bucket${renderLabels({ ...entry.labels, le: boundary })} ${entry.buckets[index] ?? 0}`);
    });
    lines.push(`${name}_bucket${renderLabels({ ...entry.labels, le: '+Inf' })} ${entry.count}`);
    lines.push(`${name}_sum${renderLabels(entry.labels)} ${entry.sum}`);
    lines.push(`${name}_count${renderLabels(entry.labels)} ${entry.count}`);
  }
  return lines;
};

export const metrics = Object.freeze({
  httpRequestStarted(): void {
    httpInFlight.increment({}, 1);
  },
  httpRequestFinished(input: { method: string; route: string; status: number; durationSeconds: number }): void {
    httpInFlight.increment({}, -1);
    const labels = { method: input.method, route: input.route, status: input.status };
    httpRequests.increment(labels);
    httpDuration.observe(labels, input.durationSeconds);
  },
  socketConnected(): void {
    socketConnections.increment({}, 1);
  },
  socketDisconnected(): void {
    socketConnections.increment({}, -1);
  },
  socketAuthenticationFailed(code: string): void {
    socketAuthenticationFailures.increment({ code });
  },
  workerRun(worker: string): number {
    workerRuns.increment({ worker });
    workerLastRunTimestamp.set({ worker }, Math.floor(Date.now() / 1_000));
    return performance.now();
  },
  workerSuccess(worker: string, startedAtMs: number, processed = 0): void {
    workerDuration.observe({ worker, outcome: 'success' }, Math.max(0, performance.now() - startedAtMs) / 1_000);
    workerLastSuccessTimestamp.set({ worker }, Math.floor(Date.now() / 1_000));
    if (processed > 0) workerProcessed.increment({ worker }, processed);
  },
  workerFailure(worker: string, startedAtMs: number): void {
    workerFailures.increment({ worker });
    workerDuration.observe({ worker, outcome: 'failure' }, Math.max(0, performance.now() - startedAtMs) / 1_000);
  },
  dependency(name: string, ready: boolean): void {
    dependencyReady.set({ dependency: name }, ready ? 1 : 0);
  },
  render(): string {
    return [
      ...renderProcessMetrics(),
      ...renderCounter('finalframe_http_requests_total', 'Completed API requests.', httpRequests),
      ...renderHistogram('finalframe_http_request_duration_seconds', 'API request duration in seconds.', httpDuration),
      ...renderCounter('finalframe_http_requests_in_flight', 'Currently active API requests.', httpInFlight),
      ...renderCounter('finalframe_socket_connections', 'Currently connected collaboration sockets.', socketConnections),
      ...renderCounter('finalframe_socket_authentication_failures_total', 'Rejected collaboration socket authentications.', socketAuthenticationFailures),
      ...renderCounter('finalframe_worker_runs_total', 'Background worker execution cycles.', workerRuns),
      ...renderCounter('finalframe_worker_failures_total', 'Background worker execution failures.', workerFailures),
      ...renderCounter('finalframe_worker_processed_items_total', 'Items processed by background workers.', workerProcessed),
      ...renderHistogram('finalframe_worker_duration_seconds', 'Background worker cycle duration in seconds.', workerDuration),
      ...renderCounter('finalframe_worker_last_run_timestamp_seconds', 'Unix timestamp of the most recent worker cycle.', workerLastRunTimestamp),
      ...renderCounter('finalframe_worker_last_success_timestamp_seconds', 'Unix timestamp of the most recent successful worker cycle.', workerLastSuccessTimestamp),
      ...renderCounter('finalframe_dependency_ready', 'Dependency readiness state.', dependencyReady),
      '',
    ].join('\n');
  },
});
