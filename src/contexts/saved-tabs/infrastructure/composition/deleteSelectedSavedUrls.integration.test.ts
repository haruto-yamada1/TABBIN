import { IDBFactory } from 'fake-indexeddb'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { PersistenceOperationGatePort } from '@/contexts/saved-tabs/application/ports/PersistenceBootstrapPort'
import { createDeleteSelectedSavedUrlsUseCase } from '@/contexts/saved-tabs/application/use-cases/DeleteSelectedSavedUrlsUseCase'
import { IndexedDbConnectionManager } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbConnectionManager'
import { IndexedDbPersistenceSnapshotReader } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceSnapshotReader'
import { IndexedDbPersistenceUnitOfWork } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceUnitOfWork'

import {
  createIndexedDbSavedTabsUseCases,
  createNativeIndexedDbSavedTabsRuntime,
} from './createIndexedDbSavedTabsUseCases'
import { createNativeSavedTabsPersistenceAdapters } from './NativeSavedTabsPersistenceAdapters'

const gate: PersistenceOperationGatePort = {
  runIndexedDbRead: async (operation) => operation(),
  runIndexedDbWrite: async (operation) => operation(),
}

const targets = [
  { tabGroupId: 'first', urls: ['https://first.example/a'] },
  { tabGroupId: 'second', urls: ['https://second.example/c'] },
]

const createFixture = async () => {
  const indexedDb = new IDBFactory()
  const databaseName = 'selected-saved-urls'
  const manager = new IndexedDbConnectionManager({ databaseName, indexedDb })
  vi.stubGlobal('chrome', {
    storage: {
      local: { get: vi.fn(async () => ({})), set: vi.fn(), remove: vi.fn() },
    },
  })
  const urls = ['a', 'b', 'c', 'd'].map((id, index) => {
    const domain = index < 2 ? 'first.example' : 'second.example'
    const url = `https://${domain}/${id}`
    return {
      firstSavedAt: 1,
      firstSavedAtProvenance: 'exact' as const,
      id,
      lastSavedAt: 1,
      lastSavedAtProvenance: 'exact' as const,
      normalizedUrl: url,
      title: id,
      updatedAt: 1,
      url,
    }
  })
  await new IndexedDbPersistenceUnitOfWork(manager, gate).commit({
    collections: {
      put: ['first', 'second'].map((id, index) => ({
        createdAt: 1,
        definition: {
          domain: `${id}.example`,
          type: 'domain' as const,
        },
        id,
        name: id,
        sortOrder: index,
        updatedAt: 1,
      })),
    },
    memberships: {
      put: urls.map(({ id }, index) => ({
        addedAt: 1,
        collectionId: index < 2 ? 'first' : 'second',
        sortOrder: index % 2,
        updatedAt: 1,
        urlId: id,
      })),
    },
    urls: { put: urls },
  })
  const reader = new IndexedDbPersistenceSnapshotReader(manager, gate)
  const useCases = createIndexedDbSavedTabsUseCases({
    connectionManager: manager,
    operationGate: gate,
  })
  const reopen = () => {
    manager.close()
    const reloaded = new IndexedDbConnectionManager({ databaseName, indexedDb })
    return {
      manager: reloaded,
      reader: new IndexedDbPersistenceSnapshotReader(reloaded, gate),
    }
  }
  return { manager, reader, reopen, useCases }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('selected saved-URL native persistence boundary', () => {
  it('removes an entire categorized domain and custom memberships, then restores category metadata and manual order with one Undo', async () => {
    const fixture = await createFixture()
    const initial = await fixture.reader.readVerifiedSavedTabsSnapshot()
    const project = {
      createdAt: 1,
      definition: {
        projectKeywords: {
          domainKeywords: ['example'],
          titleKeywords: ['research'],
          urlKeywords: ['docs'],
        },
        type: 'custom' as const,
      },
      id: 'project',
      name: 'Research',
      sortOrder: 3072,
      uncategorizedCategoryPosition: 0,
      updatedAt: 1,
    }
    const categories = [
      { collectionId: 'first', id: 'first:later', sortOrder: 2048 },
      { collectionId: 'first', id: 'first:important', sortOrder: 1024 },
      { collectionId: 'second', id: 'second:docs', sortOrder: 1024 },
      { collectionId: 'project', id: 'project:research', sortOrder: 1024 },
    ].map((category) => ({
      ...category,
      createdAt: 1,
      keywords: ['keyword'],
      name: category.id,
      updatedAt: 1,
    }))
    await new IndexedDbPersistenceUnitOfWork(fixture.manager, gate).commit({
      groups: {
        put: ['Work', 'Archive'].map((name, index) => ({
          createdAt: 1,
          id: name.toLowerCase(),
          name,
          sortOrder: index * 1024,
          updatedAt: 1,
        })),
      },
      collections: {
        put: [
          ...initial.savedTabs.collections.map((collection, index) => ({
            ...collection,
            groupId: 'work',
            sortOrder: (2 - index) * 1024,
            uncategorizedCategoryPosition: 1,
          })),
          project,
        ],
      },
      categories: { put: categories },
      memberships: {
        put: [
          ...initial.savedTabs.memberships.map((membership, index) => {
            let categoryId = 'second:docs'
            if (membership.collectionId === 'first') {
              categoryId =
                membership.urlId === 'a' ? 'first:important' : 'first:later'
            }
            return {
              ...membership,
              addedAt: 100 + index,
              addedAtProvenance: 'exact' as const,
              categoryId,
              notes: `notes-${membership.urlId}`,
              sortOrder: (2 - (index % 2)) * 1024,
              updatedAt: 100 + index,
            }
          }),
          ...['a', 'c', 'd'].map((urlId, index) => ({
            addedAt: 200 + index,
            addedAtProvenance: 'legacy-fallback' as const,
            categoryId: 'project:research',
            collectionId: 'project',
            notes: `project-notes-${urlId}`,
            sortOrder: (3 - index) * 1024,
            updatedAt: 200 + index,
            urlId,
          })),
        ],
      },
    })
    const before = await fixture.reader.readVerifiedSavedTabsSnapshot()

    const result = await fixture.useCases.deleteSelectedSavedUrls({
      targets: [
        {
          tabGroupId: 'first',
          urls: ['https://first.example/a', 'https://first.example/b'],
        },
        { tabGroupId: 'second', urls: ['https://second.example/c'] },
      ],
    })

    expect(result.removedCount).toBe(3)
    const after = await fixture.reader.readVerifiedSavedTabsSnapshot()
    expect(after.revision).toBe(before.revision + 1)
    expect(after.savedTabs.collections.map(({ id }) => id)).toEqual([
      'project',
      'second',
    ])
    expect(after.savedTabs.categories.map(({ id }) => id)).toEqual([
      'project:research',
      'second:docs',
    ])
    expect(after.savedTabs.memberships).toMatchObject([
      { collectionId: 'project', urlId: 'd' },
      { collectionId: 'second', urlId: 'd' },
    ])
    const page = await fixture.useCases.getSavedTabsPageData()
    expect(page.parentCategories).toMatchObject([
      { id: 'work', collections: [{ id: 'second' }] },
      { id: 'archive', collections: [] },
    ])

    expect(result.snapshot).not.toBeNull()
    if (result.snapshot) {
      await fixture.useCases.restoreOpenedUrlsSnapshot({
        snapshot: result.snapshot,
      })
    }
    const reloaded = fixture.reopen()
    try {
      const restored = await reloaded.reader.readVerifiedSavedTabsSnapshot()
      expect(restored.savedTabs.categories).toEqual(before.savedTabs.categories)
      expect(restored.savedTabs.memberships).toEqual(
        before.savedTabs.memberships,
      )
      expect(restored.savedTabs.urls).toEqual(before.savedTabs.urls)
      const collectionOrder = (
        collections: typeof before.savedTabs.collections,
      ) =>
        collections
          .toSorted(
            (left, right) =>
              left.definition.type.localeCompare(right.definition.type) ||
              left.sortOrder - right.sortOrder,
          )
          .map(
            ({ id, definition, groupId, uncategorizedCategoryPosition }) => ({
              id,
              definition,
              groupId,
              uncategorizedCategoryPosition,
            }),
          )
      expect(collectionOrder(restored.savedTabs.collections)).toEqual(
        collectionOrder(before.savedTabs.collections),
      )
      expect(
        restored.savedTabs.groups
          .toSorted((left, right) => left.sortOrder - right.sortOrder)
          .map(({ id, name }) => ({ id, name })),
      ).toEqual([
        { id: 'work', name: 'Work' },
        { id: 'archive', name: 'Archive' },
      ])
    } finally {
      reloaded.manager.close()
    }
  })

  it('commits several groups once and returns one complete snapshot that restores them after reopening', async () => {
    const fixture = await createFixture()
    const before = await fixture.reader.readVerifiedSavedTabsSnapshot()

    const result = await fixture.useCases.deleteSelectedSavedUrls({ targets })

    expect(result.removedCount).toBe(2)
    expect(result.snapshot?.savedTabs).toHaveLength(2)
    expect(result.snapshot?.urlRecords).toHaveLength(4)
    const after = await fixture.reader.readVerifiedSavedTabsSnapshot()
    expect(after.revision).toBe(before.revision + 1)
    expect(after.savedTabs.urls.map(({ id }) => id)).toEqual(['b', 'd'])
    expect(after.savedTabs.memberships.map(({ urlId }) => urlId)).toEqual([
      'b',
      'd',
    ])

    expect(result.snapshot).not.toBeNull()
    if (result.snapshot) {
      await fixture.useCases.restoreOpenedUrlsSnapshot({
        snapshot: result.snapshot,
      })
    }
    const reloaded = fixture.reopen()
    try {
      const restored = await reloaded.reader.readVerifiedSavedTabsSnapshot()
      expect(restored.savedTabs).toEqual(before.savedTabs)
    } finally {
      reloaded.manager.close()
    }
  })

  it('discards staged domain mutations when the custom aggregate fails and remains unchanged after reopening', async () => {
    const fixture = await createFixture()
    await new IndexedDbPersistenceUnitOfWork(fixture.manager, gate).commit({
      collections: {
        put: [
          {
            createdAt: 1,
            definition: {
              projectKeywords: {
                domainKeywords: [],
                titleKeywords: [],
                urlKeywords: [],
              },
              type: 'custom',
            },
            id: 'project',
            name: 'Project',
            sortOrder: 0,
            updatedAt: 1,
          },
        ],
      },
      memberships: {
        put: [
          {
            addedAt: 1,
            collectionId: 'project',
            sortOrder: 0,
            updatedAt: 1,
            urlId: 'a',
          },
        ],
      },
    })
    const before = await fixture.reader.readVerifiedSavedTabsSnapshot()
    const runtime = createNativeIndexedDbSavedTabsRuntime({
      connectionManager: fixture.manager,
      operationGate: gate,
    })
    const saveError = new Error('custom aggregate mutation failed')
    let stagedDomainSave = false

    await expect(
      runtime.session.run(async (state) => {
        const deps = createNativeSavedTabsPersistenceAdapters(
          state,
          runtime.deps,
        )
        const saveAll = deps.tabGroupRepository.saveAll
        deps.tabGroupRepository.saveAll = async (groups) => {
          await saveAll(groups)
          stagedDomainSave = true
        }
        deps.customProjectRepository.saveAll = async () => {
          expect(stagedDomainSave).toBe(true)
          expect(
            state.memberships.some(
              ({ collectionId, urlId }) =>
                collectionId === 'first' && urlId === 'a',
            ),
          ).toBe(false)
          throw saveError
        }
        return createDeleteSelectedSavedUrlsUseCase(deps)({ targets })
      }),
    ).rejects.toBe(saveError)
    expect(stagedDomainSave).toBe(true)

    const reloaded = fixture.reopen()
    try {
      await expect(
        reloaded.reader.readVerifiedSavedTabsSnapshot(),
      ).resolves.toEqual(before)
    } finally {
      reloaded.manager.close()
    }
  })

  it('rejects a stale second selection through the public API without changing any group or revision', async () => {
    const fixture = await createFixture()
    const before = await fixture.reader.readVerifiedSavedTabsSnapshot()

    await expect(
      fixture.useCases.deleteSelectedSavedUrls({
        targets: [
          { tabGroupId: 'first', urls: ['https://first.example/a'] },
          { tabGroupId: 'second', urls: ['https://second.example/missing'] },
        ],
      }),
    ).rejects.toMatchObject({ code: 'URL_RECORD_NOT_FOUND' })

    const reloaded = fixture.reopen()
    try {
      await expect(
        reloaded.reader.readVerifiedSavedTabsSnapshot(),
      ).resolves.toEqual(before)
    } finally {
      reloaded.manager.close()
    }
  })
})
