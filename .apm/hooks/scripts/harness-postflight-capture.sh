#!/bin/sh
set -eu

project_dir="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "$project_dir"

hook_input="$(mktemp "${TMPDIR:-/tmp}/apm-harness-postflight.XXXXXX")"
trap 'rm -f "$hook_input"' EXIT HUP INT TERM

cat >"$hook_input" || true

node - "$hook_input" <<'NODE'
const fs = require('fs')
const path = require('path')

const [, , inputPath] = process.argv
const activePath = path.join(process.cwd(), '.agents/harness/ACTIVE')

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }
}

function summarize(payload) {
  const toolName =
    payload.tool_name ||
    payload.toolName ||
    payload.name ||
    payload.hook_event_name ||
    'unknown'
  const command =
    payload.tool_input?.command ||
    payload.toolInput?.command ||
    payload.command ||
    ''
  return { toolName, command: String(command).slice(0, 300) }
}

const payload = readJson(inputPath)
if (!payload) process.exit(0)

const active = fs.existsSync(activePath)
  ? fs.readFileSync(activePath, 'utf8').trim()
  : ''
const eventDir = active
  ? path.join(
      process.cwd(),
      '.agents/harness/runs',
      path.basename(active),
    )
  : path.join(process.cwd(), '.agents/harness')
fs.mkdirSync(eventDir, { recursive: true })

const event = {
  ...summarize(payload),
  source: 'postflight-hook',
  updated_at: new Date().toISOString(),
}

fs.writeFileSync(
  path.join(eventDir, 'events.jsonl'),
  `${JSON.stringify(event)}\n`,
  { flag: 'a' },
)
NODE
