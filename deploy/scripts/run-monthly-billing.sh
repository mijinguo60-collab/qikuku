#!/usr/bin/env sh
set -eu

: "${CRON_SECRET:?CRON_SECRET is required}"

# curl reads the authorization header from stdin so the secret is not placed in
# the process argument list or journal output. This is invoked by the systemd
# timer only after the app is locally healthy.
printf '%s\n' "header = \"Authorization: Bearer ${CRON_SECRET}\"" \
  | curl --fail --silent --show-error --max-time 600 --config - \
    http://127.0.0.1:3000/api/cron/billing-monthly >/dev/null
