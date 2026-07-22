#!/usr/bin/env sh
set -eu
. "$(dirname -- "$0")/common.sh"
require_deploy_files
validate_env
compose build app migrate
echo "Image build completed. Start it only through deploy/scripts/start.sh."
