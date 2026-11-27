import { describe, expect, it } from 'vitest'

import {
  generateAnalyticsResult,
  getDefaultAnalyticsQuery,
} from '@/features/analytics/lib/analytics'
import { calculateAnalyticsHealth } from '@/features/analytics/lib/analyticsHealth'

import {
  createAnalyticsSampleRecords,
  shouldShowAnalyticsGhostPreview,
} from './analyticsSampleData'

const NOW = Date.UTC(2026, 2, 14, 0, 0, 0)

describe('analyticsSampleData', () => {
  it('creates deterministic sample records on reserved example domains', () => {
    const records = createAnalyticsSampleRecords(NOW)
    expect(records.length).toBeGreaterThan(0)
    expect(createAnalyticsSampleRecords(NOW)).toEqual(records)
    expect(
      records.every(
        (record) =>
          record.domain.endsWith('.example.com') ||
          record.domain.endsWith('.example.net'),
      ),
    ).toBe(true)
    expect(records.every((record) => record.savedAt <= NOW)).toBe(true)
  })

  it('feeds the existing chart pipeline so the ghost shows a finished shape', () => {
    const records = createAnalyticsSampleRecords(NOW)
    const result = generateAnalyticsResult(
      records,
      getDefaultAnalyticsQuery(),
      {
        now: NOW,
      },
    )
    expect(result.filteredRecordCount).toBe(records.length)
    expect(result.chartSpecs).toHaveLength(1)
    expect(result.chartSpecs[0]?.data.length).toBeGreaterThan(1)
    expect(
      result.chartSpecs[0]?.data.reduce(
        (sum, datum) =>
          sum + (typeof datum.count === 'number' ? datum.count : 0),
        0,
      ),
    ).toBe(records.length)
  })

  it('feeds the existing health calculation with categories and a score', () => {
    const records = createAnalyticsSampleRecords(NOW)
    const health = calculateAnalyticsHealth(records, NOW)
    expect(health.total).toBe(records.length)
    expect(health.score).not.toBeNull()
    expect(health.categories.length).toBeGreaterThan(0)
    expect(health.uncategorized.length).toBeGreaterThan(0)
  })

  it('shows the ghost preview only after loading with zero records', () => {
    expect(shouldShowAnalyticsGhostPreview(0, true)).toBe(true)
    expect(shouldShowAnalyticsGhostPreview(0, false)).toBe(false)
    expect(shouldShowAnalyticsGhostPreview(1, true)).toBe(false)
  })
})
