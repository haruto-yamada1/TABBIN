import { AssertionError } from 'node:assert'

import { describe, expect, it } from 'vitest'

import { parseStagedOpeningMeasurements } from './stagedOpeningMeasurementContract'

const completeRun = () =>
  [10, 100, 500].flatMap((count) =>
    (['backgroundTabs', 'newWindow'] as const).map((mode) => ({
      count,
      mode,
      durationMs: 1,
      firstProgressMs: 0.5,
      peakPendingCreates: 5,
      largestWindowBatch: mode === 'newWindow' ? 5 : 0,
      timerTicks: 1,
      maxTimerGapMs: 10,
      createdTabs: count,
      createdWindows: 1,
      newWindows: mode === 'newWindow' ? 1 : 0,
      tabsInNewWindows: mode === 'newWindow' ? count : 0,
      firstTabActive: mode === 'newWindow' ? true : null,
      opened: count,
      failed: 0,
      removed: count,
      remaining: 0,
    })),
  )

describe('native staged-opening measurement evidence', () => {
  it('accepts a complete run with confirmed creation and removal', () => {
    const run = completeRun()
    expect(parseStagedOpeningMeasurements(run)).toEqual(run)
  })

  it.each([
    { largestWindowBatch: 0 },
    { largestWindowBatch: 4 },
    { newWindows: 0, tabsInNewWindows: 0 },
    { newWindows: 2 },
    { tabsInNewWindows: 9 },
    { firstTabActive: false },
    { firstTabActive: null },
  ])(
    'rejects new-window evidence that violates its destination: %j',
    (invalid) => {
      const run = completeRun().map((result) =>
        result.mode === 'newWindow' ? { ...result, ...invalid } : result,
      )
      expect(() => parseStagedOpeningMeasurements(run)).toThrow(AssertionError)
    },
  )

  it.each([
    { newWindows: 1 },
    { tabsInNewWindows: 1 },
    { largestWindowBatch: 1 },
  ])('rejects background tabs that create a window: %j', (invalid) => {
    const run = completeRun().map((result) =>
      result.mode === 'backgroundTabs' ? { ...result, ...invalid } : result,
    )
    expect(() => parseStagedOpeningMeasurements(run)).toThrow(AssertionError)
  })

  it.each(
    [
      null,
      [],
      completeRun().slice(0, 5),
      Array.from({ length: 6 }, () => completeRun()[0]),
      completeRun().map((item) => ({ ...item, peakPendingCreates: 6 })),
      completeRun().map((item) => ({ ...item, createdTabs: item.count - 1 })),
      completeRun().map((item) => ({ ...item, remaining: 1 })),
      completeRun().map((item) => ({ ...item, durationMs: Number.NaN })),
      completeRun().map((item) => ({ ...item, firstProgressMs: null })),
    ].map((value) => ({ value })),
  )('rejects incomplete or invalid evidence: %j', ({ value }) => {
    expect(() => parseStagedOpeningMeasurements(value)).toThrow(AssertionError)
  })
})
