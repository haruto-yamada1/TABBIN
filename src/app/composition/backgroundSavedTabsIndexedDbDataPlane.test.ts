import { assert, describe, expect, it, vi } from 'vitest'

import type { IndexedDbSavedTabsMutableState } from '@/contexts/saved-tabs/infrastructure/composition/IndexedDbSavedTabsSessionService'

import { createBackgroundSavedTabsIndexedDbDataPlane } from './backgroundSavedTabsIndexedDbDataPlane'

const createState = (): IndexedDbSavedTabsMutableState => ({
  categories: [
    {
      collectionId: 'domain-1',
      createdAt: 1,
      id: 'category-1',
      keywords: ['docs'],
      name: 'Docs',
      sortOrder: 0,
      updatedAt: 1,
    },
  ],
  collections: [
    {
      createdAt: 1,
      definition: { domain: 'example.com', type: 'domain' },
      groupId: 'group-1',
      id: 'domain-1',
      name: 'example.com',
      sortOrder: 0,
      updatedAt: 1,
    },
    {
      createdAt: 1,
      definition: {
        projectKeywords: {
          domainKeywords: [],
          titleKeywords: ['docs'],
          urlKeywords: [],
        },
        type: 'custom',
      },
      id: 'project-1',
      name: 'Research',
      sortOrder: 0,
      updatedAt: 1,
    },
  ],
  groups: [
    {
      createdAt: 1,
      id: 'group-1',
      name: 'Work',
      sortOrder: 0,
      updatedAt: 1,
    },
  ],
  memberships: [
    {
      addedAt: 1,
      categoryId: 'category-1',
      collectionId: 'domain-1',
      sortOrder: 0,
      updatedAt: 1,
      urlId: 'url-1',
    },
    {
      addedAt: 1,
      collectionId: 'project-1',
      sortOrder: 0,
      updatedAt: 1,
      urlId: 'url-1',
    },
  ],
  urls: [
    {
      firstSavedAt: 1,
      id: 'url-1',
      lastSavedAt: 1,
      normalizedUrl: 'https://example.com/docs',
      title: 'Docs',
      updatedAt: 1,
      url: 'https://example.com/docs',
    },
  ],
})

const createDataPlane = (state = createState()) => {
  const sessionRun = vi.fn()
  const session = {
    run: async <Result>(
      operation: (
        value: IndexedDbSavedTabsMutableState,
      ) => Promise<Result> | Result,
    ): Promise<Result> => {
      sessionRun(operation)
      return operation(state)
    },
  }
  const dataPlane = createBackgroundSavedTabsIndexedDbDataPlane({
    idGenerator: vi
      .fn<() => string>()
      .mockReturnValueOnce('url-new')
      .mockReturnValueOnce('domain-new')
      .mockReturnValueOnce('uncategorized'),
    now: () => 10,
    readSnapshot: async () => ({
      revision: 1,
      savedTabs: structuredClone(state),
    }),
    session,
  })
  return { dataPlane, sessionRun, state }
}

describe('backgroundSavedTabsIndexedDbDataPlane', () => {
  it('captures only fresh URLs atomically and preserves every existing field and membership', async () => {
    const state = createState()
    assert.isDefined(state.urls[0])
    state.urls[0] = { ...state.urls[0], isFavorite: true }
    const existing = structuredClone(state.urls[0])
    const memberships = structuredClone(state.memberships)
    const { dataPlane } = createDataPlane(state)

    await expect(
      dataPlane.saveTabs(
        [
          { title: 'Untrusted replacement', url: 'https://example.com/docs' },
          { title: 'Docs new', url: 'https://example.com/new' },
        ],
        { preserveExisting: true },
      ),
    ).resolves.toEqual({ existingCount: 1, savedCount: 1 })

    expect(state.urls.find(({ id }) => id === existing.id)).toEqual(existing)
    expect(
      state.memberships.filter(({ urlId }) => urlId === existing.id),
    ).toEqual(memberships)
    expect(state.memberships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          collectionId: 'domain-1',
          urlId: 'url-new',
          categoryId: 'category-1',
        }),
        expect.objectContaining({
          collectionId: 'project-1',
          urlId: 'url-new',
        }),
      ]),
    )
    const afterCapture = structuredClone(state)
    await expect(
      dataPlane.saveTabs(
        [{ title: 'Different', url: 'https://example.com/new' }],
        { preserveExisting: true },
      ),
    ).resolves.toEqual({ existingCount: 1, savedCount: 0 })
    expect(state).toEqual(afterCapture)
  })

  it('updates an existing URL without replacing its title when preserved', async () => {
    const state = createState()
    assert.isDefined(state.urls[0])
    const originalFirstSavedAt = state.urls[0].firstSavedAt
    const { dataPlane } = createDataPlane(state)

    await dataPlane.saveTabs(
      [{ title: 'example.com/docs', url: 'https://example.com/docs' }],
      { preserveExistingTitle: true },
    )

    const saved = state.urls.find(({ id }) => id === 'url-1')
    expect(saved?.title).toBe('Docs')
    expect(saved?.firstSavedAt).toBe(originalFirstSavedAt)
    expect(saved?.lastSavedAt).toBe(10)
    expect(saved?.lastSavedAtProvenance).toBe('exact')
  })

  it('projects URL metrics and membership events without collapsing their timestamps', async () => {
    const state = createState()
    assert.isDefined(state.urls[0])
    state.urls[0] = {
      ...state.urls[0],
      firstSavedAt: 10,
      firstSavedAtProvenance: 'exact',
      lastSavedAt: 30,
      lastSavedAtProvenance: 'exact',
    }
    assert.isDefined(state.memberships[0])
    state.memberships[0] = {
      ...state.memberships[0],
      addedAt: 20,
      addedAtProvenance: 'legacy-fallback',
    }
    assert.isDefined(state.memberships[1])
    state.memberships[1] = {
      ...state.memberships[1],
      addedAt: 40,
      addedAtProvenance: 'exact',
    }
    const { dataPlane } = createDataPlane(state)

    await expect(dataPlane.readAnalyticsRecords()).resolves.toEqual([
      expect.objectContaining({
        eventId: 'url-1:first-saved',
        id: 'url-1',
        metric: 'first-saved',
        savedAt: 10,
        timestampAccuracy: 'exact',
      }),
      expect.objectContaining({
        collectionType: 'domain',
        eventId: 'domain-1:url-1',
        id: 'url-1',
        metric: 'membership-added',
        savedAt: 20,
        timestampAccuracy: 'legacy-fallback',
      }),
      expect.objectContaining({
        eventId: 'url-1:last-saved',
        id: 'url-1',
        metric: 'last-saved',
        savedAt: 30,
        timestampAccuracy: 'exact',
      }),
      expect.objectContaining({
        collectionType: 'custom',
        eventId: 'project-1:url-1',
        id: 'url-1',
        metric: 'membership-added',
        savedAt: 40,
        timestampAccuracy: 'exact',
      }),
    ])
  })

  it('reads insights directly from Collection/Group/Category/Membership projections', async () => {
    const { dataPlane } = createDataPlane()

    await expect(dataPlane.readInsightRecords()).resolves.toStrictEqual([
      expect.objectContaining({
        id: 'url-1',
        parentCategories: ['Work'],
        projectCategories: [],
        savedInProjects: ['Research'],
        savedInTabGroups: ['example.com'],
        subCategories: ['Docs'],
      }),
    ])
  })

  it('saves a deduplicated URL into native domain and matched custom memberships', async () => {
    const state = createState()
    state.categories = []
    state.collections = state.collections.filter(({ id }) => id !== 'domain-1')
    state.memberships = []
    state.urls = []
    const { dataPlane, sessionRun } = createDataPlane(state)

    await dataPlane.saveTabs([
      { title: 'Docs guide', url: 'https://example.com/docs' },
      { title: 'Docs duplicate', url: 'https://example.com/docs' },
    ])

    expect(sessionRun).toHaveBeenCalledOnce()
    expect(state.urls).toHaveLength(1)
    expect(state.collections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          definition: { domain: 'example.com', type: 'domain' },
        }),
      ]),
    )
    expect(state.memberships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          collectionId: 'domain-new',
          urlId: 'url-new',
        }),
        expect.objectContaining({
          collectionId: 'project-1',
          urlId: 'url-new',
        }),
      ]),
    )
  })

  it('removes URL, memberships, empty domain collection, and its categories together', async () => {
    const { dataPlane, state } = createDataPlane()

    await expect(dataPlane.removeUrlIds(['url-1'])).resolves.toBe(1)

    expect(state.urls).toStrictEqual([])
    expect(state.memberships).toStrictEqual([])
    expect(state.collections.map(({ id }) => id)).toStrictEqual(['project-1'])
    expect(state.categories).toStrictEqual([])
  })

  it('expires only affected domain memberships and preserves unrelated legacy orphans', async () => {
    const state = createState()
    state.urls.push({
      firstSavedAt: 1,
      id: 'legacy-orphan',
      lastSavedAt: 1,
      normalizedUrl: 'https://orphan.example/',
      title: 'Legacy orphan',
      updatedAt: 1,
      url: 'https://orphan.example/',
    })
    const { dataPlane } = createDataPlane(state)

    await expect(
      dataPlane.removeExpiredUrls(2, 10, {
        protectFavoriteFromAutoRemoval: true,
      }),
    ).resolves.toEqual({
      removedCount: 1,
      sourceCount: 1,
    })

    expect(state.urls.map(({ id }) => id)).toStrictEqual([
      'url-1',
      'legacy-orphan',
    ])
    expect(state.memberships).toStrictEqual([
      expect.objectContaining({
        collectionId: 'project-1',
        urlId: 'url-1',
      }),
    ])
  })

  it('protects favorite URLs from expiration until explicitly unmarked', async () => {
    const state = createState()
    state.urls = state.urls.map((url) => ({ ...url, isFavorite: true }))
    const { dataPlane } = createDataPlane(state)
    const before = structuredClone(state)
    await expect(
      dataPlane.removeExpiredUrls(2, 10, {
        protectFavoriteFromAutoRemoval: true,
      }),
    ).resolves.toEqual({
      removedCount: 0,
      sourceCount: 1,
    })
    expect(state).toEqual(before)
    state.urls = state.urls.map((url) => ({ ...url, isFavorite: false }))
    await expect(
      dataPlane.removeExpiredUrls(2, 10, {
        protectFavoriteFromAutoRemoval: true,
      }),
    ).resolves.toEqual({
      removedCount: 1,
      sourceCount: 1,
    })
  })

  it('favorite protection が OFF なら期限切れのお気に入りも削除する', async () => {
    const state = createState()
    state.urls = state.urls.map((url) => ({ ...url, isFavorite: true }))
    const { dataPlane } = createDataPlane(state)

    await expect(
      dataPlane.removeExpiredUrls(2, 10, {
        protectFavoriteFromAutoRemoval: false,
      }),
    ).resolves.toEqual({
      removedCount: 1,
      sourceCount: 1,
    })
    expect(state.urls.map(({ id }) => id)).toStrictEqual(['url-1'])
    expect(state.memberships).toStrictEqual([
      expect.objectContaining({
        collectionId: 'project-1',
        urlId: 'url-1',
      }),
    ])
  })

  it('外部ドロップ削除は transaction 内の最新 favorite 状態で保護する', async () => {
    const state = createState()
    state.urls = state.urls.map((url) => ({ ...url, isFavorite: true }))
    const { dataPlane } = createDataPlane(state)

    await expect(
      dataPlane.removeUrl('https://example.com/docs', 'url-1', {
        protectFavorite: true,
      }),
    ).resolves.toBe(0)
    expect(state.urls.map(({ id }) => id)).toStrictEqual(['url-1'])
    expect(state.memberships).toHaveLength(2)

    state.urls = state.urls.map((url) => ({ ...url, isFavorite: false }))
    await expect(
      dataPlane.removeUrl('https://example.com/docs', 'url-1', {
        protectFavorite: true,
      }),
    ).resolves.toBe(1)
    expect(state.urls).toStrictEqual([])
    expect(state.memberships).toStrictEqual([])
  })

  it('明示的な手動削除は favorite protection の影響を受けない', async () => {
    const state = createState()
    state.urls = state.urls.map((url) => ({ ...url, isFavorite: true }))
    const { dataPlane } = createDataPlane(state)

    await expect(
      dataPlane.removeUrl('https://example.com/docs', 'url-1'),
    ).resolves.toBe(1)
    expect(state.urls).toStrictEqual([])
  })

  it('propagates a native session failure without another backend attempt', async () => {
    const error = new Error('indexeddb failed')
    const session = {
      run: vi.fn(async () => {
        throw error
      }),
    }
    const dataPlane = createBackgroundSavedTabsIndexedDbDataPlane({
      idGenerator: () => 'unused',
      now: () => 1,
      readSnapshot: vi.fn(),
      session,
    })

    await expect(dataPlane.removeUrlIds(['url-1'])).rejects.toBe(error)
    expect(session.run).toHaveBeenCalledOnce()
  })

  it('exact URL-only delete resolves one persistent ID and preserves lookalikes', async () => {
    const state = createState()
    const dataPlane = createBackgroundSavedTabsIndexedDbDataPlane({
      idGenerator: () => crypto.randomUUID(),
      now: () => 10,
      readSnapshot: async () => ({ revision: 1, savedTabs: state }),
      session: { run: async (operation) => operation(state) },
    })
    await dataPlane.saveTabs([
      { url: 'https://example.com' },
      { url: 'https://example.com/' },
      { url: 'https://EXAMPLE.com' },
    ])
    await expect(dataPlane.removeUrl('https://example.com')).resolves.toBe(1)
    expect(state.urls.map(({ url }) => url)).toContain('https://example.com/')
    expect(state.urls.map(({ url }) => url)).toContain('https://EXAMPLE.com')
  })

  it('ID hint must match the exact source URL inside the mutation', async () => {
    const { dataPlane, state } = createDataPlane()
    const before = structuredClone(state)
    await expect(
      dataPlane.removeUrl('https://example.com/docs', 'wrong-id'),
    ).resolves.toBe(0)
    expect(state).toEqual(before)
    await expect(
      dataPlane.removeUrl('https://example.com/docs', 'url-1'),
    ).resolves.toBe(1)
    expect(state.urls).toEqual([])
  })

  it('ambiguous exact URL records are preserved without an ID hint', async () => {
    const { dataPlane, state } = createDataPlane()
    assert.isDefined(state.urls[0])
    state.urls.push({ ...state.urls[0], id: 'duplicate' })
    const before = structuredClone(state)
    await expect(dataPlane.removeUrl('https://example.com/docs')).resolves.toBe(
      0,
    )
    expect(state).toEqual(before)
  })
})
