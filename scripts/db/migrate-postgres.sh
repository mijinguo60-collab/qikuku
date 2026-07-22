#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" != "--apply" || "${CONFIRM_DOMESTIC_DB_MIGRATION:-}" != "migrate-neon-test-to-domestic" ]]; then
  echo "Dry-run only. To migrate a new empty domestic database use --apply and CONFIRM_DOMESTIC_DB_MIGRATION=migrate-neon-test-to-domestic." >&2
  exit 64
fi
: "${SOURCE_DATABASE_URL:?SOURCE_DATABASE_URL is required}"
: "${TARGET_DATABASE_URL:?TARGET_DATABASE_URL is required}"
: "${TARGET_DATABASE_SSL_CA_PATH:?TARGET_DATABASE_SSL_CA_PATH is required}"
[[ -f "$TARGET_DATABASE_SSL_CA_PATH" ]] || { echo "Target CA certificate file is missing." >&2; exit 65; }

source_host=$(node -p 'new URL(process.argv[1]).hostname' "$SOURCE_DATABASE_URL")
target_host=$(node -p 'new URL(process.argv[1]).hostname' "$TARGET_DATABASE_URL")
if [[ "$source_host" != "ep-snowy-tooth-ata0virv.c-9.us-east-1.aws.neon.tech" || "$target_host" == *"neon.tech"* || "$source_host" == "$target_host" ]]; then
  echo "Unsafe source/target endpoints; migration stopped." >&2
  exit 65
fi
command -v pg_dump >/dev/null || { echo "pg_dump is required." >&2; exit 69; }
command -v pg_restore >/dev/null || { echo "pg_restore is required." >&2; exit 69; }

backup_dir=".local-backups/postgres-migrations"
mkdir -p "$backup_dir"
chmod 700 "$backup_dir"
dump_file="$backup_dir/neon-test-$(date +%Y%m%d%H%M%S).dump"
trap 'rm -f "$dump_file"' EXIT

target_restore_url=$(node - "$TARGET_DATABASE_URL" "$TARGET_DATABASE_SSL_CA_PATH" <<'NODE'
const parsed = new URL(process.argv[2]);
parsed.searchParams.set('sslmode', 'verify-full');
parsed.searchParams.set('sslrootcert', process.argv[3]);
process.stdout.write(parsed.toString());
NODE
)

pg_dump --dbname="$SOURCE_DATABASE_URL" --format=custom --no-owner --no-privileges --file="$dump_file"
pg_restore --dbname="$target_restore_url" --no-owner --no-privileges --exit-on-error "$dump_file"
SOURCE_DATABASE_URL="$SOURCE_DATABASE_URL" TARGET_DATABASE_URL="$TARGET_DATABASE_URL" TARGET_DATABASE_SSL_CA_PATH="$TARGET_DATABASE_SSL_CA_PATH" npx tsx scripts/db/verify-migration.ts --verify
echo "Migration completed. The Neon test source remains unchanged and the dump stays in $backup_dir."
