# FinalFrame API

The API handles accounts, projects, files, feedback, approvals, notifications and realtime updates.

## Setup

Copy `.env.example` to `.env`, then run:

```bash
npm ci
npm run prisma:generate
npm run db:migrate:dev
npm run dev
```

Use Node.js 24.18.0 and npm 11.16.0.

## Useful checks

```bash
npm run check
npm run build
npm run test:core
```

## Email

Use `EMAIL_DELIVERY_MODE=disabled` when no email provider is available. Registration, sign-in, in-app notices and copied invite links still work. Email verification and email reset links stay off.

Use `EMAIL_DELIVERY_MODE=resend` only after adding `RESEND_API_KEY` and `EMAIL_FROM_ADDRESS`.

## Important rules

- Keep real environment files out of Git.
- Run every Prisma migration in order. Do not delete or rename migration folders.
- Keep Redis enabled for shared rate limits and realtime work across API replicas.
- Keep ClamAV and private object storage enabled for file review.
