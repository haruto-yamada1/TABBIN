import { execFile } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { parseArgs, promisify } from 'node:util'

import { collectEvidence } from './collect'
import { summarizeRuns } from './report'

const execute = promisify(execFile)

async function githubApi(endpoint: string): Promise<unknown> {
  let stdout: string
  try {
    const result = await execute('gh', ['api', '--method', 'GET', endpoint], {
      encoding: 'utf8',
      timeout: 60_000,
      maxBuffer: 64 * 1_024 * 1_024,
    })
    stdout = result.stdout
  } catch {
    // Do not expose raw logs, response bodies, environment, or credentials.
    throw new Error(`GitHub API request failed: ${endpoint}`)
  }
  return endpoint.endsWith('/logs') ? stdout : JSON.parse(stdout)
}

async function main() {
  const { values } = parseArgs({
    options: {
      repo: { type: 'string', default: 'haruto-yamada1/TABBIN' },
      workflow: { type: 'string', default: 'ci.yml' },
      limit: { type: 'string', default: '30' },
      branch: { type: 'string' },
      'run-id': { type: 'string', multiple: true },
      output: { type: 'string', default: 'reports/ci-performance/latest.json' },
    },
    allowPositionals: false,
  })
  const samples = await collectEvidence({
    repo: values.repo,
    workflow: values.workflow,
    limit: Number(values.limit),
    ...(values.branch ? { branch: values.branch } : {}),
    ...(values['run-id'] ? { runIds: values['run-id'].map(Number) } : {}),
    api: githubApi,
  })
  const report = {
    schemaVersion: 1,
    collectedAt: new Date().toISOString(),
    repository: values.repo,
    workflow: values.workflow,
    sample: {
      requestedLimit: values['run-id'] ? null : Number(values.limit),
      requestedRunIds: values['run-id']?.map(Number) ?? null,
      branch: values.branch ?? null,
      attemptPolicy: 'Latest attempt only; earlier attempts are not included',
    },
    definitions: {
      elapsedSeconds:
        'Original run created_at to last executed job completed_at; reruns include delay before rerun',
      attemptElapsedSeconds:
        'Latest attempt run_started_at to last executed job completed_at; excludes delay before rerun; missing start remains null',
      initialSchedulingSeconds:
        'Run created_at to first executed job started_at',
      queueSeconds:
        'Job created_at to started_at; includes dependency and runner wait, not an isolated runner queue',
      runnerMinutes:
        'Sum of actual executed job seconds / 60; excludes skipped jobs; not invoice data',
      roundedJobMinutesEstimate:
        'Sum of each executed job duration rounded up to minutes; excludes OS multipliers and prior attempts',
      failureRate:
        'Failures / (successes + failures); cancelled, skipped, and neutral are separate conclusions',
      percentile:
        'p90/p95 use nearest-rank; median (p50) averages the middle pair',
      cache:
        'Primary restore/miss markers in explicit cache or setup Bun/Node steps, using half-open time windows; restoreRate includes exact/fallback; generic completion messages, boundaries, unknown step names, and unavailable logs do not count',
      criticalPath:
        'lastCompletedJob identifies the observed tail, not an inferred workflow DAG',
    },
    ...summarizeRuns(samples),
  }
  const output = path.resolve(values.output)
  mkdirSync(path.dirname(output), { recursive: true })
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify({ output, ...report.summary }, null, 2))
}

await main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : 'CI measurement failed',
  )
  process.exitCode = 1
})
