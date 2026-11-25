import { describe, expect, it } from 'vitest'

import type { SavedTabsTabGroupDto as TabGroup } from '@/contexts/saved-tabs/presentation/types/SavedTabsCompatibilityViewModel'

import {
  applyOpenTabsRowOrder,
  buildOpenTabsRowId,
  buildOpenTabsRows,
} from './open-tabs-display'
import type { OpenTabsRow } from './open-tabs-display'

const makeGroup = (overrides: Partial<TabGroup> = {}): TabGroup => ({
  domain: 'example.com',
  id: 'group-1',
  ...overrides,
})

const makeUrl = (
  url: string,
  overrides: Partial<{
    title: string
    isFavorite: boolean
    savedAt: number
  }> = {},
) => ({
  url,
  title: overrides.title ?? `Title for ${url}`,
  ...(overrides.isFavorite !== undefined
    ? { isFavorite: overrides.isFavorite }
    : {}),
  ...(overrides.savedAt !== undefined ? { savedAt: overrides.savedAt } : {}),
})

describe('buildOpenTabsRowId', () => {
  it('joins group id and url with a separator that cannot appear in urls', () => {
    expect(buildOpenTabsRowId('group-1', 'https://example.com')).toBe(
      'group-1\u0000https://example.com',
    )
  })
})

describe('buildOpenTabsRows', () => {
  it('keeps the persistent URL ID separate from the sortable row ID', () => {
    const url = 'https://example.com/a'
    const rows = buildOpenTabsRows(
      [makeGroup({ urls: [{ id: 'persisted-url', url, title: 'Original' }] })],
      [url],
    )
    expect(rows).toEqual([
      expect.objectContaining({
        id: buildOpenTabsRowId('group-1', url),
        urlRecordId: 'persisted-url',
        groupId: 'group-1',
        url,
      }),
    ])
  })

  it('returns a stable empty reference when nothing is open', () => {
    const groups = [makeGroup({ urls: [makeUrl('https://example.com/a')] })]
    expect(buildOpenTabsRows(groups, [])).toEqual([])
  })

  it('keeps one row per (groupId, url) occurrence across groups', () => {
    const groups: TabGroup[] = [
      makeGroup({
        id: 'group-1',
        urls: [
          makeUrl('https://example.com/a'),
          makeUrl('https://example.com/b'),
        ],
      }),
      makeGroup({
        id: 'group-2',
        urls: [makeUrl('https://example.com/a', { isFavorite: true })],
      }),
    ]
    const rows = buildOpenTabsRows(groups, ['https://example.com/a'])
    expect(rows.map((row) => row.id)).toEqual([
      buildOpenTabsRowId('group-1', 'https://example.com/a'),
      buildOpenTabsRowId('group-2', 'https://example.com/a'),
    ])
    expect(rows[1]?.isFavorite).toBe(true)
  })

  it('preserves title, savedAt and group order from the source data', () => {
    const groups: TabGroup[] = [
      makeGroup({
        id: 'group-2',
        urls: [makeUrl('https://example.com/b', { savedAt: 42 })],
      }),
    ]
    const rows = buildOpenTabsRows(groups, ['https://example.com/b'])
    expect(rows).toEqual([
      {
        id: buildOpenTabsRowId('group-2', 'https://example.com/b'),
        groupId: 'group-2',
        isFavorite: false,
        title: 'Title for https://example.com/b',
        url: 'https://example.com/b',
        savedAt: 42,
      },
    ])
  })

  it('does not match prefixes of an open url', () => {
    const groups: TabGroup[] = [
      makeGroup({
        urls: [
          makeUrl('https://example.com/long-path'),
          makeUrl('https://example.com/long'),
        ],
      }),
    ]
    const rows = buildOpenTabsRows(groups, ['https://example.com/long'])
    expect(rows.map((row) => row.url)).toEqual(['https://example.com/long'])
  })
})

describe('applyOpenTabsRowOrder', () => {
  const rows: OpenTabsRow[] = [
    { id: 'row-1', groupId: 'g1', isFavorite: false, title: 't1', url: 'u1' },
    { id: 'row-2', groupId: 'g1', isFavorite: false, title: 't2', url: 'u2' },
    { id: 'row-3', groupId: 'g2', isFavorite: false, title: 't3', url: 'u3' },
  ]

  it('returns the input rows untouched when no custom order exists', () => {
    expect(applyOpenTabsRowOrder(rows, [])).toBe(rows)
  })

  it('reorders rows to match a session order', () => {
    expect(applyOpenTabsRowOrder(rows, ['row-3', 'row-1', 'row-2'])).toEqual([
      rows[2],
      rows[0],
      rows[1],
    ])
  })

  it('drops stale ids and appends newly discovered rows', () => {
    const appendedRow: OpenTabsRow = {
      id: 'row-4',
      groupId: 'g1',
      isFavorite: false,
      title: 't1',
      url: 'u4',
    }
    const withNew: OpenTabsRow[] = [...rows, appendedRow]
    expect(
      applyOpenTabsRowOrder(withNew, ['row-2', 'row-99', 'row-1']),
    ).toEqual([rows[1], rows[0], rows[2], appendedRow])
  })

  it('deduplicates repeated ids in the order list', () => {
    expect(applyOpenTabsRowOrder(rows, ['row-2', 'row-2', 'row-1'])).toEqual([
      rows[1],
      rows[0],
      rows[2],
    ])
  })
})
