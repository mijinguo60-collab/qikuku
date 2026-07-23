#!/usr/bin/env bash
set -euo pipefail
. "$(dirname -- "$0")/common.sh"
require_deploy_files
validate_env

if [ "${1:-}" != "--apply" ] || [ "${CONFIRM_QIKUKU_MIGRATION:-}" != "apply-production-migrations" ]; then
  echo "Refusing migration. Require --apply and CONFIRM_QIKUKU_MIGRATION=apply-production-migrations." >&2
  exit 2
fi

# Compose interpolates only the migration variables declared on the migrate
# service. The app's full production env file is never mounted or passed into
# that container. This root-owned file is trusted deployment input.
set -a
# shellcheck disable=SC1090
. "$QIKUKU_ENV_FILE"
set +a

compose --profile tools run --rm migrate --apply
