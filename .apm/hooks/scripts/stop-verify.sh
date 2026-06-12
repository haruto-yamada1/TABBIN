#!/bin/sh
set -eu

project_dir="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "$project_dir"

"$(dirname "$0")/verify-touched.sh" stop
