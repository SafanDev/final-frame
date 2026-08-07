import { randomBytes } from 'node:crypto';

export interface TraceContext {
  traceId: string;
  spanId: string;
  traceFlags: '00' | '01';
  traceparent: string;
}

const TRACEPARENT = /^00-([a-f0-9]{32})-([a-f0-9]{16})-(00|01)$/u;
const allZero = (value: string): boolean => /^0+$/u.test(value);

function randomHex(bytes: number): string {
  let value = randomBytes(bytes).toString('hex');
  while (allZero(value)) value = randomBytes(bytes).toString('hex');
  return value;
}

export function parseTraceparent(value: string | undefined): TraceContext | null {
  if (!value || value.length > 128) return null;
  const match = TRACEPARENT.exec(value.trim().toLowerCase());
  if (!match || allZero(match[1]!) || allZero(match[2]!)) return null;
  return {
    traceId: match[1]!,
    spanId: match[2]!,
    traceFlags: match[3] as '00' | '01',
    traceparent: `00-${match[1]}-${match[2]}-${match[3]}`,
  };
}

export function createTraceContext(parent?: string): TraceContext {
  const parsed = parseTraceparent(parent);
  const traceId = parsed?.traceId ?? randomHex(16);
  const spanId = randomHex(8);
  const traceFlags = parsed?.traceFlags ?? '01';
  return { traceId, spanId, traceFlags, traceparent: `00-${traceId}-${spanId}-${traceFlags}` };
}
