import { spawnSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { verifyCandidateValidation } from './candidate-validation'
import { decideResult, validateManifest } from './contract'
import type { IssueCase } from './contract'
import { executionPreflight } from './preflight'
import { saveReport } from './report'
import type { EvaluationReport } from './report'
import {
  buildArguments,
  buildSandboxArguments,
  runProcess,
  sanitizedEnvironment,
  summarizeEvents,
} from './runtime'
import { guardedPackage } from './scope'
import {
  createSnapshot,
  fingerprint,
  implementationFingerprint,
  installGuidance,
  installWorkspaceSkills,
} from './snapshot'
import { inspectTestReport } from './test-report'
import { prepareValidation } from './validation'

function git(root: string, args: string[], input?: string): string {
  const result = spawnSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    input,
    timeout: 60000,
    maxBuffer: 32 * 1024 * 1024,
    env: {
      ...sanitizedEnvironment(),
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: '/dev/null',
    },
  })
  if (result.status !== 0) {
    throw new Error('Git preparation failed')
  }
  return result.stdout
}
function resource(root: string, file: string): string {
  const base = realpathSync(path.join(root, 'evals/codex-issues'))
  const resolved = realpathSync(path.join(base, file))
  if (!resolved.startsWith(`${base}/`) || !lstatSync(resolved).isFile()) {
    throw new Error('Invalid evaluation resource')
  }
  return resolved
}
export function loadManifest(root: string, oracleRoot = root) {
  const manifest = validateManifest(
    JSON.parse(
      readFileSync(
        path.join(oracleRoot, 'evals/codex-issues/manifest.json'),
        'utf8',
      ),
    ),
  )
  for (const item of manifest.cases) {
    const patch = readFileSync(
      resource(oracleRoot, item.referencePatch),
      'utf8',
    )
    resource(oracleRoot, item.hiddenTest)
    for (const additional of item.additionalHiddenTests ?? []) {
      resource(oracleRoot, additional.hiddenTest)
    }
    const patchFiles = [...patch.matchAll(/^diff --git a\/(.+) b\/(.+)$/gmu)]
    if (
      !patchFiles.length ||
      patchFiles.some(
        (match) =>
          match[1] !== match[2] || !item.allowedPaths.includes(match[2] ?? ''),
      )
    ) {
      throw new Error('Reference patch exceeds fixed edit scope')
    }
    if (
      git(root, ['rev-parse', `${item.startCommit}^{commit}`]).trim() !==
      item.startCommit
    ) {
      throw new Error('Pinned start commit unavailable')
    }
    const files = git(root, [
      'ls-tree',
      '-r',
      '--name-only',
      item.startCommit,
    ]).split('\n')
    if (
      [
        item.hiddenTestTarget,
        ...(item.additionalHiddenTests ?? []).map(
          (test) => test.hiddenTestTarget,
        ),
      ].some((file) => files.includes(file))
    ) {
      throw new Error('Hidden grader must not replace a test')
    }
  }
  return manifest
}
function commandVersion(command: string, expected: RegExp): string {
  const version = spawnSync(command, ['--version'], { encoding: 'utf8' })
  if (version.status !== 0 || !expected.test(version.stdout.trim())) {
    throw new Error('Required pinned runtime unavailable')
  }
  return version.stdout.trim()
}
async function prepare(
  root: string,
  item: IssueCase,
  directory: string,
  oracleRoot: string,
) {
  const seed = path.join(directory, 'seed')
  const workspace = path.join(directory, 'agent')
  mkdirSync(seed, { mode: 0o700 })
  const archive = spawnSync('git', ['archive', item.startCommit], {
    cwd: root,
    timeout: 60000,
    maxBuffer: 64 * 1024 * 1024,
  })
  if (archive.status !== 0) {
    throw new Error('Pinned archive unavailable')
  }
  const unpack = spawnSync('tar', ['-xf', '-', '-C', seed], {
    input: archive.stdout,
  })
  if (unpack.status !== 0) {
    throw new Error('Archive extraction failed')
  }
  installGuidance(oracleRoot, seed)
  git(seed, ['init', '--quiet'])
  git(seed, ['add', '.'])
  git(seed, [
    '-c',
    'user.name=Evaluation',
    '-c',
    'user.email=eval@example.invalid',
    '-c',
    'core.hooksPath=/dev/null',
    'commit',
    '--quiet',
    '-m',
    'Pinned task snapshot',
  ])
  git(seed, ['worktree', 'add', '--quiet', '--detach', workspace, 'HEAD'])
  installWorkspaceSkills(oracleRoot, workspace)
  const installed = await runProcess('bun', ['install', '--frozen-lockfile'], {
    cwd: workspace,
    env: sanitizedEnvironment(),
    timeoutMs: 180000,
  })
  if (installed.exitCode !== 0 || installed.timedOut || installed.outputLimit) {
    throw new Error('Historical frozen dependency preparation failed')
  }
  mkdirSync(path.join(workspace, '.agent-tmp'), { mode: 0o700 })
  const validationArguments = prepareValidation(workspace)
  const readRoots = [
    realpathSync(path.dirname(process.execPath)),
    realpathSync(path.join(workspace, 'node_modules')),
  ]
  const bunPath = spawnSync('which', ['bun'], {
    encoding: 'utf8',
  }).stdout.trim()
  if (!bunPath) {
    throw new Error('Pinned Bun unavailable')
  }
  readRoots.push(path.dirname(realpathSync(bunPath)))
  const nodePath = spawnSync('node', ['-p', 'process.execPath'], {
    encoding: 'utf8',
  }).stdout.trim()
  readRoots.push(path.dirname(realpathSync(nodePath)))
  if (existsSync('/System/Library/OpenSSL/openssl.cnf')) {
    readRoots.push('/System/Library/OpenSSL/openssl.cnf')
  }
  for (const file of item.allowedPaths) {
    const target = path.join(workspace, file)
    if (!existsSync(target)) {
      mkdirSync(path.dirname(target), { recursive: true })
      writeFileSync(target, '')
    }
  }
  await verifyCandidateValidation(
    workspace,
    readRoots,
    item,
    validationArguments,
    root,
  )
  return { seed, workspace, readRoots, oracleRoot, validationArguments }
}
function candidatePatch(workspace: string, item: IssueCase) {
  const changed = git(workspace, ['status', '--porcelain', '-uall'])
    .split('\n')
    .filter(Boolean)
    .map((line) => line.slice(3))
    .filter((file) => !file.startsWith('.agent-tmp/'))
  let withinScope =
    changed.length > 0 &&
    changed.every((file) => item.allowedPaths.includes(file))
  for (const file of item.allowedPaths) {
    const target = path.join(workspace, file)
    if (
      !existsSync(target) ||
      !lstatSync(target).isFile() ||
      lstatSync(target).isSymbolicLink()
    ) {
      withinScope = false
    }
  }
  if (changed.includes('package.json')) {
    withinScope &&= guardedPackage(
      git(workspace, ['show', 'HEAD:package.json']),
      readFileSync(path.join(workspace, 'package.json'), 'utf8'),
    )
  }
  if (!withinScope) {
    return { withinScope, patch: '' }
  }
  git(workspace, ['add', '--intent-to-add', '--', ...item.allowedPaths])
  return {
    withinScope,
    patch: git(workspace, [
      'diff',
      'HEAD',
      '--binary',
      '--',
      ...item.allowedPaths,
    ]),
  }
}
async function serial<T>(
  items: readonly T[],
  operation: (item: T, index: number) => Promise<void>,
  index = 0,
): Promise<void> {
  const item = items[index]
  if (item === undefined) {
    return
  }
  await operation(item, index)
  await serial(items, operation, index + 1)
}

function readTestResult(grader: string, name: string, expected: number) {
  try {
    return inspectTestReport(
      readFileSync(path.join(grader, '.agent-tmp', name), 'utf8'),
      expected,
    )
  } catch {
    return { valid: false, passed: false, failures: null }
  }
}
function classifyFailure(output: string): string {
  if (/permission denied|operation not permitted/iu.test(output)) {
    return 'sandbox_denied'
  }
  if (/assertionerror|failed tests/iu.test(output)) {
    return 'test_failure'
  }
  if (/timeout/iu.test(output)) {
    return 'timeout'
  }
  return 'tool_failure'
}

async function grade(
  root: string,
  item: IssueCase,
  attempt: Awaited<ReturnType<typeof prepare>>,
  directory: string,
  patch: string,
  hiddenOnly = false,
) {
  const grader = path.join(directory, 'grader')
  git(attempt.seed, ['worktree', 'add', '--quiet', '--detach', grader, 'HEAD'])
  cpSync(
    path.join(attempt.workspace, 'node_modules'),
    path.join(grader, 'node_modules'),
    { recursive: true, dereference: false },
  )
  const legacyModules = path.join(
    attempt.workspace,
    'tools/legacy-tooling/node_modules',
  )
  if (existsSync(legacyModules)) {
    cpSync(
      legacyModules,
      path.join(grader, 'tools/legacy-tooling/node_modules'),
      { recursive: true, dereference: false },
    )
  }
  if (existsSync(path.join(attempt.workspace, '.wxt'))) {
    cpSync(path.join(attempt.workspace, '.wxt'), path.join(grader, '.wxt'), {
      recursive: true,
    })
  }
  if (patch) {
    git(grader, ['apply', '--binary', '-'], patch)
  }
  const validationArguments = prepareValidation(grader)
  mkdirSync(path.join(grader, '.agent-tmp/swc'), {
    recursive: true,
    mode: 0o700,
  })
  const hidden = path.join(grader, item.hiddenTestTarget)
  mkdirSync(path.dirname(hidden), { recursive: true })
  cpSync(resource(attempt.oracleRoot, item.hiddenTest), hidden)
  for (const additional of item.additionalHiddenTests ?? []) {
    const target = path.join(grader, additional.hiddenTestTarget)
    mkdirSync(path.dirname(target), { recursive: true })
    cpSync(resource(attempt.oracleRoot, additional.hiddenTest), target)
  }
  const commands = [
    [
      'node',
      [
        'node_modules/vitest/vitest.mjs',
        'run',
        '--config',
        'vitest.ci.config.ts',
        ...validationArguments,
        item.hiddenTestTarget,
        ...(item.additionalHiddenTests ?? []).map(
          (test) => test.hiddenTestTarget,
        ),
        '--reporter=json',
        '--outputFile=.agent-tmp/hidden-result.json',
      ],
    ],
    [
      'node',
      [
        'node_modules/vitest/vitest.mjs',
        'run',
        '--config',
        'vitest.ci.config.ts',
        ...validationArguments,
        ...item.regressionTests,
        '--reporter=json',
        '--outputFile=.agent-tmp/regression-result.json',
      ],
    ],
    ['node', ['node_modules/typescript/bin/tsc', '--noEmit']],
    [
      'node',
      [
        existsSync(path.join(grader, 'tools/legacy-tooling/arch-check.mjs'))
          ? 'tools/legacy-tooling/arch-check.mjs'
          : 'node_modules/dependency-cruiser/bin/dependency-cruiser.mjs',
        '--config',
        '.dependency-cruiser.cjs',
        'src',
        '--output-type',
        'err',
      ],
    ],
  ] as const
  const results: {
    gate: string
    passed: boolean
    elapsedMs: number
    exitCode: number | null
    assertionsFailed: number | null
    diagnostic: string | null
  }[] = []
  await serial(
    commands.slice(0, hiddenOnly ? 1 : 4),
    async ([command, args]) => {
      const result = await runProcess(
        'codex',
        [
          ...buildSandboxArguments(grader, attempt.readRoots, [
            root,
            attempt.seed,
          ]),
          command,
          ...args,
        ],
        {
          cwd: grader,
          env: {
            ...sanitizedEnvironment(),
            SWC_NATIVE_BINDING_CACHE: path.join(grader, '.agent-tmp/swc'),
            TMPDIR: path.join(grader, '.agent-tmp'),
          },
          timeoutMs: 180000,
        },
      )
      const report =
        results.length < 2
          ? readTestResult(
              grader,
              results.length === 0
                ? 'hidden-result.json'
                : 'regression-result.json',
              results.length === 0
                ? item.expectedHiddenTests
                : item.expectedRegressionTests,
            )
          : null
      results.push({
        gate:
          ['hidden', 'vitest', 'compile', 'ddd'][results.length] ?? 'unknown',
        assertionsFailed: report?.failures ?? null,
        diagnostic:
          result.exitCode === 0
            ? null
            : classifyFailure(result.stdout + result.stderr),
        passed:
          result.exitCode === 0 &&
          !result.timedOut &&
          !result.outputLimit &&
          (report === null || report.passed),
        elapsedMs: result.elapsedMs,
        exitCode: result.exitCode,
      })
      writeFileSync(
        path.join(directory, `grade-${results.length}.log`),
        result.stdout + result.stderr,
        { mode: 0o600 },
      )
    },
  )
  git(attempt.seed, ['worktree', 'remove', '--force', grader])
  return results
}
type EvaluationOptions = {
  root: string
  mode: 'mock' | 'baseline' | 'real'
  output: string
  run: boolean
  model: string
  effort: string
  seconds: number
  maxTokens: number
  cadence: 'change' | 'weekly' | 'monthly'
  optIn: boolean
  caseId?: string
  snapshotRoot?: string
}
async function evaluateCase(
  options: EvaluationOptions,
  item: IssueCase,
): Promise<Record<string, unknown>> {
  const { root, mode } = options
  let returnRecord: Record<string, unknown> = {}
  if (mode === 'mock') {
    const sample = {
      completed: true,
      timedOut: false,
      outputLimit: false,
      exitCode: 0,
      invalidEvents: false,
      inputTokens: 100,
      outputTokens: 10,
      withinScope: true,
      gates: [true, true, true, true],
      maxTokens: options.maxTokens,
    }
    returnRecord = {
      id: item.id,
      status: decideResult(sample),
      synthetic: true,
      startCommit: item.startCommit,
      issue: item.issue,
    }
    return returnRecord
  }
  const directory = realpathSync(
    mkdtempSync(path.join(tmpdir(), 'tabbin-issue-eval-')),
  )
  try {
    const attempt = await prepare(
      root,
      item,
      directory,
      options.snapshotRoot ?? root,
    )
    if (mode === 'baseline') {
      const red = await grade(root, item, attempt, directory, '', true)
      const gates = await grade(
        root,
        item,
        attempt,
        directory,
        readFileSync(
          resource(options.snapshotRoot ?? root, item.referencePatch),
          'utf8',
        ),
      )
      returnRecord = {
        id: item.id,
        issue: item.issue,
        startCommit: item.startCommit,
        status:
          (red[0]?.assertionsFailed ?? 0) > 0 &&
          gates.every((gate) => gate.passed)
            ? 'passed'
            : 'baseline_failed',
        redDetected: (red[0]?.assertionsFailed ?? 0) > 0,
        red: red[0],
        gates,
        synthetic: false,
      }
    } else {
      const result = await runProcess(
        'codex',
        buildArguments({
          workspace: attempt.workspace,
          allowedPaths: item.allowedPaths,
          model: options.model,
          effort: options.effort,
          readRoots: attempt.readRoots,
          denyReadPaths: [root, attempt.seed, attempt.oracleRoot],
        }),
        {
          cwd: attempt.workspace,
          env: sanitizedEnvironment(),
          input: `${item.prompt}\n\nImplement only this task. Edit only: ${item.allowedPaths.join(', ')}.\nDo not commit, publish, fetch history, or access grading resources. If package.json is edited, preserve all fields and existing imports; new aliases may only target ./src/constants/language.ts. Temporary files belong in .agent-tmp. Run local tests with node node_modules/vitest/vitest.mjs run --config vitest.ci.config.ts ${attempt.validationArguments.join(' ')} ${item.regressionTests.join(' ')} and typecheck with node node_modules/typescript/bin/tsc --noEmit.\n`,
          timeoutMs: options.seconds * 1000,
        },
      )
      const usage = summarizeEvents(result.stdout)
      const candidate = candidatePatch(attempt.workspace, item)
      const gates = candidate.withinScope
        ? await grade(root, item, attempt, directory, candidate.patch)
        : []
      const status = decideResult({
        ...result,
        ...usage,
        withinScope: candidate.withinScope,
        gates: gates.map((gate) => gate.passed),
        maxTokens: options.maxTokens,
      })
      returnRecord = {
        id: item.id,
        issue: item.issue,
        startCommit: item.startCommit,
        status,
        elapsedMs: result.elapsedMs,
        withinScope: candidate.withinScope,
        inputTokens: usage.inputTokens,
        cachedInputTokens: usage.cachedInputTokens,
        outputTokens: usage.outputTokens,
        toolCalls: usage.toolCalls,
        retries: usage.retries,
        gates,
        measuredCostUsd: null,
      }
    }
  } catch {
    returnRecord = {
      id: item.id,
      issue: item.issue,
      startCommit: item.startCommit,
      status: 'infrastructure_failed',
      reason: 'preparation_or_grading_failed',
    }
  } finally {
    // These are newly created private repositories, never the user's worktrees.
    rmSync(directory, { recursive: true, force: true })
  }

  return returnRecord
}

function selectCases(cases: IssueCase[], options: EvaluationOptions) {
  if (options.caseId !== undefined) {
    const selected = cases.find((item) => item.id === options.caseId)
    if (!selected || options.cadence !== 'change') {
      throw new Error('Invalid individual case selection')
    }
    return [selected]
  }
  if (options.cadence === 'weekly') {
    return [cases[Math.floor(Date.now() / 604800000) % cases.length]]
  }
  return cases
}

function shouldSkipReal(options: EvaluationOptions) {
  return (
    !options.run ||
    Boolean(process.env.CI) ||
    (options.cadence !== 'change' && !options.optIn)
  )
}

async function runSuite(options: EvaluationOptions) {
  const { root, mode } = options
  if (existsSync(options.output)) {
    throw new Error('Use a new output directory; prior results are preserved')
  }
  const manifest = loadManifest(root, options.snapshotRoot ?? root)
  const version = {
    codex: null,
    runnerSha256: implementationFingerprint(import.meta.dirname),
    node: commandVersion('node', /^v24\./u),
    bun: commandVersion('bun', /^1\.3\.14$/u),
  }
  const records: Record<string, unknown>[] = []
  const report: EvaluationReport = {
    schemaVersion: 1,
    mode,
    status: 'running',
    configuration: {
      model: options.model,
      effort: options.effort,
      guidanceSha256: fingerprint(options.snapshotRoot ?? root),
      hooks: 'disabled',
      network: 'agent-denied',
      authentication: 'chatgpt-only',
      ...version,
    },
    budget: {
      secondsPerCase: options.seconds,
      tokensPerCase: options.maxTokens,
      additionalApiSpendUsd: 0,
      automaticRetries: 0,
    },
    cadence: options.cadence,
    caseId: options.caseId ?? null,
    sandboxProof: null,
    records,
  }
  if (mode === 'real' && shouldSkipReal(options)) {
    report.status = 'skipped'
    records.push({
      status: 'skipped',
      reason: 'explicit_local_opt_in_required',
    })
    saveReport(options.output, report)
    return false
  }
  if (mode !== 'mock') {
    const preflight = await executionPreflight(root, mode === 'real')
    report.configuration.codex = preflight.codexVersion
    report.sandboxProof = preflight.sandboxProof
    if (!preflight.passed) {
      report.status = 'infrastructure_failed'
      records.push({
        status: 'infrastructure_failed',
        reason: 'auth_or_sandbox_preflight_failed',
      })
      saveReport(options.output, report)
      return false
    }
  }
  const selected = selectCases(manifest.cases, options)
  saveReport(options.output, report)
  let stop = false
  await serial(selected, async (item) => {
    if (!item) {
      throw new Error('No selected case')
    }
    if (stop) {
      records.push({
        id: item.id,
        status: 'skipped',
        reason: 'prior_budget_exhausted',
      })
    } else {
      const record = await evaluateCase(options, item)
      records.push(record)
      stop = [
        'timeout',
        'budget_exceeded',
        'usage_unavailable',
        'output_limit',
        'infrastructure_failed',
      ].includes(String(record.status))
    }
    saveReport(options.output, report)
  })
  if (records.every((record) => record.status === 'passed')) {
    report.status = mode === 'mock' ? 'mock_passed' : 'passed'
  } else {
    report.status = 'failed'
  }
  saveReport(options.output, report)
  return report.status === 'passed' || report.status === 'mock_passed'
}

export async function evaluateIssues(options: EvaluationOptions) {
  if (existsSync(options.output)) {
    throw new Error('Use a new output directory; prior results are preserved')
  }
  const snapshotRoot = createSnapshot(options.root)
  try {
    return await runSuite({ ...options, snapshotRoot })
  } finally {
    rmSync(snapshotRoot, { recursive: true, force: true })
  }
}
