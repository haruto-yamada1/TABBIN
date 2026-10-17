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
