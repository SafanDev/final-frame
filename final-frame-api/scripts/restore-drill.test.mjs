import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildRestoreCommand,
  restoreToolForFile,
  validateRestoreTargets,
} from './restore-drill-lib.mjs';

test('restore drill refuses the production/source database and requires exact target confirmation', () => {
  assert.throws(() => validateRestoreTargets({
    sourceUrl: 'postgresql://user:secret@db.example.com:5432/finalframe',
    restoreUrl: 'postgresql://other:secret@db.example.com:5432/finalframe',
    confirmation: 'finalframe',
  }), /must not be the source database/u);

  assert.throws(() => validateRestoreTargets({
    sourceUrl: 'postgresql://user:secret@db.example.com/finalframe',
    restoreUrl: 'postgresql://user:secret@db.example.com/finalframe_restore',
    confirmation: 'wrong',
  }), /RESTORE_DRILL_CONFIRM_DATABASE=finalframe_restore/u);
});

test('restore drill accepts a distinct disposable database and chooses safe restore tooling', () => {
  const result = validateRestoreTargets({
    sourceUrl: 'postgresql://user:secret@db.example.com/finalframe',
    restoreUrl: 'postgresql://user:secret@restore.example.com/finalframe_restore',
    confirmation: 'finalframe_restore',
  });
  assert.equal(result.restore.database, 'finalframe_restore');
  assert.equal(restoreToolForFile('latest.dump'), 'pg_restore');
  assert.equal(restoreToolForFile('latest.sql'), 'psql');
  assert.deepEqual(buildRestoreCommand({
    tool: 'pg_restore',
    restoreUrl: 'postgresql://restore/finalframe_restore',
    backupFile: 'latest.dump',
  }).args.slice(0, 5), ['--clean', '--if-exists', '--no-owner', '--no-privileges', '--exit-on-error']);
  assert.throws(() => restoreToolForFile('latest.zip'), /must end in/u);
});
