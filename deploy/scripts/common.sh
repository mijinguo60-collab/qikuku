#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
DEPLOY_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
COMPOSE_FILE="$DEPLOY_ROOT/docker-compose.production.yml"
COMPOSE_ENV_FILE=/etc/qikuku/compose.env

require_root_file() {
  local file="$1"
  local forbidden_mode="$2"
  [[ -f "$file" && -r "$file" ]] || {
    echo 'Required deployment file is missing or unreadable.' >&2
    exit 2
  }
  [[ "$(stat -c '%U:%G' "$file")" == 'root:root' ]] || {
    echo 'Required deployment file must be owned by root:root.' >&2
    exit 2
  }
  local mode
  mode=$(stat -c '%a' "$file")
  (( (8#$mode & 8#$forbidden_mode) == 0 )) || {
    echo 'Required deployment file has unsafe permissions.' >&2
    exit 2
  }
}

load_compose_environment() {
  require_root_file "$COMPOSE_ENV_FILE" 077
  set -a
  # This root-owned, non-sensitive file only provides image and file paths.
  # shellcheck disable=SC1090
  source "$COMPOSE_ENV_FILE"
  set +a
  : "${QIKUKU_IMAGE:?QIKUKU_IMAGE is required in compose.env}"
  : "${QIKUKU_ENV_FILE:?QIKUKU_ENV_FILE is required in compose.env}"
  : "${DATABASE_SSL_CA_HOST_PATH:?DATABASE_SSL_CA_HOST_PATH is required in compose.env}"
  [[ -f "$COMPOSE_FILE" ]] || {
    echo 'Production Compose file is missing.' >&2
    exit 2
  }
}

load_compose_environment

require_deploy_files() {
  require_root_file "$QIKUKU_ENV_FILE" 077
  require_root_file "$DATABASE_SSL_CA_HOST_PATH" 022
  if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
    echo "Docker Engine and Docker Compose v2 are required." >&2
    exit 2
  fi
}

compose() {
  docker compose --env-file "$COMPOSE_ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

validate_env() {
  "$SCRIPT_DIR/validate-production-env.sh" "$QIKUKU_ENV_FILE"
}
