#!/bin/sh
set -eu

project_dir="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "$project_dir"

hook_input="$(mktemp "${TMPDIR:-/tmp}/apm-harness-first-edit.XXXXXX")"
trap 'rm -f "$hook_input"' EXIT HUP INT TERM

cat >"$hook_input" || true

node - "$hook_input" <<'NODE'
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const [, , inputPath] = process.argv
const activePath = path.join(process.cwd(), '.agents/harness/ACTIVE')

function collectPaths(value, paths = []) {
  if (!value || typeof value !== 'object') return paths
  if (Array.isArray(value)) {
    for (const item of value) collectPaths(item, paths)
    return paths
  }
  for (const [key, item] of Object.entries(value)) {
    if (
      typeof item === 'string' &&
      (key === 'file_path' || key === 'path') &&
      !item.includes('\n')
    ) {
      paths.push(item)
    } else {
      collectPaths(item, paths)
    }
  }
  return paths
}

function projectPath(candidate) {
  const absolute = path.isAbsolute(candidate)
    ? path.normalize(candidate)
    : path.resolve(process.cwd(), candidate)
  const relative = path.relative(process.cwd(), absolute)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    return null
  }
  return relative.split(path.sep).join('/')
}

if (!fs.existsSync(activePath)) {
  process.exit(0)
}

let payload = {}
try {
  const input = fs.readFileSync(inputPath, 'utf8').trim()
  payload = input ? JSON.parse(input) : {}
} catch {
  process.exit(0)
}

const active = fs.readFileSync(activePath, 'utf8').trim()
const runDir = path.isAbsolute(active)
  ? active
  : path.join(process.cwd(), '.agents/harness/runs', active)
const gateDir = path.join(runDir, 'first-edit-gate')
fs.mkdirSync(gateDir, { recursive: true })

const files = collectPaths(payload)
  .map(projectPath)
  .filter(Boolean)
  .filter((filePath) => /\.(ts|tsx|js|jsx|json|md|sh)$/.test(filePath))

const firstFiles = []
for (const filePath of files) {
  const marker = path.join(
    gateDir,
    `${crypto.createHash('sha256').update(filePath).digest('hex')}.json`,
  )
  if (fs.existsSync(marker)) continue
  fs.writeFileSync(
    marker,
    `${JSON.stringify({ file_path: filePath, first_seen_at: new Date().toISOString() }, null, 2)}\n`,
  )
  firstFiles.push(filePath)
}

if (firstFiles.length === 0) {
  process.exit(0)
}

const message =
  `Harness first-edit gate: 初回編集 ${firstFiles.join(', ')}。` +
  ' import 元、既存 helper、schema、テスト、ユーザー要件を確認してから編集してください。'
console.error(message)

if (process.env.TABBIN_HARNESS_STRICT === '1') {
  console.error('strict mode では初回編集を一度止めます。調査後に同じ編集を再実行してください。')
  process.exit(2)
}
NODE
