# Release validation

Use Node.js 24.18.0 and npm 11.16.0.

## Readiness definitions

A clean repository can be considered **source-ready / deployment-ready** after the source, API, web and CI gates below pass. **Deployment approval** is a separate operational state and requires the staging/domain, backup-restore, load/SLO and operator checks against the actual hosting environment. Publishing the repository does not require operating a public production service.

## Source checks

```bash
node scripts/release-static-check.mjs
```

## API checks

```bash
cd final-frame-api
npm ci
npm run check
npm run build
```

## Web checks

```bash
cd final-frame-web
npm ci
npm run verify
npm run test:e2e
npm run lighthouse
```

The authenticated E2E suite must prove wrong-account invitation rejection, one-time invitation consumption, cross-tenant API denial, cross-tenant Socket.IO join denial, removal from realtime access, locked-original denial, safe derivative access, Client approval and signed evidence. HTTPS staging also verifies the session cookie remains HttpOnly, Lax, Secure and host-only.

## Production-like staging checks

Use the same public-origin pattern intended for release: web routes plus `/backend` API and Socket.IO on one HTTPS hostname.

```bash
cd final-frame-api
DEPLOYED_BASE_URL=https://staging.example.com npm run ops:verify-deployed-security
LOAD_TEST_BASE_URL=https://staging.example.com npm run ops:load-slo
npm run ops:dead-letter -- --action=list --require-empty=true
```

The deployed-security probe checks production response headers, CSP/HSTS, private-route cache/indexing controls, untrusted CORS behavior and cross-site mutation rejection. The load probe is GET-only and enforces the configured request-count, p95 and error-rate SLO.

## Backup restore drill

Restore the latest real backup into a disposable database with PostgreSQL client tools installed:

```bash
cd final-frame-api
RESTORE_DRILL_SOURCE_DATABASE_URL="$DATABASE_URL" \
RESTORE_DRILL_DATABASE_URL="postgresql://.../finalframe_restore" \
RESTORE_DRILL_BACKUP_FILE="/secure/path/latest.dump" \
RESTORE_DRILL_CONFIRM=true \
RESTORE_DRILL_CONFIRM_DATABASE=finalframe_restore \
npm run ops:restore-drill
```

Only after the drill succeeds may `BACKUP_RESTORE_TESTED=true` and `BACKUP_RESTORE_VERIFIED_AT=<verifiedAt>` be used for the production migration preflight.

## Manual checks

Confirm registration, sign-in, MFA, password change, project creation, copied invite links, file upload, safe preview, comments, review status changes, approval evidence, account export and account deletion.

When email is disabled, confirm that reset and verification actions are hidden and that no email job is created. When AI/transcription is enabled, confirm the deployed privacy disclosure and workspace consent controls match the configured providers.

## Final checks

- no real `.env` file is included
- no build output, test report or local log is included
- migrations are complete and in order
- public routes contain no private file URL
- latest database/storage backup has been restored and checked
- email and storage dead-letter queues are empty or every item has an operator disposition
- staging load/SLO and deployed security checks pass
- authenticated accessibility/browser suites have no skipped critical path in CI
- privacy, retention, AI and transcription disclosures match the enabled runtime behavior
- configured limits and provider billing alerts are set
