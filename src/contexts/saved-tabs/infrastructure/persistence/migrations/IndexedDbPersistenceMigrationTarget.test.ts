import { IDBFactory } from 'fake-indexeddb'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { PersistenceV2MigrationTargetError } from '@/contexts/saved-tabs/application/ports/PersistenceV2MigrationTargetPort'
import type { PersistenceV2MigrationTargetErrorCode } from '@/contexts/saved-tabs/application/ports/PersistenceV2MigrationTargetPort'
import type { PersistenceV2WritePlan } from '@/contexts/saved-tabs/application/ports/PersistenceV2UnitOfWorkPort'
import { IndexedDbConnectionManager } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbConnectionManager'
import {
  queueIndexedDbTransaction,
  waitForIndexedDbTransaction,
} from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbTransaction'
import { PERSISTENCE_STORE_NAMES } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/persistenceDatabaseSchema'

import { IndexedDbPersistenceMigrationTarget } from './IndexedDbPersistenceMigrationTarget'

const MIGRATABLE_STORE_NAMES = [
  PERSISTENCE_STORE_NAMES.urls,
  PERSISTENCE_STORE_NAMES.collections,
  PERSISTENCE_STORE_NAMES.memberships,
  PERSISTENCE_STORE_NAMES.categories,
  PERSISTENCE_STORE_NAMES.groups,
  PERSISTENCE_STORE_NAMES.conversations,
  PERSISTENCE_STORE_NAMES.messages,
  PERSISTENCE_STORE_NAMES.analyticsViews,
] as const

const managers: IndexedDbConnectionManager[] = []

afterEach(() => {
  for (const manager of managers) {
    manager.close()
  }
  managers.length = 0
})

const createManager = (databaseName: string) => {
  const manager = new IndexedDbConnectionManager({
    databaseName,
    indexedDb: new IDBFactory(),
  })
  managers.push(manager)
  return manager
}

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

const createCompletePlan = (): PersistenceV2WritePlan => ({
  analyticsViews: {
    put: [
      {
        id: 'analytics-1',
        updatedAt: 1,
        value: { type: 'daily' },
      },
    ],
  },
  collections: {
    put: [createDomainCollection('collection-1')],
  },
  conversations: {
    put: [
      {
        id: 'conversation-1',
        updatedAt: 1,
        value: { title: 'Conversation' },
      },
    ],
  },
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
  messages: {
    put: [
      {
        conversationId: 'conversation-1',
        createdAt: 1,
        id: 'message-1',
        value: { role: 'user', text: 'message' },
      },
    ],
  },
  urls: { put: [createUrl('url-1')] },
})

const expectTargetErrorCode = async (
  operation: Promise<unknown>,
  code: PersistenceV2MigrationTargetErrorCode,
): Promise<void> => {
  const error = await operation.catch((error: unknown) => error)

  expect(error).toBeInstanceOf(PersistenceV2MigrationTargetError)
  expect(error).toMatchObject({ code })
}

const readRawTarget = async (manager: IndexedDbConnectionManager) => {
  const database = await manager.open()
  const transaction = database.transaction(
    [
      ...MIGRATABLE_STORE_NAMES,
      PERSISTENCE_STORE_NAMES.metadata,
      PERSISTENCE_STORE_NAMES.recoverySnapshots,
    ],
    'readonly',
  )
  const migratableRequests = MIGRATABLE_STORE_NAMES.map(
    (storeName) =>
      [storeName, transaction.objectStore(storeName).getAll()] as const,
  )
  const migrationTarget = transaction
    .objectStore(PERSISTENCE_STORE_NAMES.metadata)
    .get('migrationTarget')
  const recoverySnapshots = transaction
    .objectStore(PERSISTENCE_STORE_NAMES.recoverySnapshots)
    .getAll()
  const revision = transaction
    .objectStore(PERSISTENCE_STORE_NAMES.metadata)
    .get('revision')
  await waitForIndexedDbTransaction(transaction)

  return {
    migratable: Object.fromEntries(
      migratableRequests.map(([storeName, request]) => [
        storeName,
        request.result,
      ]),
    ),
    migrationTarget: migrationTarget.result,
    recoverySnapshots: recoverySnapshots.result,
    revision: revision.result,
  }
}

describe('IndexedDbPersistenceMigrationTarget', () => {
  it('prepareで全migration対象storeをatomicに初期化しrecovery snapshotを保持する', async () => {
    const manager = createManager('migration-target-prepare')
    const database = await manager.open()
    await queueIndexedDbTransaction(
      {
        database,
        mode: 'readwrite',
        storeNames: [
          ...MIGRATABLE_STORE_NAMES,
          PERSISTENCE_STORE_NAMES.metadata,
          PERSISTENCE_STORE_NAMES.recoverySnapshots,
        ],
      },
      (transaction) => {
        transaction
          .objectStore(PERSISTENCE_STORE_NAMES.urls)
          .put(createUrl('old-url'))
        transaction
          .objectStore(PERSISTENCE_STORE_NAMES.collections)
          .put(createDomainCollection('old-collection'))
        transaction.objectStore(PERSISTENCE_STORE_NAMES.memberships).put({
          addedAt: 1,
          collectionId: 'old-collection',
          sortOrder: 1024,
          updatedAt: 1,
          urlId: 'old-url',
        })
        transaction.objectStore(PERSISTENCE_STORE_NAMES.categories).put({
          collectionId: 'old-collection',
          createdAt: 1,
          id: 'old-category',
          keywords: [],
          name: 'old-category',
          sortOrder: 1024,
          updatedAt: 1,
        })
        transaction.objectStore(PERSISTENCE_STORE_NAMES.groups).put({
          createdAt: 1,
          id: 'old-group',
          name: 'old-group',
          sortOrder: 1024,
          updatedAt: 1,
        })
        transaction.objectStore(PERSISTENCE_STORE_NAMES.conversations).put({
          id: 'old-conversation',
          updatedAt: 1,
          value: {},
        })
        transaction.objectStore(PERSISTENCE_STORE_NAMES.messages).put({
          conversationId: 'old-conversation',
          createdAt: 1,
          id: 'old-message',
          value: {},
        })
        transaction.objectStore(PERSISTENCE_STORE_NAMES.analyticsViews).put({
          id: 'old-analytics',
          updatedAt: 1,
          value: {},
        })
        transaction.objectStore(PERSISTENCE_STORE_NAMES.recoverySnapshots).put({
          createdAt: 1,
          expiresAt: 2,
          id: 'recovery-1',
          value: { preserved: true },
        })
        transaction
          .objectStore(PERSISTENCE_STORE_NAMES.metadata)
          .put({ key: 'revision', value: 7 })
      },
    )

    await new IndexedDbPersistenceMigrationTarget(manager).prepare(
      'migration-1',
    )

    const raw = await readRawTarget(manager)
    expect(
      Object.values(raw.migratable).every(
        (records) => Array.isArray(records) && records.length === 0,
      ),
    ).toBe(true)
    expect(raw.recoverySnapshots).toEqual([
      expect.objectContaining({ id: 'recovery-1' }),
    ])
    expect(raw.revision).toEqual({ key: 'revision', value: 0 })
    expect(raw.migrationTarget).toEqual({
      key: 'migrationTarget',
      value: { migrationId: 'migration-1', state: 'copying' },
    })
    manager.close()
  })

  it('matching migrationだけをcopyingからwrittenとverifiedへ冪等に遷移する', async () => {
    const manager = createManager('migration-target-lifecycle')
    const target = new IndexedDbPersistenceMigrationTarget(manager)

    await expectTargetErrorCode(
      target.readSnapshot('migration-1'),
      'MIGRATION_TARGET_NOT_PREPARED',
    )
    await target.prepare('migration-1')
    await expectTargetErrorCode(
      target.writeBatch('migration-2', createCompletePlan()),
      'MIGRATION_TARGET_ID_MISMATCH',
    )
    await expectTargetErrorCode(
      target.readSnapshot('migration-1'),
      'MIGRATION_TARGET_STATE_INVALID',
    )
    await expectTargetErrorCode(
      target.markVerified('migration-1'),
      'MIGRATION_TARGET_STATE_INVALID',
    )

    await target.writeBatch('migration-1', createCompletePlan())
    await target.markWritten('migration-1')
    await target.markWritten('migration-1')

    const written = await target.readSnapshot('migration-1')
    expect(written).toMatchObject({
      analyticsViews: [{ id: 'analytics-1' }],
      conversations: [{ id: 'conversation-1' }],
      messages: [{ id: 'message-1' }],
      revision: 1,
      savedTabs: {
        collections: [{ id: 'collection-1' }],
        memberships: [{ collectionId: 'collection-1', urlId: 'url-1' }],
        urls: [{ id: 'url-1' }],
      },
    })

    await target.markVerified('migration-1')
    await target.markVerified('migration-1')
    await expect(target.readSnapshot('migration-1')).resolves.toStrictEqual(
      written,
    )
    await expectTargetErrorCode(
      target.writeBatch('migration-1', { urls: { put: [createUrl('late')] } }),
      'MIGRATION_TARGET_STATE_INVALID',
    )
    manager.close()
  })

  it('prepareは別migration IDのtargetを破壊せず同じIDだけを再初期化する', async () => {
    const manager = createManager('migration-target-prepare-identity')
    const target = new IndexedDbPersistenceMigrationTarget(manager)
    await target.prepare('migration-1')
    await target.writeBatch('migration-1', {
      urls: { put: [createUrl('partial')] },
    })

    await expectTargetErrorCode(
      target.prepare('migration-2'),
      'MIGRATION_TARGET_ID_MISMATCH',
    )
    expect((await readRawTarget(manager)).migratable.urls).toEqual([
      expect.objectContaining({ id: 'partial' }),
    ])

    await target.prepare('migration-1')

    expect((await readRawTarget(manager)).migratable.urls).toEqual([])
  })

  it.each(['', '   '])(
    '全public methodが空のmigration IDを拒否する: %j',
    async (migrationId) => {
      expect.hasAssertions()
      const target = new IndexedDbPersistenceMigrationTarget(
        createManager(`migration-target-invalid-id-${migrationId.length}`),
      )

      await expectTargetErrorCode(
        target.prepare(migrationId),
        'MIGRATION_ID_INVALID',
      )
      await expectTargetErrorCode(
        target.writeBatch(migrationId, {
          urls: { put: [createUrl('url-1')] },
        }),
        'MIGRATION_ID_INVALID',
      )
      await expectTargetErrorCode(
        target.markWritten(migrationId),
        'MIGRATION_ID_INVALID',
      )
      await expectTargetErrorCode(
        target.readSnapshot(migrationId),
        'MIGRATION_ID_INVALID',
      )
      await expectTargetErrorCode(
        target.markVerified(migrationId),
        'MIGRATION_ID_INVALID',
      )
    },
  )

  it('membershipの複合key削除を適用し不正なkey shapeを拒否する', async () => {
    const target = new IndexedDbPersistenceMigrationTarget(
      createManager('migration-target-membership-delete'),
    )
    await target.prepare('migration-1')
    await target.writeBatch('migration-1', {
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
    })

    await expectTargetErrorCode(
      Reflect.apply(target.writeBatch, target, [
        'migration-1',
        {
          memberships: { delete: [['collection-1']] },
        },
      ]),
      'MIGRATION_WRITE_PLAN_INVALID',
    )
    await target.writeBatch('migration-1', {
      memberships: { delete: [['collection-1', 'url-1']] },
    })
    await target.markWritten('migration-1')

    await expect(target.readSnapshot('migration-1')).resolves.toMatchObject({
      savedTabs: { memberships: [] },
    })
  })

  it('recovery snapshot mutationとnon JSON-safe valueをtyped aggregate errorで拒否する', async () => {
    const manager = createManager('migration-target-invalid-plan')
    const target = new IndexedDbPersistenceMigrationTarget(manager)
    await target.prepare('migration-1')

    await expectTargetErrorCode(
      target.writeBatch('migration-1', {
        recoverySnapshots: {
          put: [
            {
              createdAt: 1,
              expiresAt: 2,
              id: 'forbidden',
              value: {},
            },
          ],
        },
      }),
      'MIGRATION_WRITE_PLAN_INVALID',
    )
    const privateValue = 'private user content'
    const error = await Reflect.apply(target.writeBatch, target, [
      'migration-1',
      {
        conversations: {
          put: [
            {
              id: 'conversation-1',
              updatedAt: 1,
              value: { privateValue, unsupported: new Date() },
            },
          ],
        },
      },
    ]).catch((error: unknown) => error)

    expect(error).toBeInstanceOf(PersistenceV2MigrationTargetError)
    expect(error).toMatchObject({ code: 'MIGRATION_WRITE_PLAN_INVALID' })
    expect((error as Error).message).not.toContain(privateValue)
    manager.close()
  })

  it('writeBatchはstrict durabilityの単一transactionで失敗をrollbackする', async () => {
    const manager = createManager('migration-target-rollback')
    const target = new IndexedDbPersistenceMigrationTarget(manager)
    await target.prepare('migration-1')
    const database = await manager.open()
    const transactionSpy = vi.spyOn(database, 'transaction')

    await expectTargetErrorCode(
      target.writeBatch('migration-1', {
        collections: {
          put: [
            // Both records deliberately violate the unique domain index.
            createDomainCollection('collection-1', 'same.example.com'),
            createDomainCollection('collection-2', 'same.example.com'),
          ],
        },
        urls: { put: [createUrl('rolled-back')] },
      }),
      'MIGRATION_TARGET_TRANSACTION_FAILED',
    )

    expect(transactionSpy).toHaveBeenLastCalledWith(
      expect.arrayContaining([
        PERSISTENCE_STORE_NAMES.collections,
        PERSISTENCE_STORE_NAMES.urls,
        PERSISTENCE_STORE_NAMES.metadata,
      ]),
      'readwrite',
      { durability: 'strict' },
    )
    await target.writeBatch('migration-1', createCompletePlan())
    await target.markWritten('migration-1')
    const snapshot = await target.readSnapshot('migration-1')
    expect(snapshot.revision).toBe(1)
    expect(snapshot.savedTabs.urls).toEqual([
      expect.objectContaining({ id: 'url-1' }),
    ])
    manager.close()
  })
})
