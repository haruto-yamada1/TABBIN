#!/bin/sh
set -eu

project_dir="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "$project_dir"

hook_input="$(mktemp "${TMPDIR:-/tmp}/apm-harness-config-protection.XXXXXX")"
trap 'rm -f "$hook_input"' EXIT HUP INT TERM

cat >"$hook_input" || true

node - "$hook_input" <<'NODE'
const fs = require('fs')
const path = require('path')

const [, , inputPath] = process.argv
const protectedPatterns = [
  /^\.oxlintrc\.json$/,
  /^\.oxfmtrc\.json$/,
  /^\.jscpd\.json$/,
  /^knip\.(json|[cm]?[jt]s)$/,
  /^tsconfig(\..+)?\.json$/,
  /^vitest\..+\.config\.[cm]?[jt]s$/,
  /^wxt\.config\.[cm]?[jt]s$/,
  /^playwright\.config\.[cm]?[jt]s$/,
]

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

function collectApplyPatchPaths(text, paths = []) {
  if (typeof text !== 'string' || !text.includes('*** Begin Patch')) return paths
  for (const line of text.split(/\r?\n/)) {
    for (const prefix of [
      '*** Update File: ',
      '*** Add File: ',
      '*** Delete File: ',
      '*** Move to: ',
    ]) {
      if (line.startsWith(prefix)) paths.push(line.slice(prefix.length).trim())
    }
  }
  return paths
}

function collectTouchedPaths(value, paths = []) {
  if (!value || typeof value !== 'object') return paths
  if (Array.isArray(value)) {
    for (const item of value) collectTouchedPaths(item, paths)
    return paths
  }
  collectPaths(value, paths)
  for (const item of Object.values(value)) {
    if (typeof item === 'string') {
      collectApplyPatchPaths(item, paths)
    } else {
      collectTouchedPaths(item, paths)
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

let payload = {}
try {
  const input = fs.readFileSync(inputPath, 'utf8').trim()
  payload = input ? JSON.parse(input) : {}
} catch {
  process.exit(0)
}

const protectedFiles = collectTouchedPaths(payload)
  .map(projectPath)
  .filter(Boolean)
  .filter((filePath) =>
    protectedPatterns.some((pattern) => pattern.test(path.basename(filePath)))
  )

if (protectedFiles.length === 0) {
  process.exit(0)
}

const message =
  `Harness config protection: ${protectedFiles.join(', ')} は品質ゲート設定です。` +
  ' 設定を弱める前に、コード側の修正で解決できないか確認してください。'
console.error(message)

if (process.env.TABBIN_HARNESS_STRICT === '1') {
  console.error(
    'TABBIN_HARNESS_ALLOW_CONFIG_EDIT=1 を明示するまで strict mode ではブロックします.',
  )
  if (process.env.TABBIN_HARNESS_ALLOW_CONFIG_EDIT !== '1') {
    process.exit(2)
  }
}
NODE
