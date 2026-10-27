import { describe, expect, it } from 'vitest'

import { getFavoriteDisplayUrls, reorderFavoriteUrls } from './favorite-display'

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

  const manualUrls = urls.map((item) => ({ ...item, url: item.id }))

  it('reorders favorites in their manual slots without moving normal URLs', () => {
    const before = structuredClone(manualUrls)
    expect(reorderFavoriteUrls(manualUrls, 'b', 'c')).toEqual([
      manualUrls[0],
      manualUrls[2],
      manualUrls[1],
      manualUrls[3],
    ])
    expect(manualUrls).toEqual(before)
  })

  it('reorders normal URLs without moving favorites or hidden URLs', () => {
    expect(reorderFavoriteUrls(manualUrls, 'a', 'd')).toEqual([
      manualUrls[3],
      manualUrls[1],
      manualUrls[2],
      manualUrls[0],
    ])
    expect(
      reorderFavoriteUrls(manualUrls, 'b', 'c', manualUrls.slice(1, 3)),
    ).toEqual([manualUrls[0], manualUrls[2], manualUrls[1], manualUrls[3]])
    expect(
      reorderFavoriteUrls(manualUrls, 'a', 'd', manualUrls.slice(0, 3)),
    ).toBeNull()
  })

  it('rejects opposite favorite states, unknown URLs, and unchanged drops', () => {
    for (const [source, target] of [
      ['a', 'b'],
      ['b', 'd'],
      ['missing', 'a'],
      ['a', 'missing'],
      ['b', 'b'],
    ]) {
      expect(
        reorderFavoriteUrls(manualUrls, source ?? '', target ?? ''),
      ).toBeNull()
    }
  })

  it('uses the current visible order for consecutive drops before source synchronization', () => {
    const visible = manualUrls.filter((item) => item.isFavorite).toReversed()
    expect(reorderFavoriteUrls(manualUrls, 'c', 'b', visible)).toEqual(
      manualUrls,
    )
  })
})
