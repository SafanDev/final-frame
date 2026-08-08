#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  buildRestoreCommand,
  restoreToolForFile,
  validateRestoreTargets,
} from './restore-drill-lib.mjs';

const sourceUrl = process.env.RESTORE_DRILL_SOURCE_DATABASE_URL || process.env.DATABASE_URL || '';
const restoreUrl = process.env.RESTORE_DRILL_DATABASE_URL || '';
const backupFile = resolve(process.env.RESTORE_DRILL_BACKUP_FILE || '');
const confirmation = process.env.RESTORE_DRILL_CONFIRM_DATABASE || '';

if (process.env.RESTORE_DRILL_CONFIRM !== 'true') {
  throw new Error('Set RESTORE_DRILL_CONFIRM=true only after selecting a disposable restore database.');
}

const { restore } = validateRestoreTargets({ sourceUrl, restoreUrl, confirmation });
if (!process.env.RESTORE_DRILL_BACKUP_FILE?.trim() || !existsSync(backupFile)) {
  throw new Error('RESTORE_DRILL_BACKUP_FILE must point to an existing PostgreSQL backup.');
}

const run = (binary, args, { capture = false } = {}) => {
  const result = spawnSync(binary, args, {
    encoding: 'utf8',
    stdio: capture ? 'pipe' : 'inherit',
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = capture ? (result.stderr || result.stdout || '').trim() : '';
    throw new Error(`${binary} failed with exit code ${result.status}${detail ? `: ${detail}` : ''}`);
  }
  return capture ? (result.stdout || '').trim() : '';
};

const currentDatabase = run('psql', [`--dbname=${restoreUrl}`, '-Atqc', 'SELECT current_database();'], { capture: true });
if (currentDatabase !== restore.database) {
  throw new Error(`Connected restore target ${currentDatabase || '(unknown)'} did not match confirmed database ${restore.database}.`);
}

const tool = restoreToolForFile(backupFile);
const restoreCommand = buildRestoreCommand({ tool, restoreUrl, backupFile });
run(restoreCommand.binary, restoreCommand.args);

const verificationSql = `
SELECT json_build_object(
  'database', current_database(),
  'completedMigrations', (SELECT COUNT(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL),
  'userTable', to_regclass('"User"') IS NOT NULL,
  'projectTable', to_regclass('"Project"') IS NOT NULL,
  'invitationTable', to_regclass('"ProjectInvitation"') IS NOT NULL,
  'emailOutboxTable', to_regclass('"EmailOutbox"') IS NOT NULL,
  'storageDeletionTable', to_regclass('"StorageDeletionTask"') IS NOT NULL
)::text;
`;

const verificationText = run('psql', [`--dbname=${restoreUrl}`, '-Atqc', verificationSql], { capture: true });
const verification = JSON.parse(verificationText);
if (!Number.isInteger(Number(verification.completedMigrations)) || Number(verification.completedMigrations) < 1) {
  throw new Error('Restored database has no completed Prisma migration history.');
}
for (const key of ['userTable', 'projectTable', 'invitationTable', 'emailOutboxTable', 'storageDeletionTable']) {
  if (verification[key] !== true) throw new Error(`Restored database is missing required table check: ${key}.`);
}

process.stdout.write(`${JSON.stringify({
  restoreDrill: 'passed',
  verifiedAt: new Date().toISOString(),
  target: `${restore.host}:${restore.port}/${restore.database}`,
  backupFile: basename(backupFile),
  restoreTool: tool,
  completedMigrations: Number(verification.completedMigrations),
}, null, 2)}\n`);
