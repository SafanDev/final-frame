# Operations

## Daily checks

Check API readiness, Redis, database connections, ClamAV, storage access and background queues.

Important queue metrics include:

- `finalframe_project_deletions`
- `finalframe_storage_deletion_tasks`
- `finalframe_email_outbox_messages` when email is enabled
- preview-processing failures and worker success timestamps

Any `status="ABANDONED"` email or storage series is a dead letter and must be investigated. Prometheus rules alert on both queues.

## Dead-letter inspection and replay

List dead letters without changing data:

```bash
cd final-frame-api
npm run ops:dead-letter -- --action=list --require-empty=true
```

If the command returns an abandoned item, investigate the provider/storage failure first. Replay only one reviewed item at a time and confirm its exact identifier:

```bash
npm run ops:dead-letter -- --action=replay --kind=email --id=<id> --confirm=<id>
npm run ops:dead-letter -- --action=replay --kind=storage --id=<id> --confirm=<id>
```

Replay resets automatic-attempt accounting and schedules the durable worker to try again. It does not directly send email or delete an object from the operator process.

## Backup restore drill

A production migration is not approved by merely setting the backup evidence variables. Perform a real restore into a disposable PostgreSQL database first. The drill refuses to target the source database and requires exact target confirmation.

```bash
cd final-frame-api
RESTORE_DRILL_SOURCE_DATABASE_URL="$DATABASE_URL" \
RESTORE_DRILL_DATABASE_URL="postgresql://.../finalframe_restore" \
RESTORE_DRILL_BACKUP_FILE="/secure/path/latest.dump" \
RESTORE_DRILL_CONFIRM=true \
RESTORE_DRILL_CONFIRM_DATABASE=finalframe_restore \
npm run ops:restore-drill
```

Record the emitted `verifiedAt` timestamp, then set `BACKUP_RESTORE_TESTED=true` and `BACKUP_RESTORE_VERIFIED_AT` to that real drill time for the release migration. Never restore a drill backup over the source database.

## Staging security and SLO checks

Verify the public security boundary against the exact staging hostname:

```bash
DEPLOYED_BASE_URL=https://staging.example.com npm run ops:verify-deployed-security
```

Run the safe GET-only SLO probe against the same origin:

```bash
LOAD_TEST_BASE_URL=https://staging.example.com \
LOAD_TEST_DURATION_SECONDS=60 \
LOAD_TEST_CONCURRENCY=8 \
LOAD_TEST_P95_MS=2000 \
LOAD_TEST_MAX_ERROR_RATE=0.01 \
npm run ops:load-slo
```

The default paths exercise the public page, web health and API liveness route. For an authenticated staging run, add an authorized read-only path such as `/backend/api/projects?limit=25` to `LOAD_TEST_PATHS` and provide a short-lived staging-only cookie with `LOAD_TEST_COOKIE`. Never put production cookies in shell history or CI logs.

## Common problems

### Sign-in fails

Check the shared session secret, cookie name, public URL, API route and system time.

### Upload fails

Check storage keys, bucket access, upload size limits, ClamAV and preview worker logs.

### Realtime updates stop

Check Redis, Socket.IO routing, proxy timeouts and connection limits. Cross-tenant Socket.IO joins are expected to emit `PROJECT_ACCESS_DENIED`.

### A delete stays pending

Check the project deletion and storage cleanup queues. Keep the record until all private objects are removed or the failure is reviewed.

## Incident rule

Do not delete logs or audit records while an incident is being reviewed. Rotate exposed secrets, end affected sessions and record the exact release involved.
