#!/bin/sh
set -eu

project_dir="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "$project_dir"

hook_input="$(mktemp "${TMPDIR:-/tmp}/apm-track-edit-hook.XXXXXX")"
trap 'rm -f "$hook_input"' EXIT HUP INT TERM

cat >"$hook_input" || true

state_dir="$(git rev-parse --git-path apm-hooks/sessions)"
mkdir -p "$state_dir"

node - "$hook_input" "$project_dir" "$state_dir" <<'NODE'
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const [, , inputPath, projectDir, stateDir] = process.argv

const relevantExtensions = new Set([
  '.cjs',
  '.cts',
  '.js',
  '.json',
  '.jsonc',
  '.jsx',
  '.sh',
  '.mjs',
  '.mts',
  '.ts',
  '.tsx',
  '.yaml',
  '.yml',
  '.md',
])
const relevantBasenames = new Set([
  '.jscpd.json',
  '.oxfmtrc.json',
  '.oxlintrc.json',
  'bun.lock',
  'package.json',
  'postcss.config.cjs',
  'tailwind.config.ts',
  'tsconfig.json',
])
const relevantPatterns = [
  /^tsconfig\..+\.json$/,
  /^vitest\..+\.config\.[cm]?[jt]s$/,
  /^vite\..+\.config\.[cm]?[jt]s$/,
  /^wxt\.config\.[cm]?[jt]s$/,
  /^knip\.(json|[cm]?[jt]s)$/,
  /^playwright\.config\.[cm]?[jt]s$/,
]

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

function firstString(...values) {
  return values.find((value) => typeof value === 'string' && value.length > 0)
}

function sessionKey(payload) {
  const rawKey = firstString(
    payload.session_id,
    payload.sessionId,
    payload.run_id,
    payload.runId,
    payload.transcript_path,
    payload.transcriptPath,
    process.env.CLAUDE_SESSION_ID,
    process.env.CODEX_SESSION_ID,
  )

  return rawKey
    ? crypto.createHash('sha256').update(rawKey).digest('hex').slice(0, 32)
    : null
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

function isVerificationRelevant(filePath) {
  const basename = path.basename(filePath)
  return (
    relevantBasenames.has(basename) ||
    relevantPatterns.some((pattern) => pattern.test(basename)) ||
    relevantExtensions.has(path.extname(filePath))
  )
}

function withLock(lockPath, callback) {
  const deadline = Date.now() + 5000

  while (true) {
    try {
      fs.mkdirSync(lockPath)
      break
    } catch (error) {
      if (error.code !== 'EEXIST' || Date.now() > deadline) {
        throw error
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50)
    }
  }

  try {
    return callback()
  } finally {
    fs.rmSync(lockPath, { force: true, recursive: true })
  }
}

try {
  const input = fs.readFileSync(inputPath, 'utf8').trim()
  if (!input) {
    process.exit(0)
  }

  const payload = JSON.parse(input)
  const key = sessionKey(payload)
  if (!key) {
    console.error('APM hook warning: missing session id; skipping touched file tracking.')
    process.exit(0)
  }

  const touchedFilesPath = path.join(stateDir, `${key}.txt`)
  const lockPath = `${touchedFilesPath}.lock`
  const nextPaths = collectTouchedPaths(payload)
    .map(normalizeProjectPath)
    .filter(Boolean)
    .filter(isVerificationRelevant)

  if (nextPaths.length === 0) {
    process.exit(0)
  }

  withLock(lockPath, () => {
    const previousPaths = fs.existsSync(touchedFilesPath)
      ? fs.readFileSync(touchedFilesPath, 'utf8').split(/\r?\n/).filter(Boolean)
      : []
    const allPaths = [...new Set([...previousPaths, ...nextPaths])].sort()

    fs.writeFileSync(touchedFilesPath, `${allPaths.join('\n')}\n`)
  })
} catch (error) {
  console.error(`APM hook warning: failed to record touched files: ${error.message}`)
}
NODE
