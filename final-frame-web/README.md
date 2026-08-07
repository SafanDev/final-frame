# FinalFrame Web

The web app contains the public page, account screens, project dashboard and review workspace.

## Setup

Copy `.env.example` to `.env.local`, then run:

```bash
npm ci
npm run dev
```

Use Node.js 24.18.0 and npm 11.16.0.

## Checks

```bash
npm run verify
npm run test:e2e
npm run lighthouse
```

The browser API URL must use the same public origin with the `/backend` path. Private files must not use public object URLs.

## Design rules

- Keep wording short and clear.
- Keep controls keyboard accessible.
- Do not add large libraries for small visual effects.
- Do not expose server secrets through `NEXT_PUBLIC_*` values.
