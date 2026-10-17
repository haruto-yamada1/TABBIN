import assert from 'node:assert/strict'

// eslint-disable-next-line import/no-relative-parent-imports -- native browser measurements share a typed protocol boundary
import type { StagedOpeningMeasurement } from '../../e2e/support/staged-url-opening-measurements'

const numericFields = [
  'count',
  'durationMs',
  'peakPendingCreates',
  'largestWindowBatch',
  'timerTicks',
  'maxTimerGapMs',
  'createdTabs',
  'createdWindows',
  'opened',
  'failed',
  'removed',
  'remaining',
] as const

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isMeasurement = (value: unknown): value is StagedOpeningMeasurement =>
  isRecord(value) &&
  numericFields.every(
    (field) =>
      typeof value[field] === 'number' &&
      Number.isFinite(value[field]) &&
      value[field] >= 0,
  ) &&
  (value.mode === 'backgroundTabs' || value.mode === 'newWindow') &&
  (value.firstProgressMs === null ||
    (typeof value.firstProgressMs === 'number' &&
      Number.isFinite(value.firstProgressMs) &&
      value.firstProgressMs >= 0))

export const parseStagedOpeningMeasurements = (
  value: unknown,
): readonly StagedOpeningMeasurement[] => {
  assert.ok(
    Array.isArray(value) && value.every(isMeasurement),
    'Malformed native opening measurement result.',
  )
  assert.equal(
    value.length,
    6,
    'Both opening modes must be measured at 10, 100 and 500 URLs.',
  )
  const expected = new Set(
    [10, 100, 500].flatMap((count) =>
      ['backgroundTabs', 'newWindow'].map((mode) => `${count}:${mode}`),
    ),
  )
  for (const result of value) {
    assert.ok(
      expected.delete(`${result.count}:${result.mode}`),
      'Unexpected or repeated measurement case.',
    )
    assert.equal(result.createdTabs, result.count)
    assert.equal(result.createdWindows, 1)
    assert.equal(result.opened, result.count)
    assert.equal(result.removed, result.count)
    assert.equal(result.failed, 0)
    assert.equal(result.remaining, 0)
    assert.ok(result.peakPendingCreates > 0 && result.peakPendingCreates <= 5)
    assert.ok(result.largestWindowBatch <= 5)
    assert.notEqual(result.firstProgressMs, null)
  }
  return value
}
