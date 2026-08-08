# FinalFrame

FinalFrame is a production-oriented design review and approval platform for sharing versioned creative work, collecting contextual client feedback, and recording accountable final decisions.

Designers create private workspaces and upload versioned files. Clients review safe derivatives, leave pinned or written feedback, compare revisions, request changes, and approve a selected final version. Final approval is recorded with signed evidence rather than being treated as a cosmetic status change.

## Core capabilities

- Designer-owned private review workspaces
- Versioned asset uploads and final-file selection
- Quarantined uploads with malware/content inspection and generated review derivatives
- Image, video, PDF, source-code and general feedback anchors
- Written feedback, voice notes and revision history
- One-time, email-bound client invitations
- Client approver roles and server-enforced review state transitions
- Locked-original protection before approval policy permits access
- Signed approval certificates and audit exports
- Realtime presence and cursor collaboration through Socket.IO + Redis
- MFA, session revocation, password recovery and account security controls
- Storage/project/AI quotas and shared abuse controls
- Retryable email, storage cleanup and background processing operations
- Accessibility, multi-browser, Lighthouse, security and release CI gates

## Architecture

```text
Browser
  |
  v
Caddy / same public origin
  |-- Next.js web application
  |-- /backend -> Express API
  |-- /backend/socket.io -> Socket.IO
                         |
                         |-- PostgreSQL / Prisma
                         |-- Redis
                         |-- private S3-compatible storage / Cloudflare R2
                         |-- ClamAV + media processing workers
                         |-- optional Resend email
                         `-- optional OpenRouter AI summaries
```

Keeping browser API and Socket.IO traffic on the same public origin preserves the host-only authenticated session model and avoids widening cookie scope across subdomains.

## Repository

- `final-frame-web` — Next.js frontend, authentication UI, dashboard and review workspace
- `final-frame-api` — Express API, Prisma/PostgreSQL domain logic, workers and Socket.IO
- `deploy` — Caddy and monitoring configuration
- `docs` — release validation and data-retention guidance
- `.github/workflows/ci.yml` — full-system release gates

## Required runtime

- Node.js `24.18.0`
- npm `11.16.0`
- PostgreSQL
- Redis
- ClamAV
- private S3-compatible object storage such as Cloudflare R2

The exact Node and npm versions are pinned in both applications.

## Local validation

Never commit a real `.env` file. Copy the example environment files and supply local/test values.

```bash
node scripts/release-static-check.mjs

cd final-frame-api
npm ci
npm run verify

cd ../final-frame-web
npm ci
npm run verify
```

The GitHub Actions pipeline additionally exercises migrations, disposable PostgreSQL/Redis/storage/ClamAV services, authenticated browser flows in Chromium/Firefox/WebKit/mobile Chromium, accessibility checks, and desktop/mobile Lighthouse budgets.

## Security model

FinalFrame treats uploaded originals and review derivatives as different security objects. Reviewers receive authorization-checked preview routes; originals are not exposed as public object URLs. Project access is revalidated by API and realtime paths, invitations are recipient-bound and single-use, and approval decisions are tied to server-enforced workflow rules and signed evidence.

Operational controls include shared rate limits, session revocation, MFA, private storage, malware scanning, bounded media processing, quotas, structured telemetry redaction, dead-letter handling, migration preflight checks and backup-restore readiness gates.

See `final-frame-web/SECURITY.md` for the application security policy.

## Email and optional providers

FinalFrame can run without Resend:

```env
EMAIL_DELIVERY_MODE=disabled
REQUIRE_EMAIL_VERIFICATION=false
RESEND_API_KEY=
EMAIL_FROM_ADDRESS=
```

Registration, sign-in, in-app notices and copied one-time invite links remain available. Email verification and email-based password reset remain disabled until an email provider is configured.

AI summaries are optional and remain unavailable when `OPENROUTER_API_KEY` is not configured.

## Release status

The repository distinguishes **source readiness** from **deployment approval**:

- **Source-ready / deployment-ready** means the clean repository, builds, tests, migrations, browser/security checks and CI release contracts pass.
- **Deployment-approved** additionally requires running the documented restore drill, deployed-domain security probe, load/SLO probe and operator checks against the actual hosting environment.

This repository can therefore be published as a deployment-ready engineering project without operating a public production service. It should not be described as a live production deployment unless the environment-specific checks in `docs/RELEASE_VALIDATION.md` have also been completed.

## Release and operations

Start with:

```bash
node scripts/release-static-check.mjs
```

Then follow:

- `docs/RELEASE_VALIDATION.md`
- `final-frame-api/BACKEND-DEPLOYMENT.md`
- `final-frame-web/docs/DEPLOYMENT.md`
- `final-frame-web/docs/OPERATIONS-RUNBOOK.md`

Provider billing is external to the application. Configure provider-side limits and billing alerts before attaching live infrastructure.
