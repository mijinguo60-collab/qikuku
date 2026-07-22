#!/usr/bin/env sh
set -eu

# Forward-only Prisma migrations are deliberately not rolled back here. This
# script requires a verified backup first, then builds, migrates, and swaps the
# web image. Use rollback.sh for code/image rollback; restore a database backup
# only under an explicit incident procedure.
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)

if [ "${1:-}" != "--apply" ] || [ "${CONFIRM_QIKUKU_UPDATE:-}" != "update-qikuku-production" ]; then
  echo "Refusing update. Require --apply and CONFIRM_QIKUKU_UPDATE=update-qikuku-production." >&2
  exit 2
fi

"$ROOT/deploy/scripts/backup-database.sh" --apply
"$ROOT/deploy/scripts/build-image.sh"
CONFIRM_QIKUKU_MIGRATION=apply-production-migrations "$ROOT/deploy/scripts/migrate.sh" --apply
"$ROOT/deploy/scripts/start.sh"
