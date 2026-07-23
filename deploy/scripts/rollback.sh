#!/usr/bin/env bash
set -euo pipefail
. "$(dirname -- "$0")/common.sh"
require_deploy_files

if [ -z "${QIKUKU_ROLLBACK_IMAGE:-}" ]; then
  echo "Set QIKUKU_ROLLBACK_IMAGE to a previously verified immutable image tag." >&2
  exit 2
fi

QIKUKU_IMAGE="$QIKUKU_ROLLBACK_IMAGE" compose up -d --no-build --pull never app
echo "Code rollback completed. Prisma migrations are forward-only; do not restore data automatically."
