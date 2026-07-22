#!/usr/bin/env sh
set -eu
. "$(dirname -- "$0")/common.sh"
require_deploy_files
validate_env

if [ "${1:-}" != "--apply" ] || [ "${CONFIRM_QIKUKU_DATABASE_BACKUP:-}" != "backup-qikuku-production" ]; then
  echo "Refusing backup. Require --apply and CONFIRM_QIKUKU_DATABASE_BACKUP=backup-qikuku-production." >&2
  exit 2
fi

BACKUP_DIR=${QIKUKU_BACKUP_DIR:-/var/backups/qikuku}
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
OUTPUT="$BACKUP_DIR/qikuku-$STAMP.dump"

# The direct URL stays in Docker's environment, never in process arguments.
docker run --rm --network host \
  --env-file "$QIKUKU_ENV_FILE" \
  -e PGSSLMODE=verify-full \
  -e PGSSLROOTCERT=/run/secrets/tencentdb-ca.pem \
  -v "$DATABASE_SSL_CA_HOST_PATH:/run/secrets/tencentdb-ca.pem:ro" \
  -v "$BACKUP_DIR:/backup" \
  postgres:17-bookworm \
  sh -eu -c 'pg_dump "$DATABASE_DIRECT_URL" --format=custom --no-owner --file "/backup/'"$(basename -- "$OUTPUT")"'"'

test -s "$OUTPUT"
echo "Database backup completed: $(basename -- "$OUTPUT")"
