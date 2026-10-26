import { describe, expect, it } from 'vitest'

import {
  canReorderFavoriteDisplay,
  getFavoriteDisplayUrls,
} from './favorite-display'

describe('favorite display projection', () => {
  const urls = [
    { id: 'a' },
    { id: 'b', isFavorite: true },
    { id: 'c', isFavorite: true },
    { id: 'd', isFavorite: false },
  ]

  it('partitions stably and filters without modifying the manual source', () => {
    const before = structuredClone(urls)
    expect(getFavoriteDisplayUrls(urls).map(({ id }) => id)).toEqual([
      'b',
      'c',
      'a',
      'd',
    ])
    expect(getFavoriteDisplayUrls(urls, true).map(({ id }) => id)).toEqual([
      'b',
      'c',
    ])
    expect(urls).toEqual(before)
    expect(
      getFavoriteDisplayUrls([{ id: 'a', isFavorite: false }], true),
    ).toEqual([])
  })

  it('allows manual ordering only when the complete manual list is displayed', () => {
    expect(canReorderFavoriteDisplay(undefined, false)).toBe(true)
    expect(canReorderFavoriteDisplay([], true)).toBe(false)
    expect(canReorderFavoriteDisplay(urls, false)).toBe(false)
    expect(canReorderFavoriteDisplay([{ isFavorite: false }], false)).toBe(true)
    expect(canReorderFavoriteDisplay([], false, false)).toBe(false)
  })
})
