import { IDBFactory } from 'fake-indexeddb'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { PersistenceOperationGatePort } from '@/contexts/saved-tabs/application/ports/PersistenceBootstrapPort'
import { IndexedDbConnectionManager } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbConnectionManager'
import { IndexedDbPersistenceSnapshotReader } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceSnapshotReader'
import { IndexedDbPersistenceUnitOfWork } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceUnitOfWork'

import { createIndexedDbSavedTabsUseCases } from './createIndexedDbSavedTabsUseCases'

const createFixture = async () => {
  const indexedDb = new IDBFactory()
  const databaseName = 'custom-project-deletion'
  const managers: IndexedDbConnectionManager[] = []
  let writeError: Error | undefined
  const gate: PersistenceOperationGatePort = {
    runIndexedDbRead: async (operation) => operation(),
    runIndexedDbWrite: async (operation) => {
      if (writeError) {
        throw writeError
      }
      return operation()
    },
  }
  const connect = () => {
    const manager = new IndexedDbConnectionManager({ databaseName, indexedDb })
    managers.push(manager)
    return {
      manager,
      reader: new IndexedDbPersistenceSnapshotReader(manager, gate),
      useCases: createIndexedDbSavedTabsUseCases({
        connectionManager: manager,
        operationGate: gate,
      }),
    }
  }
  vi.stubGlobal('chrome', {
    storage: {
      local: { get: vi.fn(async () => ({})), set: vi.fn(), remove: vi.fn() },
    },
  })
  const fixture = connect()
  const domainFor = (id: string) => {
    if (id === 'a' || id === 'b') {
      return 'first'
    }
    return id === 'c' ? 'second' : 'unrelated'
  }
  const urls = ['a', 'b', 'c', 'd', 'orphan'].map((id) => ({
    firstSavedAt: 1,
    firstSavedAtProvenance: 'exact' as const,
    id,
    isFavorite: id === 'a',
    lastSavedAt: 2,
    lastSavedAtProvenance: 'exact' as const,
    normalizedUrl: `https://example.com/${id}`,
    title: id,
    updatedAt: 2,
    url: `https://example.com/${id}`,
  }))
  const collections = ['first', 'second', 'unrelated'].map((id, index) => ({
    createdAt: 1,
    definition: { domain: `${id}.example`, type: 'domain' as const },
    groupId: 'work',
    id,
    name: id,
    sortOrder: index * 1024,
    updatedAt: 2,
  }))
  const projects = ['source', 'other'].map((id, index) => ({
    createdAt: 1,
    definition: {
      projectKeywords: {
        domainKeywords: [],
        titleKeywords: [],
        urlKeywords: [],
      },
      type: 'custom' as const,
    },
    id,
    name: id,
    sortOrder: index * 1024,
    updatedAt: 2,
  }))
  const categories = [...collections, ...projects].map(({ id }) => ({
    collectionId: id,
    createdAt: 1,
    id: `${id}:category`,
    keywords: ['docs'],
    name: 'Docs',
    sortOrder: 1024,
    updatedAt: 2,
  }))
  const membership = (collectionId: string, urlId: string, index: number) => ({
    addedAt: 3,
    addedAtProvenance: 'exact' as const,
    categoryId: `${collectionId}:category`,
    collectionId,
    notes: `${collectionId}-${urlId}`,
    sortOrder: index * 1024,
    updatedAt: 3,
    urlId,
  })
  await new IndexedDbPersistenceUnitOfWork(fixture.manager, gate).commit({
    categories: { put: categories },
    collections: { put: [...collections, ...projects] },
    groups: {
      put: [
        { createdAt: 1, id: 'work', name: 'Work', sortOrder: 0, updatedAt: 2 },
      ],
    },
    memberships: {
      put: [
        ...['a', 'b', 'c', 'd'].map((id, index) =>
          membership(domainFor(id), id, index),
        ),
        ...['a', 'b', 'c'].map((id, index) => membership('source', id, index)),
        ...['a', 'd'].map((id, index) => membership('other', id, index)),
      ],
    },
    urls: { put: urls },
  })
  return {
    ...fixture,
    unitOfWork: new IndexedDbPersistenceUnitOfWork(fixture.manager, gate),
    close: () => managers.forEach((manager) => manager.close()),
    failWrites: (error: Error) => {
      writeError = error
    },
    reopen: () => {
      fixture.manager.close()
      return connect()
    },
  }
}

afterEach(() => vi.unstubAllGlobals())

describe('custom and domain deletion consistency', () => {
  it.each(['single', 'bulk'] as const)(
    '%s deletes shared saved URLs from every view and restores both views with Undo after reopening',
    async (mode) => {
      const fixture = await createFixture()
      try {
        const before = await fixture.reader.readVerifiedSavedTabsSnapshot()
        const removedIds = mode === 'single' ? ['a'] : ['a', 'b', 'c']
        const undo = await fixture.useCases.getCustomProjectUndoSnapshot({
          includeSavedUrls: true,
          targets: [
            {
              projectId: 'source',
              urls: removedIds.map((id) => `https://example.com/${id}`),
            },
          ],
        })
        if (mode === 'single') {
          await fixture.useCases.removeUrlFromCustomProject({
            projectId: 'source',
            url: 'https://example.com/a',
          })
        } else {
          await fixture.useCases.removeUrlsFromCustomProject({
            projectId: 'source',
            urls: ['a', 'b', 'c', 'a', 'd', 'missing'].map(
              (id) => `https://example.com/${id}`,
            ),
          })
        }
        const reloaded = fixture.reopen()
        const after = await reloaded.reader.readVerifiedSavedTabsSnapshot()
        expect(after.revision).toBe(before.revision + 1)
        expect(after.savedTabs.memberships).toEqual(
          before.savedTabs.memberships.filter(
            ({ urlId }) => !removedIds.includes(urlId),
          ),
        )
        expect(after.savedTabs.urls).toEqual(
          before.savedTabs.urls.filter(({ id }) => !removedIds.includes(id)),
        )
        expect(after.savedTabs.collections.map(({ id }) => id)).toEqual(
          mode === 'single'
            ? ['first', 'other', 'second', 'source', 'unrelated']
            : ['other', 'source', 'unrelated'],
        )
        expect(after.savedTabs.categories).toEqual(
          before.savedTabs.categories.filter(
            ({ collectionId }) =>
              mode === 'single' || !['first', 'second'].includes(collectionId),
          ),
        )
        await reloaded.useCases.restoreCustomProjectsSnapshot({
          payload: { ...undo, customProjects: undo.customProjects ?? [] },
        })
        reloaded.manager.close()
        const restored = await fixture
          .reopen()
          .reader.readVerifiedSavedTabsSnapshot()
        expect(restored.savedTabs.urls).toEqual(before.savedTabs.urls)
        expect(restored.savedTabs.categories).toEqual(
          before.savedTabs.categories,
        )
        expect(restored.savedTabs.memberships).toEqual(
          before.savedTabs.memberships,
        )
        const collectionOrder = (snapshot: typeof before) =>
          snapshot.savedTabs.collections
            .toSorted((left, right) => left.sortOrder - right.sortOrder)
            .map(
              ({
                updatedAt: _updatedAt,
                sortOrder: _sortOrder,
                ...collection
              }) => collection,
            )
        expect(collectionOrder(restored)).toEqual(collectionOrder(before))
        expect(
          restored.savedTabs.groups.map(({ id, name }) => ({ id, name })),
        ).toEqual(before.savedTabs.groups.map(({ id, name }) => ({ id, name })))
      } finally {
        fixture.close()
      }
    },
  )

  it.each([
    { ids: [] },
    { ids: ['d'] },
    { ids: ['missing'] },
    { ids: ['orphan'] },
  ])(
    'does not change any persisted data for absent source memberships: $ids',
    async ({ ids }) => {
      const fixture = await createFixture()
      try {
        const before = await fixture.reader.readVerifiedSavedTabsSnapshot()
        await fixture.useCases.removeUrlsFromCustomProject({
          projectId: 'source',
          urls: ids.map((id) => `https://example.com/${id}`),
        })
        await expect(
          fixture.reopen().reader.readVerifiedSavedTabsSnapshot(),
        ).resolves.toEqual(before)
      } finally {
        fixture.close()
      }
    },
  )

  it('rejects an unknown project before mutating saved URLs', async () => {
    const fixture = await createFixture()
    try {
      const before = await fixture.reader.readVerifiedSavedTabsSnapshot()
      await expect(
        fixture.useCases.removeUrlFromCustomProject({
          projectId: 'missing',
          url: 'https://example.com/a',
        }),
      ).rejects.toMatchObject({ code: 'INVALID_CUSTOM_PROJECT' })
      await expect(
        fixture.reopen().reader.readVerifiedSavedTabsSnapshot(),
      ).resolves.toEqual(before)
    } finally {
      fixture.close()
    }
  })

  it('leaves both modes intact after a failed commit and reopening', async () => {
    const fixture = await createFixture()
    try {
      const before = await fixture.reader.readVerifiedSavedTabsSnapshot()
      const failure = new Error('write failed')
      fixture.failWrites(failure)
      await expect(
        fixture.useCases.removeUrlsFromCustomProject({
          projectId: 'source',
          urls: ['https://example.com/a', 'https://example.com/c'],
        }),
      ).rejects.toBe(failure)
      await expect(
        fixture.reopen().reader.readVerifiedSavedTabsSnapshot(),
      ).resolves.toEqual(before)
    } finally {
      fixture.close()
    }
  })

  it.each(['single', 'bulk'] as const)(
    'domain %s deletion also removes all custom references after reopening',
    async (mode) => {
      const fixture = await createFixture()
      try {
        const before = await fixture.reader.readVerifiedSavedTabsSnapshot()
        if (mode === 'single') {
          await fixture.useCases.deleteSavedUrl({
            tabGroupId: 'first',
            url: 'https://example.com/a',
          })
        } else {
          await fixture.useCases.deleteSavedUrls({
            tabGroupId: 'first',
            urls: ['https://example.com/a'],
          })
        }
        const after = await fixture
          .reopen()
          .reader.readVerifiedSavedTabsSnapshot()
        expect(after.savedTabs.memberships).toEqual(
          before.savedTabs.memberships.filter(({ urlId }) => urlId !== 'a'),
        )
        expect(after.savedTabs.urls).toEqual(
          before.savedTabs.urls.filter(({ id }) => id !== 'a'),
        )
      } finally {
        fixture.close()
      }
    },
  )

  it('moving a URL between projects preserves its domain membership and saved record', async () => {
    const fixture = await createFixture()
    try {
      const before = await fixture.reader.readVerifiedSavedTabsSnapshot()
      await fixture.useCases.moveUrlBetweenCustomProjects({
        sourceProjectId: 'source',
        targetProjectId: 'other',
        url: 'https://example.com/b',
      })
      const after = await fixture
        .reopen()
        .reader.readVerifiedSavedTabsSnapshot()
      expect(after.savedTabs.urls).toEqual(before.savedTabs.urls)
      expect(
        after.savedTabs.memberships.filter(
          ({ collectionId }) => collectionId === 'first',
        ),
      ).toEqual(
        before.savedTabs.memberships.filter(
          ({ collectionId }) => collectionId === 'first',
        ),
      )
      expect(after.savedTabs.memberships).toContainEqual(
        expect.objectContaining({ collectionId: 'other', urlId: 'b' }),
      )
      expect(after.savedTabs.memberships).not.toContainEqual(
        expect.objectContaining({ collectionId: 'source', urlId: 'b' }),
      )
    } finally {
      fixture.close()
    }
  })

  it('Undo preserves URLs saved later into the same domain and project, including new categories and projects', async () => {
    const fixture = await createFixture()
    try {
      const before = await fixture.reader.readVerifiedSavedTabsSnapshot()
      const undo = await fixture.useCases.getCustomProjectUndoSnapshot({
        includeSavedUrls: true,
        targets: [{ projectId: 'source', urls: ['https://example.com/a'] }],
      })
      await fixture.useCases.removeUrlFromCustomProject({
        projectId: 'source',
        url: 'https://example.com/a',
      })
      const added = {
        firstSavedAt: 4,
        firstSavedAtProvenance: 'exact' as const,
        id: 'new',
        lastSavedAt: 5,
        lastSavedAtProvenance: 'exact' as const,
        normalizedUrl: 'https://example.com/new',
        title: 'Later saved',
        updatedAt: 6,
        url: 'https://example.com/new',
      }
      const categories = ['first', 'source', 'later', 'new-domain'].map(
        (collectionId) => ({
          collectionId,
          createdAt: 4,
          id: `${collectionId}:later`,
          keywords: ['later'],
          name: 'Later',
          sortOrder: 4096,
          updatedAt: 5,
        }),
      )
      const memberships = ['first', 'source', 'later', 'new-domain'].map(
        (collectionId) => ({
          addedAt: 4,
          addedAtProvenance: 'exact' as const,
          categoryId: `${collectionId}:later`,
          collectionId,
          notes: 'Keep later data',
          sortOrder: 4096,
          updatedAt: 5,
          urlId: 'new',
        }),
      )
      await fixture.unitOfWork.commit({
        groups: {
          put: [
            {
              createdAt: 4,
              id: 'later-group',
              name: 'Later group',
              sortOrder: 4096,
              updatedAt: 5,
            },
          ],
        },
        urls: { put: [added] },
        categories: { put: categories },
        memberships: { put: memberships },
        collections: {
          put: [
            {
              createdAt: 4,
              definition: {
                type: 'custom',
                projectKeywords: {
                  domainKeywords: [],
                  titleKeywords: [],
                  urlKeywords: [],
                },
              },
              id: 'later',
              name: 'Later project',
              sortOrder: 4096,
              updatedAt: 5,
            },
            {
              createdAt: 4,
              definition: { type: 'domain', domain: 'example.com' },
              groupId: 'later-group',
              id: 'new-domain',
              name: 'Later domain',
              sortOrder: 4096,
              updatedAt: 5,
            },
          ],
        },
      })
      await fixture.useCases.restoreCustomProjectsSnapshot({
        payload: { ...undo, customProjects: undo.customProjects ?? [] },
      })
      const restored = await fixture
        .reopen()
        .reader.readVerifiedSavedTabsSnapshot()
      expect(restored.savedTabs.urls).toEqual(
        [...before.savedTabs.urls, added].toSorted((left, right) =>
          left.id.localeCompare(right.id),
        ),
      )
      for (const expected of [
        ...before.savedTabs.memberships,
        ...memberships,
      ]) {
        expect(restored.savedTabs.memberships).toContainEqual(expected)
      }
      expect(restored.savedTabs.memberships).toHaveLength(
        before.savedTabs.memberships.length + memberships.length,
      )
      for (const expected of [...before.savedTabs.categories, ...categories]) {
        expect(restored.savedTabs.categories).toContainEqual(expected)
      }
      expect(restored.savedTabs.collections).toContainEqual(
        expect.objectContaining({ id: 'later', name: 'Later project' }),
      )
      expect(restored.savedTabs.groups).toContainEqual(
        expect.objectContaining({ id: 'later-group', name: 'Later group' }),
      )
      expect(restored.savedTabs.collections).toContainEqual(
        expect.objectContaining({ id: 'new-domain', groupId: 'later-group' }),
      )
    } finally {
      fixture.close()
    }
  })

  it('Undo restores only its selected URLs and preserves later deletions and favorite edits', async () => {
    const fixture = await createFixture()
    try {
      const undo = await fixture.useCases.getCustomProjectUndoSnapshot({
        includeSavedUrls: true,
        targets: [{ projectId: 'source', urls: ['https://example.com/a'] }],
      })
      await fixture.useCases.removeUrlFromCustomProject({
        projectId: 'source',
        url: 'https://example.com/a',
      })
      await fixture.useCases.deleteSavedUrl({
        tabGroupId: 'unrelated',
        url: 'https://example.com/d',
      })
      await fixture.useCases.setSavedUrlFavorite({
        url: 'https://example.com/b',
        isFavorite: true,
      })
      await fixture.useCases.restoreCustomProjectsSnapshot({
        payload: { ...undo, customProjects: undo.customProjects ?? [] },
      })
      const restored = await fixture
        .reopen()
        .reader.readVerifiedSavedTabsSnapshot()
      expect(restored.savedTabs.urls.map(({ id }) => id)).toEqual([
        'a',
        'b',
        'c',
        'orphan',
      ])
      expect(
        restored.savedTabs.urls.find(({ id }) => id === 'b')?.isFavorite,
      ).toBe(true)
      expect(restored.savedTabs.memberships).not.toContainEqual(
        expect.objectContaining({ urlId: 'd' }),
      )
      expect(restored.savedTabs.collections).not.toContainEqual(
        expect.objectContaining({ id: 'unrelated' }),
      )
      expect(
        restored.savedTabs.memberships
          .filter(({ urlId }) => urlId === 'a')
          .map(({ collectionId }) => collectionId),
      ).toEqual(['first', 'other', 'source'])
    } finally {
      fixture.close()
    }
  })

  it('Undo joins a recreated domain by domain identity when saving after its last URL was deleted', async () => {
    const fixture = await createFixture()
    try {
      const undo = await fixture.useCases.getCustomProjectUndoSnapshot({
        includeSavedUrls: true,
        targets: [{ projectId: 'source', urls: ['https://example.com/c'] }],
      })
      await fixture.useCases.removeUrlFromCustomProject({
        projectId: 'source',
        url: 'https://example.com/c',
      })
      await fixture.unitOfWork.commit({
        collections: {
          put: [
            {
              createdAt: 4,
              definition: { type: 'domain', domain: 'second.example' },
              groupId: 'work',
              id: 'recreated-second',
              name: 'second.example',
              sortOrder: 4096,
              updatedAt: 4,
            },
          ],
        },
        urls: {
          put: [
            {
              firstSavedAt: 4,
              firstSavedAtProvenance: 'exact',
              id: 'new',
              lastSavedAt: 4,
              lastSavedAtProvenance: 'exact',
              normalizedUrl: 'https://second.example/new',
              title: 'New',
              updatedAt: 4,
              url: 'https://second.example/new',
            },
          ],
        },
        memberships: {
          put: [
            {
              addedAt: 4,
              collectionId: 'recreated-second',
              sortOrder: 0,
              updatedAt: 4,
              urlId: 'new',
            },
          ],
        },
      })
      await fixture.useCases.restoreCustomProjectsSnapshot({
        payload: { ...undo, customProjects: undo.customProjects ?? [] },
      })
      const restored = await fixture
        .reopen()
        .reader.readVerifiedSavedTabsSnapshot()
      expect(
        restored.savedTabs.collections.filter(
          ({ definition }) =>
            definition.type === 'domain' &&
            definition.domain === 'second.example',
        ),
      ).toMatchObject([{ id: 'recreated-second', groupId: 'work' }])
      expect(
        restored.savedTabs.memberships
          .filter(({ collectionId }) => collectionId === 'recreated-second')
          .map(({ urlId }) => urlId)
          .toSorted(),
      ).toEqual(['c', 'new'])
      expect(restored.savedTabs.memberships).toContainEqual(
        expect.objectContaining({ collectionId: 'source', urlId: 'c' }),
      )
      expect(restored.savedTabs.urls.map(({ id }) => id)).toEqual([
        'a',
        'b',
        'c',
        'd',
        'new',
        'orphan',
      ])
    } finally {
      fixture.close()
    }
  })

  it('Undo reuses a URL saved again with a new ID without duplicating identity or overwriting its new metadata', async () => {
    const fixture = await createFixture()
    try {
      const undo = await fixture.useCases.getCustomProjectUndoSnapshot({
        includeSavedUrls: true,
        targets: [{ projectId: 'source', urls: ['https://example.com/a'] }],
      })
      await fixture.useCases.removeUrlFromCustomProject({
        projectId: 'source',
        url: 'https://example.com/a',
      })
      const recaptured = {
        firstSavedAt: 4,
        firstSavedAtProvenance: 'exact' as const,
        id: 'recaptured',
        isFavorite: false,
        lastSavedAt: 5,
        lastSavedAtProvenance: 'exact' as const,
        normalizedUrl: 'https://example.com/a',
        title: 'Saved again',
        updatedAt: 5,
        url: 'https://example.com/a',
      }
      await fixture.unitOfWork.commit({
        urls: { put: [recaptured] },
        memberships: {
          put: [
            {
              addedAt: 4,
              collectionId: 'first',
              sortOrder: 4096,
              updatedAt: 5,
              urlId: 'recaptured',
            },
          ],
        },
      })
      await fixture.useCases.restoreCustomProjectsSnapshot({
        payload: { ...undo, customProjects: undo.customProjects ?? [] },
      })
      const restored = await fixture
        .reopen()
        .reader.readVerifiedSavedTabsSnapshot()
      expect(
        restored.savedTabs.urls.filter(({ url }) => url === recaptured.url),
      ).toEqual([recaptured])
      expect(restored.savedTabs.urls.map(({ id }) => id)).toEqual([
        'b',
        'c',
        'd',
        'orphan',
        'recaptured',
      ])
      expect(restored.savedTabs.memberships).not.toContainEqual(
        expect.objectContaining({ urlId: 'a' }),
      )
      expect(
        restored.savedTabs.memberships
          .filter(({ urlId }) => urlId === 'recaptured')
          .map(({ collectionId }) => collectionId),
      ).toEqual(['first', 'other', 'source'])
    } finally {
      fixture.close()
    }
  })
})
