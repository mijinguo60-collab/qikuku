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

read -r source_host target_host < <(node <<'NODE'
const source = new URL(process.env.SOURCE_DATABASE_URL);
const target = new URL(process.env.TARGET_DATABASE_URL);
process.stdout.write(`${source.hostname} ${target.hostname}\n`);
NODE
)
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
credentials_dir=$(mktemp -d "$backup_dir/pg-credentials.XXXXXX")
service_file="$credentials_dir/pg_service.conf"
pass_file="$credentials_dir/pgpass"
migration_succeeded=false
cleanup() {
  rm -rf "$credentials_dir"
  if [[ "$migration_succeeded" != true ]]; then
    rm -f "$dump_file"
  fi
}
trap cleanup EXIT

node - "$service_file" "$pass_file" <<'NODE'
const { writeFileSync, chmodSync } = require('node:fs');
const source = new URL(process.env.SOURCE_DATABASE_URL);
const target = new URL(process.env.TARGET_DATABASE_URL);
const targetCa = process.env.TARGET_DATABASE_SSL_CA_PATH;
const asFields = (url) => ({ host: url.hostname, port: url.port || '5432', database: url.pathname.slice(1), user: decodeURIComponent(url.username), password: decodeURIComponent(url.password) });
const escapePass = (value) => value.replace(/\\/g, '\\\\').replace(/:/g, '\\:');
const sourceFields = asFields(source);
const targetFields = asFields(target);
const service = (name, fields, sslmode, extra = '') => `[${name}]\nhost=${fields.host}\nport=${fields.port}\ndbname=${fields.database}\nuser=${fields.user}\nsslmode=${sslmode}\n${extra}`;
// The pinned Neon test direct endpoint's existing connection policy is encrypted
// `require`; the domestic target remains strictly verified with its supplied CA.
writeFileSync(process.argv[2], `${service('source', sourceFields, 'require')}\n${service('target', targetFields, 'verify-full', `sslrootcert=${targetCa}\n`)}`, { mode: 0o600 });
writeFileSync(process.argv[3], `${sourceFields.host}:${sourceFields.port}:${sourceFields.database}:${sourceFields.user}:${escapePass(sourceFields.password)}\n${targetFields.host}:${targetFields.port}:${targetFields.database}:${targetFields.user}:${escapePass(targetFields.password)}\n`, { mode: 0o600 });
chmodSync(process.argv[2], 0o600);
chmodSync(process.argv[3], 0o600);
NODE

PGSERVICEFILE="$service_file" PGPASSFILE="$pass_file" pg_dump --dbname=service=source --format=custom --no-owner --no-privileges --file="$dump_file"
chmod 600 "$dump_file"
PGSERVICEFILE="$service_file" PGPASSFILE="$pass_file" pg_restore --dbname=service=target --no-owner --no-privileges --exit-on-error "$dump_file"
SOURCE_DATABASE_URL="$SOURCE_DATABASE_URL" TARGET_DATABASE_URL="$TARGET_DATABASE_URL" TARGET_DATABASE_SSL_CA_PATH="$TARGET_DATABASE_SSL_CA_PATH" npx tsx scripts/db/verify-migration.ts --verify
migration_succeeded=true
echo "Migration completed. The Neon test source remains unchanged and the dump stays in $backup_dir."
