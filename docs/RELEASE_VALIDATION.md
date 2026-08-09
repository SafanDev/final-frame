# Release validation

Use Node.js `24.18.0` and npm `11.16.0`.

A clean repository can be treated as source-ready after the source, API, web, and CI checks pass. A real deployment still needs the staging, restore, load, and operator checks for the chosen hosting environment.

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

The authenticated browser tests cover invitation rules, cross-project access, private-file access, realtime joins, approval flow, and signed approval evidence.

## Production-like staging checks

Use one HTTPS public origin for the web app, `/backend` API routes, and Socket.IO.

```bash
cd final-frame-api
DEPLOYED_BASE_URL=https://staging.example.com npm run ops:verify-deployed-security
LOAD_TEST_BASE_URL=https://staging.example.com npm run ops:load-slo
npm run ops:dead-letter -- --action=list --require-empty=true
```

These checks cover deployed security headers, private-route behavior, CORS/cross-site protection, basic read-only load, and unresolved email/storage dead letters.

## Backup restore drill

Restore a real backup into a disposable PostgreSQL database before using backup-restore evidence for a production migration.

```bash
cd final-frame-api
RESTORE_DRILL_SOURCE_DATABASE_URL="$DATABASE_URL" \
RESTORE_DRILL_DATABASE_URL="postgresql://.../finalframe_restore" \
RESTORE_DRILL_BACKUP_FILE="/secure/path/latest.dump" \
RESTORE_DRILL_CONFIRM=true \
RESTORE_DRILL_CONFIRM_DATABASE=finalframe_restore \
npm run ops:restore-drill
```

Only after a successful drill should `BACKUP_RESTORE_TESTED=true` and `BACKUP_RESTORE_VERIFIED_AT=<verifiedAt>` be used.

## Manual checks

Confirm registration, sign-in, MFA, password change, project creation, invitations, upload, preview, feedback, review status, approval, export, and account deletion.

If email, AI summaries, or transcription are enabled, confirm the related settings and privacy text match the providers in use.

## Final checks

- no real `.env` files, build output, test reports, or local logs are included
- migrations are complete and ordered
- private files are not exposed through public URLs
- backup restore has been tested for the target environment
- email and storage dead letters are empty or reviewed
- staging security and load checks pass
- browser and accessibility checks pass
- provider limits and billing alerts are configured where needed
