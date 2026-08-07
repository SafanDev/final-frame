# FinalFrame

FinalFrame is a private design review app. Designers share versioned files, clients leave feedback, and approved work is recorded with a signed audit file.

## Main folders

- `final-frame-web` — Next.js user interface
- `final-frame-api` — Express API, workers, Prisma and PostgreSQL logic
- `deploy` — Caddy and monitoring files
- `docs` — deployment, release and data rules

## What you need

- Node.js 24.18.0
- npm 11.16.0
- PostgreSQL
- Redis
- ClamAV
- Private S3-compatible storage such as Cloudflare R2

The exact Node and npm versions are pinned in both apps.

## Email setup

FinalFrame can run without Resend.

```env
EMAIL_DELIVERY_MODE=disabled
REQUIRE_EMAIL_VERIFICATION=false
RESEND_API_KEY=
EMAIL_FROM_ADDRESS=
```

In this mode:

- registration and sign-in work
- in-app notices work
- project owners can copy one-time invite links
- email verification and email password reset are not shown

Password changes still require an authenticated account. MFA, rate limits, session checks and invite rules stay active.

To enable email later, set `EMAIL_DELIVERY_MODE=resend`, add a Resend key and add a verified sender address. Then set `REQUIRE_EMAIL_VERIFICATION=true`.

## Local setup

Copy each example environment file and fill in the required values. Never commit a real `.env` file.

```bash
cd final-frame-api
npm ci
npm run check
npm run build

cd ../final-frame-web
npm ci
npm run verify
```

Start the API and web app with the scripts in their own `package.json` files.

## Safety and cost controls

- Uploaded files stay private and use short-lived access links.
- Malware checks and safe preview generation run before review.
- Per-account limits protect project, member, storage, comment and AI usage.
- App-wide project and storage limits stop new work before shared capacity is exhausted.
- AI summaries stay off when `OPENROUTER_API_KEY` is empty.
- The repository has no card checkout or automatic charging flow.

Hosting, storage, database, email and AI providers can still charge for their services. Set provider limits and billing alerts before using live resources.

## Before release

Run the root static check first:

```bash
node scripts/release-static-check.mjs
```

Then follow `docs/RELEASE_VALIDATION.md` and `final-frame-web/docs/DEPLOYMENT.md`.
