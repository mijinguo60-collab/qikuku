#!/usr/bin/env sh
set -eu
. "$(dirname -- "$0")/common.sh"
require_deploy_files
validate_env

if [ "${1:-}" != "--apply" ] || [ "${CONFIRM_QIKUKU_MIGRATION:-}" != "apply-production-migrations" ]; then
  echo "Refusing migration. Require --apply and CONFIRM_QIKUKU_MIGRATION=apply-production-migrations." >&2
  exit 2
fi

compose --profile tools run --rm migrate sh scripts/deploy/run-migrations.sh --apply
