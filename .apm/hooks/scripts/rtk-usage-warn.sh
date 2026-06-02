#!/bin/sh
set -eu

if [ "${TABBIN_RTK_USAGE_WARN_DISABLED:-}" = "1" ]; then
  exit 0
fi

hook_input="$(mktemp "${TMPDIR:-/tmp}/apm-rtk-usage.XXXXXX")"
trap 'rm -f "$hook_input"' EXIT HUP INT TERM

cat >"$hook_input" || true

node - "$hook_input" <<'NODE'
const fs = require('fs')
const path = require('path')

const [, , inputPath] = process.argv

const rtkCommands = new Map([
  ['aws', 'rtk aws ...'],
  ['bun', 'rtk bun ...'],
  ['cargo', 'rtk cargo ...'],
  ['cat', 'rtk read <file>'],
  ['docker', 'rtk docker ...'],
  ['find', 'rtk find ...'],
  ['gh', 'rtk gh ...'],
  ['git', 'rtk git ...'],
  ['glab', 'rtk glab ...'],
  ['go', 'rtk go test ...'],
  ['grep', 'rtk grep ...'],
  ['head', 'rtk read <file>'],
  ['jest', 'rtk jest ...'],
  ['kubectl', 'rtk kubectl ...'],
  ['ls', 'rtk ls ...'],
  ['npm', 'rtk npm ...'],
  ['npx', 'rtk npx ...'],
  ['playwright', 'rtk playwright ...'],
  ['pnpm', 'rtk pnpm ...'],
  ['psql', 'rtk psql ...'],
  ['pytest', 'rtk pytest ...'],
  ['rg', 'rtk grep ...'],
  ['sed', 'rtk read <file>'],
  ['tail', 'rtk read <file>'],
  ['tree', 'rtk tree ...'],
  ['tsc', 'rtk tsc ...'],
  ['vitest', 'rtk vitest ...'],
  ['wc', 'rtk wc ...'],
])

const shellTools = new Set(['Bash', 'Shell'])
const leadingWrappers = new Set(['command', 'env', 'noglob', 'sudo', 'time'])

function warn(message) {
  console.error(`RTK usage warning: ${message}`)
}

function getPath(value, pathSegments) {
  let current = value
  for (const segment of pathSegments) {
    if (!current || typeof current !== 'object') return undefined
    current = current[segment]
  }
  return current
}

function isShellPayload(payload) {
  const toolName = payload.tool_name || payload.toolName || payload.name
  if (!toolName) return true
  return shellTools.has(toolName)
}

function commandFromPayload(payload) {
  const candidates = [
    getPath(payload, ['tool_input', 'command']),
    getPath(payload, ['tool_input', 'cmd']),
    getPath(payload, ['toolInput', 'command']),
    getPath(payload, ['toolInput', 'cmd']),
    payload.command,
    payload.cmd,
  ]
  return candidates.find((candidate) => typeof candidate === 'string') || ''
}

function splitShellSegments(command) {
  const segments = []
  let current = ''
  let quote = ''
  let escaping = false

  for (let index = 0; index < command.length; index += 1) {
    const char = command[index]
    const next = command[index + 1]

    if (escaping) {
      current += char
      escaping = false
      continue
    }

    if (char === '\\') {
      current += char
      escaping = true
      continue
    }

    if (quote) {
      current += char
      if (char === quote) quote = ''
      continue
    }

    if (char === '"' || char === "'") {
      current += char
      quote = char
      continue
    }

    if (char === '\n' || char === ';' || char === '|') {
      segments.push(current)
      current = ''
      if ((char === '|' && next === '|') || (char === '&' && next === '&')) index += 1
      continue
    }

    if (char === '&' && next === '&') {
      segments.push(current)
      current = ''
      index += 1
      continue
    }

    current += char
  }

  segments.push(current)
  return segments.map((segment) => segment.trim()).filter(Boolean)
}

function tokenize(segment) {
  const tokens = []
  let current = ''
  let quote = ''
  let escaping = false

  for (const char of segment.trim()) {
    if (escaping) {
      current += char
      escaping = false
      continue
    }
    if (char === '\\') {
      escaping = true
      continue
    }
    if (quote) {
      if (char === quote) quote = ''
      else current += char
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      continue
    }
    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current)
        current = ''
      }
      continue
    }
    current += char
  }
  if (current) tokens.push(current)
  return tokens
}

function normalizeCommandToken(token) {
  return path.basename(token.replace(/^\(+/, '').replace(/\)+$/, ''))
}

function firstExecutable(segment) {
  const tokens = tokenize(segment)
  while (tokens.length) {
    const token = tokens.shift()
    if (!token) continue
    if (/^[A-Za-z_][A-Za-z0-9_]*=.*/.test(token)) continue

    const command = normalizeCommandToken(token)
    if (leadingWrappers.has(command)) continue
    return command
  }
  return ''
}

let payload = {}
try {
  const input = fs.readFileSync(inputPath, 'utf8').trim()
  payload = input ? JSON.parse(input) : {}
} catch {
  process.exit(0)
}

if (!isShellPayload(payload)) process.exit(0)

const command = commandFromPayload(payload)
if (!command.trim()) process.exit(0)

for (const segment of splitShellSegments(command)) {
  const executable = firstExecutable(segment)
  if (!executable || executable === 'rtk') continue

  const replacement = rtkCommands.get(executable)
  if (!replacement) continue

  warn(`\`${executable}\` は \`${replacement}\` で実行できる可能性があります。RTK が詳細を隠す場合だけ \`rtk proxy <cmd>\` や targeted な context-mode を使ってください。`)
  process.exit(0)
}
NODE
