#!/usr/bin/env bash
set -euo pipefail
. "$(dirname -- "$0")/common.sh"
require_deploy_files
compose stop app
echo "Application stopped. The database was not modified."
