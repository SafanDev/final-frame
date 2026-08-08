#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, extname, join, normalize, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const warnings = [];
const passes = [];
const skipLock = process.argv.includes('--skip-lockfile');

const text = (path) => readFileSync(join(root, path), 'utf8');
const json = (path) => JSON.parse(text(path));
const pass = (message) => passes.push(message);
const fail = (message) => failures.push(message);
const warn = (message) => warnings.push(message);

function assert(condition, message) {
  if (condition) pass(message);
  else fail(message);
}

function exactDependencyVersions(manifest, label) {
  for (const section of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    for (const [name, version] of Object.entries(manifest[section] ?? {})) {
      if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(String(version))) {
        fail(`${label} ${section}.${name} must use an exact version; found ${version}.`);
      }
    }
  }
}

function checkLockfile(manifestPath, lockPath, label) {
  const manifest = json(manifestPath);
  const lock = json(lockPath);
  const rootPackage = lock.packages?.[''];
  if (!rootPackage) {
    fail(`${label} lockfile has no root package entry.`);
    return;
  }
  for (const section of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    const expected = manifest[section] ?? {};
    const actual = rootPackage[section] ?? {};
    for (const [name, version] of Object.entries(expected)) {
      if (actual[name] !== version) fail(`${label} lockfile root ${section}.${name} is ${actual[name] ?? 'missing'}; expected ${version}.`);
      const installed = lock.packages?.[`node_modules/${name}`];
      if (!installed) fail(`${label} lockfile has no installed-package entry for ${name}.`);
      else if (installed.version !== version) fail(`${label} lockfile resolves ${name} to ${installed.version}; expected ${version}.`);
    }
    for (const name of Object.keys(actual)) {
      if (!(name in expected)) fail(`${label} lockfile root contains stale ${section}.${name}.`);
    }
  }
  if (!failures.some((item) => item.startsWith(`${label} lockfile`))) pass(`${label} lockfile matches its manifest.`);
}

function walk(directory, predicate, output = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (['.git', 'node_modules', '.next', 'dist', 'coverage', 'playwright-report', 'test-results', 'lighthouse-reports'].includes(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) walk(path, predicate, output);
    else if (predicate(path)) output.push(path);
  }
  return output;
}

function resolveLocalImport(sourceFile, specifier) {
  const base = specifier.startsWith('@/')
    ? join(root, 'final-frame-web', specifier.slice(2))
    : resolve(dirname(sourceFile), specifier);
  const stripped = base.replace(/\.(?:mjs|cjs|js)$/i, '');
  const candidates = [
    base,
    stripped,
    ...['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs', '.json'].map((extension) => `${stripped}${extension}`),
    ...['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs'].map((extension) => join(stripped, `index${extension}`)),
  ];
  return candidates.some((candidate) => existsSync(candidate) && statSync(candidate).isFile());
}

function checkRelativeImports() {
  const files = walk(root, (path) => ['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs'].includes(extname(path)));
  const importPattern = /(?:import|export)\s+(?:[^'";]*?\s+from\s+)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;
  let checked = 0;
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(importPattern)) {
      const specifier = match[1] ?? match[2];
      if (!specifier || (!specifier.startsWith('.') && !specifier.startsWith('@/'))) continue;
      checked += 1;
      if (resolveLocalImport(file, specifier)) continue;
      const normalized = normalize(specifier).replaceAll('\\', '/');
      if (normalized.includes('generated/prisma') || normalized.includes('.next/types') || normalized.includes('.next/dev/types')) continue;
      fail(`Unresolved handwritten import ${specifier} from ${relative(root, file)}.`);
    }
  }
  if (!failures.some((item) => item.startsWith('Unresolved handwritten import'))) pass(`${checked} handwritten local imports resolve.`);
}

function environmentKeysFromSchema(path) {
  const source = text(path);
  const keys = new Set();
  for (const match of source.matchAll(/^\s+([A-Z][A-Z0-9_]+):/gm)) keys.add(match[1]);
  return keys;
}

function environmentKeysFromExample(path) {
  const keys = new Set();
  for (const line of text(path).split(/\r?\n/)) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=/);
    if (match) keys.add(match[1]);
  }
  return keys;
}

function checkEnvironmentParity(schemaPaths, examplePath, label, allowedExtra = [], allowedMissing = []) {
  const schema = new Set(schemaPaths.flatMap((path) => [...environmentKeysFromSchema(path)]));
  const example = environmentKeysFromExample(examplePath);
  const missingAllowed = new Set(allowedMissing);
  for (const key of schema) if (!example.has(key) && !missingAllowed.has(key)) fail(`${label} .env.example is missing ${key}.`);
  const allowed = new Set(allowedExtra);
  for (const key of example) if (!schema.has(key) && !allowed.has(key)) warn(`${label} .env.example contains non-schema key ${key}.`);
  if (![...schema].some((key) => !example.has(key))) pass(`${label} environment schema is represented in .env.example (${schema.size} keys).`);
}

function checkMigrationSet() {
  const migrationsRoot = join(root, 'final-frame-api/prisma/migrations');
  const migrations = readdirSync(migrationsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const unique = new Set(migrations);
  const rehearsal = text('final-frame-api/scripts/rehearse-migrations.mjs');
  const baseline = rehearsal.match(/const baselineName = process\.env\.MIGRATION_REHEARSAL_BASELINE \|\| '([^']+)'/)?.[1] ?? '';
  const baselineIndex = migrations.indexOf(baseline);
  assert(unique.size === migrations.length, 'Prisma migration directory names are unique.');
  assert(migrations.length >= 6, `Prisma migration history contains ${migrations.length} ordered migrations.`);
  assert(baselineIndex >= 0 && baselineIndex < migrations.length - 1, 'Migration rehearsal baseline exists and precedes at least one upgrade migration.');
  for (const migration of migrations) {
    const sqlPath = join(migrationsRoot, migration, 'migration.sql');
    if (!existsSync(sqlPath) || readFileSync(sqlPath, 'utf8').trim().length === 0) fail(`Migration ${migration} has no non-empty migration.sql.`);
  }
  if (!failures.some((item) => item.startsWith('Migration '))) pass('Every migration contains non-empty SQL.');
}

function checkNoSensitiveGeneratedArtifacts() {
  const forbiddenDirectories = ['.next', 'dist', 'coverage', 'playwright-report', 'test-results', 'lighthouse-reports'];
  const forbiddenFiles = new Set(['id_rsa', 'id_ed25519']);
  const findings = [];

  function inspect(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue;
      const path = join(directory, entry.name);
      const rel = relative(root, path).replaceAll('\\', '/');
      if (entry.isDirectory()) {
        if (forbiddenDirectories.includes(entry.name) || rel.endsWith('/src/generated/prisma')) {
          findings.push(rel);
          continue;
        }
        inspect(path);
        continue;
      }
      const isRealEnvironment = entry.name.startsWith('.env') && !entry.name.endsWith('.example');
      const isPrivateKey = forbiddenFiles.has(entry.name) || /\.(?:pem|p12|pfx)$/i.test(entry.name);
      const isCompilerCache = /\.tsbuildinfo$/i.test(entry.name);
      if (isRealEnvironment || isPrivateKey || isCompilerCache) findings.push(rel);
    }
  }

  inspect(root);
  for (const finding of findings) fail(`Release source contains generated or sensitive artifact ${finding}.`);
  if (findings.length === 0) pass('Release source excludes real environment files, private keys, generated Prisma Client, builds and reports.');
}

function checkWebEnvironmentValidator() {
  const script = join(root, 'final-frame-web/scripts/validate-environment.mjs');
  const validEnvironment = {
    ...process.env,
    DEPLOYMENT_ENVIRONMENT: 'production',
    NEXT_PUBLIC_SITE_URL: 'https://app.finalframe.test',
    NEXT_PUBLIC_API_URL: 'https://app.finalframe.test/backend',
    NEXT_PUBLIC_STORAGE_ORIGIN: 'https://storage.finalframe.test',
    NEXT_PUBLIC_SITE_NAME: 'FinalFrame',
    NEXT_PUBLIC_RELEASE_VERSION: 'release-check',
    RELEASE_VERSION: 'release-check',
    API_URL: 'http://edge:8080/backend',
    NEXTAUTH_URL: 'https://app.finalframe.test',
    NEXTAUTH_SECRET: 'release-check-secret-with-more-than-thirty-two-characters',
    SESSION_COOKIE_NAME: '__Secure-next-auth.session-token',
  };
  const valid = spawnSync(process.execPath, [script], {
    cwd: join(root, 'final-frame-web'),
    env: validEnvironment,
    encoding: 'utf8',
  });
  if (valid.status !== 0) {
    fail(`Production web environment validator rejected the same-origin/private-service model: ${(valid.stderr || valid.stdout).trim()}`);
    return;
  }

  const invalid = spawnSync(process.execPath, [script], {
    cwd: join(root, 'final-frame-web'),
    env: { ...validEnvironment, NEXT_PUBLIC_API_URL: 'https://api.finalframe.test' },
    encoding: 'utf8',
  });
  if (invalid.status === 0) {
    fail('Production web environment validator accepted a separate browser API origin.');
    return;
  }
  pass('Production web environment validation accepts private HTTP server routing and rejects cross-origin browser API routing.');
}

const apiManifest = json('final-frame-api/package.json');
const webManifest = json('final-frame-web/package.json');
exactDependencyVersions(apiManifest, 'API');
exactDependencyVersions(webManifest, 'Web');
assert(apiManifest.engines?.node === '>=24 <25' && apiManifest.engines?.npm === '>=11', 'API runtime engines require Node 24 with npm 11 or newer; preinstall and release gates enforce npm 11.');
assert(webManifest.engines?.node === '>=24 <25' && webManifest.engines?.npm === '>=11', 'Web runtime engines require Node 24 with npm 11 or newer; preinstall and release gates enforce npm 11.');
assert(apiManifest.packageManager === 'npm@11.16.0' && webManifest.packageManager === 'npm@11.16.0', 'Both applications pin the npm 11.16.0 bundled with Node.js 24.18.0.');
assert(text('final-frame-api/.nvmrc').trim() === '24.18.0' && text('final-frame-web/.nvmrc').trim() === '24.18.0', 'Both applications pin Node.js 24.18.0 through .nvmrc.');
assert(text('final-frame-api/.npmrc') === text('final-frame-web/.npmrc'), 'Both applications enforce the same exact-install npm policy.');
assert(text('final-frame-api/.npmrc').includes('engine-strict=true') && text('final-frame-api/.npmrc').includes('save-exact=true'), 'npm configuration rejects unsupported engines and preserves exact dependency versions.');
assert(text('scripts/run-release-gates.mjs').includes("const expectedNode = '24.18.0'") && text('scripts/run-release-gates.mjs').includes("const expectedNpm = '11.16.0'"), 'Executable release gates require the exact Node.js and npm versions.');
assert(text('.github/workflows/ci.yml').includes('NODE_VERSION: 24.18.0'), 'CI pins Node.js 24.18.0.');
assert((text('final-frame-api/Dockerfile').match(/node:24\.18\.0/g) ?? []).length >= 3, 'API Docker stages pin Node.js 24.18.0.');
assert((text('final-frame-web/Dockerfile').match(/node:24\.18\.0/g) ?? []).length >= 3, 'Web Docker stages pin Node.js 24.18.0.');
assert(apiManifest.scripts?.['test:release-scripts'] === 'node --test scripts/*.test.mjs', 'API release-script regression tests are part of the manifest.');
assert(apiManifest.scripts?.verify?.includes('test:release-scripts'), 'API verification executes release-script regression tests.');
assert(text('.github/workflows/ci.yml').includes('npm run test:release-scripts'), 'CI executes migration and release-script regression tests.');
assert(
  apiManifest.scripts?.['test:core'] === 'node --experimental-strip-types --test src/config/*.test.ts src/services/*.test.ts'
    && apiManifest.scripts?.['typecheck:core'] === 'tsc -p tsconfig.core.json --noEmit'
    && text('.github/workflows/ci.yml').includes('Dependency-light security and workflow checks')
    && text('.github/workflows/ci.yml').includes('node --experimental-strip-types --test src/config/*.test.ts src/services/*.test.ts')
    && text('.github/workflows/ci.yml').includes('node --experimental-strip-types --test tests/core/*.test.ts'),
  'Dependency-light API and web security tests run before package installation.',
);
assert(
  text('final-frame-api/tsconfig.json').includes('"rewriteRelativeImportExtensions": true')
    && text('final-frame-api/src/services/project-workflow.ts').includes('export const PROJECT_STATUS')
    && !text('final-frame-api/src/services/project-workflow.ts').includes('generated/prisma'),
  'Core project workflow policy is executable without generated Prisma Client and compiles TS imports back to JavaScript.',
);

if (!skipLock) {
  checkLockfile('final-frame-api/package.json', 'final-frame-api/package-lock.json', 'API');
  checkLockfile('final-frame-web/package.json', 'final-frame-web/package-lock.json', 'Web');
} else {
  warn('Lockfile parity was skipped by request; this mode cannot approve a release.');
}

checkRelativeImports();
checkEnvironmentParity(
  ['final-frame-api/src/config/env.ts'],
  'final-frame-api/.env.example',
  'API',
  ['BACKUP_RESTORE_TESTED', 'BACKUP_RESTORE_VERIFIED_AT', 'BACKUP_MAX_AGE_HOURS', 'MIGRATION_CONFIRM_DATABASE'],
);
checkEnvironmentParity(
  ['final-frame-web/lib/env/server.ts', 'final-frame-web/lib/env/client.ts'],
  'final-frame-web/.env.example',
  'Web',
  ['E2E_EMAIL', 'E2E_PASSWORD', 'E2E_CLIENT_EMAIL', 'E2E_CLIENT_PASSWORD', 'E2E_ALLOW_MUTATIONS'],
  ['NODE_ENV'],
);
checkMigrationSet();
checkNoSensitiveGeneratedArtifacts();
checkWebEnvironmentValidator();

const assetSchema = text('final-frame-web/lib/api/schemas.ts').match(/export const assetSchema = z\.object\(\{([\s\S]*?)\n\}\);/)?.[1] ?? '';
assert(!/\b(?:fileUrl|storageKey|previewKey)\b/.test(assetSchema), 'Browser asset contracts expose no original or storage-object location.');
const secureUrlRoute = text('final-frame-api/src/routes/misc.routes.ts');
assert(
  secureUrlRoute.includes("input.purpose === 'download'")
    && secureUrlRoute.includes('/api/media/assets/')
    && secureUrlRoute.includes('streamPrivateObject')
    && secureUrlRoute.includes('assertCanDownloadOriginal')
    && secureUrlRoute.includes('asset.previewKey'),
  'Private media routes revalidate access and separate original downloads from review previews.',
);
assert(
  text('.env.production.example').includes('PUBLIC_API_URL=https://app.example.com/backend')
    && text('docker-compose.production.example.yml').includes('NEXT_PUBLIC_API_URL: ${PUBLIC_API_URL:?set PUBLIC_API_URL}')
    && text('deploy/Caddyfile').includes('uri strip_prefix /backend')
    && text('.github/workflows/ci.yml').includes('NEXT_PUBLIC_API_URL: http://127.0.0.1:3100/backend')
    && text('deploy/Caddyfile.ci').includes('reverse_proxy 127.0.0.1:5000'),
  'Production and CI browser API traffic stays on the application origin under /backend.',
);
assert(
  text('final-frame-web/proxy.ts').includes('NEXT_PUBLIC_STORAGE_ORIGIN')
    && !text('final-frame-web/proxy.ts').includes('https://*.r2.cloudflarestorage.com')
    && text('.github/workflows/ci.yml').includes('NEXT_PUBLIC_STORAGE_ORIGIN: http://127.0.0.1:9000')
    && text('.env.production.example').includes('PUBLIC_STORAGE_ORIGIN=https://account-id.r2.cloudflarestorage.com')
    && text('docker-compose.production.example.yml').includes('NEXT_PUBLIC_STORAGE_ORIGIN: ${PUBLIC_STORAGE_ORIGIN:?set PUBLIC_STORAGE_ORIGIN}'),
  'Browser CSP trusts only the configured private-storage origin, including disposable CI storage.',
);
assert(
  !text('final-frame-web/app/layout.tsx').includes('next/font/google'),
  'Web builds use a network-independent system font stack.',
);
assert(
  !text('final-frame-api/src/routes/asset.routes.ts').includes("router.post('/', requireAuth, uploadLimiter"),
  'Legacy ambiguous asset upload endpoint is removed.',
);
assert(
  text('final-frame-api/src/routes/asset.routes.ts').includes('/upload/multipart/refresh')
    && text('final-frame-api/src/services/upload-reservations.ts').includes('completeMultipartReservation')
    && text('final-frame-api/src/config/storage.ts').includes('CreateMultipartUploadCommand')
    && text('final-frame-web/lib/api/uploads.ts').includes('uploadMultipartReservation')
    && text('final-frame-api/prisma/schema.prisma').includes('multipartUploadId'),
  'Large uploads use resumable multipart transfer with persisted state, refresh, completion, and browser retry support.',
);
assert(
  text('final-frame-api/src/services/storage-cleanup.ts').includes('abortMultipartUpload')
    && text('final-frame-api/src/services/project-deletion.ts').includes('abortMultipartUpload'),
  'Expired reservations and deleted projects abort unfinished multipart uploads.',
);
assert(
  text('final-frame-api/prisma/schema.prisma').includes('storageKey        String\n')
    && !text('final-frame-api/prisma/schema.prisma').includes('@map(\"fileUrl\")')
    && text('final-frame-api/prisma/migrations/202607260000_world_class_hardening/migration.sql').includes('RENAME COLUMN \"fileUrl\" TO \"storageKey\"')
    && !text('final-frame-api/prisma/migrations/202607270000_asset_original_retirement/migration.sql').includes('asset.\"fileUrl\"'),
  'Prisma and migration history agree that Asset storage uses the physical storageKey column.',
);
assert(
  text('final-frame-api/Dockerfile').includes('poppler-utils')
    && text('final-frame-api/src/services/asset-processing.ts').includes('ASSET_PDF_MAX_PAGES')
    && text('final-frame-api/src/services/asset-processing.ts').includes('ASSET_VIDEO_MAX_DURATION_SECONDS'),
  'Asset processing enforces bounded PDF and media complexity before conversion.',
);
assert(
  text('final-frame-api/src/services/asset-processing.ts').includes("'-dSAFER'")
    && text('final-frame-api/Dockerfile').includes('ghostscript'),
  'PDF review derivatives run through Ghostscript safer mode in the processing image.',
);
assert(
  text('final-frame-api/src/services/asset-storage-footprint.ts').includes('const objectSizes = new Map<string, bigint>()')
    && text('final-frame-api/src/services/asset-storage-footprint.ts').includes('bytes > current')
    && text('final-frame-api/src/services/asset-storage-footprint.test.ts').includes('keeps the largest known size'),
  'Storage quota accounting counts each private object key once, even across malformed legacy references.',
);
assert(
  text('final-frame-api/src/services/project-access.ts').includes('deletionStatus: ProjectDeletionStatus.ACTIVE')
    && text('final-frame-api/src/services/project-access-policy.ts').includes("status !== PROJECT_DELETION_STATUS.ACTIVE")
    && text('final-frame-api/src/services/project-access-policy.test.ts').includes('PROJECT_DELETION_STATUS.DELETING'),
  'Private workspace access is revoked immediately when secure project deletion begins.',
);
assert(
  text('final-frame-api/src/services/asset-storage-footprint.ts').includes('getAssetsStorageFootprint')
    && text('final-frame-api/src/routes/asset.routes.ts').includes('getAssetsStorageFootprint(assets)')
    && text('final-frame-api/src/services/project-deletion.ts').includes('getAssetsStorageFootprint(assets)')
    && text('final-frame-api/src/services/asset-storage-footprint.test.ts').includes('across multiple asset rows'),
  'Batch deletion accounting deduplicates physical storage objects across asset rows.',
);
assert(
  text('final-frame-api/tsconfig.core.json').includes('"types": []')
    && text('final-frame-api/tsconfig.core.json').includes('src/types/core-node.d.ts')
    && text('final-frame-api/src/types/core-node.d.ts').includes("declare module 'node:crypto'"),
  'Focused core typechecking uses a dependency-light Node declaration surface.',
);
assert(
  text('final-frame-api/src/routes/auth.routes.ts').includes('buildRegistrationAcceptedResponse(emailVerificationRequired)')
    && text('final-frame-api/src/services/registration-privacy.ts').includes('next step is based only on deployment policy')
    && !text('final-frame-api/src/routes/auth.routes.ts').includes("response.status(201).json")
    && text('final-frame-web/lib/api/schemas.ts').includes('nextStep: z.enum(["VERIFY_EMAIL", "SIGN_IN"])')
    && !text('final-frame-web/lib/api/schemas.ts').match(/registerResponseSchema[^;]+user:/s),
  'Registration responses are uniform and disclose no account identity or existence state.',
);
assert(
  text('final-frame-api/src/routes/account.routes.ts').includes("router.post('/export'")
    && !text('final-frame-api/src/routes/account.routes.ts').includes("router.get('/export'")
    && text('final-frame-api/src/routes/account.routes.ts').includes('confirmSensitiveAccountOperation(transaction, account, input.password, input.mfaCode)')
    && text('final-frame-web/components/account/AccountActions.tsx').includes('downloadAccountExport')
    && !text('final-frame-web/components/account/AccountActions.tsx').includes('exportUrl'),
  'Account exports require password and MFA step-up instead of only a live session.',
);
assert(
  text('final-frame-api/src/services/outbox-cancellation.ts').includes('payload: { cancelled: true }')
    && text('final-frame-api/src/routes/project.routes.ts').includes('cancelOutboxByPayloadReference')
    && text('final-frame-api/src/routes/auth.routes.ts').includes('cancelOutboxByPayloadReference')
    && text('final-frame-api/src/routes/account.routes.ts').includes("lastError: 'The account was deleted before this message was delivered.'"),
  'Revoked and superseded invitation or account-security emails have secret-bearing payloads scrubbed.',
);
assert(
  text('final-frame-api/src/routes/account.routes.ts').includes('OR: [{ createdById: account.id }, { invitedEmail: account.email }]')
    && text('final-frame-api/src/routes/account.routes.ts').includes('invitation.deliveryStatus !== EmailDeliveryStatus.SENT')
    && text('final-frame-api/src/routes/project.routes.ts').includes('deliveryStatus === EmailDeliveryStatus.SENT')
    && text('final-frame-api/src/routes/project.routes.ts').includes('EmailDeliveryStatus.CANCELLED'),
  'Account deletion and invitation lifecycle changes revoke pending links while preserving truthful SENT delivery history.',
);
assert(
  text('final-frame-api/src/services/email-outbox.ts').includes('where: { id: payload.invitationId }')
    && text('final-frame-api/src/services/email-outbox.ts').includes('Delivered after link invalidation; the action link was already unusable.')
    && text('final-frame-api/src/services/email-outbox.ts').includes('actionInvalidated: true'),
  'Provider-confirmed deliveries remain auditable even when revocation wins the outbox lock race; the delivered link remains invalid.',
);
assert(
  text('final-frame-web/lib/api/download.ts').includes('safeDownloadName')
    && text('final-frame-web/lib/api/download-name.ts').includes(String.raw`replace(/[\\/\u0000-\u001F\u007F]/gu`)
    && text('final-frame-web/tests/core/download-name.test.ts').includes('traversal runs'),
  'Downloaded evidence and account exports sanitize server-provided file names.',
);

assert(
  text('final-frame-api/prisma/schema.prisma').includes('originalRetiredAt DateTime?')
    && text('final-frame-api/prisma/migrations/202607270000_asset_original_retirement/migration.sql').includes('asset."storageKey"')
    && text('final-frame-api/prisma/migrations/202607270000_asset_original_retirement/migration.sql').includes('Asset_originalRetired_requires_rejected')
    && text('final-frame-api/src/services/storage-reconciliation.ts').includes('CASE WHEN a."originalRetiredAt" IS NULL')
    && text('final-frame-api/src/routes/asset.routes.ts').includes('getAssetsStorageFootprint')
    && text('final-frame-api/src/services/project-deletion.ts').includes('getAssetsStorageFootprint'),
  'Retired unsafe originals are excluded consistently from required objects, deletion queues, and quota accounting.',
);
assert(
  text('.github/workflows/ci.yml').includes('minio/minio:RELEASE.2025-05-24T17-08-30Z')
    && text('.github/workflows/ci.yml').includes('clamav/clamav:1.4.3')
    && text('.github/workflows/ci.yml').includes('npm run e2e:storage:prepare')
    && text('final-frame-web/tests/e2e/authenticated.spec.ts').includes('/assets/upload/start')
    && text('final-frame-web/tests/e2e/authenticated.spec.ts').includes('/assets/upload/complete')
    && text('final-frame-web/tests/e2e/authenticated.spec.ts').includes('/download')
    && text('final-frame-web/tests/e2e/authenticated.spec.ts').includes('/certificate'),
  'CI models the real private upload, scan, preview, locked-original, and approval-evidence workflow.',
);
const signedUrlCache = text('final-frame-web/lib/storage/signed-url-cache.ts');
assert(
  signedUrlCache.includes('cacheGeneration')
    && signedUrlCache.includes('assetInvalidationVersions')
    && !signedUrlCache.includes('requestSecureAssetUrl(assetId, purpose, options.signal)')
    && !signedUrlCache.includes('requestCommentAudioUrl(projectId, assetId, commentId, options.signal)'),
  'Shared signed-URL requests are consumer-abort-safe and late responses cannot repopulate invalidated caches.',
);
assert(
  !text('final-frame-web/components/PdfEngine.tsx').includes('Promise.all(Array.from({ length: document.numPages }'),
  'PDF page metadata is loaded lazily instead of eagerly across the full document.',
);


assert(
  text('final-frame-api/src/middleware/request-context.ts').includes("request.header('traceparent')")
    && text('final-frame-api/src/services/trace-context.ts').includes('createTraceContext')
    && text('final-frame-web/lib/api/client.ts').includes('createBrowserTraceparent')
    && text('final-frame-api/src/services/ai-summary.ts').includes('traceparent'),
  'Validated W3C trace context correlates browser requests, API handling, AI calls, and delivery logs.',
);
assert(
  text('final-frame-api/prisma/schema.prisma').includes('notificationDelivery      NotificationDeliveryMode')
    && text('final-frame-api/src/services/notification-delivery-core.ts').includes('getNextDigestSchedule')
    && text('final-frame-api/src/services/email-outbox.ts').includes("mode === 'DAILY_DIGEST'")
    && text('final-frame-api/src/routes/account.routes.ts').includes("router.patch('/preferences'")
    && text('final-frame-web/components/account/AccountPreferences.tsx').includes('value="DAILY_DIGEST"'),
  'Notification delivery preferences support immediate email, time-zone-aware daily digests, and in-app-only delivery.',
);
assert(
  !text('final-frame-api/prisma/schema.prisma').includes('enum Role {')
    && !text('final-frame-api/src/routes/auth.routes.ts').includes('role:')
    && !text('final-frame-web/components/auth/RegisterForm.tsx').includes('setRole')
    && text('final-frame-api/src/routes/project.routes.ts').includes('ownerId: user.id'),
  'Registration creates a neutral account and each project creator becomes that project owner.',
);
assert(
  !text('final-frame-api/prisma/schema.prisma').includes('model Organization {')
    && !text('final-frame-api/prisma/schema.prisma').includes('model OrganizationMember {')
    && !text('final-frame-api/prisma/schema.prisma').includes('organizationId')
    && !text('final-frame-api/prisma/schema.prisma').includes('enum AccountPlan {')
    && !text('final-frame-api/src/services/quotas.ts').includes('AccountPlan')
    && text('final-frame-api/src/services/quotas.ts').includes('FROM "User"')
    && text('final-frame-api/src/services/storage-reconciliation.ts').includes('u."storageUsedBytes"')
    && text('final-frame-api/src/services/project-deletion.ts').includes('UPDATE \"User\"'),
  'Project owners are the authoritative project, storage, and AI usage boundary without a plan bypass.',
);
assert(
  text('final-frame-api/src/config/env.ts').includes('GLOBAL_MAX_PROJECTS')
    && text('final-frame-api/src/config/env.ts').includes('GLOBAL_MAX_STORAGE_BYTES')
    && text('final-frame-api/src/services/quotas.ts').includes('pg_advisory_xact_lock')
    && text('final-frame-api/src/services/quotas.ts').includes('globalReservedBytes')
    && text('final-frame-api/src/services/quotas.ts').includes('SERVICE_STORAGE_LIMIT_REACHED')
    && text('final-frame-api/src/services/quota-policy-core.test.ts').includes('pending reservations'),
  'App-wide project and storage ceilings are serialized and include pending uploads.',
);
assert(
  !existsSync(join(root, 'final-frame-api/src/routes/organization.routes.ts'))
    && !existsSync(join(root, 'final-frame-api/src/services/organization-policy-core.ts'))
    && !existsSync(join(root, 'final-frame-web/app/organizations/page.tsx'))
    && !text('final-frame-web/proxy.ts').includes('"/organizations"')
    && text('final-frame-api/src/services/project-access.ts').includes('ownerId: userId')
    && text('final-frame-api/src/services/project-access.ts').includes('members: { some: { userId } }'),
  'Access is limited to the project owner and accepted project members without an organization administration layer.',
);
assert(
  !text('final-frame-web/components/dashboard/ProjectFormDialog.tsx').includes('project-organization')
    && !text('final-frame-api/src/routes/project.routes.ts').includes('organizationId_userId')
    && text('final-frame-api/src/routes/project.routes.ts').includes('await requireProjectCapacity(transaction, user.id)')
    && text('final-frame-api/src/routes/project.routes.ts').includes('ownerId: user.id'),
  'Project creation assigns ownership and quota accounting directly to the signed-in user.',
);

assert(
  text('final-frame-api/src/routes/notification.routes.ts').includes("router.post('/read-all'")
    && text('final-frame-api/src/routes/notification.routes.ts').includes('unreadCount')
    && text('final-frame-web/app/notifications/page.tsx').includes('NotificationInbox')
    && text('final-frame-web/proxy.ts').includes('"/notifications"')
    && text('final-frame-web/components/navigation/AccountNavigation.tsx').includes('href="/notifications"'),
  'Authenticated notification inbox exposes unread state, stable pagination, and read controls.',
);


assert(
  ['privacy', 'terms', 'security', 'support'].every((route) => existsSync(join(root, `final-frame-web/app/${route}/page.tsx`)))
    && text('final-frame-web/components/Footer.tsx').includes('Trust and support')
    && text('final-frame-web/app/layout.tsx').includes('<Footer />')
    && text('final-frame-web/app/sitemap.ts').includes('["privacy", "terms", "security", "support"]'),
  'Public trust, privacy, security, terms, and operator-aware support surfaces are linked and indexed.',
);
assert(
  text('final-frame-web/hooks/useVoiceRecorder.ts').includes('options?.transcribe === true')
    && text('final-frame-web/components/feedback/VoiceRecorderControl.tsx').includes('recorder.start({ transcribe: false })')
    && !text('final-frame-web/components/feedback/VoiceRecorderControl.tsx').includes('Enable browser live transcription')
    && !text('final-frame-web/components/feedback/VoiceRecorderControl.tsx').includes('speech-service provider may process spoken audio'),
  'Voice recording remains available while browser speech transcription stays out of the primary review flow.',
);
assert(
  text('final-frame-web/lib/workspace/canvas-viewport-core.ts').includes('calculateFitScale')
    && text('final-frame-web/components/workspace/CanvasArea.tsx').includes('scaleFromPinch')
    && text('final-frame-web/styles/workspace.css').includes('touch-action: none')
    && text('final-frame-web/tests/core/canvas-viewport.test.ts').includes('contain fit uses both available width and height'),
  'Canvas fit computes actual containment and touch users can pan and pinch within bounded zoom limits.',
);
assert(
  text('final-frame-web/lib/realtime/contracts.ts').includes('assetId: string;')
    && text('final-frame-api/src/realtime/socket-server.ts').includes('assetId: z.string().cuid()')
    && text('final-frame-web/components/workspace/RemoteCursorLayer.tsx').includes('cursor.assetId === assetId')
    && !text('final-frame-web/components/workspace/RemoteCursorLayer.tsx').includes('100}vw'),
  'Remote cursors are scoped and normalized to the active asset surface instead of each browser viewport.',
);
assert(
  text('final-frame-web/components/viewers/CodeViewer.tsx').includes('VirtualCodePreview')
    && text('final-frame-web/components/viewers/CodeViewer.tsx').includes('visibleLines')
    && text('final-frame-web/components/viewers/CodeViewer.tsx').includes('credentials: "include"')
    && !text('final-frame-web/components/viewers/CodeViewer.tsx').includes('<code>{content}</code>'),
  'Large source previews virtualize visible lines and preserve authenticated same-origin streaming.',
);


assert(
  text('final-frame-web/lib/workspace/asset-merge-core.ts').includes('mergeAssetsByFreshness')
    && text('final-frame-web/lib/workspace/asset-merge-core.ts').includes('tombstones.stacks')
    && text('final-frame-web/components/workspace/AssetSidebar.tsx').includes('deletedAssetTombstonesRef')
    && text('final-frame-web/components/workspace/AssetSidebar.tsx').includes('deletedStackTombstonesRef')
    && text('final-frame-web/contexts/WorkspaceContext.tsx').includes('mergeAssetsByFreshness')
    && text('final-frame-web/tests/core/asset-merge.test.ts').includes('older pagination responses cannot overwrite'),
  'Asset pagination uses timestamp-aware merging and deletion tombstones so stale responses cannot restore deleted or older versions.',
);
assert(
  text('final-frame-web/lib/feedback/anchor-core.ts').includes('resolveFeedbackAnchor')
    && text('final-frame-web/components/feedback/CommentComposer.tsx').includes('resolveFeedbackAnchor')
    && text('final-frame-web/components/PdfEngine.tsx').includes('data-pdf-page')
    && text('final-frame-web/components/viewers/CodeViewer.tsx').includes('data-code-line')
    && text('final-frame-web/components/workspace/CanvasArea.tsx').includes('pendingLineRange')
    && text('final-frame-web/tests/core/feedback-anchor.test.ts').includes('PDF feedback keeps page-local coordinates'),
  'Image, PDF, video, source-code, and general feedback preserve media-specific anchors from the browser through the API contract.',
);
assert(
  text('final-frame-web/components/feedback/CommentComposer.tsx').includes('saveFeedbackDraft(currentUserId')
    && text('final-frame-web/components/feedback/CommentComposer.tsx').includes('loadFeedbackDraft(currentUserId')
    && text('final-frame-web/lib/workspace/review-session.ts').includes(':draft:${userId}:${projectId}:${assetId}:${kind}')
    && text('final-frame-web/tests/unit/review-session.test.ts').includes('restores and clears feedback drafts per file and mode'),
  'Written feedback drafts are user-scoped and recover within the active browser tab.',
);
assert(
  text('final-frame-web/components/workspace/WorkspaceNavigationGuard.tsx').includes('beforeunload')
    && text('final-frame-web/hooks/useFileUpload.ts').includes('setWorkspaceWorkflowBlocker')
    && text('final-frame-web/components/feedback/VoiceRecorderControl.tsx').includes('setWorkspaceWorkflowBlocker')
    && text('final-frame-web/components/workspace/WorkspaceShell.tsx').includes('<WorkspaceNavigationGuard />'),
  'Workspace navigation protects in-progress uploads and unposted voice notes without blocking recoverable text drafts.',
);
assert(
  text('final-frame-web/components/workspace/AssetSidebar.tsx').includes('type="file" multiple')
    && text('final-frame-web/components/workspace/AssetSidebar.tsx').includes('onDrop={handleDrop}')
    && text('final-frame-web/components/workspace/AssetSidebar.tsx').includes('processUploadBatch')
    && text('final-frame-web/components/workspace/AssetSidebar.tsx').includes('closeMobileSidebars()'),
  'Files support multi-select and panel-scoped drag/drop uploads while mobile selection returns users to the canvas.',
);
assert(
  text('final-frame-web/components/workspace/CanvasArea.tsx').includes('saveReviewViewState')
    && text('final-frame-web/components/workspace/CanvasArea.tsx').includes('loadPendingFeedbackAnchor')
    && text('final-frame-web/contexts/WorkspaceContext.tsx').includes('loadLastActiveAssetId')
    && text('final-frame-web/contexts/WorkspaceContext.tsx').includes('loadWorkspaceChromeMemory'),
  'Review continuity restores the active file, viewport, pending pin, and workspace panel layout within the tab.',
);
assert(
  text('final-frame-web/components/workspace/WorkspaceHeader.tsx').includes('saveTitleRename')
    && text('final-frame-web/components/workspace/WorkspaceHeader.tsx').includes('saveFileRename')
    && text('final-frame-web/components/workspace/WorkspaceHeader.tsx').includes('renameAssetStack')
    && text('final-frame-web/components/workspace/WorkspaceHeader.tsx').includes('aria-keyshortcuts="Enter Escape"'),
  'Owners can quickly rename the project or active file from the workspace header with keyboard-safe controls.',
);
assert(
  text('final-frame-web/lib/workspace/review-navigation.ts').includes('buildFeedbackDeepLink')
    && text('final-frame-web/contexts/WorkspaceContext.tsx').includes('parseFeedbackDeepLink')
    && text('final-frame-web/components/feedback/CommentCard.tsx').includes('Feedback link copied.')
    && text('final-frame-web/tests/unit/review-navigation.test.ts').includes('notification-style asset/comment links'),
  'Individual feedback supports durable project/file deep links and clipboard sharing.',
);
assert(
  text('final-frame-web/components/workspace/CanvasArea.tsx').includes('handleFileShortcut')
    && text('final-frame-web/components/workspace/CanvasArea.tsx').includes('window.addEventListener("keydown", handleFileShortcut, true)')
    && text('final-frame-web/components/workspace/FeedbackSidebar.tsx').includes('navigateOpenFeedback')
    && text('final-frame-web/components/workspace/CanvasShortcuts.tsx').includes('J / K'),
  'Review keyboard navigation changes files globally with Alt+Left/Right and cycles open feedback with J/K.',
);
assert(
  text('final-frame-web/components/feedback/CommentComposer.tsx').includes('Offline — your text draft is safe.')
    && text('final-frame-web/components/workspace/WorkspaceShell.tsx').includes('Reconnect to post, upload, or change review state.')
    && text('final-frame-web/components/workspace/AssetSidebar.tsx').includes('canStartUpload = canUpload && isOnline'),
  'Offline review keeps recoverable drafts available while server-backed mutations are clearly gated.',
);
assert(
  text('final-frame-web/components/feedback/CommentComposer.tsx').includes('buildOptimisticComment')
    && text('final-frame-web/components/workspace/CanvasArea.tsx').includes('handleOptimisticSettled')
    && text('final-frame-web/lib/workspace/state.ts').includes('replaceWorkspaceComment')
    && text('final-frame-web/tests/unit/optimistic-feedback.test.ts').includes('immediately renderable text comment'),
  'Text feedback and pins render immediately while server persistence settles in the background with rollback support.',
);
assert(
  !text('final-frame-web/components/workspace/WorkspaceHeader.tsx').includes('ff-workspace-refresh-dot')
    && !text('final-frame-web/contexts/WorkspaceContext.tsx').includes('setIsRefreshing')
    && text('final-frame-web/components/workspace/AssetSidebar.tsx').includes('processingStatus: "PROCESSING"'),
  'Background workspace reconciliation stays visually silent while retry and final-file actions update locally first.',
);
assert(
  text('final-frame-web/components/feedback/CommentDeleteDialog.tsx').includes('onDeleted(target)')
    && text('final-frame-web/components/feedback/CommentDeleteDialog.tsx').includes('onFailed(target')
    && text('final-frame-web/components/feedback/CommentCard.tsx').includes('onUpdated(optimistic, false)')
    && text('final-frame-web/components/feedback/CommentCard.tsx').includes('onResolved(comment.assetId, comment.id, next, false)'),
  'High-frequency feedback edit, resolution, and deletion interactions update immediately and roll back failed mutations.',
);

assert(
  text('final-frame-web/components/AuthProvider.tsx').includes('UserPreferencesProvider')
    && text('final-frame-web/components/account/AccountPreferences.tsx').includes('publishUserFormattingPreferences')
    && text('final-frame-web/contexts/UserPreferencesContext.tsx').includes('profile.timeZone')
    && text('final-frame-web/components/feedback/ActivityTimeline.tsx').includes('formatDateTime(entry.createdAt, preferences)')
    && text('final-frame-web/components/notifications/NotificationInbox.tsx').includes('formatDateTime(item.createdAt, preferences)')
    && text('final-frame-web/components/dashboard/ProjectCard.tsx').includes('formatRelativeDate(project.updatedAt, preferences)')
    && text('final-frame-web/tests/core/format-preferences.test.ts').includes('saved time zone'),
  'Saved locale and IANA time-zone preferences drive timestamps across account, project, review, invitation, activity, and notification surfaces.',
);


assert(
  text('final-frame-web/vitest.config.mts').includes('coverage/product')
    && text('final-frame-web/vitest.config.mts').includes('app/**/*.{ts,tsx}')
    && text('final-frame-web/vitest.critical.config.mts').includes('coverage/critical')
    && text('final-frame-web/vitest.critical.config.mts').includes('thresholds')
    && webManifest.scripts?.['test:coverage']?.includes('test:coverage:report')
    && webManifest.scripts?.['test:coverage']?.includes('test:coverage:critical'),
  'Frontend coverage publishes an honest product-wide report and enforces a separate critical-module threshold.',
);
assert(
  webManifest.scripts?.lighthouse?.includes('lighthouse:desktop')
    && webManifest.scripts?.lighthouse?.includes('lighthouse:mobile')
    && text('final-frame-web/.lighthouserc.mobile.cjs').includes('formFactor: "mobile"')
    && text('final-frame-web/performance-budgets.json').includes('maxGzipBytes')
    && text('final-frame-web/performance-budgets.json').includes('review workspace')
    && text('final-frame-web/scripts/check-bundle-budget.mjs').includes('app-build-manifest.json')
    && text('final-frame-web/tests/core/bundle-budget.test.ts').includes('compressed and raw bundle ceilings'),
  'Performance gates cover desktop and throttled mobile Lighthouse plus compressed, route-specific bundle ceilings.',
);
assert(
  text('final-frame-web/lib/security/csp-core.ts').includes("style-src-elem 'self'")
    && text('final-frame-web/lib/security/csp-core.ts').includes("style-src-attr 'unsafe-inline'")
    && !text('final-frame-web/lib/security/csp-core.ts').includes("style-src 'self' 'unsafe-inline'")
    && text('final-frame-web/proxy.ts').includes('createContentSecurityPolicy')
    && text('final-frame-web/tests/core/csp.test.ts').includes('style elements require a request nonce'),
  'CSP requires nonces for style elements and confines unavoidable inline compatibility to style attributes.',
);
assert(
  text('final-frame-web/lib/security/hsts-core.ts').includes('domainControlConfirmed')
    && text('final-frame-web/next.config.ts').includes('HSTS_DOMAIN_CONTROL_CONFIRMED')
    && text('final-frame-web/lib/env/server.ts').includes('HSTS_SCOPE')
    && text('final-frame-web/docs/DEPLOYMENT.md').includes('HSTS scope governance')
    && text('final-frame-web/tests/core/hsts.test.ts').includes('domain governance'),
  'HSTS defaults to host-only and rejects subdomain/preload scope without explicit domain-wide governance.',
);

assert(
  !text('final-frame-api/src/scripts/seed-e2e.ts').includes('Organization')
    && text('final-frame-api/src/scripts/seed-e2e.ts').includes('upsertE2eUser')
    && (text('final-frame-web/tests/e2e/authenticated.spec.ts').match(/data: \{ title, description:/g) ?? []).length >= 2
    && text('final-frame-web/tests/e2e/accessibility.spec.ts').includes('data: { title, description:')
    && text('final-frame-web/tests/e2e/accessibility.spec.ts').includes('review workspace has no automated WCAG A/AA violations')
    && text('final-frame-web/tests/e2e/accessibility.spec.ts').includes('E2E_ALLOW_MUTATIONS=true for workspace accessibility coverage'),
  'Disposable CI seeds neutral accounts, exercises project-owned creation, and audits the core review workspace for WCAG A/AA.',
);
assert(
  text('final-frame-api/src/routes/metrics.routes.ts').includes('collectOperationalMetrics')
    && text('final-frame-api/src/services/operational-metrics-core.ts').includes('finalframe_storage_deletion_tasks')
    && text('final-frame-api/src/services/operational-metrics-core.ts').includes('finalframe_operational_snapshot_success')
    && text('final-frame-api/src/services/operational-metrics.test.ts').includes('operational queue metrics')
    && text('docs/DATA_RETENTION.md').includes('Storage deletion failures')
    && text('final-frame-web/docs/OPERATIONS-RUNBOOK.md').includes('finalframe_project_deletions'),
  'Private metrics expose durable cleanup queue state and the repository documents application and operator-owned retention policy.',
);
assert(
  text('final-frame-web/Dockerfile').includes('ARG HSTS_SCOPE=host')
    && text('final-frame-web/Dockerfile').includes('HSTS_DOMAIN_CONTROL_CONFIRMED=$HSTS_DOMAIN_CONTROL_CONFIRMED')
    && text('docker-compose.production.example.yml').includes('HSTS_SCOPE: ${HSTS_SCOPE:-host}')
    && text('final-frame-web/docker-compose.production.example.yml').includes('HSTS_MAX_AGE_SECONDS: ${HSTS_MAX_AGE_SECONDS:-15552000}'),
  'Documented HSTS governance is carried into production builds and runtime examples instead of being a runtime-only no-op.',
);

console.log(`FinalFrame static release check: ${passes.length} passed, ${warnings.length} warning(s), ${failures.length} failure(s).`);
for (const message of passes) console.log(`PASS  ${message}`);
for (const message of warnings) console.warn(`WARN  ${message}`);
for (const message of failures) console.error(`FAIL  ${message}`);
if (failures.length > 0) process.exit(1);
