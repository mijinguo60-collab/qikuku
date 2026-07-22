#!/usr/bin/env sh
set -eu

PROJECT_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
COMPOSE_FILE="$PROJECT_ROOT/docker-compose.production.yml"
QIKUKU_ENV_FILE=${QIKUKU_ENV_FILE:-/etc/qikuku/production.env}
DATABASE_SSL_CA_HOST_PATH=${DATABASE_SSL_CA_HOST_PATH:-/etc/qikuku/tencentdb-ca.pem}

require_deploy_files() {
  if [ ! -r "$QIKUKU_ENV_FILE" ] || [ ! -r "$DATABASE_SSL_CA_HOST_PATH" ]; then
    echo "Production env file or TencentDB CA file is missing or unreadable." >&2
    exit 2
  fi
  if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
    echo "Docker Engine and Docker Compose v2 are required." >&2
    exit 2
  fi
}

compose() {
  QIKUKU_ENV_FILE="$QIKUKU_ENV_FILE" DATABASE_SSL_CA_HOST_PATH="$DATABASE_SSL_CA_HOST_PATH" \
    docker compose -f "$COMPOSE_FILE" --env-file "$QIKUKU_ENV_FILE" "$@"
}

validate_env() {
  (cd "$PROJECT_ROOT" && npx tsx scripts/deploy/check-production-env.ts --file "$QIKUKU_ENV_FILE")
}
