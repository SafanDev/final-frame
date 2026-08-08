import assert from 'node:assert/strict';
import test from 'node:test';
import { validateMigrationEnvironment } from './migration-preflight-lib.mjs';

const now = new Date('2026-07-26T12:00:00.000Z');
const productionBase = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://app:secret@db.internal:5432/finalframe',
  DIRECT_DATABASE_URL: 'postgresql://migrator:secret@db.internal:5432/finalframe',
  BACKUP_RESTORE_TESTED: 'true',
  BACKUP_RESTORE_VERIFIED_AT: '2026-07-26T11:00:00.000Z',
  BACKUP_MAX_AGE_HOURS: '24',
  MIGRATION_CONFIRM_DATABASE: 'db.internal:5432/finalframe',
};

test('accepts a confirmed production target with recent restore evidence', () => {
  const result = validateMigrationEnvironment(productionBase, now);
  assert.deepEqual(result.errors, []);
  assert.equal(result.databaseName, 'finalframe');
});

test('rejects application and direct URLs aimed at different databases', () => {
  const result = validateMigrationEnvironment({
    ...productionBase,
    DIRECT_DATABASE_URL: 'postgresql://migrator:secret@db.internal:5432/other',
  }, now);
  assert(result.errors.includes('DATABASE_URL and DIRECT_DATABASE_URL must target the same database name.'));
});

test('rejects PostgreSQL maintenance databases in production', () => {
  const result = validateMigrationEnvironment({
    ...productionBase,
    DATABASE_URL: 'postgresql://app:secret@db.internal:5432/postgres',
    DIRECT_DATABASE_URL: 'postgresql://migrator:secret@db.internal:5432/postgres',
    MIGRATION_CONFIRM_DATABASE: 'db.internal:5432/postgres',
  }, now);
  assert(result.errors.some((error) => error.includes('maintenance database postgres')));
});

test('rejects stale and future backup evidence', () => {
  const stale = validateMigrationEnvironment({
    ...productionBase,
    BACKUP_RESTORE_VERIFIED_AT: '2026-07-24T11:00:00.000Z',
  }, now);
  assert(stale.errors.some((error) => error.includes('older than')));

  const future = validateMigrationEnvironment({
    ...productionBase,
    BACKUP_RESTORE_VERIFIED_AT: '2026-07-26T13:00:00.000Z',
  }, now);
  assert(future.errors.includes('BACKUP_RESTORE_VERIFIED_AT cannot be in the future.'));
});

test('does not expose credentials in confirmation errors', () => {
  const result = validateMigrationEnvironment({ ...productionBase, MIGRATION_CONFIRM_DATABASE: 'wrong' }, now);
  const combined = result.errors.join('\n');
  assert(!combined.includes('secret'));
  assert(combined.includes('db.internal:5432/finalframe'));
});
