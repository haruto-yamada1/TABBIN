import { z } from 'zod'

const timestamp = z.iso.datetime({ offset: true })
const conclusion = z.string().min(1)
export const runSchema = z.object({
  id: z.number().int().positive(),
  run_attempt: z.number().int().positive(),
  status: z.literal('completed'),
  conclusion,
  html_url: z.url(),
  head_sha: z.string().min(1),
  head_branch: z.string().nullable(),
  event: z.string().min(1),
  created_at: timestamp,
  run_started_at: timestamp.optional(),
})
const stepSchema = z.object({
  name: z.string().min(1),
  number: z.number().int().positive(),
  conclusion: conclusion.nullable(),
  started_at: timestamp.nullable(),
  completed_at: timestamp.nullable(),
})
export const jobSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  status: z.literal('completed'),
  conclusion,
  created_at: timestamp.nullable().optional(),
  started_at: timestamp.nullable(),
  completed_at: timestamp.nullable(),
  steps: z.array(stepSchema).default([]),
})
const evidenceSchema = z.object({
  run: runSchema,
  jobs: z.array(jobSchema).min(1),
  logs: z.record(z.string(), z.string().nullable()),
})
export type Evidence = z.infer<typeof evidenceSchema>
type Step = z.infer<typeof stepSchema>
type CacheOutcome = 'restored' | 'missed' | 'unavailable' | 'unobserved'

function seconds(start: string | null | undefined, end: string | null) {
  if (!start || !end) {
    return null
  }
  const value = (Date.parse(end) - Date.parse(start)) / 1_000
  if (value < 0) {
    throw new Error('Invalid timing: completion precedes start')
  }
  return value
}

function distribution(values: (number | null)[]) {
  const known = values
    .filter((value) => value !== null)
    .toSorted((a, b) => a - b)
  const middle = known.slice(
    Math.floor((known.length - 1) / 2),
    Math.floor(known.length / 2) + 1,
  )
  const median = middle.length
    ? middle.reduce((sum, value) => sum + value, 0) / middle.length
    : null
  return {
    count: known.length,
    missing: values.length - known.length,
    median,
    p90: known.length ? known[Math.ceil(known.length * 0.9) - 1] : null,
    p95: known.length ? known[Math.ceil(known.length * 0.95) - 1] : null,
    total: known.reduce((sum, value) => sum + value, 0),
  }
}

function outcomes(values: string[]) {
  const conclusions: Record<string, number> = {}
  for (const value of values) {
    conclusions[value] = (conclusions[value] ?? 0) + 1
  }
  const failures = [
    'failure',
    'timed_out',
    'startup_failure',
    'action_required',
  ]
    .map((value) => conclusions[value] ?? 0)
    .reduce((sum, value) => sum + value, 0)
  const decided = failures + (conclusions.success ?? 0)
  return { conclusions, failureRate: decided ? failures / decided : null }
}

function cacheOutcome(
  step: Step,
  log: string | null | undefined,
): CacheOutcome {
  if (log === null || log === undefined) {
    return 'unavailable'
  }
  if (!step.started_at || !step.completed_at) {
    return 'unobserved'
  }
  if (!/cache|^set ?up (?:bun|node)/i.test(step.name)) {
    return 'unobserved'
  }
  const start = Date.parse(step.started_at)
  // Conservative half-open windows avoid assigning a later step's log to an
  // earlier step when API timestamps share a second. Boundary evidence remains
  // unobserved rather than inflating cache restores.
  const end = Date.parse(step.completed_at)
  const lines = log.split('\n').filter((line) => {
    const time = Date.parse(line.split(' ', 1)[0] ?? '')
    return Number.isFinite(time) && time >= start && time < end
  })
  if (
    lines.some((line) =>
      /^\S+\s+(?:Cache hit for:|Cache restored from key:)/i.test(line),
    )
  ) {
    return 'restored'
  }
  return lines.some((line) =>
    /^\S+\s+Cache not found for input keys:/i.test(line),
  )
    ? 'missed'
    : 'unobserved'
}

function cacheSummary(values: CacheOutcome[]) {
  const restored = values.filter((value) => value === 'restored').length
  const missed = values.filter((value) => value === 'missed').length
  return {
    restored,
    missed,
    unavailable: values.filter((value) => value === 'unavailable').length,
    unobserved: values.filter((value) => value === 'unobserved').length,
    restoreRate: restored + missed ? restored / (restored + missed) : null,
  }
}

function normalizeEvidence(sample: Evidence) {
  const jobs = sample.jobs.map((job) => ({
    ...job,
    executionSeconds:
      job.conclusion === 'skipped'
        ? null
        : seconds(job.started_at, job.completed_at),
    queueSeconds:
      job.conclusion === 'skipped'
        ? null
        : seconds(job.created_at, job.started_at),
    steps: job.steps.map((step) => ({
      ...step,
      executionSeconds:
        step.conclusion === 'skipped'
          ? null
          : seconds(step.started_at, step.completed_at),
      cacheOutcome: cacheOutcome(step, sample.logs[job.id]),
    })),
  }))
  if (new Set(jobs.map((job) => job.id)).size !== jobs.length) {
    throw new Error('Duplicate job IDs')
  }
  const timedJobs = jobs.filter((job) => job.executionSeconds !== null)
  const firstStart =
    timedJobs
      .map((job) => job.started_at)
      .filter((time) => time !== null)
      .toSorted()[0] ?? null
  const lastJob = timedJobs.toSorted((left, right) =>
    (right.completed_at ?? '').localeCompare(left.completed_at ?? ''),
  )[0]
  const execution = timedJobs.map((job) => job.executionSeconds ?? 0)
  return {
    ...sample.run,
    elapsedSeconds: seconds(
      sample.run.created_at,
      lastJob?.completed_at ?? null,
    ),
    attemptElapsedSeconds: seconds(
      sample.run.run_started_at,
      lastJob?.completed_at ?? null,
    ),
    initialSchedulingSeconds: seconds(sample.run.created_at, firstStart),
    runnerMinutes: execution.reduce((sum, value) => sum + value, 0) / 60,
    roundedJobMinutesEstimate: execution.reduce(
      (sum, value) => sum + Math.ceil(value / 60),
      0,
    ),
    lastCompletedJob: lastJob?.name ?? null,
    jobs,
  }
}

function grouped<T>(items: T[], key: (item: T) => string) {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const name = key(item)
    const group = groups.get(name) ?? []
    group.push(item)
    groups.set(name, group)
  }
  return [...groups.entries()].toSorted(([a], [b]) => a.localeCompare(b))
}

export function summarizeRuns(samples: unknown[]) {
  const parsed = z.array(evidenceSchema).min(1).parse(samples)
  if (new Set(parsed.map((sample) => sample.run.id)).size !== parsed.length) {
    throw new Error('Duplicate run IDs')
  }
  const runs = parsed.map(normalizeEvidence)
  const jobs = grouped(
    runs.flatMap((run) => run.jobs),
    (job) => job.name,
  ).map(([name, group]) => ({
    name,
    count: group.length,
    ...outcomes(group.map((job) => job.conclusion)),
    executionSeconds: distribution(group.map((job) => job.executionSeconds)),
    queueSeconds: distribution(group.map((job) => job.queueSeconds)),
    steps: grouped(
      group.flatMap((job) => job.steps),
      (step) => step.name,
    ).map(([stepName, steps]) => ({
      name: stepName,
      count: steps.length,
      ...outcomes(steps.map((step) => step.conclusion ?? 'unknown')),
      executionSeconds: distribution(
        steps.map((step) => step.executionSeconds),
      ),
      cache: cacheSummary(steps.map((step) => step.cacheOutcome)),
    })),
  }))
  return {
    summary: {
      count: runs.length,
      ...outcomes(runs.map((run) => run.conclusion)),
      elapsedSeconds: distribution(runs.map((run) => run.elapsedSeconds)),
      attemptElapsedSeconds: distribution(
        runs.map((run) => run.attemptElapsedSeconds),
      ),
      initialSchedulingSeconds: distribution(
        runs.map((run) => run.initialSchedulingSeconds),
      ),
      runnerMinutes: runs.reduce((sum, run) => sum + run.runnerMinutes, 0),
      roundedJobMinutesEstimate: runs.reduce(
        (sum, run) => sum + run.roundedJobMinutesEstimate,
        0,
      ),
      logsAvailable: parsed.reduce(
        (sum, sample) =>
          sum + Object.values(sample.logs).filter((log) => log !== null).length,
        0,
      ),
      logsUnavailable: parsed.reduce(
        (sum, sample) =>
          sum + Object.values(sample.logs).filter((log) => log === null).length,
        0,
      ),
    },
    jobs,
    runs,
  }
}
