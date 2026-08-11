import { describe, expect, it, vi } from 'vitest'

import type { PersistenceDataPlaneRouterPort } from '@/contexts/saved-tabs/application/ports/PersistenceBootstrapPort'

import type { SavedTabsCompatibilityStorage } from './backgroundSavedTabsDataPlane'
import { createBackgroundSavedTabsDataPlane } from './backgroundSavedTabsDataPlane'

const createStorage = (
  initial: Record<string, unknown>,
): SavedTabsCompatibilityStorage & {
  readonly set: ReturnType<typeof vi.fn>
  readonly values: Record<string, unknown>
} => {
  const values = structuredClone(initial)
  return {
    get: vi.fn(async (key: string) => ({
      [key]: structuredClone(values[key]),
    })),
    set: vi.fn(async (items: Record<string, unknown>) => {
      Object.assign(values, structuredClone(items))
    }),
    values,
  }
}

const createRouter = (
  route: 'indexeddb' | 'legacy',
): PersistenceDataPlaneRouterPort => ({
  read: vi.fn(async (operation) => operation[route]()),
  write: vi.fn(async (operation) => operation[route]()),
})

const baseState = {
  customProjectOrder: [],
  customProjects: [],
  parentCategories: [],
  savedTabs: [
    {
      domain: 'example.com',
      id: 'group-1',
      urlIds: ['url-1'],
      urls: [
        {
          id: 'url-1',
          savedAt: 1,
          title: 'Example',
          url: 'https://example.com/',
        },
      ],
    },
  ],
  urls: [
    {
      id: 'url-1',
      savedAt: 1,
      title: 'Example',
      url: 'https://example.com/',
    },
  ],
}

describe('backgroundSavedTabsDataPlane', () => {
  it('legacy route mutates only legacy storage', async () => {
    const legacy = createStorage(baseState)
    const indexeddb = createStorage(baseState)
    const runIndexedDbSession = vi.fn(async (operation) => operation(indexeddb))
    const dataPlane = createBackgroundSavedTabsDataPlane({
      idGenerator: () => 'generated-id',
      legacyStorage: legacy,
      now: () => 10,
      router: createRouter('legacy'),
      runIndexedDbSession,
    })

    await expect(dataPlane.removeUrl('https://example.com/')).resolves.toBe(1)

    expect(runIndexedDbSession).not.toHaveBeenCalled()
    expect(legacy.values.savedTabs).toEqual([])
    expect(legacy.values.urls).toEqual([])
    expect(indexeddb.set).not.toHaveBeenCalled()
  })

  it('indexeddb route commits through one native transaction without legacy write', async () => {
    const legacy = createStorage(baseState)
    const indexeddb = createStorage(baseState)
    const runIndexedDbSession = vi.fn(async (operation) => operation(indexeddb))
    const dataPlane = createBackgroundSavedTabsDataPlane({
      idGenerator: () => 'generated-id',
      legacyStorage: legacy,
      now: () => 10,
      router: createRouter('indexeddb'),
      runIndexedDbSession,
    })

    await expect(dataPlane.removeUrl('https://example.com/')).resolves.toBe(1)

    expect(runIndexedDbSession).toHaveBeenCalledOnce()
    expect(indexeddb.values.savedTabs).toEqual([])
    expect(indexeddb.values.urls).toEqual([])
    expect(legacy.set).not.toHaveBeenCalled()
  })

  it('does not invoke legacy storage after an IndexedDB failure', async () => {
    const legacy = createStorage(baseState)
    const error = new Error('indexeddb failed')
    const dataPlane = createBackgroundSavedTabsDataPlane({
      idGenerator: () => 'generated-id',
      legacyStorage: legacy,
      now: () => 10,
      router: createRouter('indexeddb'),
      runIndexedDbSession: vi.fn(async () => {
        throw error
      }),
    })

    await expect(dataPlane.readInsightRecords()).rejects.toBe(error)
    expect(legacy.get).not.toHaveBeenCalled()
    expect(legacy.set).not.toHaveBeenCalled()
  })

  it('reads AI and analytics insight records from the selected route', async () => {
    const legacy = createStorage(baseState)
    const indexeddb = createStorage({
      ...baseState,
      customProjects: [
        {
          categories: ['Research'],
          createdAt: 1,
          id: 'project-1',
          name: 'Project',
          updatedAt: 1,
          urlIds: ['url-1'],
          urlMetadata: { 'url-1': { category: 'Research' } },
        },
      ],
    })
    const dataPlane = createBackgroundSavedTabsDataPlane({
      idGenerator: () => 'generated-id',
      legacyStorage: legacy,
      now: () => 10,
      router: createRouter('indexeddb'),
      runIndexedDbSession: async (operation) => operation(indexeddb),
    })

    await expect(dataPlane.readInsightRecords()).resolves.toEqual([
      expect.objectContaining({
        id: 'url-1',
        savedInProjects: ['Project'],
        savedInTabGroups: ['example.com'],
      }),
    ])
    expect(legacy.get).not.toHaveBeenCalled()
  })

  it('keeps same-named legacy collection memberships distinct in analytics records', async () => {
    const legacy = createStorage({
      ...baseState,
      customProjectOrder: ['project-1', 'project-2'],
      customProjects: [
        {
          categories: ['Reading'],
          createdAt: 1,
          id: 'project-1',
          name: 'Research',
          updatedAt: 1,
          urlIds: ['url-1'],
          urlMetadata: { 'url-1': { category: 'Reading' } },
        },
        {
          categories: ['Review'],
          createdAt: 1,
          id: 'project-2',
          name: 'Research',
          updatedAt: 1,
          urlIds: ['url-1'],
          urlMetadata: { 'url-1': { category: 'Review' } },
        },
      ],
      savedTabs: [
        {
          domain: 'example.com',
          id: 'group-1',
          urlIds: ['url-1'],
          urlSubCategories: { 'url-1': 'Docs' },
        },
        {
          domain: 'example.com',
          id: 'group-2',
          urlIds: ['url-1'],
          urlSubCategories: { 'url-1': 'Reference' },
        },
      ],
    })
    const dataPlane = createBackgroundSavedTabsDataPlane({
      idGenerator: () => 'unused',
      legacyStorage: legacy,
      now: () => 10,
      router: createRouter('legacy'),
      runIndexedDbSession: vi.fn(),
    })

    const membershipRecords = (await dataPlane.readAnalyticsRecords()).filter(
      ({ metric }) => metric === 'membership-added',
    )

    expect(membershipRecords).toHaveLength(4)
    expect(membershipRecords).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventId: 'legacy:custom:project-1:url-1',
          projectCategories: ['Reading'],
          savedInProjects: ['Research'],
        }),
        expect.objectContaining({
          eventId: 'legacy:custom:project-2:url-1',
          projectCategories: ['Review'],
          savedInProjects: ['Research'],
        }),
        expect.objectContaining({
          eventId: 'legacy:domain:group-1:url-1',
          savedInTabGroups: ['example.com'],
          subCategories: ['Docs'],
        }),
        expect.objectContaining({
          eventId: 'legacy:domain:group-2:url-1',
          savedInTabGroups: ['example.com'],
          subCategories: ['Reference'],
        }),
      ]),
    )
  })

  it('deduplicates save input and restores domain/custom/category placement', async () => {
    const legacy = createStorage({
      customProjectOrder: ['project-second', 'project-first'],
      customProjects: [
        {
          categories: [],
          createdAt: 1,
          id: 'project-first',
          name: 'First',
          projectKeywords: {
            domainKeywords: ['example.com'],
            titleKeywords: [],
            urlKeywords: [],
          },
          updatedAt: 1,
          urlIds: [],
        },
        {
          categories: [],
          createdAt: 1,
          id: 'project-second',
          name: 'Second',
          projectKeywords: {
            domainKeywords: [],
            titleKeywords: ['Guide'],
            urlKeywords: [],
          },
          updatedAt: 1,
          urlIds: [],
        },
      ],
      domainCategoryMappings: [
        { categoryId: 'parent-1', domain: 'example.com' },
      ],
      domainCategorySettings: [
        {
          categoryKeywords: [{ categoryName: 'Docs', keywords: ['guide'] }],
          domain: 'https://example.com',
          subCategories: ['Docs'],
        },
      ],
      parentCategories: [
        {
          domainNames: ['example.com'],
          domains: [],
          id: 'parent-1',
          name: 'Reference',
        },
      ],
      savedTabs: [],
      urls: [],
    })
    const ids = ['url-new', 'group-new']
    const dataPlane = createBackgroundSavedTabsDataPlane({
      idGenerator: () => ids.shift() ?? 'unexpected-id',
      legacyStorage: legacy,
      now: () => 100,
      router: createRouter('legacy'),
      runIndexedDbSession: vi.fn(),
    })

    await dataPlane.saveTabs([
      { title: 'Old title', url: 'https://EXAMPLE.com/guide' },
      { title: 'Guide', url: 'https://example.com/guide' },
      { title: 'Invalid', url: 'not a url' },
    ])

    expect(legacy.values.urls).toEqual([
      expect.objectContaining({
        id: 'url-new',
        title: 'Guide',
        url: 'https://example.com/guide',
      }),
    ])
    expect(legacy.values.savedTabs).toEqual([
      expect.objectContaining({
        categoryKeywords: [{ categoryName: 'Docs', keywords: ['guide'] }],
        domain: 'example.com',
        id: 'group-new',
        parentCategoryId: 'parent-1',
        urlIds: ['url-new'],
        urlSubCategories: { 'url-new': 'Docs' },
      }),
    ])
    expect(legacy.values.customProjects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'project-second', urlIds: ['url-new'] }),
        expect.objectContaining({ id: 'project-first', urlIds: [] }),
        expect.objectContaining({ id: 'custom-uncategorized', urlIds: [] }),
      ]),
    )
    expect(legacy.values.parentCategories).toEqual([
      expect.objectContaining({ domains: ['group-new'], id: 'parent-1' }),
    ])
  })

  it('reuses a URL record and sends an unmatched URL to uncategorized once', async () => {
    const legacy = createStorage({
      ...baseState,
      customProjectOrder: ['custom-uncategorized'],
      customProjects: [
        {
          categories: [],
          createdAt: 1,
          id: 'custom-uncategorized',
          name: '未分類',
          updatedAt: 1,
          urlIds: [],
        },
      ],
    })
    const dataPlane = createBackgroundSavedTabsDataPlane({
      idGenerator: () => 'must-not-generate',
      legacyStorage: legacy,
      now: () => 100,
      router: createRouter('legacy'),
      runIndexedDbSession: vi.fn(),
    })

    await dataPlane.saveTabs([
      { title: 'Updated', url: 'https://EXAMPLE.com/' },
      { title: 'Updated', url: 'https://example.com/' },
    ])

    expect(legacy.values.urls).toEqual([
      expect.objectContaining({ id: 'url-1', title: 'Updated' }),
    ])
    expect(legacy.values.savedTabs).toEqual([
      expect.objectContaining({ id: 'group-1', urlIds: ['url-1'] }),
    ])
    expect(legacy.values.customProjects).toEqual([
      expect.objectContaining({
        id: 'custom-uncategorized',
        urlIds: ['url-1'],
      }),
    ])
  })

  it('bulk delete removes memberships, metadata, empty groups and parent references', async () => {
    const legacy = createStorage({
      customProjectOrder: ['project-1'],
      customProjects: [
        {
          categories: ['Read'],
          createdAt: 1,
          id: 'project-1',
          name: 'Project',
          updatedAt: 1,
          urlIds: ['url-1', 'url-2'],
          urlMetadata: {
            'url-1': { category: 'Read' },
            'url-2': { category: 'Read' },
          },
        },
      ],
      parentCategories: [
        {
          domainNames: ['example.com'],
          domains: ['group-1'],
          id: 'parent-1',
          name: 'Parent',
        },
      ],
      savedTabs: [
        {
          domain: 'example.com',
          id: 'group-1',
          urlIds: ['url-1', 'url-2'],
          urlSubCategories: { 'url-1': 'A', 'url-2': 'B' },
        },
      ],
      urls: [
        { id: 'url-1', savedAt: 1, title: 'One', url: 'https://one.test/' },
        { id: 'url-2', savedAt: 1, title: 'Two', url: 'https://two.test/' },
      ],
    })
    const dataPlane = createBackgroundSavedTabsDataPlane({
      idGenerator: () => 'unused',
      legacyStorage: legacy,
      now: () => 1,
      router: createRouter('legacy'),
      runIndexedDbSession: vi.fn(),
    })

    await expect(
      dataPlane.removeUrlIds(['url-1', 'url-1', 'url-2']),
    ).resolves.toBe(2)

    expect(legacy.values.savedTabs).toEqual([])
    expect(legacy.values.urls).toEqual([])
    expect(legacy.values.parentCategories).toEqual([
      expect.objectContaining({ domains: [] }),
    ])
    expect(legacy.values.customProjects).toEqual([
      expect.objectContaining({ urlIds: [], urlMetadata: {} }),
    ])
  })

  it('does not write when a delete target is absent', async () => {
    const legacy = createStorage(baseState)
    const dataPlane = createBackgroundSavedTabsDataPlane({
      idGenerator: () => 'unused',
      legacyStorage: legacy,
      now: () => 1,
      router: createRouter('legacy'),
      runIndexedDbSession: vi.fn(),
    })

    await expect(dataPlane.removeUrl('https://absent.test/')).resolves.toBe(0)
    expect(legacy.set).not.toHaveBeenCalled()
  })

  it('expiry removes only expired domain memberships and keeps custom membership/source URL', async () => {
    const legacy = createStorage({
      customProjectOrder: ['project-1'],
      customProjects: [
        {
          categories: [],
          createdAt: 1,
          id: 'project-1',
          name: 'Keep',
          updatedAt: 1,
          urlIds: ['url-old'],
        },
      ],
      parentCategories: [
        {
          domainNames: ['old.test'],
          domains: ['group-old', 'group-new'],
          id: 'parent-1',
          name: 'Parent',
        },
      ],
      savedTabs: [
        { domain: 'old.test', id: 'group-old', urlIds: ['url-old'] },
        { domain: 'new.test', id: 'group-new', urlIds: ['url-new'] },
      ],
      urls: [
        { id: 'url-old', savedAt: 10, title: 'Old', url: 'https://old.test/' },
        { id: 'url-new', savedAt: 90, title: 'New', url: 'https://new.test/' },
      ],
    })
    const dataPlane = createBackgroundSavedTabsDataPlane({
      idGenerator: () => 'unused',
      legacyStorage: legacy,
      now: () => 100,
      router: createRouter('legacy'),
      runIndexedDbSession: vi.fn(),
    })

    await expect(dataPlane.removeExpiredUrls(50, 100)).resolves.toEqual({
      removedCount: 1,
      sourceCount: 2,
    })
    expect(legacy.values.savedTabs).toEqual([
      expect.objectContaining({ id: 'group-new', urlIds: ['url-new'] }),
    ])
    expect(legacy.values.customProjects).toEqual([
      expect.objectContaining({ urlIds: ['url-old'] }),
    ])
    expect(legacy.values.urls).toHaveLength(2)
    expect(legacy.values.parentCategories).toEqual([
      expect.objectContaining({ domains: ['group-new'] }),
    ])
  })

  it('timestamp update handles both non-empty and empty selected route state', async () => {
    const legacy = createStorage(baseState)
    const dataPlane = createBackgroundSavedTabsDataPlane({
      idGenerator: () => 'unused',
      legacyStorage: legacy,
      now: () => 1,
      router: createRouter('legacy'),
      runIndexedDbSession: vi.fn(),
    })

    await expect(dataPlane.updateTabTimestamps(42)).resolves.toEqual({
      success: true,
    })
    expect(legacy.values.savedTabs).toEqual([
      expect.objectContaining({ id: 'group-1', savedAt: 42 }),
    ])

    const empty = createStorage({ savedTabs: [] })
    const emptyDataPlane = createBackgroundSavedTabsDataPlane({
      idGenerator: () => 'unused',
      legacyStorage: empty,
      now: () => 1,
      router: createRouter('legacy'),
      runIndexedDbSession: vi.fn(),
    })
    await expect(emptyDataPlane.updateTabTimestamps(42)).resolves.toEqual({
      success: false,
    })
    expect(empty.set).not.toHaveBeenCalled()
  })

  it('legacy undo snapshot is projected to versioned Persistence v2', async () => {
    const legacy = createStorage(baseState)
    const readIndexedDbSnapshot = vi.fn()
    const dataPlane = createBackgroundSavedTabsDataPlane({
      idGenerator: () => 'unused',
      legacyStorage: legacy,
      now: () => 1,
      readIndexedDbSnapshot,
      router: createRouter('legacy'),
      runIndexedDbSession: vi.fn(),
    })

    const snapshot = await dataPlane.readUndoSnapshot()

    expect(snapshot.revision).toBe(0)
    expect(snapshot.savedTabs.urls).toEqual([
      expect.objectContaining({ id: 'url-1' }),
    ])
    expect(snapshot).not.toHaveProperty('customProjects')
    expect(readIndexedDbSnapshot).not.toHaveBeenCalled()
  })

  it('IndexedDB undo snapshot uses the native reader without compatibility session or legacy read', async () => {
    const legacy = createStorage(baseState)
    const nativeSnapshot = {
      revision: 7,
      savedTabs: {
        categories: [],
        collections: [],
        groups: [],
        memberships: [],
        urls: [],
      },
    }
    const readIndexedDbSnapshot = vi.fn(async () => nativeSnapshot)
    const runIndexedDbSession = vi.fn()
    const dataPlane = createBackgroundSavedTabsDataPlane({
      idGenerator: () => 'unused',
      legacyStorage: legacy,
      now: () => 1,
      readIndexedDbSnapshot,
      router: createRouter('indexeddb'),
      runIndexedDbSession,
    })

    await expect(dataPlane.readUndoSnapshot()).resolves.toBe(nativeSnapshot)
    expect(runIndexedDbSession).not.toHaveBeenCalled()
    expect(legacy.get).not.toHaveBeenCalled()
  })

  it.each(['legacy', 'indexeddb'] as const)(
    '%s route restores a v2 undo snapshot only through the selected writer',
    async (route) => {
      const legacy = createStorage({})
      const indexeddb = createStorage({})
      const runIndexedDbSession = vi.fn(async (operation) =>
        operation(indexeddb),
      )
      const dataPlane = createBackgroundSavedTabsDataPlane({
        idGenerator: () => 'unused',
        legacyStorage: legacy,
        now: () => 1,
        router: createRouter(route),
        runIndexedDbSession,
      })
      const snapshot = {
        revision: 3,
        savedTabs: {
          categories: [],
          collections: [],
          groups: [],
          memberships: [],
          urls: [],
        },
      }

      await dataPlane.restoreUndoSnapshot(snapshot)

      expect(legacy.set).toHaveBeenCalledTimes(route === 'legacy' ? 1 : 0)
      expect(runIndexedDbSession).toHaveBeenCalledTimes(
        route === 'indexeddb' ? 1 : 0,
      )
      expect(indexeddb.set).toHaveBeenCalledTimes(route === 'indexeddb' ? 1 : 0)
    },
  )

  it('does not fall back when the native IndexedDB undo reader fails', async () => {
    const legacy = createStorage(baseState)
    const error = new Error('indexeddb snapshot failed')
    const dataPlane = createBackgroundSavedTabsDataPlane({
      idGenerator: () => 'unused',
      legacyStorage: legacy,
      now: () => 1,
      readIndexedDbSnapshot: vi.fn(async () => {
        throw error
      }),
      router: createRouter('indexeddb'),
      runIndexedDbSession: vi.fn(),
    })

    await expect(dataPlane.readUndoSnapshot()).rejects.toBe(error)
    expect(legacy.get).not.toHaveBeenCalled()
    expect(legacy.set).not.toHaveBeenCalled()
  })
})
