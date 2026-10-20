import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import {
  evaluateSamples,
  isCount,
  isDuration,
  isEnvironment,
  isRecord,
  isWorkCounts,
  requiredWork,
  REQUIRED_CASES,
} from './report'
import type {
  BudgetCase,
  BudgetEnvironment,
  BudgetEvaluation,
  BudgetFailure,
} from './report'

type DurationComparison = {
  status: 'available' | 'unavailable'
  reason?: string
  cases: { caseId: string; ratio: number | null }[]
}

type WorkDelta = {
  caseId: string
  metric: string
  current: number | null
  baseline: number | null
  delta: number | null
}

export type BudgetReport = BudgetEvaluation & {
  schemaVersion: 1
  environment: BudgetEnvironment | null
  sourceRevision: string | null
  comparison: { duration: DurationComparison; work: WorkDelta[] }
}

type Baseline = {
  environment: BudgetEnvironment
  cases: BudgetCase[]
}

function isSourceRevision(value: unknown): value is string {
  return (
    typeof value === 'string' && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(value)
  )
}

function sameEnvironment(a: BudgetEnvironment, b: BudgetEnvironment): boolean {
  return (
    a.platform === b.platform &&
    a.browserVersion === b.browserVersion &&
    a.nodeVersion === b.nodeVersion &&
    a.bunVersion === b.bunVersion
  )
}

function environmentFields(value: BudgetEnvironment): BudgetEnvironment {
  return {
    platform: value.platform,
    browserVersion: value.browserVersion,
    nodeVersion: value.nodeVersion,
    bunVersion: value.bunVersion,
  }
}

async function discover(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(
    entries
      .toSorted((a, b) => a.name.localeCompare(b.name))
      .map(async (entry) => {
        const filename = path.join(directory, entry.name)
        if (entry.isDirectory()) {
          return discover(filename)
        }
        return entry.isFile() && entry.name === 'budget-samples.json'
          ? [filename]
          : []
      }),
  )
  return files.flat()
}

async function readSamples(directory: string) {
  const samples: unknown[] = []
  const failures: BudgetFailure[] = []
  let environment: BudgetEnvironment | null = null
  let sourceRevision: string | null = null
  const files = await discover(directory)
  if (files.length === 0) {
    failures.push({
      code: 'input',
      message: 'No budget-samples.json files found.',
    })
  }
  const contents = await Promise.all(
    files.map(async (filename) => {
      try {
        const value: unknown = JSON.parse(await readFile(filename, 'utf8'))
        return { value, readable: true }
      } catch {
        return { value: null, readable: false }
      }
    }),
  )
  for (const [index, { value, readable }] of contents.entries()) {
    if (!readable) {
      failures.push({
        code: 'input',
        message: `Input file ${index + 1} is unreadable or invalid JSON.`,
      })
      continue
    }
    if (
      !isRecord(value) ||
      value.schemaVersion !== 1 ||
      !isEnvironment(value.environment) ||
      !isSourceRevision(value.sourceRevision) ||
      !Array.isArray(value.samples)
    ) {
      failures.push({
        code: 'input',
        message: `Input file ${index + 1} has an invalid sample envelope.`,
      })
      continue
    }
    if (environment && !sameEnvironment(environment, value.environment)) {
      failures.push({
        code: 'input',
        message: 'Input files have mismatched environments.',
      })
      continue
    }
    if (sourceRevision && sourceRevision !== value.sourceRevision) {
      failures.push({
        code: 'input',
        message: 'Input files have mismatched source revisions.',
      })
      continue
    }
    environment = environmentFields(value.environment)
    sourceRevision = value.sourceRevision
    const entries: unknown[] = value.samples
    samples.push(...entries)
  }
  return { environment, sourceRevision, samples, failures }
}

function validBaselineCase(
  value: unknown,
  repeatCount: number,
): value is BudgetCase {
  if (!isRecord(value)) {
    return false
  }
  const work = value.work
  const definition = REQUIRED_CASES.find(({ id }) => value.id === id)
  if (
    !definition ||
    value.scenario !== definition.scenario ||
    value.size !== definition.size ||
    value.mode !== definition.mode ||
    value.count !== repeatCount ||
    !isRecord(value.durationMs) ||
    !isDuration(value.durationMs.median) ||
    !isDuration(value.durationMs.p95) ||
    value.durationMs.median > value.durationMs.p95 ||
    !isWorkCounts(work)
  ) {
    return false
  }
  return Object.keys(requiredWork(definition)).every((key) =>
    Object.hasOwn(work, key),
  )
}

function parseBaseline(value: unknown): Baseline | null {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    !isEnvironment(value.environment) ||
    !isSourceRevision(value.sourceRevision) ||
    !isCount(value.repeatCount) ||
    value.repeatCount === 0 ||
    value.sampleCount !== value.repeatCount * REQUIRED_CASES.length ||
    !Array.isArray(value.failures) ||
    value.failures.length !== 0 ||
    !Array.isArray(value.cases) ||
    value.cases.length !== REQUIRED_CASES.length
  ) {
    return null
  }
  const cases: BudgetCase[] = []
  for (const entry of value.cases) {
    if (!validBaselineCase(entry, value.repeatCount)) {
      return null
    }
    cases.push(entry)
  }
  if (new Set(cases.map(({ id }) => id)).size !== REQUIRED_CASES.length) {
    return null
  }
  return { environment: environmentFields(value.environment), cases }
}

function durationRatio(current: number, previous: number): number | null {
  if (current === 0 && previous === 0) {
    return 1
  }
  const ratio = current / previous
  return Number.isFinite(ratio) ? ratio : null
}

function compare(
  current: BudgetEvaluation,
  environment: BudgetEnvironment | null,
  baseline: Baseline | null,
  baselineRequested: boolean,
): BudgetReport['comparison'] {
  const duration: DurationComparison = {
    status: 'unavailable',
    reason: baselineRequested
      ? 'Baseline is unavailable.'
      : 'No baseline supplied.',
    cases: [],
  }
  const work: WorkDelta[] = []
  if (!baseline) {
    return { duration, work }
  }
  const comparable =
    environment && sameEnvironment(environment, baseline.environment)
  if (comparable) {
    duration.status = 'available'
    delete duration.reason
  } else {
    duration.reason = 'Environment differs; duration ratios are unavailable.'
  }
  const byId = new Map(baseline.cases.map((entry) => [entry.id, entry]))
  for (const entry of current.cases) {
    const previous = byId.get(entry.id)
    if (!previous) {
      continue
    }
    if (comparable) {
      duration.cases.push({
        caseId: entry.id,
        ratio: durationRatio(
          entry.durationMs.median,
          previous.durationMs.median,
        ),
      })
    }
    const metrics = new Set([
      ...Object.keys(entry.work),
      ...Object.keys(previous.work),
    ])
    for (const metric of [...metrics].toSorted()) {
      const currentCount = Object.hasOwn(entry.work, metric)
        ? (entry.work[metric] ?? null)
        : null
      const baselineCount = Object.hasOwn(previous.work, metric)
        ? (previous.work[metric] ?? null)
        : null
      work.push({
        caseId: entry.id,
        metric,
        current: currentCount,
        baseline: baselineCount,
        delta:
          currentCount !== null && baselineCount !== null
            ? currentCount - baselineCount
            : null,
      })
    }
  }
  return { duration, work }
}

function markdown(report: BudgetReport): string {
  const rows = [
    '# Performance budget report',
    '',
    `Result: ${report.failures.length === 0 ? 'PASS' : 'FAIL'}. ${report.sampleCount} samples; ${report.repeatCount} repeats per case.`,
    '',
    'Durations are advisory observations; work counts determine the budget result.',
    'Category switch navigates to the next parent category (Domain) or project (Custom) using the loaded snapshot.',
    '',
    '| Case | Count | Median ms | p95 ms | Maximum work counts |',
    '| --- | ---: | ---: | ---: | --- |',
    ...report.cases.map(
      (entry) =>
        `| ${entry.id} | ${entry.count} | ${entry.durationMs.median} | ${entry.durationMs.p95} | ${Object.entries(
          entry.work,
        )
          .map(([metric, value]) => `${metric}=${value}`)
          .join(', ')} |`,
    ),
    '',
    '## Baseline comparison',
    '',
  ]
  if (report.comparison.duration.status === 'available') {
    rows.push(
      'Duration ratios are advisory (current median / baseline median). A zero baseline with a nonzero current median has no finite ratio.',
      '',
      '| Case | Duration ratio |',
      '| --- | ---: |',
      ...report.comparison.duration.cases.map(
        ({ caseId, ratio }) => `| ${caseId} | ${ratio ?? 'unavailable'} |`,
      ),
    )
  } else {
    rows.push(
      report.comparison.duration.reason ?? 'Duration ratios unavailable.',
    )
  }
  if (report.comparison.work.length > 0) {
    rows.push(
      '',
      'Work deltas compare maximum counts regardless of environment; limits remain fixed.',
      '',
      '| Case | Metric | Baseline | Current | Delta |',
      '| --- | --- | ---: | ---: | ---: |',
      ...report.comparison.work.map(
        ({ caseId, metric, baseline, current, delta }) =>
          `| ${caseId} | ${metric} | ${baseline ?? 'unavailable'} | ${current ?? 'unavailable'} | ${delta ?? 'unavailable'} |`,
      ),
    )
  }
  if (report.failures.length > 0) {
    rows.push(
      '',
      '## Failures',
      '',
      ...report.failures.map(({ message }) => `- ${message}`),
    )
  }
  return `${rows.join('\n')}\n`
}

function options(args: string[]) {
  const parsed = new Map<string, string>()
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index] ?? ''
    const value = args[index + 1]
    if (
      !['--input', '--output', '--baseline'].includes(flag) ||
      !value ||
      value.startsWith('--') ||
      parsed.has(flag)
    ) {
      return null
    }
    parsed.set(flag, value)
  }
  const input = parsed.get('--input')
  const output = parsed.get('--output')
  return input && output
    ? { input, output, baseline: parsed.get('--baseline') }
    : null
}

export async function runCli(args: string[]): Promise<number> {
  const parsed = options(args)
  if (!parsed) {
    console.error(
      'Usage: bun tools/performance-budget/cli.ts --input DIR --output DIR [--baseline PATH]',
    )
    return 1
  }
  const failures: BudgetFailure[] = []
  let environment: BudgetEnvironment | null = null
  let sourceRevision: string | null = null
  let samples: unknown[] = []
  try {
    const current = await readSamples(parsed.input)
    environment = current.environment
    sourceRevision = current.sourceRevision
    samples = current.samples
    failures.push(...current.failures)
  } catch {
    failures.push({ code: 'input', message: 'Input directory cannot be read.' })
  }
  const evaluation = evaluateSamples(samples)
  failures.push(...evaluation.failures)
  let baseline: Baseline | null = null
  if (parsed.baseline) {
    try {
      baseline = parseBaseline(
        JSON.parse(await readFile(parsed.baseline, 'utf8')),
      )
    } catch {
      // Invalid or unreadable baselines fail closed below without exposing content.
    }
    if (!baseline) {
      failures.push({
        code: 'baseline',
        message: 'Baseline report is invalid or unreadable.',
      })
    }
  }
  const report: BudgetReport = {
    schemaVersion: 1,
    sourceRevision,
    environment,
    ...evaluation,
    failures,
    comparison: compare(
      evaluation,
      environment,
      baseline,
      Boolean(parsed.baseline),
    ),
  }
  try {
    await mkdir(parsed.output, { recursive: true })
    await writeFile(
      path.join(parsed.output, 'report.json'),
      `${JSON.stringify(report, null, 2)}\n`,
    )
    await writeFile(path.join(parsed.output, 'report.md'), markdown(report))
  } catch {
    console.error('Performance budget reports could not be written.')
    return 1
  }
  return failures.length === 0 ? 0 : 1
}

if (import.meta.main) {
  process.exitCode = await runCli(process.argv.slice(2))
}
