#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { cp, mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import pg from 'pg';

const { Client } = pg;
const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const prismaBinary = join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'prisma.cmd' : 'prisma');
const adminUrlText = process.env.MIGRATION_REHEARSAL_ADMIN_URL || process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL || '';
const baselineName = process.env.MIGRATION_REHEARSAL_BASELINE || '202607220002_upload_and_storage_outbox';
const allowRemote = process.env.MIGRATION_REHEARSAL_ALLOW_REMOTE === 'true';

if (!existsSync(prismaBinary)) throw new Error('Install API dependencies before rehearsing migrations.');

let adminUrl;
try {
  adminUrl = new URL(adminUrlText);
} catch {
  throw new Error('MIGRATION_REHEARSAL_ADMIN_URL must be a valid PostgreSQL connection URL.');
}
if (!['postgres:', 'postgresql:'].includes(adminUrl.protocol)) throw new Error('Migration rehearsal requires PostgreSQL.');

const localHosts = new Set(['localhost', '127.0.0.1', '::1', 'postgres']);
if (!allowRemote && !localHosts.has(adminUrl.hostname) && !adminUrl.hostname.endsWith('.internal')) {
  throw new Error('Refusing to create disposable databases on a remote host. Set MIGRATION_REHEARSAL_ALLOW_REMOTE=true only for an isolated test cluster.');
}
if (process.env.NODE_ENV === 'production') throw new Error('Migration rehearsal must never run with NODE_ENV=production.');

const suffix = `${Date.now().toString(36)}_${process.pid}_${randomBytes(3).toString('hex')}`;
const cleanDatabase = `finalframe_clean_${suffix}`;
const upgradeDatabase = `finalframe_upgrade_${suffix}`;
const temporaryRoot = await mkdtemp(join(tmpdir(), 'finalframe-migrations-'));
const prismaConfigModuleUrl = pathToFileURL(require.resolve('prisma/config')).href;

function quoteIdentifier(identifier) {
  if (!/^[a-z0-9_]+$/.test(identifier)) throw new Error(`Unsafe database identifier: ${identifier}`);
  return `"${identifier}"`;
}

function databaseUrl(name) {
  const target = new URL(adminUrl);
  target.pathname = `/${name}`;
  return target.toString();
}

function runPrisma(args, targetUrl, cwd = root) {
  const result = spawnSync(prismaBinary, args, {
    cwd,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      DATABASE_URL: targetUrl,
      DIRECT_DATABASE_URL: targetUrl,
    },
    stdio: 'inherit',
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Prisma command failed: prisma ${args.join(' ')}`);
}

async function createDatabase(client, name) {
  await client.query(`CREATE DATABASE ${quoteIdentifier(name)} TEMPLATE template0 ENCODING 'UTF8'`);
}

async function dropDatabase(client, name) {
  await client.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(name)} WITH (FORCE)`);
}

const adminClient = new Client({ connectionString: adminUrl.toString(), connectionTimeoutMillis: 10_000 });
let connected = false;
let createdClean = false;
let createdUpgrade = false;

try {
  await adminClient.connect();
  connected = true;
  await createDatabase(adminClient, cleanDatabase);
  createdClean = true;
  await createDatabase(adminClient, upgradeDatabase);
  createdUpgrade = true;

  const migrationEntries = (await readdir(join(root, 'prisma/migrations'), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const baselineIndex = migrationEntries.indexOf(baselineName);
  if (baselineIndex < 0) throw new Error(`Baseline migration ${baselineName} does not exist.`);
  if (baselineIndex === migrationEntries.length - 1) throw new Error('The rehearsal baseline must precede at least one upgrade migration.');

  const baselineRoot = join(temporaryRoot, 'baseline');
  await mkdir(join(baselineRoot, 'prisma/migrations'), { recursive: true });
  await cp(join(root, 'prisma/schema.prisma'), join(baselineRoot, 'prisma/schema.prisma'));
  await cp(join(root, 'prisma/migrations/migration_lock.toml'), join(baselineRoot, 'prisma/migrations/migration_lock.toml'));
  for (const migration of migrationEntries.slice(0, baselineIndex + 1)) {
    await cp(
      join(root, 'prisma/migrations', migration),
      join(baselineRoot, 'prisma/migrations', migration),
      { recursive: true },
    );
  }

  const baselineConfig = join(baselineRoot, 'prisma.config.ts');
  await writeFile(
    baselineConfig,
    `import { defineConfig } from ${JSON.stringify(prismaConfigModuleUrl)};\n`
      + `const url = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;\n`
      + `if (!url) throw new Error('Database URL is required.');\n`
      + `export default defineConfig({ schema: ${JSON.stringify(join(baselineRoot, 'prisma/schema.prisma'))}, migrations: { path: ${JSON.stringify(join(baselineRoot, 'prisma/migrations'))} }, datasource: { url } });\n`,
  );

  process.stdout.write(`Rehearsing clean deployment through ${basename(migrationEntries.at(-1))}...\n`);
  runPrisma(['migrate', 'deploy'], databaseUrl(cleanDatabase));
  runPrisma(['migrate', 'status'], databaseUrl(cleanDatabase));

  process.stdout.write(`Rehearsing upgrade from ${baselineName}...\n`);
  runPrisma(['migrate', 'deploy', '--config', baselineConfig], databaseUrl(upgradeDatabase), baselineRoot);
  runPrisma(['migrate', 'deploy'], databaseUrl(upgradeDatabase));
  runPrisma(['migrate', 'status'], databaseUrl(upgradeDatabase));

  process.stdout.write('Clean-install and upgrade migration rehearsals passed.\n');
} finally {
  if (connected) {
    if (createdClean) await dropDatabase(adminClient, cleanDatabase).catch((error) => process.stderr.write(`Failed to drop ${cleanDatabase}: ${String(error)}\n`));
    if (createdUpgrade) await dropDatabase(adminClient, upgradeDatabase).catch((error) => process.stderr.write(`Failed to drop ${upgradeDatabase}: ${String(error)}\n`));
    await adminClient.end();
  }
  await rm(temporaryRoot, { recursive: true, force: true });
}
