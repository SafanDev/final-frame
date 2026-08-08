export const percentile = (values, quantile) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(quantile * sorted.length) - 1));
  return sorted[index];
};

export const summarizeLoadResults = ({ latencies, failures, total }) => ({
  total,
  failures,
  errorRate: total === 0 ? 1 : failures / total,
  p50Ms: percentile(latencies, 0.50),
  p95Ms: percentile(latencies, 0.95),
  p99Ms: percentile(latencies, 0.99),
  maxMs: latencies.length ? Math.max(...latencies) : 0,
});

export const validateLoadTarget = (baseUrl) => {
  let url;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error('LOAD_TEST_BASE_URL must be a valid URL.');
  }
  const local = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !local) {
    throw new Error('Load/SLO tests against remote targets require HTTPS.');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('LOAD_TEST_BASE_URL must not contain credentials, query parameters, or fragments.');
  }
  return url.toString().replace(/\/$/u, '');
};

export const parseLoadPaths = (value) => {
  const paths = value.split(',').map((item) => item.trim()).filter(Boolean);
  if (!paths.length || paths.some((path) => !path.startsWith('/') || path.startsWith('//'))) {
    throw new Error('LOAD_TEST_PATHS must be a comma-separated list of same-origin absolute paths.');
  }
  return [...new Set(paths)];
};
