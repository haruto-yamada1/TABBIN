import { describe, expect, it } from 'vitest'

import { collectEvidence } from './collect'
import { summarizeRuns } from './report'

const run = (overrides = {}) => ({
  id: 1,
  run_attempt: 1,
  status: 'completed',
  conclusion: 'success',
  html_url: 'https://github.com/owner/repo/actions/runs/1',
  head_sha: 'abc',
  head_branch: 'develop',
  event: 'pull_request',
  created_at: '2026-10-14T00:00:00Z',
  run_started_at: '2026-10-14T00:00:00Z',
  ...overrides,
})

const step = (overrides = {}) => ({
  name: 'Restore package cache',
  number: 1,
  conclusion: 'success',
  started_at: '2026-10-14T00:00:10Z',
  completed_at: '2026-10-14T00:00:20Z',
  ...overrides,
})

const job = (overrides = {}) => ({
  id: 11,
  name: 'Test',
  status: 'completed',
  conclusion: 'success',
  created_at: '2026-10-14T00:00:05Z',
  started_at: '2026-10-14T00:00:10Z',
  completed_at: '2026-10-14T00:01:11Z',
  steps: [step()],
  ...overrides,
})

describe('CI performance evidence', () => {
  it('separates elapsed, initial scheduling, job queue, actual execution, and rounding', () => {
    expect(
      summarizeRuns([
        {
          run: run(),
          jobs: [job(), job({ id: 12, name: 'Coverage' })],
          logs: {},
        },
      ]),
    ).toMatchObject({
      summary: {
        elapsedSeconds: { median: 71, p90: 71, p95: 71 },
        initialSchedulingSeconds: { median: 10 },
        runnerMinutes: 122 / 60,
        roundedJobMinutesEstimate: 4,
      },
      jobs: [
        {
          name: 'Coverage',
          queueSeconds: { median: 5 },
          executionSeconds: { median: 61 },
        },
        { name: 'Test', queueSeconds: { median: 5 } },
      ],
    })
  })

  it('does not count cancelled or skipped as failures or fabricate absent timing', () => {
    const samples = ['success', 'failure', 'cancelled', 'skipped'].map(
      (conclusion, index) => ({
        run: run({ id: index + 1, conclusion }),
        jobs: [
          job({
            id: index + 11,
            conclusion,
            created_at: null,
            started_at: conclusion === 'skipped' ? null : job().started_at,
            completed_at: conclusion === 'skipped' ? null : job().completed_at,
          }),
        ],
        logs: {},
      }),
    )
    expect(summarizeRuns(samples)).toMatchObject({
      summary: {
        conclusions: { success: 1, failure: 1, cancelled: 1, skipped: 1 },
        failureRate: 0.5,
        elapsedSeconds: { count: 3, missing: 1 },
      },
      jobs: [{ queueSeconds: { count: 0, missing: 4, median: null } }],
    })
  })

  it('uses the latest attempt start without including a rerun delay', async () => {
    const calls: string[] = []
    const samples = await collectEvidence({
      repo: 'owner/repo',
      runIds: [1],
      api: async (path) => {
        calls.push(path)
        if (path.endsWith('/runs/1') || path.endsWith('/attempts/2')) {
          return run({
            run_attempt: 2,
            created_at: '2026-10-13T00:00:00Z',
            run_started_at: path.endsWith('/attempts/2')
              ? '2026-10-14T00:00:00Z'
              : '2026-10-13T00:00:00Z',
          })
        }
        if (path.includes('/jobs?')) {
          return { total_count: 1, jobs: [job()] }
        }
        return ''
      },
    })
    expect(summarizeRuns(samples)).toMatchObject({
      runs: [{ elapsedSeconds: 86_471, attemptElapsedSeconds: 71 }],
      summary: { attemptElapsedSeconds: { median: 71, p90: 71 } },
    })
    expect(calls).toContain('repos/owner/repo/actions/runs/1/attempts/2')
  })

  it('derives cache outcomes per step while keeping toolchain and dependencies separate', () => {
    const log = [
      '2026-10-14T00:00:12Z Cache hit for: secret-cache-key',
      '2026-10-14T00:00:13Z Cache restored successfully',
      '2026-10-14T00:00:25Z Cache not found for input keys: secret-second-key',
    ].join('\n')
    const report = summarizeRuns([
      {
        run: run(),
        jobs: [
          job({
            steps: [
              step({ name: 'Set up Bun' }),
              step({
                name: 'Restore package cache',
                number: 2,
                started_at: '2026-10-14T00:00:21Z',
                completed_at: '2026-10-14T00:00:30Z',
              }),
            ],
          }),
        ],
        logs: { '11': log },
      },
    ])
    expect(report).toMatchObject({
      jobs: [
        {
          steps: [
            {
              name: 'Restore package cache',
              cache: { restored: 0, missed: 1, restoreRate: 0 },
            },
            {
              name: 'Set up Bun',
              cache: { restored: 1, missed: 0, restoreRate: 1 },
            },
          ],
        },
      ],
    })
    expect(JSON.stringify(report)).not.toContain('secret-cache-key')
    expect(JSON.stringify(report)).not.toContain('secret-second-key')
  })

  it('records inaccessible logs and no cache markers as unknown, never a zero-percent hit rate', () => {
    const samples = [null, '2026-10-14T00:00:12Z normal build output'].map(
      (log, index) => ({
        run: run({ id: index + 1 }),
        jobs: [job({ id: index + 11 })],
        logs: { [index + 11]: log },
      }),
    )
    expect(summarizeRuns(samples)).toMatchObject({
      jobs: [
        {
          steps: [
            {
              cache: {
                restored: 0,
                missed: 0,
                unavailable: 1,
                unobserved: 1,
                restoreRate: null,
              },
            },
          ],
        },
      ],
    })
  })

  it('does not attribute a cache restore to adjacent steps sharing second boundaries', () => {
    expect(
      summarizeRuns([
        {
          run: run(),
          jobs: [
            job({
              steps: [
                step({
                  name: 'Set up Node.js',
                  completed_at: '2026-10-14T00:00:11Z',
                }),
                step({
                  name: 'Set up Bun',
                  number: 2,
                  started_at: '2026-10-14T00:00:11Z',
                  completed_at: '2026-10-14T00:00:12Z',
                }),
                step({
                  name: 'Install dependencies',
                  number: 4,
                  started_at: '2026-10-14T00:00:12Z',
                }),
                step({
                  name: 'Verify toolchain versions',
                  number: 3,
                  started_at: '2026-10-14T00:00:12Z',
                  completed_at: '2026-10-14T00:00:12Z',
                }),
              ],
            }),
          ],
          logs: {
            '11': [
              '2026-10-14T00:00:11.500Z Cache hit for: omitted-key',
              '2026-10-14T00:00:12.300Z Cache restored successfully',
            ].join('\n'),
          },
        },
      ]),
    ).toMatchObject({
      jobs: [
        {
          steps: [
            {
              name: 'Install dependencies',
              cache: { restored: 0, unobserved: 1 },
            },
            { name: 'Set up Bun', cache: { restored: 1 } },
            { name: 'Set up Node.js', cache: { restored: 0, unobserved: 1 } },
            {
              name: 'Verify toolchain versions',
              cache: { restored: 0, unobserved: 1 },
            },
          ],
        },
      ],
    })
  })

  it('fails closed on malformed timing, incomplete jobs, and duplicate run IDs', () => {
    for (const sample of [
      { run: run({ status: 'in_progress' }), jobs: [job()], logs: {} },
      { run: run(), jobs: [], logs: {} },
      { run: run(), jobs: [job({ started_at: 'invalid' })], logs: {} },
      {
        run: run(),
        jobs: [job({ completed_at: '2026-10-13T00:00:00Z' })],
        logs: {},
      },
    ]) {
      expect(() => summarizeRuns([sample])).toThrow(
        /completed|small|datetime|timing/i,
      )
    }
    const sample = { run: run(), jobs: [job()], logs: {} }
    expect(() => summarizeRuns([sample, sample])).toThrow(/duplicate/i)
  })

  it('paginates jobs, filters completed runs, and tolerates only log access failure', async () => {
    const calls: string[] = []
    const api = async (path: string) => {
      calls.push(path)
      if (path.includes('/workflows/')) {
        return { total_count: 1, workflow_runs: [run()] }
      }
      if (path.includes('/runs/1/jobs')) {
        return {
          total_count: 2,
          jobs: [path.endsWith('page=1') ? job() : job({ id: 12 })],
        }
      }
      throw new Error('logs inaccessible')
    }
    expect(
      await collectEvidence({ repo: 'owner/repo', limit: 1, api }),
    ).toMatchObject([
      { jobs: [{ id: 11 }, { id: 12 }], logs: { 11: null, 12: null } },
    ])
    expect(calls).toContain(
      'repos/owner/repo/actions/workflows/ci.yml/runs?status=completed&per_page=100&page=1',
    )
    expect(calls).toContain(
      'repos/owner/repo/actions/runs/1/jobs?filter=latest&per_page=100&page=2',
    )
    await expect(
      collectEvidence({
        repo: 'owner/repo',
        limit: 1,
        api: async () => ({ total_count: 1, workflow_runs: [] }),
      }),
    ).rejects.toThrow(/incomplete/i)
  })

  it('supports explicit run IDs and rejects a jobs API failure rather than returning a partial report', async () => {
    const calls: string[] = []
    await expect(
      collectEvidence({
        repo: 'owner/repo',
        runIds: [1],
        api: async (path) => {
          calls.push(path)
          if (path.endsWith('/runs/1')) {
            return run()
          }
          throw new Error('jobs request denied')
        },
      }),
    ).rejects.toThrow('jobs request denied')
    expect(calls).toContain('repos/owner/repo/actions/runs/1')
  })
})
