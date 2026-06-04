#!/bin/sh
set -eu

project_dir="$(cd "$(dirname "$0")/../.." && pwd)"
script="$project_dir/.apm/hooks/scripts/rtk-usage-replace.sh"

run_hook() {
  printf '%s' "$1" | "$script" 2>&1
}

assert_replaces() {
  input="$1"
  expected="$2"
  output="$(run_hook "$input")"
  case "$output" in
    *"$expected"*) ;;
    *)
      printf 'expected replacement %s for input:\n%s\nactual output:\n%s\n' "$expected" "$input" "$output" >&2
      exit 1
      ;;
  esac
}

assert_quiet() {
  output="$(run_hook "$1")"
  if [ -n "$output" ]; then
    printf 'expected no output for input:\n%s\nactual output:\n%s\n' "$1" "$output" >&2
    exit 1
  fi
}

assert_replaces \
  '{"tool_name":"Bash","tool_input":{"command":"git status"}}' \
  'rtk git status'

assert_replaces \
  '{"tool_name":"Bash","tool_input":{"command":"cd src && git status"}}' \
  'cd src && rtk git status'

assert_replaces \
  '{"tool_name":"Bash","tool_input":{"command":"FOO=1 bun run test"}}' \
  'FOO=1 rtk bun run test'

assert_replaces \
  '{"tool_name":"Bash","tool_input":{"command":"sudo git push"}}' \
  'sudo rtk git push'

assert_replaces \
  '{"tool_name":"Bash","tool_input":{"command":"cd src; git status"}}' \
  'rtk git status'

assert_quiet '{"tool_name":"Bash","tool_input":{"command":"rtk git status"}}'
assert_quiet '{"tool_name":"Bash","tool_input":{"command":"mkdir -p .agents/tmp"}}'
assert_quiet '{"tool_name":"Edit","tool_input":{"command":"git status"}}'

printf 'rtk-usage-replace tests passed\n'
