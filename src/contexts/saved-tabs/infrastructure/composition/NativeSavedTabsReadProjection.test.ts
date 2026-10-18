import { describe, expect, it, vi } from 'vitest'

import type { IndexedDbSavedTabsMutableState } from './IndexedDbSavedTabsSessionService'
import { createNativeSavedTabsPersistenceAdapters } from './NativeSavedTabsPersistenceAdapters'

const external = () => ({
  browserTabPort: { open: vi.fn() },
  browserWindowPort: { openWithUrls: vi.fn() },
  clock: { now: () => 100 },
  idGenerator: { generate: () => 'unused' },
  messagingPort: { send: vi.fn() },
  notificationPort: { error: vi.fn(), info: vi.fn(), success: vi.fn() },
  storageChangePort: { subscribe: vi.fn() },
  userSettingsRepository: { findAll: vi.fn(), save: vi.fn() },
})

const createFixture = (collectionCount: number) => {
  const work = { category: 0, membership: 0, url: 0 }
  const state: IndexedDbSavedTabsMutableState = {
    categories: [],
    collections: [],
    groups: [],
    memberships: [],
    urls: [],
  }
  for (let index = 0; index < collectionCount; index += 1) {
    const collectionId = `collection-${index}`
    state.collections.push({
      createdAt: 1,
      definition: { domain: `${index}.example.com`, type: 'domain' },
      id: collectionId,
      name: `Domain ${index}`,
      sortOrder: collectionCount - index,
      updatedAt: 1,
    })
    state.categories.push({
      get collectionId() {
        work.category += 1
        return collectionId
      },
      createdAt: 1,
      id: `category-${index}`,
      keywords: [],
      name: 'Empty category',
      sortOrder: 0,
      updatedAt: 1,
    })
    for (let item = 0; item < 20; item += 1) {
      const id = `url-${index}-${item}`
      state.urls.push({
        firstSavedAt: 1,
        get id() {
          work.url += 1
          return id
        },
        lastSavedAt: 2,
        normalizedUrl: `https://${index}.example.com/${item}`,
        title: `URL ${item}`,
        updatedAt: 2,
        url: `https://${index}.example.com/${item}`,
      })
      state.memberships.push({
        addedAt: 1,
        get collectionId() {
          work.membership += 1
          return collectionId
        },
        notes: `Note ${item}`,
        sortOrder: 20 - item,
        updatedAt: 1,
        urlId: id,
      })
    }
  }
  return { state, work }
}

describe('native saved-tabs read projection work', () => {
  it.each([1, 50])(
    'joins %i domains with work bounded by the snapshot record count',
    async (collectionCount) => {
      const { state, work } = createFixture(collectionCount)
      const adapters = createNativeSavedTabsPersistenceAdapters(
        state,
        external(),
      )
      const groups = await adapters.savedTabsTabGroupReadPort?.findAll()
      const observed = { ...work }

      expect(groups).toHaveLength(collectionCount)
      expect(groups?.[0]).toMatchObject({
        collection: { id: `collection-${collectionCount - 1}` },
        collectionCategories: [{ name: 'Empty category' }],
        resolvedUrls: expect.arrayContaining([
          expect.objectContaining({ notes: 'Note 19', savedAt: 2 }),
        ]),
      })
      expect(groups?.[0]?.resolvedUrls?.[0]?.id).toBe(
        `url-${collectionCount - 1}-19`,
      )
      // Count source-record visits, not wall-clock time or a particular helper.
      // Entity validation/copying may revisit a selected record a few times.
      expect(observed.category).toBeLessThanOrEqual(state.categories.length * 3)
      expect(observed.membership).toBeLessThanOrEqual(
        state.memberships.length * 4,
      )
      expect(observed.url).toBeLessThanOrEqual(state.urls.length * 2)
    },
  )

  it('rebuilds joins after state changes within the same adapter session', async () => {
    const { state } = createFixture(1)
    const adapters = createNativeSavedTabsPersistenceAdapters(state, external())
    const before = await adapters.savedTabsTabGroupReadPort?.findAll()
    state.urls = state.urls.map((url) => ({ ...url, title: 'Updated' }))
    state.categories = state.categories.map((category) => ({
      ...category,
      name: 'Renamed',
    }))
    state.memberships = state.memberships.map((membership) => ({
      ...membership,
      categoryId: 'category-0',
      notes: 'Updated note',
    }))
    const updated = await adapters.savedTabsTabGroupReadPort?.findAll()
    expect(updated?.[0]?.collectionCategories[0]?.name).toBe('Renamed')
    expect(updated?.[0]?.resolvedUrls?.[0]).toMatchObject({
      category: 'Renamed',
      notes: 'Updated note',
      title: 'Updated',
    })
    state.memberships = []
    state.categories = []
    const after = await adapters.savedTabsTabGroupReadPort?.findAll()

    expect(before?.[0]?.resolvedUrls).toHaveLength(20)
    expect(after?.[0]).toMatchObject({
      collectionCategories: [],
      memberships: [],
      resolvedUrls: [],
    })
  })
})
