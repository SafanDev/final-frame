# syntax=docker/dockerfile:1.7
FROM node:26.8.2-bookworm-slim AS dependencies
WORKDIR /app
ENV NODE_ENV=development
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY scripts/verify-runtime.mjs ./scripts/verify-runtime.mjs
RUN npm ci --no-audit --no-fund

FROM dependencies AS builder
COPY prisma ./prisma
COPY prisma.config.ts tsconfig.json ./
COPY src ./src
RUN DATABASE_URL="postgresql://finalframe:build-only@127.0.0.1:5432/finalframe?schema=public" \
    DIRECT_DATABASE_URL="postgresql://finalframe:build-only@127.0.0.1:5432/finalframe?schema=public" \
    npm run build

FROM dependencies AS migration
COPY prisma ./prisma
COPY prisma.config.ts ./
COPY scripts ./scripts
ENTRYPOINT ["npm", "run", "db:migrate:deploy"]

FROM node:26.8.2-bookworm-slim AS production-dependencies
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY scripts/verify-runtime.mjs ./scripts/verify-runtime.mjs
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

FROM node:26.8.2-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=5000
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl ffmpeg ghostscript openssl poppler-utils \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 1001 finalframe \
    && useradd --system --uid 1001 --gid finalframe --home-dir /app --shell /usr/sbin/nologin finalframe
COPY --from=production-dependencies --chown=finalframe:finalframe /app/node_modules ./node_modules
COPY --from=builder --chown=finalframe:finalframe /app/dist ./dist
COPY --chown=finalframe:finalframe package.json ./package.json
USER finalframe
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 CMD curl --fail --silent http://127.0.0.1:5000/health >/dev/null || exit 1
CMD ["node", "--enable-source-maps", "dist/index.js"]
