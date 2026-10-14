import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { z } from 'zod'

import { parseReport } from './flake-report'
import { readFlakeArchive } from './read-flake-archive'
import { selectHistoryRuns } from './telemetry-files'

const runsSchema = z.object({
  workflow_runs: z.array(
    z.object({
      id: z.number().int().positive(),
      event: z.string(),
      head_branch: z.string().nullable(),
      head_sha: z.string().regex(/^[a-f0-9]{40}$/u),
      run_attempt: z.number().int().positive(),
      pull_requests: z.array(z.object({ number: z.number().int().positive() })),
    }),
  ),
})
const artifactSchema = z.object({
  total_count: z.number().int().min(0),
  artifacts: z.array(
    z.object({
      id: z.number().int().positive(),
      name: z.string(),
      expired: z.boolean(),
      size_in_bytes: z.number().int().min(0),
    }),
  ),
})
const MAX_BYTES = 30 * 1024 * 1024
const MAX_REPORT_BYTES = 5 * 1024 * 1024
const api = (endpoint: string, maxBuffer = 2 * 1024 * 1024) => {
  const result = spawnSync('gh', ['api', endpoint], {
    timeout: 30_000,
    maxBuffer,
  })
  if (result.error || result.status !== 0) {
    throw new Error('History transport unavailable')
  }
  return result.stdout
}

const directory = process.argv[2]
const repository = process.env.GITHUB_REPOSITORY
if (
  !directory ||
  !repository ||
  !/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/u.test(repository)
) {
  throw new Error(
    'Usage: GITHUB_REPOSITORY=owner/repo fetch-flake-history.ts <directory>',
  )
}
if (existsSync(directory) && readdirSync(directory).length) {
  throw new Error('History directory must be empty; choose a fresh directory')
}
mkdirSync(directory, { recursive: true, mode: 0o700 })
const metadata = {
  days: 14,
  selectedRuns: 0,
  downloaded: 0,
  bytes: 0,
  rejected: 0,
  expired: 0,
  unavailable: false,
  truncated: false,
}
try {
  const since = new Date(Date.now() - metadata.days * 86_400_000).toISOString()
  const query = new URLSearchParams({
    created: `>=${since}`,
    status: 'completed',
    per_page: '100',
  })
  const runs = runsSchema.parse(
    JSON.parse(
      api(
        `repos/${repository}/actions/workflows/ci.yml/runs?${query}`,
      ).toString('utf8'),
    ),
  ).workflow_runs
  const pr = process.env.FLAKE_PR_NUMBER
    ? Number(process.env.FLAKE_PR_NUMBER)
    : undefined
  const selected = selectHistoryRuns(runs, process.env.GITHUB_RUN_ID ?? '0', pr)
  metadata.selectedRuns = selected.runs.length
  metadata.truncated = selected.truncated || runs.length === 100
  let inspected = 0
  let reportBytes = 0
  for (const run of selected.runs) {
    const artifacts = artifactSchema.parse(
      JSON.parse(
        api(
          `repos/${repository}/actions/runs/${run.id}/artifacts?per_page=100`,
        ).toString('utf8'),
      ),
    )
    if (artifacts.total_count > artifacts.artifacts.length) {
      metadata.truncated = true
    }
    for (const artifact of artifacts.artifacts) {
      if (!/^flake-current-[a-zA-Z0-9_.-]+$/u.test(artifact.name)) {
        continue
      }
      if (artifact.expired) {
        metadata.expired++
        continue
      }
      if (
        ++inspected > 50 ||
        artifact.size_in_bytes > MAX_REPORT_BYTES ||
        metadata.bytes + artifact.size_in_bytes > MAX_BYTES
      ) {
        metadata.truncated = true
        continue
      }
      try {
        const zip = api(
          `repos/${repository}/actions/artifacts/${artifact.id}/zip`,
          Math.min(MAX_REPORT_BYTES, MAX_BYTES - metadata.bytes),
        )
        metadata.bytes += zip.length
        const extracted = readFlakeArchive(zip)
        const bytes = Buffer.byteLength(extracted)
        if (reportBytes + bytes > MAX_BYTES) {
          metadata.truncated = true
          continue
        }
        const report = parseReport(JSON.parse(extracted))
        if (
          report.context.runId !== String(run.id) ||
          report.context.event !== run.event ||
          report.context.headSha !== run.head_sha ||
          report.context.runAttempt > run.run_attempt ||
          `flake-current-${report.suite}` !== artifact.name
        ) {
          throw new Error('Invalid provenance')
        }
        writeFileSync(
          path.join(directory, `flake-${run.id}-${report.suite}.json`),
          `${JSON.stringify(report)}\n`,
          { mode: 0o600 },
        )
        reportBytes += bytes
        metadata.downloaded++
      } catch {
        metadata.rejected++
      }
    }
  }
} catch {
  metadata.unavailable = true
} finally {
  writeFileSync(
    path.join(directory, 'history-metadata.json'),
    `${JSON.stringify(metadata)}\n`,
    { mode: 0o600 },
  )
}
console.log(JSON.stringify(metadata))
