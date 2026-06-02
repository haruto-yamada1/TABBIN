#!/bin/sh
set -eu

project_dir="$(cd "$(dirname "$0")/../.." && pwd)"
script="$project_dir/.apm/hooks/scripts/rtk-usage-warn.sh"

run_hook() {
  printf '%s' "$1" | "$script" 2>&1
}

assert_warns() {
  output="$(run_hook "$1")"
  case "$output" in
    *"RTK usage warning:"*) ;;
    *)
      printf 'expected RTK warning for input:\n%s\nactual output:\n%s\n' "$1" "$output" >&2
      exit 1
      ;;
  esac
}

assert_quiet() {
  output="$(run_hook "$1")"
  if [ -n "$output" ]; then
    printf 'expected no RTK warning for input:\n%s\nactual output:\n%s\n' "$1" "$output" >&2
    exit 1
  fi
}

assert_warns '{"tool_name":"Bash","tool_input":{"command":"git status"}}'
assert_warns '{"tool_name":"Bash","tool_input":{"command":"cd src && sed -n '\''1,20p'\'' file.ts"}}'
assert_warns '{"tool_name":"Bash","tool_input":{"command":"FOO=1 bun run test"}}'

assert_quiet '{"tool_name":"Bash","tool_input":{"command":"rtk git status"}}'
assert_quiet '{"tool_name":"Bash","tool_input":{"command":"mkdir -p .agents/tmp"}}'
assert_quiet '{"tool_name":"Edit","tool_input":{"command":"git status"}}'

printf 'rtk-usage-warn tests passed\n'
