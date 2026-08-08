#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const full = process.argv.includes('--full');
const skipInstall = process.argv.includes('--skip-install');
const expectedNode = '24.18.0';
const expectedNpm = '11.16.0';
const npmBinary = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function command(binary, args, options = {}) {
  const result = spawnSync(binary, args, {
    cwd: options.cwd ?? root,
    env: { ...process.env, ...options.env },
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
  return result.stdout?.trim() ?? '';
}

function requireEnvironment(keys, purpose) {
  const missing = keys.filter((key) => !process.env[key]?.trim());
  if (missing.length > 0) {
    console.error(`${purpose} requires: ${missing.join(', ')}.`);
    process.exit(1);
  }
}

const npmVersion = command(npmBinary, ['--version'], { capture: true });
if (process.versions.node !== expectedNode || npmVersion !== expectedNpm) {
  console.error(`Release gates require Node ${expectedNode} and npm ${expectedNpm}; found Node ${process.versions.node} and npm ${npmVersion}.`);
  process.exit(1);
}

command(process.execPath, ['scripts/release-static-check.mjs']);

for (const application of ['final-frame-api', 'final-frame-web']) {
  const cwd = join(root, application);
  if (!skipInstall) command(npmBinary, ['ci', '--no-audit', '--no-fund'], { cwd });
  else if (!existsSync(join(cwd, 'node_modules'))) {
    console.error(`${application}/node_modules is missing; --skip-install cannot be used.`);
    process.exit(1);
  }
}

command(npmBinary, ['run', 'verify'], { cwd: join(root, 'final-frame-api') });
command(npmBinary, ['run', 'verify'], {
  cwd: join(root, 'final-frame-web'),
  env: {
    DEPLOYMENT_ENVIRONMENT: 'development',
    NEXT_PUBLIC_SITE_URL: 'http://127.0.0.1:3100',
    NEXT_PUBLIC_API_URL: 'http://127.0.0.1:3100/backend',
    NEXT_PUBLIC_STORAGE_ORIGIN: 'http://127.0.0.1:9000',
    NEXT_PUBLIC_SITE_NAME: 'FinalFrame',
    NEXT_PUBLIC_RELEASE_VERSION: 'release-gate',
    RELEASE_VERSION: 'release-gate',
    API_URL: 'http://127.0.0.1:5000',
    NEXTAUTH_URL: 'http://127.0.0.1:3100',
    NEXTAUTH_SECRET: 'release-gate-only-secret-with-more-than-thirty-two-characters',
    SESSION_COOKIE_NAME: 'next-auth.session-token',
  },
});

if (process.env.MIGRATION_REHEARSAL_ADMIN_URL) {
  command(npmBinary, ['run', 'db:migrate:rehearse'], {
    cwd: join(root, 'final-frame-api'),
    env: { NODE_ENV: 'test' },
  });
} else if (full) {
  console.error('The full release gate requires MIGRATION_REHEARSAL_ADMIN_URL for clean-install and upgrade migration rehearsal.');
  process.exit(1);
}

if (full) {
  requireEnvironment(
    ['RELEASE_GATE_BASE_URL', 'E2E_EMAIL', 'E2E_PASSWORD', 'E2E_CLIENT_EMAIL', 'E2E_CLIENT_PASSWORD'],
    'The full browser release gate',
  );
  command('docker', ['compose', '-f', 'docker-compose.production.example.yml', 'config', '--quiet']);
  command('docker', ['compose', '-f', 'docker-compose.production.example.yml', 'build']);

  const browserEnvironment = {
    CI: 'true',
    PLAYWRIGHT_EXTERNAL_SERVER: 'true',
    PLAYWRIGHT_BASE_URL: process.env.RELEASE_GATE_BASE_URL,
    NEXT_PUBLIC_API_URL: `${process.env.RELEASE_GATE_BASE_URL.replace(/\/$/, '')}/backend`,
  };
  command(npmBinary, ['run', 'test:e2e'], {
    cwd: join(root, 'final-frame-web'),
    env: browserEnvironment,
  });
  command(npmBinary, ['run', 'lighthouse'], {
    cwd: join(root, 'final-frame-web'),
    env: {
      LIGHTHOUSE_EXTERNAL_SERVER: 'true',
      LIGHTHOUSE_BASE_URL: process.env.RELEASE_GATE_BASE_URL,
    },
  });
  command(npmBinary, ['run', 'ops:verify-deployed-security'], {
    cwd: join(root, 'final-frame-api'),
    env: { DEPLOYED_BASE_URL: process.env.RELEASE_GATE_BASE_URL },
  });
  command(npmBinary, ['run', 'ops:load-slo'], {
    cwd: join(root, 'final-frame-api'),
    env: { LOAD_TEST_BASE_URL: process.env.RELEASE_GATE_BASE_URL },
  });
}

console.log(full
  ? 'All automated source, dependency, migration, image, staged-browser, Lighthouse, deployed-security and load/SLO gates passed. Backup restore and dead-letter disposition remain environment-specific release evidence.'
  : 'All source, dependency, test and build gates passed.');
