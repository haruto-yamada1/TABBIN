#!/bin/sh
set -eu

project_dir="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "$project_dir"

hook_input="$(mktemp "${TMPDIR:-/tmp}/apm-format-check.XXXXXX")"
trap 'rm -f "$hook_input"' EXIT HUP INT TERM
cat >"$hook_input" || true

node - "$hook_input" "$project_dir" <<'NODE'
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const [, , inputPath, projectDir] = process.argv

const relevantExtensions = new Set([
  '.cjs',
  '.cts',
  '.css',
  '.js',
  '.jsx',
  '.json',
  '.jsonc',
  '.md',
  '.mjs',
  '.mts',
  '.ts',
  '.tsx',
  '.yaml',
  '.yml',
])

function collectPaths(value, paths = []) {
  if (!value || typeof value !== 'object') {
    return paths
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectPaths(item, paths)
    }
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
  if (typeof text !== 'string' || !text.includes('*** Begin Patch')) {
    return paths
  }
  for (const line of text.split(/\r?\n/)) {
    for (const prefix of [
      '*** Update File: ',
      '*** Add File: ',
      '*** Delete File: ',
      '*** Move to: ',
    ]) {
      if (line.startsWith(prefix)) {
        paths.push(line.slice(prefix.length).trim())
      }
    }
  }
  return paths
}

function collectTouchedPaths(value, paths = []) {
  if (!value || typeof value !== 'object') {
    return paths
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectTouchedPaths(item, paths)
    }
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

function normalizeProjectPath(candidate) {
  const absolutePath = path.isAbsolute(candidate)
    ? path.normalize(candidate)
    : path.resolve(projectDir, candidate)
  const relativePath = path.relative(projectDir, absolutePath)
  if (
    relativePath === '' ||
    relativePath.startsWith('..') ||
    path.isAbsolute(relativePath)
  ) {
    return null
  }
  return relativePath.split(path.sep).join('/')
}

try {
  const raw = fs.readFileSync(inputPath, 'utf8').trim()
  if (!raw) {
    process.exit(0)
  }
  const payload = JSON.parse(raw)

  const touchedPaths = [
    ...new Set(
      collectTouchedPaths(payload)
        .map(normalizeProjectPath)
        .filter(Boolean),
    ),
  ]
    .filter((rel) => relevantExtensions.has(path.extname(rel)))
    .filter((rel) => fs.existsSync(path.resolve(projectDir, rel)))

  if (touchedPaths.length === 0) {
    process.exit(0)
  }

  const failed = []
  for (const rel of touchedPaths) {
    const abs = path.resolve(projectDir, rel)
    try {
      execFileSync('bunx', ['oxfmt', '--check', abs], {
        cwd: projectDir,
        stdio: 'pipe',
      })
    } catch (error) {
      failed.push(rel)
    }
  }

  if (failed.length > 0) {
    console.error(
      'APM format check: 以下のファイルに oxfmt 違反があります。`bun run format` で自動修正してください。',
    )
    for (const rel of failed) {
      console.error(`  - ${rel}`)
    }
    // PostToolUse で exit 2 = hook error 扱いでブロック可能なことを示す。
    // Edit/Write/MultiEdit/apply_patch の戻り値としては surfaced される。
    process.exit(2)
  }
} catch (error) {
  console.error(`APM format check warning: ${error.message}`)
}
NODE
