#!/usr/bin/env sh
set -eu
. "$(dirname -- "$0")/common.sh"
require_deploy_files
validate_env
compose up -d --no-build --remove-orphans app
echo "Application started. Probe /api/health/live and /api/health/ready through localhost before publishing Nginx."
