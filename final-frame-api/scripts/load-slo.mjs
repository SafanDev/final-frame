#!/usr/bin/env node
import { performance } from 'node:perf_hooks';
import { parseLoadPaths, summarizeLoadResults, validateLoadTarget } from './load-slo-lib.mjs';

const baseUrl = validateLoadTarget(process.env.LOAD_TEST_BASE_URL || 'http://127.0.0.1:3100');
const paths = parseLoadPaths(process.env.LOAD_TEST_PATHS || '/,/api/health,/backend/health');
const durationSeconds = Number(process.env.LOAD_TEST_DURATION_SECONDS || '30');
const concurrency = Number(process.env.LOAD_TEST_CONCURRENCY || '8');
const timeoutMs = Number(process.env.LOAD_TEST_TIMEOUT_MS || '10000');
const p95LimitMs = Number(process.env.LOAD_TEST_P95_MS || '2000');
const maxErrorRate = Number(process.env.LOAD_TEST_MAX_ERROR_RATE || '0.01');
const minRequests = Number(process.env.LOAD_TEST_MIN_REQUESTS || '100');

for (const [name, value, min, max] of [
  ['LOAD_TEST_DURATION_SECONDS', durationSeconds, 5, 600],
  ['LOAD_TEST_CONCURRENCY', concurrency, 1, 100],
  ['LOAD_TEST_TIMEOUT_MS', timeoutMs, 100, 120_000],
  ['LOAD_TEST_P95_MS', p95LimitMs, 50, 120_000],
  ['LOAD_TEST_MAX_ERROR_RATE', maxErrorRate, 0, 1],
  ['LOAD_TEST_MIN_REQUESTS', minRequests, 1, 1_000_000],
]) {
  if (!Number.isFinite(value) || value < min || value > max) throw new Error(`${name} must be between ${min} and ${max}.`);
}

const headers = {
  'Accept': 'text/html,application/json;q=0.9,*/*;q=0.8',
  'Cache-Control': 'no-cache',
  'User-Agent': 'FinalFrame-SLO-Check/1.0',
};
if (process.env.LOAD_TEST_COOKIE?.trim()) headers.Cookie = process.env.LOAD_TEST_COOKIE.trim();
if (process.env.LOAD_TEST_AUTHORIZATION?.trim()) headers.Authorization = process.env.LOAD_TEST_AUTHORIZATION.trim();

const deadline = performance.now() + durationSeconds * 1_000;
const latencies = [];
const failuresByPath = new Map(paths.map((path) => [path, 0]));
const requestsByPath = new Map(paths.map((path) => [path, 0]));
let sequence = 0;
let failures = 0;
let total = 0;

const requestOne = async () => {
  const path = paths[sequence++ % paths.length];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = performance.now();
  let failed = false;
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'GET',
      headers,
      signal: controller.signal,
      redirect: 'manual',
    });
    if (!response.ok) failed = true;
    await response.arrayBuffer();
  } catch {
    failed = true;
  } finally {
    clearTimeout(timer);
    latencies.push(performance.now() - started);
    total += 1;
    requestsByPath.set(path, (requestsByPath.get(path) || 0) + 1);
    if (failed) {
      failures += 1;
      failuresByPath.set(path, (failuresByPath.get(path) || 0) + 1);
    }
  }
};

const worker = async () => {
  while (performance.now() < deadline) await requestOne();
};

await Promise.all(Array.from({ length: Math.floor(concurrency) }, () => worker()));
const summary = summarizeLoadResults({ latencies, failures, total });
const perPath = paths.map((path) => ({
  path,
  requests: requestsByPath.get(path) || 0,
  failures: failuresByPath.get(path) || 0,
}));
const passed = total >= minRequests && summary.errorRate <= maxErrorRate && summary.p95Ms <= p95LimitMs;

process.stdout.write(`${JSON.stringify({
  target: baseUrl,
  durationSeconds,
  concurrency,
  thresholds: { minRequests, maxErrorRate, p95LimitMs },
  ...summary,
  perPath,
  passed,
}, null, 2)}\n`);

if (!passed) process.exitCode = 1;
