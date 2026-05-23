#!/bin/sh
set -eu

project_dir="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "$project_dir"

case ",${TABBIN_HARNESS_DISABLED_HOOKS:-}," in
  *,activity-track,*) exit 0 ;;
esac

hook_input="$(mktemp "${TMPDIR:-/tmp}/apm-harness-activity.XXXXXX")"
trap 'rm -f "$hook_input"' EXIT HUP INT TERM

cat >"$hook_input" || true
mkdir -p .agents/harness

node - "$hook_input" <<'NODE'
const fs = require('fs')
const path = require('path')

const [, , inputPath] = process.argv
const projectDir = process.cwd()
const activePath = path.join(projectDir, '.agents/harness/ACTIVE')

function readPayload() {
  try {
    const input = fs.readFileSync(inputPath, 'utf8').trim()
    return input ? JSON.parse(input) : {}
  } catch {
    return {}
  }
}

function resolveRunDir(active) {
  if (!active) return path.join(projectDir, '.agents/harness')
  return path.isAbsolute(active)
    ? active
    : path.join(projectDir, '.agents/harness/runs', active)
}

const payload = readPayload()
const active = fs.existsSync(activePath)
  ? fs.readFileSync(activePath, 'utf8').trim()
  : ''
const eventDir = resolveRunDir(active)
fs.mkdirSync(eventDir, { recursive: true })

const event = {
  hook_id: 'activity-track',
  event: payload.hook_event_name || payload.event || 'unknown',
  tool: payload.tool_name || payload.toolName || payload.name || '',
  profile: process.env.TABBIN_HARNESS_PROFILE || 'standard',
  disabled_hook_ids: process.env.TABBIN_HARNESS_DISABLED_HOOKS || '',
  updated_at: new Date().toISOString(),
}

fs.writeFileSync(
  path.join(eventDir, 'activity.jsonl'),
  `${JSON.stringify(event)}\n`,
  { flag: 'a' },
)
NODE
