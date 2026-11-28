import * as fc from 'fast-check'
import { assert, describe, expect, it, vi } from 'vitest'

import {
  EXPIRED_URL_RECOVERY_DAYS,
  MAX_EXPIRED_URL_RECOVERY_COUNT,
} from '@/contexts/saved-tabs/domain/services/ExpiredUrlRecoveryService'
import type { ExpiredUrlRecoveryState } from '@/contexts/saved-tabs/domain/services/ExpiredUrlRecoveryService'
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

const createDataPlane = (initialState = createState(), now = () => 10) => {
  const state: ExpiredUrlRecoveryState = Object.assign(initialState, {
    expiredUrls: [],
  })
  let nextId = 0
  const sessionRun = vi.fn()
  const session = {
    runUndoableWithExpiredUrls: vi.fn(),
    runWithExpiredUrls: async <Result>(
      operation: (value: ExpiredUrlRecoveryState) => Result,
    ): Promise<Result> => operation(state),
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
      .mockReturnValueOnce('uncategorized')
      .mockImplementation(() => `generated-${nextId++}`),
    now,
    readExpiredUrls: async () => structuredClone(state.expiredUrls),
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

  it('updates an existing URL title on the normal save path', async () => {
    const state = createState()
    assert.isDefined(state.urls[0])
    const { dataPlane } = createDataPlane(state)

    await dataPlane.saveTabs([
      { title: 'Updated by normal save', url: 'https://example.com/docs' },
    ])

    expect(state.urls.find(({ id }) => id === 'url-1')?.title).toBe(
      'Updated by normal save',
    )
  })

  it('reports a re-save with an unchanged destination as refreshed and never duplicates the record (#923)', async () => {
    const state = createState()
    const { dataPlane } = createDataPlane(state)

    await expect(
      dataPlane.saveTabs([{ title: 'Docs', url: 'https://example.com/docs' }]),
    ).resolves.toEqual({
      resavedMovedCount: 0,
      resavedRefreshedCount: 1,
      savedUrls: ['https://example.com/docs'],
    })
    expect(state.urls).toHaveLength(1)
    expect(
      state.memberships.filter(
        ({ collectionId, urlId }) =>
          urlId === 'url-1' && collectionId === 'project-1',
      ),
    ).toHaveLength(1)
  })

  it('reports a re-save whose matching project changed as moved (#923)', async () => {
    const state = createState()
    const { dataPlane } = createDataPlane(state)

    await expect(
      dataPlane.saveTabs([
        { title: 'Unrelated title', url: 'https://example.com/docs' },
      ]),
    ).resolves.toEqual({
      resavedMovedCount: 1,
      resavedRefreshedCount: 0,
      savedUrls: ['https://example.com/docs'],
    })
    expect(state.urls).toHaveLength(1)
    expect(
      state.memberships.some(
        ({ collectionId, urlId }) =>
          urlId === 'url-1' && collectionId === 'project-1',
      ),
    ).toBe(false)
  })

  it('counts new and re-saved URLs separately (#923)', async () => {
    const state = createState()
    const { dataPlane } = createDataPlane(state)

    await expect(
      dataPlane.saveTabs([
        { title: 'Docs', url: 'https://example.com/docs' },
        { title: 'Fresh', url: 'https://example.com/fresh' },
      ]),
    ).resolves.toEqual({
      resavedMovedCount: 0,
      resavedRefreshedCount: 1,
      savedUrls: ['https://example.com/docs', 'https://example.com/fresh'],
    })
    expect(state.urls).toHaveLength(2)
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

  it('retires the URL across modes and preserves unrelated legacy orphans', async () => {
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

    expect(state.urls.map(({ id }) => id)).toStrictEqual(['legacy-orphan'])
    expect(state.memberships).toStrictEqual([])
    await expect(dataPlane.readInsightRecords()).resolves.toMatchObject([
      { id: 'legacy-orphan' },
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

  it('favorite protection が OFF なら期限切れのお気に入りも退避する', async () => {
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
    expect(state.urls).toStrictEqual([])
    expect(state.memberships).toStrictEqual([])
  })

  it('preserves membership details through generated expiration, re-save, restore and discard transitions', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string(),
        fc.nat(10_000),
        fc.boolean(),
        fc.boolean(),
        fc.constantFrom('restore', 'discard', 'purge'),
        async (notes, sortOrder, isFavorite, resave, action) => {
          const fixture = createState()
          const [original] = fixture.urls
          assert.isDefined(original)
          fixture.urls = [{ ...original, isFavorite }]
          fixture.memberships = fixture.memberships.map((membership) => ({
            ...membership,
            notes,
            sortOrder,
          }))
          let now = 10
          const { dataPlane, state } = createDataPlane(fixture, () => now)
          await dataPlane.removeExpiredUrls(2, now, {
            protectFavoriteFromAutoRemoval: false,
          })
          expect(state.urls).toEqual([])
          expect(state.memberships).toEqual([])
          const [archived] = await dataPlane.listExpiredUrls()
          assert.isDefined(archived)
          expect(archived.memberships).toEqual([
            { categoryName: 'Docs', collectionName: 'example.com' },
            { collectionName: 'Research' },
          ])

          if (resave) {
            now += 1
            await dataPlane.saveTabs([
              { title: 'New title', url: original.url },
            ])
          }
          const saved = structuredClone(state.urls[0])
          const savedMemberships = structuredClone(state.memberships)
          let count = 0
          let expiredList: readonly unknown[] = []
          if (action === 'restore') {
            now += 1
            count = await dataPlane.restoreExpiredUrls([archived.id])
          } else if (action === 'discard') {
            count = await dataPlane.discardExpiredUrls([archived.id])
          } else {
            now = 10 + EXPIRED_URL_RECOVERY_DAYS * 86_400_000
            expiredList = await dataPlane.listExpiredUrls()
            await dataPlane.purgeExpiredUrls()
          }

          const revived = action === 'restore' && !resave
          const restoredProject = {
            collectionId: 'project-1',
            notes,
            sortOrder,
          }
          const expectedMemberships = revived
            ? [
                {
                  categoryId: 'category-1',
                  collectionId: 'domain-1',
                  notes,
                  sortOrder,
                },
                restoredProject,
              ]
            : [
                ...savedMemberships,
                ...(action === 'restore'
                  ? [{ ...restoredProject, urlId: saved?.id }]
                  : []),
              ]
          const previouslySaved = saved ? [saved] : []
          const expectedUrls = revived
            ? [
                {
                  firstSavedAt: original.firstSavedAt,
                  id: original.id,
                  isFavorite,
                  lastSavedAt: now,
                },
              ]
            : previouslySaved
          expect(state.urls).toMatchObject(expectedUrls)
          expect(state.memberships).toMatchObject(expectedMemberships)
          expect(count).toBe(action === 'purge' ? 0 : 1)
          expect(expiredList).toEqual([])
          await expect(
            dataPlane.restoreExpiredUrls([archived.id]),
          ).resolves.toBe(0)
          expect(state.expiredUrls).toEqual([])
        },
      ),
    )
  })

  it('restores missing projects to Custom uncategorized and recreates the original Domain', async () => {
    const initial = createState()
    initial.memberships = initial.memberships.map((membership) => ({
      ...membership,
      notes:
        membership.collectionId === 'project-1'
          ? 'My original note'
          : 'Domain note',
    }))
    const { dataPlane, state } = createDataPlane(initial)
    await dataPlane.removeExpiredUrls(2, 10)
    const [record] = await dataPlane.listExpiredUrls()
    assert.isDefined(record)
    state.categories = []
    state.collections = []

    await expect(dataPlane.restoreExpiredUrls([record.id])).resolves.toBe(1)
    expect(state.collections.map(({ id }) => id)).toEqual([
      'domain-1',
      'custom-uncategorized',
    ])
    expect(state.memberships).toEqual([
      expect.objectContaining({
        collectionId: 'domain-1',
        notes: 'Domain note',
      }),
      expect.objectContaining({
        collectionId: 'custom-uncategorized',
        notes: 'My original note',
      }),
    ])
    expect(state.memberships[0]).not.toHaveProperty('categoryId')
  })

  it.each([true, false])(
    'restores older direct membership before a newer missing project note (fallback collection present: %s)',
    async (fallbackExists) => {
      const initial = createState()
      initial.memberships = initial.memberships.map((membership) =>
        membership.collectionId === 'project-1'
          ? { ...membership, notes: 'Newer deleted project note' }
          : membership,
      )
      const { dataPlane, state } = createDataPlane(initial)
      await dataPlane.removeExpiredUrls(2, 10)
      const [recent] = state.expiredUrls
      assert.isDefined(recent)
      const project = recent.memberships.find(
        ({ collection }) => collection.id === 'project-1',
      )
      assert.isDefined(project)
      const fallback = { ...project.collection, id: 'custom-uncategorized' }
      state.collections = state.collections.filter(
        ({ id }) => id !== 'project-1',
      )
      if (fallbackExists) {
        state.collections.push(fallback)
      }
      state.expiredUrls.push({
        ...recent,
        id: 'older-archive',
        expiredAt: 9,
        memberships: recent.memberships.map((entry) =>
          entry === project
            ? {
                collection: fallback,
                membership: {
                  ...entry.membership,
                  collectionId: fallback.id,
                  notes: 'Older original note',
                  sortOrder: 1024,
                },
              }
            : entry,
        ),
      })

      await expect(
        dataPlane.restoreExpiredUrls([recent.id, 'older-archive']),
      ).resolves.toBe(2)
      expect(
        state.memberships.filter(
          ({ collectionId }) => collectionId === fallback.id,
        ),
      ).toEqual([
        expect.objectContaining({
          notes: 'Older original note\n\nNewer deleted project note',
          sortOrder: 1024,
        }),
      ])
      expect(state.expiredUrls).toEqual([])
      expect(state.urls).toHaveLength(1)
    },
  )

  it('keeps recovery intact when merging notes would exceed the Backup V2 membership limit', async () => {
    const initial = createState()
    const [, project] = initial.collections
    const [, membership] = initial.memberships
    assert.isDefined(project)
    assert.isDefined(membership)
    initial.collections.push({ ...project, id: 'other-project' })
    initial.memberships = initial.memberships.map((item) =>
      item.collectionId === project.id
        ? { ...item, notes: 'a'.repeat(600_000) }
        : item,
    )
    initial.memberships.push({
      ...membership,
      collectionId: 'other-project',
      notes: 'b'.repeat(600_000),
    })
    const { dataPlane, state } = createDataPlane(initial)
    await dataPlane.removeExpiredUrls(2, 10)
    const [record] = await dataPlane.listExpiredUrls()
    assert.isDefined(record)
    state.collections = state.collections.filter(
      ({ definition }) => definition.type !== 'custom',
    )

    const beforeRestore = structuredClone(state)
    await expect(dataPlane.restoreExpiredUrls([record.id])).rejects.toThrow(
      'notes',
    )
    expect(state).toEqual(beforeRestore)
  })

  it('preserves archived Domain categories when manually deleting a URL from another Domain', async () => {
    const initial = createState()
    const [original] = initial.urls
    const [domain] = initial.collections
    assert.isDefined(original)
    assert.isDefined(domain)
    initial.urls.push({
      ...original,
      id: 'other-url',
      lastSavedAt: 8,
      normalizedUrl: 'https://other.example/',
      updatedAt: 8,
      url: 'https://other.example/',
    })
    initial.collections.push({
      ...domain,
      definition: { domain: 'other.example', type: 'domain' },
      id: 'other-domain',
    })
    initial.memberships.push({
      addedAt: 8,
      collectionId: 'other-domain',
      sortOrder: 0,
      updatedAt: 8,
      urlId: 'other-url',
    })
    const { dataPlane, state } = createDataPlane(initial)
    await dataPlane.removeExpiredUrls(2, 10)
    const [record] = await dataPlane.listExpiredUrls()
    assert.isDefined(record)

    await dataPlane.removeUrlIds(['other-url'])
    await dataPlane.restoreExpiredUrls([record.id])

    expect(state.collections.map(({ id }) => id).toSorted()).toEqual([
      'domain-1',
      'project-1',
    ])
    expect(state.memberships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          categoryId: 'category-1',
          collectionId: 'domain-1',
        }),
      ]),
    )
  })

  it('leaves additional URLs active while the archive is at its record limit', async () => {
    const initial = createState()
    const [url] = initial.urls
    const [membership] = initial.memberships
    assert.isDefined(url)
    assert.isDefined(membership)
    initial.urls = Array.from(
      { length: MAX_EXPIRED_URL_RECOVERY_COUNT + 1 },
      (_, index) => ({
        ...url,
        id: `url-${index}`,
        normalizedUrl: `https://example.com/${index}`,
        url: `https://example.com/${index}`,
      }),
    )
    initial.memberships = initial.urls.map(({ id }) => ({
      ...membership,
      urlId: id,
    }))
    const { dataPlane, state } = createDataPlane(initial)
    await expect(dataPlane.removeExpiredUrls(2, 10)).resolves.toEqual({
      removedCount: MAX_EXPIRED_URL_RECOVERY_COUNT,
      sourceCount: MAX_EXPIRED_URL_RECOVERY_COUNT + 1,
    })
    expect(state.expiredUrls).toHaveLength(MAX_EXPIRED_URL_RECOVERY_COUNT)
    expect(state.urls).toHaveLength(1)
    expect(state.memberships).toHaveLength(1)
  })

  it('counts UTF-8 bytes and preserves an active URL if its archive would exceed the byte limit', async () => {
    const initial = createState()
    initial.memberships = initial.memberships.map((membership) => ({
      ...membership,
      notes: '日'.repeat(1_500_000),
    }))
    const { dataPlane, state } = createDataPlane(initial)
    await expect(dataPlane.removeExpiredUrls(2, 10)).resolves.toEqual({
      removedCount: 0,
      sourceCount: 1,
    })
    expect(state.urls).toHaveLength(1)
    expect(state.memberships).toHaveLength(2)
    expect(state.expiredUrls).toEqual([])
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
      runUndoableWithExpiredUrls: vi.fn(),
      runWithExpiredUrls: vi.fn(),
      run: vi.fn(async () => {
        throw error
      }),
    }
    const dataPlane = createBackgroundSavedTabsIndexedDbDataPlane({
      idGenerator: () => 'unused',
      now: () => 1,
      readExpiredUrls: vi.fn(),
      readSnapshot: vi.fn(),
      session,
    })

    await expect(dataPlane.removeUrlIds(['url-1'])).rejects.toBe(error)
    expect(session.run).toHaveBeenCalledOnce()
  })

  it('exact URL-only delete resolves one persistent ID and preserves lookalikes', async () => {
    const { dataPlane, state } = createDataPlane()
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
