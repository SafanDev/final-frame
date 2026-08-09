# Deployment

## Public routes

Use one browser origin:

```text
https://app.example.com/             public page
https://app.example.com/app          dashboard
https://app.example.com/project/*    review workspace
https://app.example.com/backend/*    API and Socket.IO proxy
```

`NEXT_PUBLIC_API_URL` points to the public `/backend` path. `API_URL` stays server-only and points to the private API route.

## Environment files

- root `.env.production` — public routes, image names, Redis, and Caddy values
- `final-frame-api/.env.production` — database, storage, and API secrets

Do not commit either file.

## Email

Without an email provider:

```env
EMAIL_DELIVERY_MODE=disabled
REQUIRE_EMAIL_VERIFICATION=false
```

With Resend:

```env
EMAIL_DELIVERY_MODE=resend
REQUIRE_EMAIL_VERIFICATION=true
RESEND_API_KEY=...
EMAIL_FROM_ADDRESS=FinalFrame <mail@example.com>
```

## Release order

1. Back up the database and test the restore.
2. Run the migration job once.
3. Start Redis, ClamAV, and private storage access.
4. Start matching API and web images.
5. Check health and readiness routes.
6. Test sign-in, upload, preview, feedback, approval, and download.
7. Run the deployed security and load checks.
8. Review email and storage dead-letter queues.
9. Watch errors, queues, and storage cleanup after release.

## HSTS scope governance

The default HSTS setting protects only the app host. Do not enable subdomain scope or preload unless every related subdomain is controlled and permanently uses HTTPS.

## Rollback

Roll back the web and API as one matching release. Do not reverse a database migration unless a tested reverse plan exists.

## Release record

Keep the green CI run and the results of the real restore, staging security, load, browser/accessibility, and dead-letter checks for the deployed release.
