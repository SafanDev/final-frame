# Security

Report security problems privately to the person who runs the app. Do not post secrets, customer files or exploit details in a public issue.

## Main controls

- The API makes every access decision.
- Sessions use Secure and HttpOnly cookies in HTTPS environments.
- Rate limits protect account, upload and realtime routes.
- MFA supports authenticator codes and one-time recovery codes.
- Files stay private and use short-lived links.
- Original downloads are checked by the API.
- Uploaded files are checked before a safe review copy is created.
- CSP and security headers are set by the web app.
- Approval records use signed evidence.

## Secrets

Never commit database URLs, session secrets, R2 keys, Resend keys, OpenRouter keys, monitoring tokens or real `.env` files.

Only public browser settings may use the `NEXT_PUBLIC_` prefix.

## Email-disabled mode

Turning email delivery off does not weaken password, MFA, session, rate-limit or invite-token checks. It does mean the app cannot prove ownership of an email address or send reset links. Use a verified email provider before relying on email ownership as part of an account policy.
