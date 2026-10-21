import { describe, expect, it } from 'vitest'

import { evaluateSamples } from './report'
import type { BudgetSample } from './report'

function sampleAt(values: BudgetSample[], index: number): BudgetSample {
  const sample = values[index]
  if (!sample) {
    throw new Error('Fixture sample missing')
  }
  return sample
}

function completeSamples(repeats = 1): BudgetSample[] {
  const samples: BudgetSample[] = []
  for (let repeat = 0; repeat < repeats; repeat += 1) {
    for (const size of [1000, 10000] as const) {
      for (const scenario of [
        'initial',
        'search',
        'category-switch',
      ] as const) {
        for (const mode of ['domain', 'custom'] as const) {
          let work: Record<string, number> = {
            readonlyTransactions: mode === 'domain' ? 12 : 37,
            sessionCalls: mode === 'domain' ? 12 : 37,
            pageQueries: 2,
            pendingOperations: 0,
          }
          if (scenario === 'search') {
            work = { readonlyTransactions: mode === 'domain' ? 1 : 6 }
          } else if (scenario === 'category-switch') {
            work = {
              readonlyTransactions: 0,
              sessionCalls: 0,
              pageQueries: 0,
              pendingOperations: 0,
            }
          }
          samples.push({
            scenario,
            size,
            mode,
            repeat,
            durationMs: [10, 40, 20][repeat] ?? 30,
            work,
          })
        }
      }
      samples.push({
        scenario: 'bulk-open',
        size,
        mode: 'backgroundTabs',
        repeat,
        durationMs: 10_000_000 + repeat,
        work: {
          peakPendingCreates: 5,
          createdTabs: size,
          opened: size,
          failed: 0,
          remaining: size,
          pendingOperations: 0,
        },
      })
    }
  }
  return samples
}

describe('evaluateSamples', () => {
  it('aggregates all cases using median, nearest-rank p95, and maximum work', () => {
    const samples = completeSamples(3)
    sampleAt(samples, 14).work.extraCounter = 4
    sampleAt(samples, 28).work.extraCounter = 9
    const result = evaluateSamples(samples)

    expect(result.failures).toEqual([])
    expect(result.sampleCount).toBe(42)
    expect(result.repeatCount).toBe(3)
    expect(result.cases).toHaveLength(14)
    expect(result.cases[0]).toMatchObject({
      id: 'initial/1000/domain',
      count: 3,
      durationMs: { median: 20, p95: 40 },
      work: { readonlyTransactions: 12, extraCounter: 9 },
    })
  })

  it('uses the mean of the middle two durations for an even sample count', () => {
    expect(evaluateSamples(completeSamples(2)).cases[0]).toMatchObject({
      durationMs: { median: 25, p95: 40 },
    })
  })

  it('uses nearest-rank p95 rather than the maximum for twenty observations', () => {
    const samples = completeSamples(20).map((sample) => ({
      ...sample,
      durationMs: sample.repeat + 1,
    }))
    expect(evaluateSamples(samples).cases[0]).toMatchObject({
      count: 20,
      durationMs: { median: 10.5, p95: 19 },
    })
  })

  it.each([
    ['no samples', []],
    ['not an array', {}],
    ['missing case', completeSamples().slice(1)],
    ['duplicate repeat', [...completeSamples(), completeSamples()[0]]],
    ['unequal repeat counts', [...completeSamples(), completeSamples(2)[14]]],
    [
      'repeat gap',
      completeSamples().map((sample) => ({ ...sample, repeat: 1 })),
    ],
    [
      'unsupported case',
      completeSamples().map((sample, index) =>
        index === 0 ? { ...sample, mode: 'backgroundTabs' } : sample,
      ),
    ],
    ['null entry', [null, ...completeSamples()]],
  ])('rejects %s', (_name, samples) => {
    expect(evaluateSamples(samples).failures.length).toBeGreaterThan(0)
  })

  it.each([
    ['negative duration', { durationMs: -1 }],
    ['non-finite duration', { durationMs: Number.POSITIVE_INFINITY }],
    ['fractional repeat', { repeat: 0.5 }],
    ['negative repeat', { repeat: -1 }],
    ['missing work key', { work: { readonlyTransactions: 12 } }],
    ['negative work', { work: { unexpected: -1 } }],
    ['non-finite work', { work: { unexpected: Number.NaN } }],
    ['fractional count', { work: { unexpected: 1.5 } }],
    [
      'unsafe integer count',
      { work: { unexpected: Number.MAX_SAFE_INTEGER + 1 } },
    ],
    ['non-numeric work', { work: { unexpected: '1' } }],
  ])('rejects %s', (_name, overrides) => {
    const samples: unknown[] = completeSamples()
    samples[0] = { ...completeSamples()[0], ...overrides }
    expect(evaluateSamples(samples).failures.length).toBeGreaterThan(0)
  })

  it('fails the maximum observed work even when other repeats are within budget', () => {
    const samples = completeSamples(3)
    sampleAt(samples, 14).work.readonlyTransactions = 13
    const result = evaluateSamples(samples)
    expect(result.failures).toContainEqual(
      expect.objectContaining({
        code: 'budget',
        caseId: 'initial/1000/domain',
        metric: 'readonlyTransactions',
        actual: 13,
        expected: 12,
      }),
    )
  })

  it.each([
    ['initial', 'sessionCalls', 13],
    ['initial', 'pageQueries', 3],
    ['category-switch', 'pendingOperations', 1],
    ['search', 'readonlyTransactions', 2],
    ['bulk-open', 'peakPendingCreates', 6],
    ['bulk-open', 'createdTabs', 999],
    ['bulk-open', 'opened', 999],
    ['bulk-open', 'failed', 1],
    ['bulk-open', 'remaining', 999],
    ['bulk-open', 'pendingOperations', 1],
  ] as const)('enforces %s %s', (scenario, metric, actual) => {
    const samples = completeSamples()
    const sample = samples.find((value) => value.scenario === scenario)
    if (!sample) {
      throw new Error('Fixture sample missing')
    }
    sample.work[metric] = actual
    expect(evaluateSamples(samples).failures).toContainEqual(
      expect.objectContaining({ code: 'budget', metric, actual }),
    )
  })

  it('does not fail slow timing observations', () => {
    const samples = completeSamples(2)
    for (const sample of samples) {
      sample.durationMs = Number.MAX_VALUE
    }
    const result = evaluateSamples(samples)
    expect(result.failures).toEqual([])
    expect(result.cases[0]?.durationMs).toEqual({
      median: Number.MAX_VALUE,
      p95: Number.MAX_VALUE,
    })
  })

  it.each(['domain', 'custom'] as const)(
    'rejects any data refresh during category navigation in %s mode',
    (mode) => {
      for (const metric of [
        'readonlyTransactions',
        'sessionCalls',
        'pageQueries',
        'pendingOperations',
      ]) {
        const samples = completeSamples()
        const sample = samples.find(
          (value) =>
            value.scenario === 'category-switch' && value.mode === mode,
        )
        if (!sample) {
          throw new Error('Fixture sample missing')
        }
        sample.work[metric] = 1
        expect(evaluateSamples(samples).failures).toContainEqual(
          expect.objectContaining({
            code: 'budget',
            metric,
            actual: 1,
            expected: 0,
          }),
        )
      }
    },
  )

  it('rejects an incomplete bulk-open repeat even if the maximum is complete', () => {
    const samples = completeSamples(2)
    const sample = samples.find((value) => value.scenario === 'bulk-open')
    if (!sample) {
      throw new Error('Fixture sample missing')
    }
    sample.work.opened = 999
    expect(evaluateSamples(samples).failures).toContainEqual(
      expect.objectContaining({
        code: 'budget',
        metric: 'opened',
        actual: 999,
        repeat: 0,
      }),
    )
  })
})
