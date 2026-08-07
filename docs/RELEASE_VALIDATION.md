# Release validation

Use Node.js 24.18.0 and npm 11.16.0.

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

## Manual checks

Confirm registration, sign-in, MFA, password change, project creation, copied invite links, file upload, safe preview, comments, review status changes, approval evidence, account export and account deletion.

When email is disabled, confirm that reset and verification actions are hidden and that no email job is created.

## Final checks

- no real `.env` file is included
- no build output, test report or local log is included
- migrations are complete and in order
- public routes contain no private file URL
- configured limits and provider billing alerts are set
