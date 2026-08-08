const opaqueSegmentPattern = /^(?:[a-z0-9_-]{20,}|\d+)$/i;

export const normalizeMetricsRoute = (input: {
  path: string;
  matched: boolean;
  status: number;
}): string => {
  // Never use an attacker-controlled unmatched path as a Prometheus label.
  // A single constant keeps 404/405 probes from growing process memory.
  if (!input.matched) {
    return input.status === 404 || input.status === 405
      ? '/__unmatched__'
      : '/__unknown__';
  }

  const clean = input.path.split('?')[0] || '/';
  const normalized = clean
    .split('/')
    .map((segment) => opaqueSegmentPattern.test(segment) ? ':id' : segment)
    .join('/');
  return normalized || '/';
};

export const metricsRouteTemplate = (input: {
  baseUrl: string;
  routePath: unknown;
  originalUrl: string;
  path: string;
  status: number;
}): string => {
  if (typeof input.routePath === 'string') {
    return normalizeMetricsRoute({
      path: `${input.baseUrl}${input.routePath}` || '/',
      matched: true,
      status: input.status,
    });
  }

  // Express may expose a RegExp or array route. Those values are application
  // controlled, but normalizing them to one label avoids serializing complex
  // patterns and guarantees bounded cardinality.
  if (input.routePath !== undefined) return '/__matched__';

  return normalizeMetricsRoute({
    path: input.originalUrl || input.path,
    matched: false,
    status: input.status,
  });
};
