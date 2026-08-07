const POSTGRES_PROTOCOLS = new Set(['postgres:', 'postgresql:']);
const MAINTENANCE_DATABASES = new Set(['postgres', 'template0', 'template1']);

function parseDatabaseUrl(value, label, errors) {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value);
    if (!POSTGRES_PROTOCOLS.has(url.protocol)) {
      errors.push(`${label} must use PostgreSQL.`);
      return null;
    }
    const databaseName = decodeURIComponent(url.pathname.replace(/^\//, '')).trim();
    if (!databaseName || databaseName.includes('/')) {
      errors.push(`${label} must name exactly one PostgreSQL database.`);
      return null;
    }
    return { url, databaseName };
  } catch {
    errors.push(`${label} must be a valid PostgreSQL connection URL.`);
    return null;
  }
}

export function validateMigrationEnvironment(environment, now = new Date()) {
  const errors = [];
  const application = parseDatabaseUrl(environment.DATABASE_URL, 'DATABASE_URL', errors);
  const direct = parseDatabaseUrl(environment.DIRECT_DATABASE_URL, 'DIRECT_DATABASE_URL', errors);
  const target = direct ?? application;
  const production = environment.NODE_ENV === 'production';

  if (!target) errors.push('DATABASE_URL or DIRECT_DATABASE_URL is required.');
  if (application && direct && application.databaseName !== direct.databaseName) {
    errors.push('DATABASE_URL and DIRECT_DATABASE_URL must target the same database name.');
  }

  let expectedConfirmation = '';
  if (target) {
    expectedConfirmation = `${target.url.host}/${target.databaseName}`;
    if (production && MAINTENANCE_DATABASES.has(target.databaseName.toLowerCase())) {
      errors.push(`Production migrations must not target the PostgreSQL maintenance database ${target.databaseName}.`);
    }
  }

  if (production && target) {
    const restoreTested = environment.BACKUP_RESTORE_TESTED === 'true';
    const verifiedAtText = environment.BACKUP_RESTORE_VERIFIED_AT || '';
    const maxAgeHours = Number(environment.BACKUP_MAX_AGE_HOURS || '24');
    const confirmation = environment.MIGRATION_CONFIRM_DATABASE || '';
    const verifiedAt = new Date(verifiedAtText);
    const ageMs = now.getTime() - verifiedAt.getTime();

    if (!restoreTested) errors.push('BACKUP_RESTORE_TESTED must be true after restoring and checking the latest backup.');
    if (!verifiedAtText || Number.isNaN(verifiedAt.getTime())) {
      errors.push('BACKUP_RESTORE_VERIFIED_AT must be a valid ISO-8601 timestamp.');
    } else if (ageMs < -5 * 60 * 1_000) {
      errors.push('BACKUP_RESTORE_VERIFIED_AT cannot be in the future.');
    } else if (!Number.isFinite(maxAgeHours) || maxAgeHours <= 0) {
      errors.push('BACKUP_MAX_AGE_HOURS must be a positive number.');
    } else if (ageMs > maxAgeHours * 60 * 60 * 1_000) {
      errors.push(`The restore-verified backup is older than the permitted ${maxAgeHours} hours.`);
    }

    if (confirmation !== expectedConfirmation) {
      errors.push(`MIGRATION_CONFIRM_DATABASE must exactly equal ${expectedConfirmation}.`);
    }
  }

  return {
    errors,
    targetUrl: target?.url.toString() ?? '',
    databaseName: target?.databaseName ?? '',
    expectedConfirmation,
  };
}
