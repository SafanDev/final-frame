# Operations

## Daily checks

Check API readiness, Redis, database connections, ClamAV, storage access and background queues.

Important queue metrics include:

- `finalframe_project_deletions`
- `finalframe_storage_deletion_tasks`
- email outbox failures when email is enabled
- preview processing failures

## Common problems

### Sign-in fails

Check the shared session secret, cookie name, public URL, API route and system time.

### Upload fails

Check storage keys, bucket access, upload size limits, ClamAV and preview worker logs.

### Realtime updates stop

Check Redis, Socket.IO routing, proxy timeouts and connection limits.

### A delete stays pending

Check the project deletion and storage cleanup queues. Keep the record until all private objects are removed or the failure is reviewed.

## Incident rule

Do not delete logs or audit records while an incident is being reviewed. Rotate exposed secrets, end affected sessions and record the exact release involved.
