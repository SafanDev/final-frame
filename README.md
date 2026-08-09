# FinalFrame

FinalFrame is a private design review app for sharing creative work, collecting feedback, comparing revisions, and approving final files.

## What it does

- Create review projects and invite clients
- Upload and manage file versions
- Leave comments, pins, and voice feedback
- Review images, video, PDFs, and source files
- Compare revisions and choose a final file
- See realtime presence and cursor updates
- Keep uploaded files private and checked before review

## Stack

| Area | Tools |
| --- | --- |
| Web | Next.js, React, TypeScript |
| API | Node.js, Express, Prisma |
| Data | PostgreSQL, Redis |
| Realtime | Socket.IO |
| Files | S3-compatible private storage, ClamAV |
| Testing | Playwright, Lighthouse, GitHub Actions |

## Review flow

```text
Upload work -> Review -> Feedback -> New revision -> Compare -> Approve
```

## Project layout

```text
final-frame-web/    Web app and review workspace
final-frame-api/    API, database, realtime, and background work
deploy/             Deployment and monitoring files
docs/               Release and data-retention notes
```

## Run locally

FinalFrame uses Node.js `24.18.0` and npm `11.16.0`.

Copy the included `.env.example` files for local configuration. Do not commit real environment files.

```bash
cd final-frame-api
npm ci
npm run verify

cd ../final-frame-web
npm ci
npm run verify
```

## Status

**v1.0.0**

The source is complete and ready to deploy. FinalFrame is not currently running as a public service.

## Docs

- [Release validation](docs/RELEASE_VALIDATION.md)
- [Data retention](docs/DATA_RETENTION.md)
- [Security](final-frame-web/SECURITY.md)
- [Deployment](final-frame-web/docs/DEPLOYMENT.md)
- [Operations](final-frame-web/docs/OPERATIONS-RUNBOOK.md)
