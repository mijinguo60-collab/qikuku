#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 5 ]]; then
  echo "Usage: $0 <host> <port> <database> <username> <ca-certificate-path>" >&2
  exit 64
fi

host="$1"
port="$2"
database="$3"
username="$4"
ca_certificate_path="$5"
if [[ "$host" == *"neon.tech"* || -z "$host" || ! "$port" =~ ^[0-9]{2,5}$ || -z "$database" || -z "$username" || ! -f "$ca_certificate_path" ]]; then
  echo "Target must be a non-Neon PostgreSQL host with an explicit database and user." >&2
  exit 64
fi

read -r -s -p "PostgreSQL password for ${username}@${host}:${port}: " password
echo
if [[ -z "$password" ]]; then
  echo "Password cannot be empty." >&2
  exit 64
fi

backup_dir=".local-backups"
mkdir -p "$backup_dir"
chmod 700 "$backup_dir"
if [[ -f .env.local ]]; then
  backup="$backup_dir/env.local.$(date +%Y%m%d%H%M%S).bak"
  cp .env.local "$backup"
  chmod 600 "$backup"
fi

encoded_password=$(node -p 'encodeURIComponent(process.argv[1])' "$password")
target_url="postgresql://${username}:${encoded_password}@${host}:${port}/${database}?sslmode=require"
tmp_file=$(mktemp .env.local.XXXXXX)
trap 'rm -f "$tmp_file"' EXIT
if [[ -f .env.local ]]; then
  grep -vE '^(DATABASE_URL|DATABASE_DIRECT_URL)=' .env.local > "$tmp_file" || true
fi
printf 'DATABASE_URL=%s\nDATABASE_DIRECT_URL=%s\nDATABASE_SSL_CA_PATH=%s\n' "$target_url" "$target_url" "$ca_certificate_path" >> "$tmp_file"
chmod 600 "$tmp_file"
mv "$tmp_file" .env.local
trap - EXIT
node - <<'NODE'
require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');
const url = process.env.DATABASE_DIRECT_URL;
const parsed = new URL(url);
for (const key of ['sslmode', 'sslrootcert', 'sslcert', 'sslkey']) parsed.searchParams.delete(key);
const certificatePath = process.env.DATABASE_SSL_CA_PATH;
const ca = require('fs').readFileSync(certificatePath, 'utf8');
const client = new Client({ connectionString: parsed.toString(), ssl: { ca, rejectUnauthorized: true }, statement_timeout: 10000 });
client.connect().then(() => client.query('SELECT 1')).then(() => client.end()).then(() => console.log(`Domestic PostgreSQL connection verified: ${parsed.hostname}`)).catch(async (error) => { await client.end().catch(() => {}); console.error(`Connection verification failed: ${error.code || 'UNKNOWN'}`); process.exitCode = 1; });
NODE
