import { IDBFactory, IDBObjectStore } from 'fake-indexeddb'
import { describe, expect, it, vi } from 'vitest'

import type { PersistenceV2SnapshotReaderPort } from '@/contexts/saved-tabs/application/ports/PersistenceV2SnapshotReaderPort'
import type { PersistenceV2Snapshot } from '@/contexts/saved-tabs/domain/entities/PersistenceModelV2'
import { checkPersistenceIntegrity } from '@/contexts/saved-tabs/domain/services/PersistenceIntegrityChecker'

import { IndexedDbConnectionManager } from './IndexedDbConnectionManager'
import {
  IndexedDbPersistenceSnapshotReader,
  PersistenceSnapshotIntegrityError,
} from './IndexedDbPersistenceSnapshotReader'
import { IndexedDbPersistenceUnitOfWork } from './IndexedDbPersistenceUnitOfWork'
import {
  IndexedDbSavedTabsQueryAdapter,
  PersistenceProjectionIntegrityError,
} from './IndexedDbSavedTabsQueryAdapter'
import { PERSISTENCE_STORE_NAMES } from './persistenceDatabaseSchema'

const url = {
  firstSavedAt: 1,
  id: 'url-1',
  lastSavedAt: 1,
  normalizedUrl: 'https://example.com/',
  title: 'Example',
  updatedAt: 1,
  url: 'https://example.com/',
}
const collection = {
  createdAt: 1,
  definition: { domain: 'example.com', type: 'domain' as const },
  id: 'collection-1',
  name: 'Example',
  sortOrder: 1024,
  updatedAt: 1,
}
const membership = {
  addedAt: 1,
  collectionId: 'collection-1',
  sortOrder: 1024,
  updatedAt: 1,
  urlId: 'url-1',
}

const createSnapshotReader = (
  snapshot: PersistenceV2Snapshot,
): PersistenceV2SnapshotReaderPort => ({
  readConsistentSnapshot: async () => ({
    analyticsViews: [],
    conversations: [],
    messages: [],
    savedTabs: snapshot,
  }),
  readVerifiedSavedTabsSnapshot: async () => snapshot,
})

describe('IndexedDbPersistenceSnapshotReader', () => {
  it('全backup対象IndexedDB storeを1 logical snapshotとして読む', async () => {
    const manager = new IndexedDbConnectionManager({
      databaseName: 'snapshot',
      indexedDb: new IDBFactory(),
    })
    const unitOfWork = new IndexedDbPersistenceUnitOfWork(manager)
    await unitOfWork.commit({
      analyticsViews: {
        put: [{ id: 'view-1', updatedAt: 1, value: { title: 'view' } }],
      },
      collections: { put: [collection] },
      conversations: {
        put: [{ id: 'conversation-1', updatedAt: 1, value: { title: 'chat' } }],
      },
      memberships: { put: [membership] },
      messages: {
        put: [
          {
            conversationId: 'conversation-1',
            createdAt: 1,
            id: 'message-1',
            value: { role: 'user' },
          },
        ],
      },
      urls: { put: [url] },
    })

    const snapshot = await new IndexedDbPersistenceSnapshotReader(
      manager,
    ).readConsistentSnapshot()

    expect(checkPersistenceIntegrity(snapshot.savedTabs).isHealthy).toBe(true)
    expect(snapshot.conversations).toEqual([
      expect.objectContaining({ id: 'conversation-1' }),
    ])
    expect(snapshot.messages).toEqual([
      expect.objectContaining({ id: 'message-1' }),
    ])
    expect(snapshot.analyticsViews).toEqual([
      expect.objectContaining({ id: 'view-1' }),
    ])
    expect(snapshot).not.toHaveProperty('recoverySnapshots')
    manager.close()
  })

  it('concurrent writerがあってもstore間でmixed snapshotを返さない', async () => {
    const indexedDb = new IDBFactory()
    const manager = new IndexedDbConnectionManager({
      databaseName: 'consistent-read',
      indexedDb,
    })
    const unitOfWork = new IndexedDbPersistenceUnitOfWork(manager)
    await unitOfWork.commit({
      collections: { put: [collection] },
      memberships: { put: [membership] },
      urls: { put: [url] },
    })
    const reader = new IndexedDbPersistenceSnapshotReader(manager)

    const reading = reader.readConsistentSnapshot()
    const writing = unitOfWork.commit({
      memberships: { delete: [['collection-1', 'url-1']] },
      urls: { delete: ['url-1'] },
    })
    const [snapshot] = await Promise.all([reading, writing])

    const containsUrl = snapshot.savedTabs.urls.some(({ id }) => id === 'url-1')
    const containsMembership = snapshot.savedTabs.memberships.some(
      ({ urlId }) => urlId === 'url-1',
    )
    expect(containsUrl).toBe(containsMembership)
    manager.close()
  })

  it('壊れたrelationをplaceholderで補完せずtyped integrity errorにする', async () => {
    const manager = new IndexedDbConnectionManager({
      databaseName: 'integrity-error',
      indexedDb: new IDBFactory(),
    })
    const database = await manager.open()
    const write = database.transaction(
      [
        PERSISTENCE_STORE_NAMES.collections,
        PERSISTENCE_STORE_NAMES.memberships,
      ],
      'readwrite',
    )
    write.objectStore(PERSISTENCE_STORE_NAMES.collections).put(collection)
    write.objectStore(PERSISTENCE_STORE_NAMES.memberships).put(membership)
    await new Promise<void>((resolve, reject) => {
      write.addEventListener('abort', () => {
        reject(write.error ?? new Error('IndexedDB write aborted.'))
      })
      write.addEventListener('error', () => {
        reject(write.error ?? new Error('IndexedDB write failed.'))
      })
      write.addEventListener('complete', () => {
        resolve()
      })
    })

    const reader = new IndexedDbPersistenceSnapshotReader(manager)
    await expect(reader.readConsistentSnapshot()).rejects.toBeInstanceOf(
      PersistenceSnapshotIntegrityError,
    )
    await expect(reader.readVerifiedSavedTabsSnapshot()).rejects.toBeInstanceOf(
      PersistenceSnapshotIntegrityError,
    )
    manager.close()
  })
})

describe('IndexedDbSavedTabsQueryAdapter', () => {
  it('per-membership getを使わずCollection projectionを構築する', async () => {
    const getSpy = vi.spyOn(IDBObjectStore.prototype, 'get')
    const manager = new IndexedDbConnectionManager({
      databaseName: 'query-projection',
      indexedDb: new IDBFactory(),
    })
    const unitOfWork = new IndexedDbPersistenceUnitOfWork(manager)
    await unitOfWork.commit({
      collections: { put: [collection] },
      memberships: { put: [membership] },
      urls: { put: [url] },
    })
    getSpy.mockClear()

    const query = new IndexedDbSavedTabsQueryAdapter(
      new IndexedDbPersistenceSnapshotReader(manager),
    )
    const projection = await query.findCollection('collection-1')

    expect(projection).toEqual({
      collection,
      items: [{ category: undefined, membership, url }],
    })
    expect(getSpy).not.toHaveBeenCalled()
    getSpy.mockRestore()
    manager.close()
  })

  it('全read pathをmap/group化したsnapshotからN+1なしでprojectionする', async () => {
    const groupA = {
      createdAt: 1,
      id: 'group-a',
      name: 'A',
      sortOrder: 1024,
      updatedAt: 1,
    }
    const groupB = { ...groupA, id: 'group-b', name: 'B' }
    const secondCollection = {
      ...collection,
      definition: {
        projectKeywords: {
          domainKeywords: [],
          titleKeywords: [],
          urlKeywords: [],
        },
        type: 'custom' as const,
      },
      groupId: groupB.id,
      id: 'collection-2',
      name: 'Second',
    }
    const groupedCollection = { ...collection, groupId: groupB.id }
    const category = {
      collectionId: collection.id,
      createdAt: 1,
      id: 'category-1',
      keywords: ['docs'],
      name: 'Docs',
      sortOrder: 1024,
      updatedAt: 1,
    }
    const categorizedMembership = {
      ...membership,
      categoryId: category.id,
    }
    const secondMembership = {
      ...membership,
      collectionId: secondCollection.id,
    }
    const unassignedUrl = {
      ...url,
      id: 'url-2',
      normalizedUrl: 'https://example.com/unassigned',
      url: 'https://example.com/unassigned',
    }
    const query = new IndexedDbSavedTabsQueryAdapter(
      createSnapshotReader({
        categories: [category],
        collections: [secondCollection, groupedCollection],
        groups: [groupB, groupA],
        memberships: [secondMembership, categorizedMembership],
        urls: [url, unassignedUrl],
      }),
    )

    await expect(query.findCollection('missing')).resolves.toBeUndefined()
    await expect(query.findCollection(collection.id)).resolves.toMatchObject({
      items: [{ category, membership: categorizedMembership, url }],
    })
    await expect(query.readInitialLoad()).resolves.toMatchObject({
      collections: [
        { collection: groupedCollection },
        { collection: secondCollection },
      ],
      groups: [groupA, groupB],
    })
    await expect(query.findCollectionsInGroup(groupB.id)).resolves.toEqual([
      groupedCollection,
      secondCollection,
    ])
    await expect(query.findCollectionsForUrl(url.id)).resolves.toEqual([
      { collection: groupedCollection, membership: categorizedMembership },
      { collection: secondCollection, membership: secondMembership },
    ])
    await expect(query.readAnalyticsRecords()).resolves.toEqual([
      { collectionCount: 2, membershipCount: 2, url },
      {
        collectionCount: 0,
        membershipCount: 0,
        url: unassignedUrl,
      },
    ])
  })

  it('projection時の欠損relationをtyped errorにする', async () => {
    const missingUrlQuery = new IndexedDbSavedTabsQueryAdapter(
      createSnapshotReader({
        categories: [],
        collections: [collection],
        groups: [],
        memberships: [membership],
        urls: [],
      }),
    )
    await expect(
      missingUrlQuery.findCollection(collection.id),
    ).rejects.toBeInstanceOf(PersistenceProjectionIntegrityError)

    const categorizedMembership = {
      ...membership,
      categoryId: 'missing-category',
    }
    const missingCategoryQuery = new IndexedDbSavedTabsQueryAdapter(
      createSnapshotReader({
        categories: [],
        collections: [collection],
        groups: [],
        memberships: [categorizedMembership],
        urls: [url],
      }),
    )
    await expect(
      missingCategoryQuery.findCollection(collection.id),
    ).rejects.toThrow('missing category missing-category')

    const missingCollectionQuery = new IndexedDbSavedTabsQueryAdapter(
      createSnapshotReader({
        categories: [],
        collections: [],
        groups: [],
        memberships: [membership],
        urls: [url],
      }),
    )
    await expect(
      missingCollectionQuery.findCollectionsForUrl(url.id),
    ).rejects.toThrow('missing collection collection-1')
  })

  it('同一sortOrderのMembershipをurlIdでdeterministicに並べる', async () => {
    const firstByIdUrl = {
      ...url,
      id: 'url-0',
      normalizedUrl: 'https://example.com/first',
      url: 'https://example.com/first',
    }
    const firstByIdMembership = {
      ...membership,
      urlId: firstByIdUrl.id,
    }
    const query = new IndexedDbSavedTabsQueryAdapter(
      createSnapshotReader({
        categories: [],
        collections: [collection],
        groups: [],
        memberships: [membership, firstByIdMembership],
        urls: [url, firstByIdUrl],
      }),
    )

    await expect(query.findCollection(collection.id)).resolves.toMatchObject({
      items: [{ membership: firstByIdMembership }, { membership }],
    })
  })
})
