#!/usr/bin/env sh
set -eu

if [ "${1:-}" != "--apply" ] || [ "${CONFIRM_QIKUKU_MIGRATION:-}" != "apply-production-migrations" ]; then
  echo "Refusing migration. Require --apply and CONFIRM_QIKUKU_MIGRATION=apply-production-migrations." >&2
  exit 2
fi

if [ "${NODE_ENV:-}" != "production" ] || [ "${DATABASE_REQUIRE_POSTGRES:-}" != "true" ]; then
  echo "Refusing migration outside the production PostgreSQL configuration." >&2
  exit 2
fi

if [ -z "${DATABASE_DIRECT_URL:-}" ] || [ -z "${DATABASE_SSL_CA_PATH:-}" ] || [ ! -r "${DATABASE_SSL_CA_PATH}" ]; then
  echo "Refusing migration without the direct PostgreSQL URL and readable CA file." >&2
  exit 2
fi

# This legacy application-Dockerfile target is not used by production Compose.
# The independent Dockerfile.migrator has the enforced TLS-tunnel entrypoint.
exec npx prisma migrate deploy
