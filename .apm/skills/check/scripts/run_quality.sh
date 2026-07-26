#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: run_quality.sh [--verbose]

Options:
  -v, --verbose  Stream full quality output while saving the log
  -h, --help     Show this help
EOF
}

verbose=0
while (($#)); do
  case "$1" in
    -v|--verbose)
      verbose=1
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
  shift
done

if ! command -v bun >/dev/null 2>&1; then
  echo 'CHECK_RESULT status=ERROR reason="bun command not found"'
  exit 127
fi

if repo_root="$(git rev-parse --show-toplevel 2>/dev/null)"; then
  cd "$repo_root"
fi

if [[ ! -f package.json ]]; then
  echo 'CHECK_RESULT status=ERROR reason="package.json not found"'
  exit 1
fi

log_dir=".codex/logs/check"
mkdir -p "$log_dir"
find "$log_dir" -type f -name 'quality-*.log' -mtime +14 -delete >/dev/null 2>&1 || true

timestamp="$(date '+%Y%m%d-%H%M%S')"
log_file="${log_dir}/quality-${timestamp}.log"

extract_reason() {
  local file="$1"
  local line=""

  line="$(grep -m1 -E 'error TS[0-9]+' "$file" || true)"
  if [[ -z "$line" ]]; then
    line="$(grep -m1 -E '^FAIL\\b| FAIL ' "$file" || true)"
  fi
  if [[ -z "$line" ]]; then
    line="$(grep -m1 -E 'AssertionError|TypeError|ReferenceError|SyntaxError|Error:' "$file" || true)"
  fi
  if [[ -z "$line" ]]; then
    line="$(grep -m1 -E 'ERR!|✖|✗' "$file" || true)"
  fi
  if [[ -z "$line" ]]; then
    line="$(tail -n 1 "$file" || true)"
  fi

  line="${line//$'\r'/}"
  line="$(echo "$line" | sed -E 's/[[:space:]]+/ /g; s/^ +//; s/ +$//')"
  if [[ -z "$line" ]]; then
    line="quality failed"
  fi

  printf '%s' "$line"
}

run_cmd=(bun run quality:check)

if [[ "$verbose" -eq 1 ]]; then
  set +e
  "${run_cmd[@]}" 2>&1 | tee "$log_file"
  cmd_status=${PIPESTATUS[0]}
  set -e
else
  set +e
  "${run_cmd[@]}" >"$log_file" 2>&1
  cmd_status=$?
  set -e
fi

echo "CHECK_LOG path=$log_file"

if [[ "$cmd_status" -eq 0 ]]; then
  echo 'CHECK_RESULT status=OK reason="quality passed"'
  exit 0
fi

reason="$(extract_reason "$log_file")"
escaped_reason="${reason//\"/\\\"}"
echo "CHECK_RESULT status=ERROR reason=\"$escaped_reason\""

if [[ "$verbose" -eq 0 ]]; then
  echo "CHECK_HINT tail -n 80 $log_file"
fi

exit "$cmd_status"
