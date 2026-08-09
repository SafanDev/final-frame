# Operations runbook

## Routine checks

Check API readiness, PostgreSQL, Redis, ClamAV, storage access, and background queues.

Useful queue metrics include:

- `finalframe_project_deletions`
- `finalframe_storage_deletion_tasks`
- `finalframe_email_outbox_messages` when email is enabled
- preview-processing failures and worker success timestamps

A queue item with `status="ABANDONED"` needs review.

## Dead-letter inspection and replay

List unresolved items without changing data:

```bash
cd final-frame-api
npm run ops:dead-letter -- --action=list --require-empty=true
```

Fix the underlying provider or storage problem before replaying an item. Replay one reviewed item at a time and confirm its exact ID:

```bash
npm run ops:dead-letter -- --action=replay --kind=email --id=<id> --confirm=<id>
npm run ops:dead-letter -- --action=replay --kind=storage --id=<id> --confirm=<id>
```

Replay schedules the normal worker to try again; it does not send email or delete storage directly from the operator command.

## Backup restore drill

Restore into a disposable PostgreSQL database. Never use the source database as the drill target.

```bash
cd final-frame-api
RESTORE_DRILL_SOURCE_DATABASE_URL="$DATABASE_URL" \
RESTORE_DRILL_DATABASE_URL="postgresql://.../finalframe_restore" \
RESTORE_DRILL_BACKUP_FILE="/secure/path/latest.dump" \
RESTORE_DRILL_CONFIRM=true \
RESTORE_DRILL_CONFIRM_DATABASE=finalframe_restore \
npm run ops:restore-drill
```

Keep the successful `verifiedAt` value with the release record.

## Staging security and load checks

```bash
DEPLOYED_BASE_URL=https://staging.example.com npm run ops:verify-deployed-security
```

```bash
LOAD_TEST_BASE_URL=https://staging.example.com \
LOAD_TEST_DURATION_SECONDS=60 \
LOAD_TEST_CONCURRENCY=8 \
LOAD_TEST_P95_MS=2000 \
LOAD_TEST_MAX_ERROR_RATE=0.01 \
npm run ops:load-slo
```

The load command is GET-only. If an authenticated read path is added, use a short-lived staging-only cookie and keep it out of shell history and logs.

## Common problems

### Sign-in fails

Check the session secret, cookie name, public URL, API route, and system time.

### Upload fails

Check storage access, upload limits, ClamAV, and preview-worker logs.

### Realtime updates stop

Check Redis, Socket.IO routing, proxy timeouts, and connection limits. Unauthorized cross-project joins should return `PROJECT_ACCESS_DENIED`.

### A delete stays pending

Check the project-deletion and storage-cleanup queues. Keep the record until required private objects are removed or the failure is reviewed.

## Incident handling

Keep logs and audit records while an incident is being investigated. Rotate exposed secrets, end affected sessions, and record the release involved.
