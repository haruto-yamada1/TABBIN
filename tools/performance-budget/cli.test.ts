import { spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { runCli } from './cli'
import { REQUIRED_CASES, WORK_BUDGETS } from './report'
import type { BudgetSample } from './report'

const environment = {
  platform: 'linux-x64',
  browserVersion: 'Chromium 142',
  nodeVersion: '24.1.0',
  bunVersion: '1.3.14',
}
const sourceRevision = 'a'.repeat(40)

function firstSample(values: BudgetSample[]): BudgetSample {
  const sample = values[0]
  if (!sample) {
    throw new Error('Fixture sample missing')
  }
  return sample
}

function samples(): BudgetSample[] {
  return REQUIRED_CASES.map(({ scenario, size, mode }) => {
    const work =
      scenario === 'bulk-open'
        ? WORK_BUDGETS[scenario].backgroundTabs
        : WORK_BUDGETS[scenario][mode === 'domain' ? 'domain' : 'custom']
    return {
      scenario,
      size,
      mode,
      repeat: 0,
      durationMs: 20,
      work: Object.fromEntries(
        Object.entries(work).map(([key, value]) => [
          key,
          value === 'size' ? size : value,
        ]),
      ),
    }
  })
}

describe('performance budget CLI', () => {
  let root: string
  let input: string
  let output: string

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'tabbin-budget-cli-'))
    input = path.join(root, 'input')
    output = path.join(root, 'output')
    await mkdir(input)
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await rm(root, { recursive: true, force: true })
  })

  async function writeSamples(
    values: unknown = samples(),
    env: unknown = environment,
    subdirectory = '',
    revision: unknown = sourceRevision,
  ) {
    const directory = path.join(input, subdirectory)
    await mkdir(directory, { recursive: true })
    await writeFile(
      path.join(directory, 'budget-samples.json'),
      JSON.stringify({
        schemaVersion: 1,
        environment: env,
        sourceRevision: revision,
        samples: values,
      }),
    )
  }

  async function run(baseline?: string) {
    return runCli([
      '--input',
      input,
      '--output',
      output,
      ...(baseline ? ['--baseline', baseline] : []),
    ])
  }

  async function report() {
    return JSON.parse(await readFile(path.join(output, 'report.json'), 'utf8'))
  }

  async function baseline() {
    await writeSamples()
    expect(await run()).toBe(0)
    const baselinePath = path.join(root, 'baseline.json')
    const value = await report()
    await writeFile(baselinePath, JSON.stringify(value))
    return { baselinePath, value }
  }

  it('recursively discovers only budget-samples files and writes the reports', async () => {
    const values = samples()
    await writeSamples(values.slice(0, 7), environment, 'domain/nested')
    await writeSamples(values.slice(7), environment, 'custom')
    await writeFile(path.join(input, 'ignored.json'), 'not valid json')

    expect(await run()).toBe(0)
    expect(await report()).toMatchObject({
      schemaVersion: 1,
      environment,
      sourceRevision,
      sampleCount: 14,
      repeatCount: 1,
      failures: [],
      comparison: { duration: { status: 'unavailable' }, work: [] },
    })
    const markdown = await readFile(path.join(output, 'report.md'), 'utf8')
    expect(markdown).toContain('initial/1000/domain')
    expect(markdown).toContain('advisory')
    expect(markdown).toContain('No baseline supplied')
  })

  it('compares duration ratios and work deltas for the same environment', async () => {
    const { baselinePath } = await baseline()
    const values = samples()
    for (const sample of values) {
      sample.durationMs = 30
    }
    firstSample(values).work.readonlyTransactions = 11
    await writeSamples(values)

    expect(await run(baselinePath)).toBe(0)
    const value = await report()
    expect(value.comparison.duration).toMatchObject({
      status: 'available',
      cases: expect.arrayContaining([
        { caseId: 'initial/1000/domain', ratio: 1.5 },
      ]),
    })
    expect(value.comparison.work).toContainEqual({
      caseId: 'initial/1000/domain',
      metric: 'readonlyTransactions',
      current: 11,
      baseline: 12,
      delta: -1,
    })
  })

  it.each(['platform', 'browserVersion', 'nodeVersion', 'bunVersion'] as const)(
    'makes duration comparison unavailable when %s differs, preserving work deltas',
    async (key) => {
      const { baselinePath } = await baseline()
      await writeSamples(samples(), { ...environment, [key]: 'different' })
      expect(await run(baselinePath)).toBe(0)
      const value = await report()
      expect(value.comparison.duration).toMatchObject({
        status: 'unavailable',
        reason: 'Environment differs; duration ratios are unavailable.',
        cases: [],
      })
      expect(value.comparison.work.length).toBeGreaterThan(0)
    },
  )

  it('does not accept increased work merely because the baseline is larger', async () => {
    const { baselinePath, value } = await baseline()
    value.cases[0].work.readonlyTransactions = 100
    await writeFile(baselinePath, JSON.stringify(value))
    const values = samples()
    firstSample(values).work.readonlyTransactions = 13
    await writeSamples(values)
    expect(await run(baselinePath)).toBe(1)
    expect((await report()).failures).toContainEqual(
      expect.objectContaining({ code: 'budget', actual: 13, expected: 12 }),
    )
  })

  it.each([
    ['no input files', 'empty'],
    ['invalid json', 'json'],
    ['wrong schema version', 'version'],
    ['missing environment', 'environment'],
    ['missing source revision', 'revision-missing'],
    ['invalid source revision', 'revision-invalid'],
    ['incomplete matrix', 'matrix'],
    ['duplicate samples across files', 'duplicate'],
    ['mismatched input environments', 'mismatch'],
    ['mismatched input source revisions', 'revision-mismatch'],
  ])('fails closed for %s and writes the failure', async (_name, kind) => {
    if (kind === 'json') {
      await writeFile(path.join(input, 'budget-samples.json'), '{')
    } else if (kind === 'version') {
      await writeFile(
        path.join(input, 'budget-samples.json'),
        JSON.stringify({ schemaVersion: 2, environment, samples: samples() }),
      )
    } else if (kind === 'environment') {
      await writeSamples(samples(), null)
    } else if (kind === 'revision-missing') {
      await writeSamples(samples(), environment, '', null)
    } else if (kind === 'revision-invalid') {
      await writeSamples(samples(), environment, '', 'invalid')
    } else if (kind === 'revision-mismatch') {
      await writeSamples(samples().slice(0, 7))
      await writeSamples(
        samples().slice(7),
        environment,
        'more',
        'b'.repeat(40),
      )
    } else if (kind === 'matrix') {
      await writeSamples(samples().slice(1))
    } else if (kind === 'duplicate' || kind === 'mismatch') {
      await writeSamples()
      await writeSamples(
        samples(),
        kind === 'mismatch'
          ? { ...environment, browserVersion: 'other' }
          : environment,
        'more',
      )
    }
    expect(await run()).toBe(1)
    expect((await report()).failures.length).toBeGreaterThan(0)
  })

  it.each([
    'missing',
    'json',
    'version',
    'matrix',
    'duration',
    'work',
    'count',
    'revision-missing',
    'revision-invalid',
  ])('fails closed for invalid baseline: %s', async (kind) => {
    const { baselinePath, value } = await baseline()
    if (kind === 'missing') {
      await rm(baselinePath)
    } else if (kind === 'json') {
      await writeFile(baselinePath, '{')
    } else {
      if (kind === 'version') {
        value.schemaVersion = 2
      }
      if (kind === 'matrix') {
        value.cases.pop()
      }
      if (kind === 'duration') {
        value.cases[0].durationMs.median = -1
      }
      if (kind === 'work') {
        value.cases[0].work = {}
      }
      if (kind === 'count') {
        value.repeatCount = 2
      }
      if (kind === 'revision-missing') {
        delete value.sourceRevision
      }
      if (kind === 'revision-invalid') {
        value.sourceRevision = 'invalid'
      }
      await writeFile(baselinePath, JSON.stringify(value))
    }
    expect(await run(baselinePath)).toBe(1)
    expect((await report()).failures).toContainEqual(
      expect.objectContaining({ code: 'baseline' }),
    )
  })

  it('handles zero baseline durations without emitting non-finite ratios', async () => {
    const { baselinePath, value } = await baseline()
    value.cases[0].durationMs = { median: 0, p95: 0 }
    await writeFile(baselinePath, JSON.stringify(value))
    expect(await run(baselinePath)).toBe(0)
    expect((await report()).comparison.duration.cases[0]).toEqual({
      caseId: 'initial/1000/domain',
      ratio: null,
    })
  })

  it('rejects unknown or missing arguments', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await runCli(['--input', input])).toBe(1)
    expect(
      await runCli(['--input', input, '--output', output, '--unsafe']),
    ).toBe(1)
  })

  it('runs the Bun entrypoint and forwards a failed budget as its exit status', async () => {
    await writeSamples()
    const args = [
      path.resolve('tools/performance-budget/cli.ts'),
      '--input',
      input,
      '--output',
      output,
    ]
    expect(spawnSync('bun', args, { encoding: 'utf8', cwd: root }).status).toBe(
      0,
    )
    expect((await report()).cases).toHaveLength(14)
    expect((await report()).sourceRevision).toBe(sourceRevision)
    const values = samples()
    firstSample(values).work.pageQueries = 3
    await writeSamples(values)
    expect(spawnSync('bun', args, { encoding: 'utf8' }).status).toBe(1)
    expect((await report()).failures).toContainEqual(
      expect.objectContaining({
        code: 'budget',
        metric: 'pageQueries',
        actual: 3,
      }),
    )
  })
})
