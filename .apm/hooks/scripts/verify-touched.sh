#!/bin/sh
set -eu

mode="${1:-stop}"
project_dir="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "$project_dir"

# Hook stdout is reserved for JSON responses. Keep verifier logs on stderr.
exec 1>&2

hook_input="$(mktemp "${TMPDIR:-/tmp}/apm-verify-hook.XXXXXX")"
touched_files_path="$(mktemp "${TMPDIR:-/tmp}/apm-touched-files-path.XXXXXX")"
relevant_touched_files="$(mktemp "${TMPDIR:-/tmp}/apm-relevant-touched.XXXXXX")"
lintable_touched_files="$(mktemp "${TMPDIR:-/tmp}/apm-lintable-touched.XXXXXX")"
related_tests="$(mktemp "${TMPDIR:-/tmp}/apm-related-tests.XXXXXX")"
coverage_includes="$(mktemp "${TMPDIR:-/tmp}/apm-coverage-includes.XXXXXX")"
coverage_excluded="$(mktemp "${TMPDIR:-/tmp}/apm-coverage-excluded.XXXXXX")"
session_key_path="$(mktemp "${TMPDIR:-/tmp}/apm-session-key.XXXXXX")"
coverage_args=''
trap 'rm -f "$hook_input" "$touched_files_path" "$relevant_touched_files" "$lintable_touched_files" "$related_tests" "$coverage_includes" "$coverage_excluded" "$session_key_path" ${coverage_args:+"$coverage_args"}' EXIT HUP INT TERM

cat >"$hook_input" || true

state_dir="$(git rev-parse --git-path apm-hooks/sessions)"
coverage_root="$(git rev-parse --git-path apm-hooks/coverage)"
mkdir -p "$state_dir"
mkdir -p "$coverage_root"

if [ "$mode" = 'publish' ]; then
  should_verify="$(
    node - "$hook_input" <<'NODE'
const fs = require('fs')

const [, , inputPath] = process.argv

try {
  const input = fs.readFileSync(inputPath, 'utf8').trim()
  const payload = input ? JSON.parse(input) : {}
  const command =
    payload.tool_input?.command ||
    payload.toolInput?.command ||
    payload.command ||
    ''

  process.stdout.write(/^\s*git\s+(commit|push)\b/.test(command) ? '1' : '')
} catch {
  process.exit(0)
}
NODE
  )"

  if [ -z "$should_verify" ]; then
    exit 0
  fi
fi

node - "$hook_input" "$state_dir" "$session_key_path" >"$touched_files_path" <<'NODE'
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const [, , inputPath, stateDir, sessionKeyPath] = process.argv

function firstString(...values) {
  return values.find((value) => typeof value === 'string' && value.length > 0)
}

function sessionKey(payload) {
  const rawKey =
    firstString(
      payload.session_id,
      payload.sessionId,
      payload.run_id,
      payload.runId,
      payload.transcript_path,
      payload.transcriptPath,
      process.env.CLAUDE_SESSION_ID,
      process.env.CODEX_SESSION_ID
    )
  if (!rawKey) {
    return null
  }
  return crypto.createHash('sha256').update(rawKey).digest('hex').slice(0, 32)
}

try {
  const input = fs.readFileSync(inputPath, 'utf8').trim()
  const payload = input ? JSON.parse(input) : {}
  const key = sessionKey(payload)
  if (!key) {
    process.exit(0)
  }
  fs.writeFileSync(sessionKeyPath, `${key}\n`)
  process.stdout.write(path.join(stateDir, `${key}.txt`))
} catch (error) {
  console.error(`APM hook warning: failed to resolve touched files state: ${error.message}`)
}
NODE

touched_files="$(cat "$touched_files_path")"
session_key="$(cat "$session_key_path")"

if [ -z "$touched_files" ] || [ -z "$session_key" ]; then
  echo "APM hook: missing session id; skipping ${mode} verification to avoid shared hook state."
  exit 0
fi

lock_waits=0
while [ -d "$touched_files.lock" ] && [ "$lock_waits" -lt 100 ]; do
  sleep 0.05
  lock_waits=$((lock_waits + 1))
done

if [ -f "$touched_files" ]; then
  node - "$touched_files" "$relevant_touched_files" "$lintable_touched_files" <<'NODE'
const fs = require('fs')
const path = require('path')

const [, , touchedFilesPath, relevantOutputPath, lintableOutputPath] = process.argv
const relevantExtensions = new Set([
  '.cjs',
  '.cts',
  '.js',
  '.json',
  '.jsonc',
  '.jsx',
  '.md',
  '.sh',
  '.mjs',
  '.mts',
  '.ts',
  '.tsx',
  '.yaml',
  '.yml',
])
const lintableExtensions = new Set([
  '.cjs',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.mts',
  '.ts',
  '.tsx',
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

function isVerificationRelevant(filePath) {
  const basename = path.basename(filePath)
  return (
    relevantBasenames.has(basename) ||
    relevantPatterns.some((pattern) => pattern.test(basename)) ||
    relevantExtensions.has(path.extname(filePath))
  )
}

function isLintable(filePath) {
  return lintableExtensions.has(path.extname(filePath))
}

const touchedFiles = fs
  .readFileSync(touchedFilesPath, 'utf8')
  .split(/\r?\n/)
  .filter(Boolean)
  .filter(isVerificationRelevant)
const uniqueTouchedFiles = [...new Set(touchedFiles)].sort()
const lintableTouchedFiles = uniqueTouchedFiles.filter(isLintable)

if (uniqueTouchedFiles.length > 0) {
  fs.writeFileSync(relevantOutputPath, `${uniqueTouchedFiles.join('\n')}\n`)
}
if (lintableTouchedFiles.length > 0) {
  fs.writeFileSync(lintableOutputPath, `${lintableTouchedFiles.join('\n')}\n`)
}
NODE
fi

if [ ! -s "$relevant_touched_files" ]; then
  if [ "$mode" = 'stop' ]; then
    rm -f "$touched_files"
  fi
  echo "No verification-relevant files were edited; skipping ${mode} verification."
  exit 0
fi

case "$mode" in
  stop)
    echo 'Formatting touched files before Stop verification:'
    if ! tr '\n' '\0' <"$relevant_touched_files" | xargs -0 bunx oxfmt --write --no-error-on-unmatched-pattern; then
      echo 'Stop blocked: oxfmt failed. Fix the formatting errors before ending the task.' >&2
      exit 2
    fi
    ;;
  publish)
    echo 'Checking formatting for touched files before publish:'
    if ! tr '\n' '\0' <"$relevant_touched_files" | xargs -0 bunx oxfmt --check --no-error-on-unmatched-pattern; then
      echo 'Publish blocked: oxfmt --check failed. Fix formatting before git commit/push.' >&2
      exit 2
    fi
    ;;
  *)
    echo "APM hook warning: unsupported verify mode '$mode'." >&2
    exit 0
    ;;
esac
sed 's/^/- /' "$relevant_touched_files"

if [ -s "$lintable_touched_files" ]; then
  echo 'Linting touched source files:'
  sed 's/^/- /' "$lintable_touched_files"
  if ! tr '\n' '\0' <"$lintable_touched_files" | xargs -0 bunx oxlint; then
    if [ "$mode" = 'publish' ]; then
      echo 'Publish blocked: oxlint failed. Fix lint errors before git commit/push.' >&2
    else
      echo 'Stop blocked: oxlint failed. Fix lint errors before ending the task.' >&2
    fi
    exit 2
  fi
else
  echo 'No lintable source files were touched; skipping oxlint.'
fi

if ! bun run compile; then
  if [ "$mode" = 'publish' ]; then
    echo 'Publish blocked: bun run compile failed. Fix the type errors before git commit/push.' >&2
  else
    echo 'Stop blocked: bun run compile failed. Fix the type errors before ending the task.' >&2
  fi
  exit 2
fi

if [ "$mode" = 'publish' ]; then
  exit 0
fi

node - "$project_dir" "$relevant_touched_files" "$coverage_includes" "$coverage_excluded" >"$related_tests" <<'NODE'
const fs = require('fs')
const path = require('path')

const [
  ,
  ,
  projectDir,
  touchedFilesPath,
  coverageIncludesPath,
  coverageExcludedPath,
] = process.argv

const ignoredDirectories = new Set([
  '.git',
  '.output',
  '.wxt',
  'coverage',
  'coverage-json',
  'dist',
  'node_modules',
  'playwright-report',
  'test-results',
])
const sourceExtensions = [
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.mts',
  '.cts',
]
const testFilePattern = /\.(test|spec)\.[cm]?[jt]sx?$/
const coverageExcludedDirectories = [
  '.storybook/',
  'src/components/',
  'src/components/storybook/',
  'src/lib/storybook/',
]
const coverageExcludedFiles = new Set([
  'src/constants/defaultColors.ts',
  'src/entrypoints/options/main.tsx',
])

function toProjectPath(filePath) {
  return filePath.split(path.sep).join('/')
}

function removeExtension(filePath) {
  for (const extension of sourceExtensions) {
    if (filePath.endsWith(extension)) {
      return filePath.slice(0, -extension.length)
    }
  }

  return filePath
}

function withoutIndex(filePath) {
  return filePath.endsWith('/index') ? filePath.slice(0, -'/index'.length) : filePath
}

function moduleKeys(filePath) {
  const withoutExtension = removeExtension(filePath)
  return new Set([withoutExtension, withoutIndex(withoutExtension)])
}

function isTestFile(filePath) {
  return testFilePattern.test(filePath)
}

function isSourceFile(filePath) {
  return sourceExtensions.includes(path.extname(filePath)) && !isTestFile(filePath)
}

function isCoverageExcluded(filePath) {
  if (coverageExcludedFiles.has(filePath)) {
    return true
  }

  if (filePath.endsWith('.css')) {
    return true
  }

  if (filePath.endsWith('.stories.ts') || filePath.endsWith('.stories.tsx')) {
    return true
  }

  return coverageExcludedDirectories.some((directory) =>
    filePath.startsWith(directory)
  )
}

function walk(directory, results = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (ignoredDirectories.has(entry.name)) {
      continue
    }

    const absolutePath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      walk(absolutePath, results)
      continue
    }

    const relativePath = toProjectPath(path.relative(projectDir, absolutePath))
    if (isTestFile(relativePath)) {
      results.push(relativePath)
    }
  }

  return results
}

function resolveImport(fromFile, specifier) {
  if (specifier.startsWith('@/')) {
    return moduleKeys(specifier.slice(2))
  }

  if (!specifier.startsWith('.')) {
    return new Set()
  }

  const resolved = path.normalize(path.join(path.dirname(fromFile), specifier))
  return moduleKeys(toProjectPath(resolved))
}

function importedSpecifiers(content) {
  const specifiers = []
  const patterns = [
    /\bimport\s+(?:type\s+)?(?:[^'"]+\s+from\s+)?['"]([^'"]+)['"]/g,
    /\bexport\s+(?:type\s+)?[^'"]+\s+from\s+['"]([^'"]+)['"]/g,
    /\b(?:vi|jest)\.mock\(\s*['"]([^'"]+)['"]/g,
    /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
  ]

  for (const pattern of patterns) {
    let match
    while ((match = pattern.exec(content))) {
      specifiers.push(match[1])
    }
  }

  return specifiers
}

function sameStemTest(testFile, touchedFile) {
  if (path.dirname(testFile) !== path.dirname(touchedFile)) {
    return false
  }

  const testStem = path.basename(testFile).replace(/\.(test|spec)\.[^.]+$/, '')
  return testStem === path.basename(removeExtension(touchedFile))
}

const touchedFiles = fs
  .readFileSync(touchedFilesPath, 'utf8')
  .split(/\r?\n/)
  .filter(Boolean)
const touchedSourceFiles = touchedFiles.filter(isSourceFile)
const coverageIncludes = touchedSourceFiles.filter(
  (file) => !isCoverageExcluded(file)
)
const coverageExcluded = touchedSourceFiles.filter(isCoverageExcluded)
const touchedKeys = new Set(touchedFiles.flatMap((file) => [...moduleKeys(file)]))
const tests = walk(projectDir).sort()
const relatedTests = new Set()

for (const touchedFile of touchedFiles) {
  if (isTestFile(touchedFile)) {
    relatedTests.add(touchedFile)
  }

  for (const testFile of tests) {
    if (sameStemTest(testFile, touchedFile)) {
      relatedTests.add(testFile)
    }
  }
}

for (const testFile of tests) {
  const absoluteTestPath = path.join(projectDir, testFile)
  let content = ''

  try {
    content = fs.readFileSync(absoluteTestPath, 'utf8')
  } catch {
    continue
  }

  for (const specifier of importedSpecifiers(content)) {
    const importedKeys = resolveImport(testFile, specifier)
    if ([...importedKeys].some((key) => touchedKeys.has(key))) {
      relatedTests.add(testFile)
      break
    }
  }
}

const sortedRelatedTests = [...relatedTests].sort()
const sortedCoverageIncludes = [...new Set(coverageIncludes)].sort()
const sortedCoverageExcluded = [...new Set(coverageExcluded)].sort()
if (sortedCoverageIncludes.length > 0) {
  fs.writeFileSync(coverageIncludesPath, `${sortedCoverageIncludes.join('\n')}\n`)
}
if (sortedCoverageExcluded.length > 0) {
  fs.writeFileSync(coverageExcludedPath, `${sortedCoverageExcluded.join('\n')}\n`)
}
if (sortedRelatedTests.length > 0) {
  process.stdout.write(`${sortedRelatedTests.join('\n')}\n`)
}
NODE

if [ -s "$related_tests" ]; then
  echo 'Running related coverage tests:'
  sed 's/^/- /' "$related_tests"
  if [ -s "$coverage_excluded" ]; then
    echo 'Coverage 100% check excluded by vitest.ci.config.ts:'
    sed 's/^/- /' "$coverage_excluded"
  fi
  coverage_args="$(mktemp "${TMPDIR:-/tmp}/apm-coverage-args.XXXXXX")"
  {
    printf '%s\n' \
      "--coverage.reportsDirectory=$coverage_root/$session_key" \
      "--coverage.reporter=text" \
      "--coverage.thresholds.100" \
      "--coverage.thresholds.perFile"
    while IFS= read -r coverage_file; do
      [ -n "$coverage_file" ] || continue
      printf '%s\n' "--coverage.include=$coverage_file"
    done <"$coverage_includes"
    cat "$related_tests"
  } >"$coverage_args"
  if ! tr '\n' '\0' <"$coverage_args" | xargs -0 bun run test:coverage --; then
    echo 'Stop blocked: related coverage tests failed. Fix the reported test failures before ending the task.' >&2
    exit 2
  fi
else
  echo 'No related tests found for touched files; skipping targeted coverage test run.'
fi

rm -f "$touched_files"
exit 0
