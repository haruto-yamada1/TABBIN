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

const rtkCommands = new Set([
  'aws', 'bun', 'cargo', 'cat', 'docker', 'find', 'gh', 'git', 'glab',
  'go', 'grep', 'head', 'jest', 'kubectl', 'ls', 'npm', 'npx',
  'playwright', 'pnpm', 'psql', 'pytest', 'rg', 'sed', 'tail',
  'tree', 'tsc', 'vitest', 'wc',
])

const shellTools = new Set(['Bash', 'Shell'])
const leadingWrappers = new Set(['command', 'env', 'noglob', 'sudo', 'time'])

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

    if (char === '\n' || char === ';') {
      segments.push({ text: current, sep: char })
      current = ''
      continue
    }

    if (char === '|') {
      if (next === '|') {
        segments.push({ text: current, sep: '||' })
        current = ''
        index += 1
      } else {
        segments.push({ text: current, sep: '|' })
        current = ''
      }
      continue
    }

    if (char === '&' && next === '&') {
      segments.push({ text: current, sep: '&&' })
      current = ''
      index += 1
      continue
    }

    current += char
  }

  segments.push({ text: current, sep: '' })
  return segments
    .map((s) => ({ text: s.text.trim(), sep: s.sep }))
    .filter((s) => s.text)
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

function replaceSegmentExecutable(segment) {
  const tokens = tokenize(segment)
  let skipped = 0

  while (skipped < tokens.length) {
    const token = tokens[skipped]
    if (!token) { skipped += 1; continue }
    if (/^[A-Za-z_][A-Za-z0-9_]*=.*/.test(token)) { skipped += 1; continue }

    const command = normalizeCommandToken(token)
    if (leadingWrappers.has(command)) { skipped += 1; continue }

    if (command === 'rtk') return null

    if (!rtkCommands.has(command)) return null

    const before = segment.slice(0, segment.indexOf(token))
    const after = segment.slice(segment.indexOf(token) + token.length)
    return `${before}rtk ${token}${after}`
  }
  return null
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

const segments = splitShellSegments(command)
const replaced = []
let hasReplacement = false

for (const { text, sep } of segments) {
  const result = replaceSegmentExecutable(text)
  if (result) {
    replaced.push(result + (sep ? ` ${sep}` : ''))
    hasReplacement = true
  } else {
    replaced.push(text + (sep ? ` ${sep}` : ''))
  }
}

if (!hasReplacement) process.exit(0)

const newCommand = replaced.join(' ').replace(/\s+$/, '')

const result = {
  continue: false,
  stopReason: `コマンドを \`${newCommand}\` に置換してください。rtk を使って実行してください。`,
  systemMessage: `このコマンドは rtk を使って実行してください。\n元のコマンド: \`${command}\`\n置換後: \`${newCommand}\`\n\`${newCommand}\` を実行してください。`,
}

console.log(JSON.stringify(result))
NODE
