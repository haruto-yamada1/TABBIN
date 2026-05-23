#!/bin/sh
set -eu

project_dir="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "$project_dir"

hook_input="$(mktemp "${TMPDIR:-/tmp}/apm-harness-safety.XXXXXX")"
trap 'rm -f "$hook_input"' EXIT HUP INT TERM

cat >"$hook_input" || true

node - "$hook_input" <<'NODE'
const fs = require('fs')

const [, , inputPath] = process.argv

function collectStrings(value, strings = []) {
  if (typeof value === 'string') {
    strings.push(value)
    return strings
  }
  if (!value || typeof value !== 'object') {
    return strings
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, strings)
    return strings
  }
  for (const item of Object.values(value)) collectStrings(item, strings)
  return strings
}

function warn(message) {
  console.error(`Harness safety warning: ${message}`)
}

let payload = {}
try {
  const input = fs.readFileSync(inputPath, 'utf8').trim()
  payload = input ? JSON.parse(input) : {}
} catch {
  process.exit(0)
}

const values = collectStrings(payload)
const joined = values.join('\n')

if (/\brm\s+-[^;\n]*r[^;\n]*f\b|\bgit\s+reset\s+--hard\b|\bgit\s+checkout\s+--\b/.test(joined)) {
  warn('破壊的操作の可能性があります。ユーザー明示依頼と対象パスを確認してください。')
}

if (/\b(curl|wget)\b|node\s+-e\s+["'].*fetch\(/s.test(joined)) {
  warn('外部取得または inline HTTP の可能性があります。context-mode の取得経路を優先してください。')
}

if (/(^|[\s"'])(AGENTS\.md|CLAUDE\.md|\.codex\/|\.cursor\/|\.claude\/|\.gemini\/)/.test(joined)) {
  warn('生成先またはクライアント別ファイル編集の可能性があります。必要なら `.apm` source を先に確認してください。')
}
NODE
