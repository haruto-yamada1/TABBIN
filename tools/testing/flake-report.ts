import { createHash } from 'node:crypto'
import { mkdirSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { z } from 'zod'

const token = z.string().regex(/^[a-zA-Z0-9_.-]{1,80}$/u)
const count = z.number().int().min(0).max(1_000_000)
const status = z.enum([
  'passed',
  'failed',
  'timedOut',
  'skipped',
  'interrupted',
])
const fileSchema = z
  .string()
  .max(300)
  .regex(/^(src|tools|e2e)\/[a-zA-Z0-9_./-]+\.(?:test|spec)\.[cm]?[jt]sx?$/u)
  .refine(
    (value) =>
      !value
        .split('/')
        .some((part) => part === '..' || part === '.' || part === ''),
  )
const attemptSchema = z.strictObject({
  index: count,
  status,
  durationMs: z.number().min(0).max(86_400_000),
})
const testSchema = z.strictObject({
  id: z.string().regex(/^[a-f0-9]{64}$/u),
  file: fileSchema,
  project: token,
  browser: token,
  expectedStatus: z.enum(['passed', 'failed', 'skipped']),
  frameworkStatus: z.enum(['passed', 'failed', 'skipped', 'interrupted']),
  attempts: z
    .array(attemptSchema)
    .min(1)
    .max(1000)
    .refine((attempts) =>
      attempts.every((attempt, index) => attempt.index === index),
    ),
})
const reportSchema = z.strictObject({
  schemaVersion: z.literal(1),
  runner: z.enum(['vitest', 'playwright']),
  suite: token,
  context: z.strictObject({
    runId: z.string().regex(/^\d{1,20}$/u),
    runAttempt: z.number().int().min(1).max(1000),
    sha: z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u),
    headSha: z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u),
    event: z.enum(['local', 'push', 'pull_request', 'workflow_dispatch']),
  }),
  environment: z.strictObject({
    os: z.enum(['linux', 'darwin', 'win32']),
    node: z.string().regex(/^\d+$/u),
    runnerVersion: z.string().regex(/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/u),
  }),
  tests: z
    .array(testSchema)
    .max(30_000)
    .refine(
      (tests) => new Set(tests.map((test) => test.id)).size === tests.length,
    ),
  runErrors: count,
  complete: z.boolean(),
})

export type Attempt = z.infer<typeof attemptSchema>
export type Report = z.infer<typeof reportSchema>
type TestRecord = z.infer<typeof testSchema>
type Outcome =
  | 'passed'
  | 'flaky'
  | 'failed'
  | 'skipped'
  | 'interrupted'
  | 'expectedFailure'

export const parseReport = (input: unknown): Report => reportSchema.parse(input)

export function createReport(
  runner: Report['runner'],
  version: string,
): Report {
  return parseReport({
    schemaVersion: 1,
    runner,
    suite: process.env.FLAKE_SUITE ?? 'local',
    context: {
      runId: process.env.GITHUB_RUN_ID ?? '0',
      runAttempt: Number(process.env.GITHUB_RUN_ATTEMPT ?? '1'),
      sha: process.env.GITHUB_SHA ?? '0'.repeat(40),
      headSha:
        process.env.FLAKE_HEAD_SHA ?? process.env.GITHUB_SHA ?? '0'.repeat(40),
      event: process.env.GITHUB_EVENT_NAME ?? 'local',
    },
    environment: {
      os: process.platform,
      node: process.versions.node.split('.')[0],
      runnerVersion: version,
    },
    tests: [],
    runErrors: 0,
    complete: false,
  })
}

const defaultFrameworkStatus = (input: {
  expectedStatus: TestRecord['expectedStatus']
  attempts: Attempt[]
}): TestRecord['frameworkStatus'] => {
  const physical = input.attempts.at(-1)?.status
  if (physical === 'skipped' || physical === 'interrupted') {
    return physical
  }
  const physicalFailure = physical === 'failed' || physical === 'timedOut'
  return physicalFailure === (input.expectedStatus === 'failed')
    ? 'passed'
    : 'failed'
}

export function recordTest(
  report: Report,
  input: Omit<TestRecord, 'id' | 'frameworkStatus'> & {
    title: string
    frameworkStatus?: TestRecord['frameworkStatus']
  },
): void {
  const file = path.isAbsolute(input.file)
    ? path.relative(process.cwd(), input.file).split(path.sep).join('/')
    : input.file
  const project = input.project || 'default'
  let id = createHash('sha256')
    .update(JSON.stringify([report.runner, file, project, input.title]))
    .digest('hex')
  // Vitest permits identical titles (including parameterized cases). Use the
  // occurrence within that title instead of overwriting a prior observation.
  // Inserting a different title does not shift these identifiers.
  let occurrence = 0
  while (report.tests.some((test) => test.id === id)) {
    occurrence++
    id = createHash('sha256')
      .update(
        JSON.stringify([report.runner, file, project, input.title, occurrence]),
      )
      .digest('hex')
  }
  const test = testSchema.parse({
    id,
    file,
    project,
    browser: input.browser,
    expectedStatus: input.expectedStatus,
    frameworkStatus: input.frameworkStatus ?? defaultFrameworkStatus(input),
    attempts: input.attempts,
  })
  report.tests.push(test)
}

export function writeReport(report: Report): void {
  const target = process.env.FLAKE_REPORT_PATH
  if (!target) {
    return
  }
  const data = `${JSON.stringify(parseReport(report))}\n`
  if (Buffer.byteLength(data) > 5 * 1024 * 1024) {
    throw new Error('Flake telemetry exceeds 5 MiB budget')
  }
  mkdirSync(path.dirname(target), { recursive: true })
  const temporary = `${target}.tmp`
  writeFileSync(temporary, data, { mode: 0o600 })
  renameSync(temporary, target)
}

const failed = (attempt: Attempt) =>
  attempt.status === 'failed' || attempt.status === 'timedOut'
function outcome(test: TestRecord): Outcome {
  if (test.frameworkStatus === 'interrupted') {
    return 'interrupted'
  }
  if (test.frameworkStatus === 'skipped') {
    return 'skipped'
  }
  if (test.frameworkStatus === 'failed') {
    return 'failed'
  }
  if (test.expectedStatus === 'failed') {
    return 'expectedFailure'
  }
  return test.attempts.some(failed) ? 'flaky' : 'passed'
}

type TestSummary = {
  id: string
  file: string
  runner: Report['runner']
  suite: string
  project: string
  browser: string
  environment: Report['environment']
  runs: number
  executed: number
  initialFailures: number
  retryRecovered: number
  finalFailures: number
  skipped: number
  durationMs: number
  runErrors: number
  flakeRate: number | null
  retryRecoveryRate: number | null
  crossRunFailures: number
  diagnosis: string
}

type ShaObservations = Map<
  string,
  Map<string, { passed: number; failed: number }>
>

function updateSummary(
  group: TestSummary,
  report: Report,
  test: TestRecord,
  result: Outcome,
  observations: ShaObservations,
  key: string,
) {
  group.runs++
  if (['passed', 'flaky', 'failed'].includes(result)) {
    group.executed++
  }
  if (
    test.expectedStatus === 'passed' &&
    test.attempts[0] &&
    failed(test.attempts[0])
  ) {
    group.initialFailures++
  }
  if (result === 'flaky') {
    group.retryRecovered++
  }
  if (result === 'failed') {
    group.finalFailures++
  }
  if (result === 'skipped') {
    group.skipped++
  }
  group.durationMs += test.attempts.reduce(
    (sum, attempt) => sum + attempt.durationMs,
    0,
  )
  group.runErrors += report.runErrors
  const bySha =
    observations.get(key) ??
    new Map<string, { passed: number; failed: number }>()
  const observation = bySha.get(report.context.sha) ?? {
    passed: 0,
    failed: 0,
  }
  if (result === 'passed' || result === 'flaky') {
    observation.passed++
  }
  if (result === 'failed') {
    observation.failed++
  }
  bySha.set(report.context.sha, observation)
  observations.set(key, bySha)
  group.crossRunFailures = [...bySha.values()].reduce(
    (sum, value) => sum + (value.passed > 0 ? value.failed : 0),
    0,
  )
  group.flakeRate = group.executed
    ? (group.retryRecovered + group.crossRunFailures) / group.executed
    : null
  group.retryRecoveryRate = group.executed
    ? group.retryRecovered / group.executed
    : null
  group.diagnosis = 'stable-observed'
  if (group.runErrors) {
    group.diagnosis = 'environment-or-setup-investigation'
  } else if (group.retryRecovered || group.crossRunFailures) {
    group.diagnosis = 'flake-candidate'
  } else if (group.finalFailures >= 2) {
    group.diagnosis = 'regression-candidate'
  } else if (group.finalFailures) {
    group.diagnosis = 'failure-investigation'
  }
}

export function aggregateReports(input: Report[]) {
  // A job re-run supersedes its previous telemetry. Duplicate artifacts must
  // never inflate the denominator. Suites separate coverage and CI shards.
  const latest = new Map<string, Report>()
  for (const raw of input) {
    const report = parseReport(raw)
    const key = `${report.context.runId}/${report.suite}`
    const previous = latest.get(key)
    if (!previous || previous.context.runAttempt < report.context.runAttempt) {
      latest.set(key, report)
    }
  }
  const counts: Record<Outcome, number> = {
    passed: 0,
    flaky: 0,
    failed: 0,
    skipped: 0,
    interrupted: 0,
    expectedFailure: 0,
  }
  const groups = new Map<string, TestSummary>()
  const observations = new Map<
    string,
    Map<string, { passed: number; failed: number }>
  >()
  let incompleteRuns = 0
  let runErrors = 0
  for (const report of latest.values()) {
    if (!report.complete) {
      incompleteRuns++
    }
    runErrors += report.runErrors
    for (const test of report.tests) {
      const result = outcome(test)
      counts[result]++
      const key = JSON.stringify([
        test.id,
        report.suite,
        report.environment,
        test.project,
        test.browser,
      ])
      const group = groups.get(key) ?? {
        id: test.id,
        file: test.file,
        runner: report.runner,
        suite: report.suite,
        project: test.project,
        browser: test.browser,
        environment: report.environment,
        runs: 0,
        executed: 0,
        initialFailures: 0,
        retryRecovered: 0,
        finalFailures: 0,
        skipped: 0,
        durationMs: 0,
        runErrors: 0,
        flakeRate: null,
        retryRecoveryRate: null,
        crossRunFailures: 0,
        diagnosis: 'stable-observed',
      }
      updateSummary(group, report, test, result, observations, key)
      groups.set(key, group)
    }
  }
  return {
    runs: latest.size,
    counts,
    incompleteRuns,
    runErrors,
    tests: [...groups.values()].toSorted(
      (a, b) =>
        b.initialFailures - a.initialFailures || a.id.localeCompare(b.id),
    ),
  }
}
