# FinalFrame Web

The web app contains the public page, account screens, project dashboard, and review workspace.

## Setup

Use Node.js `24.18.0` and npm `11.16.0`.

Copy `.env.example` to `.env.local`, add local values, then run:

```bash
npm ci
npm run dev
```

## Checks

```bash
npm run verify
npm run test:e2e
npm run lighthouse
```

## Routing

Browser API requests use the same public origin through `/backend`. Server-only API traffic uses the private API URL.

Private files must be opened through authorized app routes, not public storage URLs.

## Frontend rules

- Keep controls keyboard accessible.
- Keep server secrets out of `NEXT_PUBLIC_*` values.
- Avoid adding large client-side dependencies for small UI effects.
- Keep public pages light and product code scoped to product routes.
