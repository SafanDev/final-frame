#!/usr/bin/env node
import { validatePublicSecurityHeaders, validateSecurityBaseUrl } from './deployed-security-lib.mjs';

const baseUrl = validateSecurityBaseUrl(process.env.DEPLOYED_BASE_URL || 'http://127.0.0.1:3100');
const base = new URL(baseUrl);
const attackOrigin = 'https://cross-site-attacker.invalid';
const failures = [];

const request = async (path, options = {}) => {
  const response = await fetch(`${baseUrl}${path}`, { redirect: 'manual', ...options });
  return response;
};

const publicResponse = await request('/');
if (publicResponse.status !== 200) failures.push(`Public page returned HTTP ${publicResponse.status}.`);
failures.push(...validatePublicSecurityHeaders(publicResponse.headers, { https: base.protocol === 'https:' }));

const apiHealth = await request('/backend/health', { headers: { Origin: attackOrigin } });
if (apiHealth.status !== 200) failures.push(`API liveness returned HTTP ${apiHealth.status}.`);
if (apiHealth.headers.get('access-control-allow-origin') === attackOrigin) {
  failures.push('API reflected an untrusted CORS origin.');
}

const hostileMutation = await request('/backend/api/projects', {
  method: 'POST',
  headers: {
    Origin: attackOrigin,
    'Sec-Fetch-Site': 'cross-site',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ title: 'cross-site-probe' }),
});
if (hostileMutation.status !== 403) failures.push(`Cross-site mutation returned HTTP ${hostileMutation.status}; expected 403.`);
if (hostileMutation.headers.get('access-control-allow-origin') === attackOrigin) failures.push('Mutation response allowed the attacker origin through CORS.');

const privateResponse = await request('/account');
const privateCache = privateResponse.headers.get('cache-control') || '';
const robots = privateResponse.headers.get('x-robots-tag') || '';
if (!privateCache.includes('no-store')) failures.push('Private route response is missing no-store caching.');
if (!robots.toLowerCase().includes('noindex')) failures.push('Private route response is missing noindex protection.');

process.stdout.write(`${JSON.stringify({
  target: baseUrl,
  checkedAt: new Date().toISOString(),
  checks: {
    publicHeaders: failures.length === 0 ? 'passed' : 'see failures',
    hostileCorsOrigin: apiHealth.headers.get('access-control-allow-origin') || null,
    hostileMutationStatus: hostileMutation.status,
    privateCache,
    privateRobots: robots,
  },
  failures,
  passed: failures.length === 0,
}, null, 2)}\n`);

if (failures.length) process.exitCode = 1;
