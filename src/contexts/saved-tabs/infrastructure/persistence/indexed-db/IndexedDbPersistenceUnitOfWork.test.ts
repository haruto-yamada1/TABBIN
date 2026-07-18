import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it, vi } from 'vitest'

import { IndexedDbConnectionManager } from './IndexedDbConnectionManager'
import { IndexedDbPersistenceSnapshotReader } from './IndexedDbPersistenceSnapshotReader'
import {
  IndexedDbPersistenceUnitOfWork,
  PersistenceEmptyWritePlanError,
} from './IndexedDbPersistenceUnitOfWork'
import {
  IndexedDbExternalAsyncTransactionError,
  queueIndexedDbTransaction,
} from './IndexedDbTransaction'
import { PERSISTENCE_STORE_NAMES } from './persistenceDatabaseSchema'

const createUrl = (id: string) => ({
  firstSavedAt: 1,
  id,
  lastSavedAt: 1,
  normalizedUrl: `https://${id}.example.com/`,
  title: id,
  updatedAt: 1,
  url: `https://${id}.example.com/`,
})

const createDomainCollection = (id: string, domain = `${id}.example.com`) => ({
  createdAt: 1,
  definition: { domain, type: 'domain' as const },
  id,
  name: id,
  sortOrder: 1024,
  updatedAt: 1,
})

describe('IndexedDbPersistenceUnitOfWork', () => {
  it('multi-store mutation と revision increment を1 transactionでcommitする', async () => {
    const manager = new IndexedDbConnectionManager({
      databaseName: 'unit-of-work',
      indexedDb: new IDBFactory(),
    })
    const unitOfWork = new IndexedDbPersistenceUnitOfWork(manager)

    const result = await unitOfWork.commit({
      collections: { put: [createDomainCollection('collection-1')] },
      memberships: {
        put: [
          {
            addedAt: 1,
            collectionId: 'collection-1',
            sortOrder: 1024,
            updatedAt: 1,
            urlId: 'url-1',
          },
        ],
      },
      urls: { put: [createUrl('url-1')] },
    })

    expect(result).toEqual({
      changedScopes: ['collections', 'memberships', 'urls'],
      revision: 1,
    })
    const snapshot = await new IndexedDbPersistenceSnapshotReader(
      manager,
    ).readConsistentSnapshot()
    expect(snapshot.savedTabs.urls).toHaveLength(1)
    expect(snapshot.savedTabs.collections).toHaveLength(1)
    expect(snapshot.savedTabs.memberships).toHaveLength(1)
    manager.close()
  })

  it('message mutationをlogical conversations scopeとして返す', async () => {
    const manager = new IndexedDbConnectionManager({
      databaseName: 'message-change-scope',
      indexedDb: new IDBFactory(),
    })
    const unitOfWork = new IndexedDbPersistenceUnitOfWork(manager)

    const result = await unitOfWork.commit({
      messages: {
        put: [
          {
            conversationId: 'conversation-1',
            createdAt: 1,
            id: 'message-1',
            value: { role: 'user', text: 'hello' },
          },
        ],
      },
    })

    expect(result).toEqual({
      changedScopes: ['conversations'],
      revision: 1,
    })
    manager.close()
  })

  it('途中のunique index violationで全storeとrevisionをrollbackする', async () => {
    const manager = new IndexedDbConnectionManager({
      databaseName: 'rollback',
      indexedDb: new IDBFactory(),
    })
    const unitOfWork = new IndexedDbPersistenceUnitOfWork(manager)

    await expect(
      unitOfWork.commit({
        collections: {
          put: [
            createDomainCollection('collection-1', 'example.com'),
            createDomainCollection('collection-2', 'example.com'),
          ],
        },
        urls: { put: [createUrl('url-1')] },
      }),
    ).rejects.toMatchObject({ name: 'ConstraintError' })

    const snapshot = await new IndexedDbPersistenceSnapshotReader(
      manager,
    ).readConsistentSnapshot()
    expect(snapshot.savedTabs.urls).toEqual([])
    expect(snapshot.savedTabs.collections).toEqual([])
    await expect(unitOfWork.readRevision()).resolves.toBe(0)
    manager.close()
  })

  it('別 context の concurrent commit を直列化しrevisionを欠番なく増やす', async () => {
    const indexedDb = new IDBFactory()
    const firstManager = new IndexedDbConnectionManager({
      databaseName: 'concurrent-revision',
      indexedDb,
    })
    const secondManager = new IndexedDbConnectionManager({
      databaseName: 'concurrent-revision',
      indexedDb,
    })
    const first = new IndexedDbPersistenceUnitOfWork(firstManager)
    const second = new IndexedDbPersistenceUnitOfWork(secondManager)

    const results = await Promise.all([
      first.commit({ urls: { put: [createUrl('url-1')] } }),
      second.commit({ urls: { put: [createUrl('url-2')] } }),
    ])

    expect(
      results
        .map(({ revision }) => revision)
        .toSorted((left, right) => left - right),
    ).toEqual([1, 2])
    await expect(first.readRevision()).resolves.toBe(2)
    firstManager.close()
    secondManager.close()
  })

  it('transaction queue callback がexternal Promiseを返すとabortする', async () => {
    const manager = new IndexedDbConnectionManager({
      databaseName: 'external-async',
      indexedDb: new IDBFactory(),
    })
    const database = await manager.open()

    await expect(
      queueIndexedDbTransaction(
        {
          database,
          mode: 'readwrite',
          storeNames: [PERSISTENCE_STORE_NAMES.urls],
        },
        async (transaction) => {
          transaction
            .objectStore(PERSISTENCE_STORE_NAMES.urls)
            .put(createUrl('url-1'))
          await Promise.resolve()
        },
      ),
    ).rejects.toBeInstanceOf(IndexedDbExternalAsyncTransactionError)

    const snapshot = await new IndexedDbPersistenceSnapshotReader(
      manager,
    ).readConsistentSnapshot()
    expect(snapshot.savedTabs.urls).toEqual([])
    manager.close()
  })

  it('critical writeだけstrict durabilityを明示できる', async () => {
    const manager = new IndexedDbConnectionManager({
      databaseName: 'strict-durability',
      indexedDb: new IDBFactory(),
    })
    const unitOfWork = new IndexedDbPersistenceUnitOfWork(manager)

    await expect(
      unitOfWork.commit(
        { urls: { put: [createUrl('url-1')] } },
        { durability: 'strict' },
      ),
    ).resolves.toMatchObject({ revision: 1 })
    manager.close()
  })

  it('context固有mapperを通らないnon JSON-safe valueをtransaction前にrejectする', async () => {
    const manager = new IndexedDbConnectionManager({
      databaseName: 'json-safe-boundary',
      indexedDb: new IDBFactory(),
    })
    const unitOfWork = new IndexedDbPersistenceUnitOfWork(manager)
    const openSpy = vi.spyOn(manager, 'open')

    await expect(
      Reflect.apply(unitOfWork.commit, unitOfWork, [
        {
          conversations: {
            put: [
              {
                id: 'conversation-1',
                updatedAt: 1,
                value: { createdAt: new Date() },
              },
            ],
          },
        },
      ]),
    ).rejects.toThrow('JSON-safe')
    await expect(
      Reflect.apply(unitOfWork.commit, unitOfWork, [
        {
          analyticsViews: {
            put: [
              {
                extra: new Date(),
                id: 'view-1',
                updatedAt: Number.NaN,
                value: {},
              },
            ],
          },
        },
      ]),
    ).rejects.toThrow('JSON-safe')
    expect(openSpy).not.toHaveBeenCalled()
    openSpy.mockRestore()
    await expect(unitOfWork.readRevision()).resolves.toBe(0)
    manager.close()
  })

  it('空planとinvalid delete keyをtyped validation errorにする', async () => {
    const manager = new IndexedDbConnectionManager({
      databaseName: 'invalid-write-plan',
      indexedDb: new IDBFactory(),
    })
    const unitOfWork = new IndexedDbPersistenceUnitOfWork(manager)

    await expect(unitOfWork.commit({})).rejects.toBeInstanceOf(
      PersistenceEmptyWritePlanError,
    )
    await expect(
      Reflect.apply(unitOfWork.commit, unitOfWork, [
        { urls: { delete: [{ invalid: 'key' }] } },
      ]),
    ).rejects.toThrow('not a valid IndexedDB key')
    await expect(unitOfWork.readRevision()).resolves.toBe(0)
    manager.close()
  })

  it('metadata storeのinvalid revisionをtyped decode errorにする', async () => {
    const manager = new IndexedDbConnectionManager({
      databaseName: 'invalid-revision',
      indexedDb: new IDBFactory(),
    })
    const database = await manager.open()
    await queueIndexedDbTransaction(
      {
        database,
        mode: 'readwrite',
        storeNames: [PERSISTENCE_STORE_NAMES.metadata],
      },
      (transaction) => {
        transaction
          .objectStore(PERSISTENCE_STORE_NAMES.metadata)
          .put({ key: 'revision', value: 'invalid' })
      },
    )

    await expect(
      new IndexedDbPersistenceUnitOfWork(manager).readRevision(),
    ).rejects.toThrow('invalid persistence revision')
    manager.close()
  })

  it('metadata revision request failure を IndexedDB error として返す', async () => {
    const requestError = new Error('request failed')
    const request = {
      addEventListener: (type: string, listener: () => void) => {
        if (type === 'error') {
          queueMicrotask(listener)
        }
      },
      error: requestError,
    }
    const manager = {
      open: async () => ({
        transaction: () => ({
          objectStore: () => ({ get: () => request }),
        }),
      }),
    }
    const unitOfWork = new IndexedDbPersistenceUnitOfWork(
      manager as unknown as IndexedDbConnectionManager,
    )

    const error = await unitOfWork
      .readRevision()
      .catch((caught: unknown) => caught)

    expect(error).toBe(requestError)
  })

  it('transaction complete までに revision request が成功しない場合は fail closed にする', async () => {
    const revisionRequest = {
      addEventListener: vi.fn(),
    }
    const transaction = {
      abort: vi.fn(),
      addEventListener: (type: string, listener: () => void) => {
        if (type === 'complete') {
          queueMicrotask(listener)
        }
      },
      objectStore: (storeName: string) =>
        storeName === PERSISTENCE_STORE_NAMES.metadata
          ? {
              get: () => revisionRequest,
              put: vi.fn(),
            }
          : { put: vi.fn() },
    }
    const manager = {
      open: async () => ({ transaction: () => transaction }),
    }
    const unitOfWork = new IndexedDbPersistenceUnitOfWork(
      manager as unknown as IndexedDbConnectionManager,
    )

    await expect(
      unitOfWork.commit({ urls: { put: [createUrl('url-1')] } }),
    ).rejects.toThrow('Persistence revision was not committed.')
    expect(revisionRequest.addEventListener).toHaveBeenCalledWith(
      'success',
      expect.any(Function),
    )
  })
})
