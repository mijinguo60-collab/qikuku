# Build on the target CVM (linux/amd64) so Prisma's native engine and argon2
# match the runtime. Debian Bookworm is intentional: it is more compatible
# with the project's native dependencies than a minimal Alpine image.
ARG NODE_VERSION=20.19.0
FROM node:${NODE_VERSION}-bookworm-slim AS base

ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates dumb-init \
  && rm -rf /var/lib/apt/lists/*

FROM base AS build-deps
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

FROM build-deps AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS builder
COPY . .
RUN npx prisma generate && npm run build

# This target is only run as an explicit one-off Compose job. It includes the
# Prisma CLI and the migration source, but it is never the web runtime image.
FROM deps AS migrator
COPY . .
RUN npx prisma generate
RUN groupadd --system --gid 1001 qikuku \
  && useradd --system --uid 1001 --gid qikuku --home-dir /app qikuku \
  && chown -R qikuku:qikuku /app
USER qikuku
ENTRYPOINT ["dumb-init", "--"]
CMD ["sh", "scripts/deploy/run-migrations.sh"]

FROM base AS runner
ENV NODE_ENV=production \
  PORT=3000 \
  HOSTNAME=0.0.0.0 \
  DATABASE_REQUIRE_POSTGRES=true
RUN groupadd --system --gid 1001 qikuku \
  && useradd --system --uid 1001 --gid qikuku --home-dir /app qikuku
COPY --from=builder --chown=qikuku:qikuku /app/public ./public
COPY --from=builder --chown=qikuku:qikuku /app/.next/standalone ./
COPY --from=builder --chown=qikuku:qikuku /app/.next/static ./.next/static
# Next's standalone tracing cannot discover node-gyp-build's runtime lookup
# for argon2's native binary, so preserve the complete installed module.
COPY --from=builder --chown=qikuku:qikuku /app/node_modules/argon2 ./node_modules/argon2
USER qikuku
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health/live').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]
