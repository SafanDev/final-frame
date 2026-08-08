# FinalFrame monitoring

Scrape each private API replica at `/metrics` with the configured bearer token. Do not route this endpoint through the public application listener.

Load `finalframe-alerts.yml` into Prometheus or a compatible ruler. The thresholds are safe starting points, not universal production values. Adjust latency and memory limits after observing real traffic, but keep dependency, worker-stall and server-error alerts enabled.

Recommended dashboard panels:

- API request rate, 5xx ratio and p50/p95/p99 duration
- PostgreSQL and Redis readiness by replica
- Connected realtime sockets and rejected socket authentication
- Worker duration, failures, processed items and time since last success
- Email/storage durable queue counts by status, with `ABANDONED` treated as operator-owned dead letters
- RSS and heap use by release and replica
- Deployment annotations using the release identifier from structured logs

Alert delivery should have an assigned primary and backup responder. Rehearse one API outage, one Redis outage, one worker failure and one failed migration preflight before launch.
