import { describe, expect, it } from 'vitest'

import type { SavedTabsAnalyticsRecord } from '@/app/composition/backgroundSavedTabsDataPlaneTypes'

import { calculateAnalyticsHealth } from './analyticsHealth'

const now = Date.UTC(2026, 9, 6)
const day = 86_400_000
const record = (
  overrides: Partial<SavedTabsAnalyticsRecord> = {},
): SavedTabsAnalyticsRecord => ({
  id: 'a',
  eventId: 'a:first',
  domain: 'example.com',
  title: 'A',
  url: `https://example.com/${overrides.id ?? 'a'}`,
  savedAt: now,
  metric: 'first-saved',
  timestampAccuracy: 'exact',
  parentCategories: [],
  subCategories: [],
  projectCategories: [],
  savedInProjects: [],
  savedInTabGroups: ['example.com'],
  ...overrides,
})

describe('calculateAnalyticsHealth', () => {
  it('joins classification from memberships, without treating a collection group as a category', () => {
    const result = calculateAnalyticsHealth(
      [
        record(),
        record({ metric: 'last-saved' }),
        record({
          metric: 'membership-added',
          parentCategories: ['Group'],
          subCategories: ['Work'],
        }),
        record({
          metric: 'membership-added',
          subCategories: ['Work'],
          savedInTabGroups: ['other.example.com'],
        }),
        record({
          id: 'b',
          url: 'https://example.com/b',
          parentCategories: ['Group'],
        }),
      ],
      now,
    )
    expect(result.total).toBe(2)
    expect(result.uncategorized.map((item) => item.id)).toEqual(['b'])
    expect(result.categories).toHaveLength(1)
    expect(result.categories[0]?.records).toHaveLength(1)
    expect(result.records[0]?.savedInTabGroups).toEqual([
      'example.com',
      'other.example.com',
    ])
  })

  it('counts each URL once across saving events without a duplicate health metric', () => {
    const result = calculateAnalyticsHealth(
      [
        record(),
        record({ eventId: 'a:last', metric: 'last-saved' }),
        record({ eventId: 'a:member', metric: 'membership-added' }),
        record({ id: 'b', eventId: 'b:first' }),
        record({
          id: 'c',
          eventId: 'c:first',
          url: 'https://example.com/c',
          subCategories: ['Work'],
        }),
      ],
      now,
    )
    expect(result.total).toBe(3)
    expect(result.uncategorized).toHaveLength(2)
    expect(result).not.toHaveProperty('duplicates')
    expect(result.score).toBe(53)
  })

  it('uses only exact last saves for stale review candidates, never first saves or membership activity', () => {
    const old = now - 90 * day
    const result = calculateAnalyticsHealth(
      [
        record({ id: 'a', savedAt: old, metric: 'last-saved' }),
        record({ id: 'a', savedAt: now, metric: 'membership-added' }),
        record({ id: 'b', savedAt: old, metric: 'first-saved' }),
        record({
          id: 'c',
          savedAt: old,
          metric: 'last-saved',
          timestampAccuracy: 'legacy-fallback',
        }),
        record({ id: 'd', savedAt: old, metric: 'last-saved' }),
        record({ id: 'd', savedAt: now - day, metric: 'last-saved' }),
        record({ id: 'e', savedAt: now + day, metric: 'last-saved' }),
      ],
      now,
    )
    expect(result.stale.map((item) => item.id)).toEqual(['a'])
    expect(result.knownLastSaved).toBe(2)
  })

  it('counts each URL once per category and reports recent exact first saves', () => {
    const result = calculateAnalyticsHealth(
      [
        record({ subCategories: ['Work', 'Work'], savedAt: now - 7 * day }),
        record({ metric: 'last-saved', subCategories: ['Work'], savedAt: now }),
        record({
          id: 'b',
          url: 'https://example.com/b',
          subCategories: ['Play'],
          savedAt: now - day,
        }),
        record({
          id: 'c',
          url: 'https://example.com/c',
          subCategories: ['Work'],
          savedAt: now - day,
          timestampAccuracy: 'legacy-fallback',
        }),
        record({
          id: 'd',
          url: 'https://example.com/d',
          subCategories: ['Work'],
          savedAt: now + day,
        }),
      ],
      now,
    )
    expect(
      result.categories.find((item) => item.label === 'Work')?.records,
    ).toHaveLength(3)
    expect(
      result.growingCategories.map((item) => [item.label, item.records.length]),
    ).toEqual([
      ['Play', 1],
      ['Work', 1],
    ])
    expect(result.concentration).toBe(0.75)
    expect(result.score).toBe(90)
  })

  it('handles empty data and a balanced categorized library', () => {
    expect(calculateAnalyticsHealth([], now)).toMatchObject({
      score: null,
      total: 0,
      concentration: 0,
    })
    expect(
      calculateAnalyticsHealth(
        [
          record({ subCategories: ['Work'] }),
          record({
            id: 'b',
            url: 'https://example.com/b',
            projectCategories: ['Play'],
          }),
        ],
        now,
      ).score,
    ).toBe(100)
  })
})
