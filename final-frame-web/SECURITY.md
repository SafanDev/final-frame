# Security

If you find a security issue, report it privately to the repository owner. Do not post secrets, private files, or exploit details in a public issue.

## Access and accounts

- The API makes the final access decision for private data.
- HTTPS sessions use Secure and HttpOnly cookies.
- MFA supports authenticator codes and one-time recovery codes.
- Rate limits protect account, upload, and realtime routes.
- Sensitive account changes can end existing sessions.

## Files

- Uploaded files stay private.
- Review copies are checked before use.
- Original downloads are authorized by the API.
- Short-lived links are used where direct storage access is needed.

## Browser security

The web app sets CSP and other security headers. Browser-facing configuration must not contain server secrets.

## Secrets

Never commit database URLs, session secrets, storage keys, email-provider keys, AI-provider keys, monitoring tokens, or real `.env` files.

Only values that are safe to expose in the browser may use the `NEXT_PUBLIC_` prefix.

## Email-disabled mode

The app can run with email delivery disabled. Password, MFA, session, rate-limit, and invite-token checks still apply, but email ownership and email reset links are unavailable until a verified email provider is configured.
