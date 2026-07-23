#!/usr/bin/env bash
set -euo pipefail

# This is deliberately loopback-only and is run only after a deployment.
base_url=${QIKUKU_HEALTH_URL:-http://127.0.0.1:3000}
case "$base_url" in
  http://127.0.0.1:3000) ;;
  *) echo 'Health checks must target the local loopback application port.' >&2; exit 2 ;;
esac

curl --fail --silent --show-error --max-time 10 "$base_url/api/health/live" >/dev/null
curl --fail --silent --show-error --max-time 10 "$base_url/api/health/ready" >/dev/null
echo 'Application liveness and readiness checks passed.'
