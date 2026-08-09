# Monitoring

Scrape each private API instance at `/metrics` with the configured bearer token. Do not expose this endpoint through the public app route.

Load `finalframe-alerts.yml` into Prometheus or a compatible rule engine. Adjust latency and memory thresholds after observing real traffic, but keep dependency, worker, queue, and server-error alerts enabled.

Useful dashboard panels:

- request rate, 5xx rate, and p50/p95/p99 response time
- PostgreSQL and Redis readiness
- connected realtime sockets and rejected authentication
- worker duration, failures, and last successful run
- email and storage queue counts, especially `ABANDONED` items
- process memory by release and instance

Assign someone to receive alerts before running the app for real users.
