# syntax=docker/dockerfile:1.7
FROM node:26.8.1-alpine AS dependencies
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
COPY scripts/verify-runtime.mjs ./scripts/verify-runtime.mjs
RUN npm ci --no-audit --no-fund

FROM node:26.8.1-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 \
    NEXT_OUTPUT=standalone \
    DEPLOYMENT_ENVIRONMENT=production \
    NEXT_PUBLIC_SITE_NAME=FinalFrame \
    NEXT_PUBLIC_TELEMETRY_ENABLED=true \
    NEXT_PUBLIC_TELEMETRY_SAMPLE_RATE=0.1 \
    OBSERVABILITY_LOG_TO_STDOUT=false \
    TELEMETRY_MAX_BODY_BYTES=16384 \
    SESSION_COOKIE_NAME=__Secure-next-auth.session-token
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_STORAGE_ORIGIN
ARG INTERNAL_API_URL=http://finalframe-api.internal:5000
ARG HSTS_SCOPE=host
ARG HSTS_MAX_AGE_SECONDS=15552000
ARG HSTS_DOMAIN_CONTROL_CONFIRMED=false
ARG RELEASE_VERSION
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_STORAGE_ORIGIN=$NEXT_PUBLIC_STORAGE_ORIGIN \
    API_URL=$INTERNAL_API_URL \
    NEXTAUTH_URL=$NEXT_PUBLIC_SITE_URL \
    HSTS_SCOPE=$HSTS_SCOPE \
    HSTS_MAX_AGE_SECONDS=$HSTS_MAX_AGE_SECONDS \
    HSTS_DOMAIN_CONTROL_CONFIRMED=$HSTS_DOMAIN_CONTROL_CONFIRMED \
    NEXT_PUBLIC_RELEASE_VERSION=$RELEASE_VERSION \
    RELEASE_VERSION=$RELEASE_VERSION
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN NEXTAUTH_SECRET="$(node -e 'process.stdout.write(require("node:crypto").randomBytes(48).toString("base64url"))')" npm run build \
    && npm run performance:budget

FROM node:26.8.1-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
RUN mkdir -p .next/cache && chown -R nextjs:nodejs .next/cache
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1
CMD ["node", "server.js"]
