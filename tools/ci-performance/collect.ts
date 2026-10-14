import { z } from 'zod'

import { jobSchema, runSchema } from './report'
import type { Evidence } from './report'

type Options = {
  repo: string
  limit?: number
  runIds?: number[]
  workflow?: string
  branch?: string
  api: (path: string) => Promise<unknown>
}

const total = z.number().int().nonnegative()
const runPageSchema = z.object({
  total_count: total,
  workflow_runs: z.array(runSchema),
})
const jobPageSchema = z.object({ total_count: total, jobs: z.array(jobSchema) })

async function mapBatches<T, R>(
  values: T[],
  size: number,
  map: (value: T) => Promise<R>,
  offset = 0,
): Promise<R[]> {
  if (offset >= values.length) {
    return []
  }
  const batch = await Promise.all(values.slice(offset, offset + size).map(map))
  const rest = await mapBatches(values, size, map, offset + size)
  return [...batch, ...rest]
}

async function getRuns(options: Options) {
  const root = `repos/${options.repo}/actions`
  if (options.runIds) {
    if (
      !options.runIds.length ||
      new Set(options.runIds).size !== options.runIds.length
    ) {
      throw new Error('Run IDs must be nonempty and unique')
    }
    return mapBatches(options.runIds, 4, async (id) => {
      z.number().int().positive().parse(id)
      return runSchema.parse(await options.api(`${root}/runs/${id}`))
    })
  }
  const limit = z
    .number()
    .int()
    .min(1)
    .max(100)
    .parse(options.limit ?? 30)
  const workflow = options.workflow ?? 'ci.yml'
  if (!/^[\w.-]+$/.test(workflow)) {
    throw new Error('Invalid workflow filename')
  }
  const branch = options.branch
    ? `&branch=${encodeURIComponent(options.branch)}`
    : ''
  const readPage = async (
    page: number,
    runs: Evidence['run'][],
  ): Promise<Evidence['run'][]> => {
    const response = runPageSchema.parse(
      await options.api(
        `${root}/workflows/${workflow}/runs?status=completed&per_page=100&page=${page}${branch}`,
      ),
    )
    const next = [...runs, ...response.workflow_runs]
    if (next.length >= limit) {
      return next.slice(0, limit)
    }
    if (next.length >= response.total_count || !response.workflow_runs.length) {
      throw new Error(
        `Incomplete sample: requested ${limit}, found ${next.length}`,
      )
    }
    return readPage(page + 1, next)
  }
  return readPage(1, [])
}

async function getJobs(options: Options, id: number) {
  const readPage = async (
    page: number,
    jobs: Evidence['jobs'],
  ): Promise<Evidence['jobs']> => {
    const response = jobPageSchema.parse(
      await options.api(
        `repos/${options.repo}/actions/runs/${id}/jobs?filter=latest&per_page=100&page=${page}`,
      ),
    )
    const next = [...jobs, ...response.jobs]
    if (next.length >= response.total_count) {
      if (!next.length || next.length > response.total_count) {
        throw new Error(`Invalid job count for run ${id}`)
      }
      return next
    }
    if (!response.jobs.length) {
      throw new Error('Incomplete jobs pagination')
    }
    return readPage(page + 1, next)
  }
  return readPage(1, [])
}

export async function collectEvidence(options: Options): Promise<Evidence[]> {
  if (!/^[\w.-]+\/[\w.-]+$/.test(options.repo)) {
    throw new Error('Invalid repository')
  }
  const runs = await getRuns(options)
  return mapBatches(runs, 1, async (latest) => {
    const run =
      latest.run_attempt > 1
        ? runSchema.parse(
            await options.api(
              `repos/${options.repo}/actions/runs/${latest.id}/attempts/${latest.run_attempt}`,
            ),
          )
        : latest
    if (
      run.id !== latest.id ||
      run.run_attempt !== latest.run_attempt ||
      (run.run_attempt > 1 && !run.run_started_at)
    ) {
      throw new Error('Incomplete or mismatched workflow attempt evidence')
    }
    const jobs = await getJobs(options, run.id)
    const logs: Evidence['logs'] = {}
    // Only derived cache evidence enters the report. Never persist raw logs.
    await mapBatches(
      jobs.filter((job) => job.conclusion !== 'skipped'),
      4,
      async (job) => {
        try {
          logs[job.id] = z
            .string()
            .parse(
              await options.api(
                `repos/${options.repo}/actions/jobs/${job.id}/logs`,
              ),
            )
        } catch {
          logs[job.id] = null
        }
      },
    )
    // The attempt endpoint has its own created_at. Keep the original run's
    // creation time for elapsed/queue metrics and the attempt's start separately.
    return { run: { ...run, created_at: latest.created_at }, jobs, logs }
  })
}
