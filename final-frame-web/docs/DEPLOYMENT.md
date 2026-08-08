# Deployment

## Public routes

Use one browser origin:

```text
https://app.example.com/             public page
https://app.example.com/app          dashboard
https://app.example.com/project/*    review workspace
https://app.example.com/backend/*    API and Socket.IO proxy
```

`NEXT_PUBLIC_API_URL` must point to the public `/backend` path. `API_URL` stays server-only and points to the private API route.

## Environment files

- root `.env.production` — public routes, image names, Redis and Caddy values
- `final-frame-api/.env.production` — database, storage and API secrets

Do not commit either file.

## Email choices

No provider:

```env
EMAIL_DELIVERY_MODE=disabled
REQUIRE_EMAIL_VERIFICATION=false
```

Resend:

```env
EMAIL_DELIVERY_MODE=resend
REQUIRE_EMAIL_VERIFICATION=true
RESEND_API_KEY=...
EMAIL_FROM_ADDRESS=FinalFrame <mail@example.com>
```

## Release order

1. Back up the database and test the restore.
2. Run the migration job once.
3. Start Redis, ClamAV and private storage access.
4. Start matching API and web images.
5. Check health and readiness routes.
6. Test sign-in, upload, preview, feedback, approval and download.
7. Run deployed security verification, cross-tenant/invitation E2E, and the staging SLO probe.
8. Confirm email/storage dead-letter queues are empty or individually reviewed.
9. Watch errors, queue health and storage cleanup.

## HSTS scope governance

The default HSTS setting protects only the app host. Do not enable subdomain scope or preload unless every current and future subdomain is fully controlled and permanently uses HTTPS.

## Rollback

Roll back the web and API as one matching release. Do not reverse a database migration unless a tested reverse plan exists.

## Final release evidence

Before switching public traffic, retain evidence for the real backup restore drill, the green CI run, staging browser/accessibility results, deployed security check, load/SLO result, and dead-letter inspection. `BACKUP_RESTORE_TESTED=true` is valid only after the restore drill actually completed against a disposable database.
