#!/usr/bin/env bash
set -euo pipefail

# This validator reads names and safe flags only. It never sources or prints
# production.env, so the image-only CVM deployment does not need app source.
env_file=${1:?usage: validate-production-env.sh /etc/qikuku/production.env}
[[ -f "$env_file" && -r "$env_file" ]] || {
  echo 'Production env file is missing or unreadable.' >&2
  exit 2
}

required=(
  NODE_ENV DATABASE_REQUIRE_POSTGRES DATABASE_URL DATABASE_DIRECT_URL
  DATABASE_SSL_CA_PATH SESSION_SECRET SMS_CODE_PEPPER ENCRYPTION_KEY
  SMS_PROVIDER TENCENT_SMS_SECRET_ID TENCENT_SMS_SECRET_KEY
  TENCENT_SMS_SDK_APP_ID TENCENT_SMS_SIGN_NAME TENCENT_SMS_TEMPLATE_ID
  BLOB_READ_WRITE_TOKEN CRON_SECRET
)

missing=0
for key in "${required[@]}"; do
  if ! grep -Eq "^[[:space:]]*${key}=[^[:space:]]" "$env_file"; then
    echo "Missing required production variable: ${key}" >&2
    missing=1
  fi
done
(( missing == 0 )) || exit 2

grep -Eq '^[[:space:]]*NODE_ENV=production[[:space:]]*$' "$env_file" || {
  echo 'NODE_ENV must be production.' >&2
  exit 2
}
grep -Eq '^[[:space:]]*DATABASE_REQUIRE_POSTGRES=true[[:space:]]*$' "$env_file" || {
  echo 'DATABASE_REQUIRE_POSTGRES must be true.' >&2
  exit 2
}
grep -Eq '^[[:space:]]*SMS_PROVIDER=tencent[[:space:]]*$' "$env_file" || {
  echo 'SMS_PROVIDER must be tencent.' >&2
  exit 2
}
if grep -Eq '^[[:space:]]*SMS_TEST_MODE=true[[:space:]]*$' "$env_file"; then
  echo 'SMS_TEST_MODE must not be true in production.' >&2
  exit 2
fi
for key in DATABASE_URL DATABASE_DIRECT_URL; do
  grep -Eq "^[[:space:]]*${key}=postgres(ql)?://" "$env_file" || {
    echo "${key} must be a PostgreSQL URL." >&2
    exit 2
  }
done
if grep -Eiq '^[[:space:]]*DATABASE_(URL|DIRECT_URL)=.*sslmode=(disable|allow|prefer|require|verify-ca)' "$env_file"; then
  echo 'Database URLs must not weaken TLS verification.' >&2
  exit 2
fi

echo 'Production environment name and safety checks passed.'
