# FinalFrame API

The API handles accounts, projects, files, feedback, approvals, notifications, background work, and realtime updates.

## Setup

Use Node.js `24.18.0` and npm `11.16.0`.

Copy `.env.example` to `.env`, add local values, then run:

```bash
npm ci
npm run prisma:generate
npm run db:migrate:dev
npm run dev
```

## Checks

```bash
npm run check
npm run build
npm run test:core
```

## Services

The API expects PostgreSQL and Redis. File review also uses private S3-compatible storage and ClamAV.

Email can stay disabled during local development:

```env
EMAIL_DELIVERY_MODE=disabled
REQUIRE_EMAIL_VERIFICATION=false
```

## Notes

- Keep real `.env` files out of Git.
- Keep Prisma migrations in order; do not rename or remove applied migration folders.
- Use private storage for uploaded files.
- Keep Redis available for shared rate limits and realtime work.
