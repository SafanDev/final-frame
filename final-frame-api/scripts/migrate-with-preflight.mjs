#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { validateMigrationEnvironment } from './migration-preflight-lib.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const prismaCli = join(root, 'node_modules', 'prisma', 'build', 'index.js');
const result = validateMigrationEnvironment(process.env);
const errors = [...result.errors];

if (!existsSync(prismaCli)) errors.push('The local Prisma CLI entry point is missing.');

if (errors.length > 0) {
  process.stderr.write('Migration preflight failed:\n');
  for (const error of errors) process.stderr.write(`- ${error}\n`);
  process.exit(1);
}

const run = (args) => {
  const child = spawnSync(process.execPath, [prismaCli, ...args], {
    cwd: root,
    env: {
      ...process.env,
      DATABASE_URL: result.targetUrl,
      DIRECT_DATABASE_URL: result.targetUrl,
    },
    stdio: 'inherit',
  });
  if (child.error) throw child.error;
  if (child.status !== 0) process.exit(child.status ?? 1);
};

process.stdout.write(`Migration target confirmed: ${result.expectedConfirmation}\n`);
run(['validate']);
run(['migrate', 'deploy']);
