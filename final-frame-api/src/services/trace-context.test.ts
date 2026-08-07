import assert from 'node:assert/strict';
import test from 'node:test';
import { createTraceContext, parseTraceparent } from './trace-context.ts';

test('accepts valid W3C trace context and creates a child span', () => {
  const parent = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';
  assert.equal(parseTraceparent(parent)?.traceId, '4bf92f3577b34da6a3ce929d0e0e4736');
  const child = createTraceContext(parent);
  assert.equal(child.traceId, '4bf92f3577b34da6a3ce929d0e0e4736');
  assert.notEqual(child.spanId, '00f067aa0ba902b7');
  assert.match(child.traceparent, /^00-[a-f0-9]{32}-[a-f0-9]{16}-01$/u);
});

test('rejects malformed and all-zero identifiers', () => {
  assert.equal(parseTraceparent('00-00000000000000000000000000000000-00f067aa0ba902b7-01'), null);
  assert.equal(parseTraceparent('not-a-trace'), null);
  assert.match(createTraceContext().traceparent, /^00-[a-f0-9]{32}-[a-f0-9]{16}-01$/u);
});
