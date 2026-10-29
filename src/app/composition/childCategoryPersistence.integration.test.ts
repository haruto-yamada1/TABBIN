import { IDBFactory } from 'fake-indexeddb'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createReadyPersistenceOperationGateStub } from '@/contexts/saved-tabs/application/testing/PersistenceOperationGateStub'
import {
  createNativeIndexedDbSavedTabsRuntime,
  createIndexedDbSavedTabsUseCases,
} from '@/contexts/saved-tabs/infrastructure/composition/createIndexedDbSavedTabsUseCases'
import { createNativeCategoryAssignmentPort } from '@/contexts/saved-tabs/infrastructure/composition/NativeSavedTabsPersistenceAdapters'
import { IndexedDbConnectionManager } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbConnectionManager'
import { IndexedDbPersistenceSnapshotReader } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceSnapshotReader'
import { IndexedDbPersistenceUnitOfWork } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceUnitOfWork'
import {
  toSavedTabsTabGroupViewModel,
  toTabGroupFromViewModel,
} from '@/contexts/saved-tabs/presentation/mappers/SavedTabsCompatibilityViewModelMapper'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('child category projection persistence', () => {
  it('keeps hidden Uncategorized position and canonical dates/IDs through reorder and reopen', async () => {
    vi.stubGlobal('chrome', { storage: { local: { get: async () => ({}) } } })
    const indexedDb = new IDBFactory()
    const databaseName = 'child-category-hidden-position'
    const manager = new IndexedDbConnectionManager({ databaseName, indexedDb })
    const gate = createReadyPersistenceOperationGateStub()
    const collection = {
      createdAt: 1,
      updatedAt: 2,
      id: 'domain',
      name: 'example.com',
      definition: { type: 'domain' as const, domain: 'example.com' },
      sortOrder: 100,
      uncategorizedCategoryPosition: 0,
    }
    const categories = ['Alpha', 'Beta'].map((name, sortOrder) => ({
      id: `canonical-category-${name}`,
      collectionId: 'domain',
      name,
      keywords: [],
      sortOrder,
      createdAt: 3 + sortOrder,
      updatedAt: 5 + sortOrder,
    }))
    const urls = ['Alpha', 'Beta'].map((title) => ({
      id: title,
      url: `https://example.com/${title}`,
      normalizedUrl: `https://example.com/${title}`,
      title,
      firstSavedAt: 10,
      lastSavedAt: 20,
      updatedAt: 20,
    }))
    const memberships = categories.map((category, sortOrder) => ({
      collectionId: 'domain',
      categoryId: category.id,
      urlId: category.name,
      sortOrder: sortOrder * 1024,
      addedAt: 15,
      addedAtProvenance: 'exact' as const,
      updatedAt: 20,
      notes: `notes-${category.name}`,
    }))
    await new IndexedDbPersistenceUnitOfWork(manager, gate).commit({
      collections: { put: [collection] },
      categories: { put: categories },
      memberships: { put: memberships },
      urls: { put: urls },
    })
    const useCases = createIndexedDbSavedTabsUseCases({
      connectionManager: manager,
      operationGate: gate,
    })
    const page = await useCases.getSavedTabsPageData()
    const native = createNativeIndexedDbSavedTabsRuntime({
      connectionManager: manager,
      operationGate: gate,
    })
    const incoming = page.tabGroups.map((group) =>
      toTabGroupFromViewModel({
        ...toSavedTabsTabGroupViewModel(group),
        subCategoryOrder: ['Beta', 'Alpha'],
        subCategoryOrderWithUncategorized: ['Beta', 'Alpha'],
      }),
    )
    await native.session.run(async (state) => {
      await createNativeCategoryAssignmentPort(
        state,
        native.deps,
      ).saveTabGroups(incoming)
    })
    manager.close()
    const reopened = new IndexedDbConnectionManager({ databaseName, indexedDb })
    const snapshot = await new IndexedDbPersistenceSnapshotReader(
      reopened,
      gate,
    ).readConsistentSnapshot()
    expect(snapshot.savedTabs.collections[0]).toEqual(collection)
    expect(
      snapshot.savedTabs.categories
        .toSorted((a, b) => a.sortOrder - b.sortOrder)
        .map(({ name, id, createdAt, updatedAt }) => ({
          name,
          id,
          createdAt,
          updatedAt,
        })),
    ).toEqual([
      { name: 'Beta', id: categories[1]?.id, createdAt: 4, updatedAt: 6 },
      { name: 'Alpha', id: categories[0]?.id, createdAt: 3, updatedAt: 5 },
    ])
    expect(snapshot.savedTabs.memberships).toEqual(memberships)
    reopened.close()
  })
})
