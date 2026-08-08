import { extname } from 'node:path';

const normalizeDatabaseUrl = (value, label) => {
  if (!value?.trim()) throw new Error(`${label} is required.`);
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid PostgreSQL URL.`);
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error(`${label} must use postgres:// or postgresql://.`);
  }
  const database = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
  if (!database) throw new Error(`${label} must include a database name.`);
  return {
    host: url.hostname.toLowerCase(),
    port: url.port || '5432',
    database,
  };
};

export const validateRestoreTargets = ({ sourceUrl, restoreUrl, confirmation }) => {
  const source = normalizeDatabaseUrl(sourceUrl, 'Source database URL');
  const restore = normalizeDatabaseUrl(restoreUrl, 'Restore database URL');
  if (`${source.host}:${source.port}/${source.database}` === `${restore.host}:${restore.port}/${restore.database}`) {
    throw new Error('Restore drill target must not be the source database.');
  }
  if (!confirmation?.trim() || confirmation.trim() !== restore.database) {
    throw new Error(`Set RESTORE_DRILL_CONFIRM_DATABASE=${restore.database} to confirm the disposable restore target.`);
  }
  return { source, restore };
};

export const restoreToolForFile = (filePath) => {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.sql')) return 'psql';
  if (['.dump', '.backup', '.tar'].includes(extname(lower))) return 'pg_restore';
  throw new Error('Restore drill backup must end in .sql, .dump, .backup, or .tar.');
};

export const buildRestoreCommand = ({ tool, restoreUrl, backupFile }) => {
  if (tool === 'psql') {
    return {
      binary: 'psql',
      args: ['--set=ON_ERROR_STOP=1', `--dbname=${restoreUrl}`, `--file=${backupFile}`],
    };
  }
  if (tool === 'pg_restore') {
    return {
      binary: 'pg_restore',
      args: [
        '--clean',
        '--if-exists',
        '--no-owner',
        '--no-privileges',
        '--exit-on-error',
        `--dbname=${restoreUrl}`,
        backupFile,
      ],
    };
  }
  throw new Error(`Unsupported restore tool: ${tool}`);
};
