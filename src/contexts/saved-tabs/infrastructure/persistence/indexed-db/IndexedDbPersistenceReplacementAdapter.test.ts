import { IDBFactory, IDBObjectStore } from 'fake-indexeddb'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { PersistenceOperationGatePort } from '@/contexts/saved-tabs/application/ports/PersistenceBootstrapPort'
import type { PersistenceV2ReplacementTarget } from '@/contexts/saved-tabs/application/ports/PersistenceV2ReplacementPort'
import { createReadyPersistenceOperationGateStub } from '@/contexts/saved-tabs/application/testing/PersistenceOperationGateStub'

import { IndexedDbConnectionManager } from './IndexedDbConnectionManager'
import {
  IndexedDbPersistenceReplacementAdapter,
  PersistenceV2ReplacementError,
} from './IndexedDbPersistenceReplacementAdapter'
import { IndexedDbPersistenceSnapshotReader } from './IndexedDbPersistenceSnapshotReader'
import { queueIndexedDbTransaction } from './IndexedDbTransaction'
import { PERSISTENCE_STORE_NAMES } from './persistenceDatabaseSchema'

const LOGICAL_STORE_NAMES = [
  PERSISTENCE_STORE_NAMES.analyticsViews,
  PERSISTENCE_STORE_NAMES.categories,
  PERSISTENCE_STORE_NAMES.collections,
  PERSISTENCE_STORE_NAMES.conversations,
  PERSISTENCE_STORE_NAMES.groups,
  PERSISTENCE_STORE_NAMES.memberships,
  PERSISTENCE_STORE_NAMES.messages,
  PERSISTENCE_STORE_NAMES.urls,
] as const

const createOperationGateSpy = () => {
  const runIndexedDbWrite = vi.fn()
  const operationGate: PersistenceOperationGatePort = {
    ...createReadyPersistenceOperationGateStub(),
    runIndexedDbWrite: async <Result>(
      operation: () => Promise<Result>,
    ): Promise<Result> => {
      runIndexedDbWrite()
      return operation()
    },
  }

  return { operationGate, runIndexedDbWrite }
}

const createTarget = (
  suffix: string,
  messageValue: Readonly<Record<string, string>> = { text: suffix },
): PersistenceV2ReplacementTarget => {
  const collectionId = `collection-${suffix}`
  const conversationId = `conversation-${suffix}`
  const groupId = `group-${suffix}`
  const urlId = `url-${suffix}`

  return {
    analyticsViews: [
      {
        id: `analytics-${suffix}`,
        updatedAt: 1,
        value: { title: suffix },
      },
    ],
    conversations: [
      {
        id: conversationId,
        updatedAt: 1,
        value: { title: suffix },
      },
    ],
    messages: [
      {
        conversationId,
        createdAt: 1,
        id: `message-${suffix}`,
        value: messageValue,
      },
    ],
    savedTabs: {
      categories: [
        {
          collectionId,
          createdAt: 1,
          id: `category-${suffix}`,
          keywords: [suffix],
          name: suffix,
          sortOrder: 1024,
          updatedAt: 1,
        },
      ],
      collections: [
        {
          createdAt: 1,
          definition: {
            projectKeywords: {
              domainKeywords: [suffix],
              titleKeywords: [],
              urlKeywords: [],
            },
            type: 'custom',
          },
          groupId,
          id: collectionId,
          name: suffix,
          sortOrder: 1024,
          updatedAt: 1,
        },
      ],
      groups: [
        {
          createdAt: 1,
          id: groupId,
          name: suffix,
          sortOrder: 1024,
          updatedAt: 1,
        },
      ],
      memberships: [
        {
          addedAt: 1,
          categoryId: `category-${suffix}`,
          collectionId,
          notes: suffix,
          sortOrder: 1024,
          updatedAt: 1,
          urlId,
        },
      ],
      urls: [
        {
          firstSavedAt: 1,
          id: urlId,
          lastSavedAt: 1,
          normalizedUrl: `https://${suffix}.example.com/`,
          title: suffix,
          updatedAt: 1,
          url: `https://${suffix}.example.com/`,
        },
      ],
    },
  }
}

const seedDatabase = async (
  manager: IndexedDbConnectionManager,
  target: PersistenceV2ReplacementTarget,
  revision = 7,
): Promise<IDBDatabase> => {
  const database = await manager.open()
  await queueIndexedDbTransaction(
    {
      database,
      mode: 'readwrite',
      storeNames: [
        ...LOGICAL_STORE_NAMES,
        PERSISTENCE_STORE_NAMES.metadata,
        PERSISTENCE_STORE_NAMES.recoverySnapshots,
      ],
    },
    (transaction) => {
      for (const value of target.analyticsViews) {
        transaction
          .objectStore(PERSISTENCE_STORE_NAMES.analyticsViews)
          .put(value)
      }
      for (const value of target.savedTabs.categories) {
        transaction.objectStore(PERSISTENCE_STORE_NAMES.categories).put(value)
      }
      for (const value of target.savedTabs.collections) {
        transaction.objectStore(PERSISTENCE_STORE_NAMES.collections).put(value)
      }
      for (const value of target.conversations) {
        transaction
          .objectStore(PERSISTENCE_STORE_NAMES.conversations)
          .put(value)
      }
      for (const value of target.savedTabs.groups) {
        transaction.objectStore(PERSISTENCE_STORE_NAMES.groups).put(value)
      }
      for (const value of target.savedTabs.memberships) {
        transaction.objectStore(PERSISTENCE_STORE_NAMES.memberships).put(value)
      }
      for (const value of target.messages) {
        transaction.objectStore(PERSISTENCE_STORE_NAMES.messages).put(value)
      }
      for (const value of target.savedTabs.urls) {
        transaction.objectStore(PERSISTENCE_STORE_NAMES.urls).put(value)
      }
      transaction
        .objectStore(PERSISTENCE_STORE_NAMES.metadata)
        .put({ key: 'revision', value: revision })
      transaction
        .objectStore(PERSISTENCE_STORE_NAMES.metadata)
        .put({ key: 'migration-state', value: 'preserve' })
      transaction.objectStore(PERSISTENCE_STORE_NAMES.recoverySnapshots).put({
        createdAt: 1,
        expiresAt: 2,
        id: 'recovery-1',
        value: { revision },
      })
    },
  )

  return database
}

const readRecord = async (
  database: IDBDatabase,
  storeName: (typeof PERSISTENCE_STORE_NAMES)[keyof typeof PERSISTENCE_STORE_NAMES],
  key: IDBValidKey,
): Promise<unknown> => {
  const transaction = database.transaction(storeName, 'readonly')
  const request = transaction.objectStore(storeName).get(key)
  const result = await new Promise<unknown>((resolve, reject) => {
    request.addEventListener('error', () => {
      reject(request.error ?? new Error('IndexedDB read failed.'))
    })
    request.addEventListener('success', () => {
      resolve(request.result as unknown)
    })
  })

  return result
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('IndexedDbPersistenceReplacementAdapter', () => {
  it('8 logical storeを1 strict transactionで全置換しrevisionだけ更新する', async () => {
    const { operationGate, runIndexedDbWrite } = createOperationGateSpy()
    const manager = new IndexedDbConnectionManager({
      databaseName: 'backup-replacement-success',
      indexedDb: new IDBFactory(),
    })
    const oldTarget = createTarget('old')
    const nextTarget = createTarget('next')
    const database = await seedDatabase(manager, oldTarget)
    const transactionSpy = vi.spyOn(database, 'transaction')
    const clearSpy = vi.spyOn(IDBObjectStore.prototype, 'clear')

    const result = await new IndexedDbPersistenceReplacementAdapter(
      manager,
      operationGate,
    ).replaceAll(nextTarget)

    expect(result).toEqual({ revision: 8 })
    expect(runIndexedDbWrite).toHaveBeenCalledOnce()
    expect(transactionSpy).toHaveBeenCalledOnce()
    expect(transactionSpy).toHaveBeenCalledWith(
      [...LOGICAL_STORE_NAMES, PERSISTENCE_STORE_NAMES.metadata],
      'readwrite',
      { durability: 'strict' },
    )
    expect(
      clearSpy.mock.contexts
        .map((store) => (store as IDBObjectStore).name)
        .toSorted((left, right) => left.localeCompare(right)),
    ).toEqual(
      [...LOGICAL_STORE_NAMES].toSorted((left, right) =>
        left.localeCompare(right),
      ),
    )

    const snapshot = await new IndexedDbPersistenceSnapshotReader(
      manager,
      operationGate,
    ).readConsistentSnapshot()
    expect(snapshot).toEqual({ ...nextTarget, revision: 8 })
    await expect(
      readRecord(
        database,
        PERSISTENCE_STORE_NAMES.recoverySnapshots,
        'recovery-1',
      ),
    ).resolves.toMatchObject({ id: 'recovery-1' })
    await expect(
      readRecord(database, PERSISTENCE_STORE_NAMES.metadata, 'migration-state'),
    ).resolves.toEqual({ key: 'migration-state', value: 'preserve' })

    clearSpy.mockRestore()
    transactionSpy.mockRestore()
    manager.close()
  })

  it('途中のsynchronous request queue failureで全storeとrevisionをrollbackする', async () => {
    const operationGate = createReadyPersistenceOperationGateStub()
    const manager = new IndexedDbConnectionManager({
      databaseName: 'backup-replacement-rollback',
      indexedDb: new IDBFactory(),
    })
    const oldTarget = createTarget('old')
    const secret = 'top-secret-message-content'
    const nextTarget = createTarget('next', { text: secret })
    await seedDatabase(manager, oldTarget)
    const originalPut = IDBObjectStore.prototype.put
    const putSpy = vi
      .spyOn(IDBObjectStore.prototype, 'put')
      .mockImplementation(
        function putWithInjectedFailure(this: IDBObjectStore, value, key) {
          if (
            this.name === PERSISTENCE_STORE_NAMES.messages &&
            typeof value === 'object' &&
            value !== null &&
            'id' in value &&
            value.id === 'message-next'
          ) {
            throw new Error(secret)
          }
          return key === undefined
            ? originalPut.call(this, value)
            : originalPut.call(this, value, key)
        },
      )

    const error = await new IndexedDbPersistenceReplacementAdapter(
      manager,
      operationGate,
    )
      .replaceAll(nextTarget)
      .catch((error: unknown) => error)

    expect(error).toBeInstanceOf(PersistenceV2ReplacementError)
    expect(error).toMatchObject({ code: 'TRANSACTION_FAILED' })
    expect(String(error)).not.toContain(secret)
    expect(JSON.stringify(error)).not.toContain(secret)
    putSpy.mockRestore()

    const snapshot = await new IndexedDbPersistenceSnapshotReader(
      manager,
      operationGate,
    ).readConsistentSnapshot()
    expect(snapshot).toEqual({ ...oldTarget, revision: 7 })
    manager.close()
  })

  it('invalid targetをoperation gateとconnection openより前にcontent-free codeでrejectする', async () => {
    const { operationGate, runIndexedDbWrite } = createOperationGateSpy()
    const manager = new IndexedDbConnectionManager({
      databaseName: 'backup-replacement-invalid-target',
      indexedDb: new IDBFactory(),
    })
    const openSpy = vi.spyOn(manager, 'open')
    const target = createTarget('invalid')
    const secret = 'private-invalid-record'
    const invalidTarget = {
      ...target,
      conversations: [
        {
          id: `conversation-${secret}`,
          updatedAt: -1,
          value: { text: secret },
        },
      ],
    }

    const adapter = new IndexedDbPersistenceReplacementAdapter(
      manager,
      operationGate,
    )
    const error = await Reflect.apply(adapter.replaceAll, adapter, [
      invalidTarget,
    ]).catch((error: unknown) => error)

    expect(error).toBeInstanceOf(PersistenceV2ReplacementError)
    expect(error).toMatchObject({ code: 'INVALID_TARGET_RECORD' })
    expect(String(error)).not.toContain(secret)
    expect(JSON.stringify(error)).not.toContain(secret)
    expect(runIndexedDbWrite).not.toHaveBeenCalled()
    expect(openSpy).not.toHaveBeenCalled()
    manager.close()
  })

  it.each([
    {
      code: 'DUPLICATE_ANALYTICS_VIEW_ID',
      mutate: (target: PersistenceV2ReplacementTarget) => ({
        ...target,
        analyticsViews: [...target.analyticsViews, target.analyticsViews[0]],
      }),
    },
    {
      code: 'DUPLICATE_CONVERSATION_ID',
      mutate: (target: PersistenceV2ReplacementTarget) => ({
        ...target,
        conversations: [...target.conversations, target.conversations[0]],
      }),
    },
    {
      code: 'DUPLICATE_MESSAGE_ID',
      mutate: (target: PersistenceV2ReplacementTarget) => ({
        ...target,
        messages: [...target.messages, target.messages[0]],
      }),
    },
    {
      code: 'ORPHAN_MESSAGE_CONVERSATION',
      mutate: (target: PersistenceV2ReplacementTarget) => ({
        ...target,
        messages: [
          {
            ...target.messages[0],
            conversationId: 'missing-private-conversation',
          },
        ],
      }),
    },
  ])('$codeをtransaction前にrejectする', async ({ code, mutate }) => {
    const { operationGate, runIndexedDbWrite } = createOperationGateSpy()
    const manager = new IndexedDbConnectionManager({
      databaseName: `backup-replacement-${code}`,
      indexedDb: new IDBFactory(),
    })
    const adapter = new IndexedDbPersistenceReplacementAdapter(
      manager,
      operationGate,
    )

    await expect(
      adapter.replaceAll(mutate(createTarget('next'))),
    ).rejects.toMatchObject({ code })
    expect(runIndexedDbWrite).not.toHaveBeenCalled()
    manager.close()
  })

  it('unhealthy saved-tabs graphをtransaction前にrejectする', async () => {
    const { operationGate, runIndexedDbWrite } = createOperationGateSpy()
    const manager = new IndexedDbConnectionManager({
      databaseName: 'backup-replacement-unhealthy',
      indexedDb: new IDBFactory(),
    })
    const target = createTarget('unhealthy')
    const adapter = new IndexedDbPersistenceReplacementAdapter(
      manager,
      operationGate,
    )

    await expect(
      adapter.replaceAll({
        ...target,
        savedTabs: {
          ...target.savedTabs,
          memberships: target.savedTabs.memberships.map((membership) => ({
            ...membership,
            urlId: 'missing-url',
          })),
        },
      }),
    ).rejects.toMatchObject({ code: 'UNHEALTHY_SAVED_TABS' })
    expect(runIndexedDbWrite).not.toHaveBeenCalled()
    manager.close()
  })

  it('warning-only saved-tabs graphをreplaceして再読込できる', async () => {
    const operationGate = createReadyPersistenceOperationGateStub()
    const manager = new IndexedDbConnectionManager({
      databaseName: 'backup-replacement-warning-only',
      indexedDb: new IDBFactory(),
    })
    const target = createTarget('warning-only')
    const warningOnlyTarget: PersistenceV2ReplacementTarget = {
      ...target,
      savedTabs: {
        ...target.savedTabs,
        urls: [
          ...target.savedTabs.urls,
          {
            firstSavedAt: 2,
            id: 'url-orphan',
            lastSavedAt: 2,
            normalizedUrl: 'https://orphan.example.test/',
            title: 'Orphan URL',
            updatedAt: 2,
            url: 'https://orphan.example.test/',
          },
        ],
      },
    }
    const adapter = new IndexedDbPersistenceReplacementAdapter(
      manager,
      operationGate,
    )

    const result = await adapter.replaceAll(warningOnlyTarget)

    const snapshot = await new IndexedDbPersistenceSnapshotReader(
      manager,
      operationGate,
    ).readConsistentSnapshot()
    expect(snapshot).toMatchObject({ revision: result.revision })
    expect(snapshot.savedTabs.urls).toEqual(
      expect.arrayContaining([...warningOnlyTarget.savedTabs.urls]),
    )
    manager.close()
  })

  it('unsafe revision overflowをabortしrevisionを変更しない', async () => {
    const operationGate = createReadyPersistenceOperationGateStub()
    const manager = new IndexedDbConnectionManager({
      databaseName: 'backup-replacement-revision-overflow',
      indexedDb: new IDBFactory(),
    })
    const oldTarget = createTarget('old')
    await seedDatabase(manager, oldTarget, Number.MAX_SAFE_INTEGER)

    await expect(
      new IndexedDbPersistenceReplacementAdapter(
        manager,
        operationGate,
      ).replaceAll(createTarget('next')),
    ).rejects.toMatchObject({ code: 'REVISION_OVERFLOW' })

    const snapshot = await new IndexedDbPersistenceSnapshotReader(
      manager,
      operationGate,
    ).readConsistentSnapshot()
    expect(snapshot).toEqual({
      ...oldTarget,
      revision: Number.MAX_SAFE_INTEGER,
    })
    manager.close()
  })
})
