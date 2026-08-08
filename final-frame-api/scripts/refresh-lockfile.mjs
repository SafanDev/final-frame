#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packagePath = join(root, 'package.json');
const packageHash = () => createHash('sha256').update(readFileSync(packagePath)).digest('hex');
const before = packageHash();

function run(binary, args) {
  const result = spawnSync(binary, args, { cwd: root, env: process.env, stdio: 'inherit', shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(process.execPath, [join(root, 'scripts/verify-runtime.mjs')]);
run(process.platform === 'win32' ? 'npm.cmd' : 'npm', [
  'install',
  '--package-lock-only',
  '--ignore-scripts',
  '--no-audit',
  '--no-fund',
  '--prefer-online',
]);

if (packageHash() !== before) {
  console.error('package.json changed while refreshing the lockfile; refusing the result.');
  process.exit(1);
}

run(process.execPath, [join(root, 'scripts/verify-lockfile.mjs')]);
console.log('API package-lock.json was regenerated from exact manifest versions and verified.');
