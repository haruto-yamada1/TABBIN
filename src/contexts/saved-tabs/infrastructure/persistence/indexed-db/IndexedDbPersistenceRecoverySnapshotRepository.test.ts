import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it } from 'vitest'

import type { PersistenceRecoverySnapshotRecord } from '@/contexts/saved-tabs/application/ports/PersistenceRecoverySnapshotPort'
import { createReadyPersistenceOperationGateStub } from '@/contexts/saved-tabs/application/testing/PersistenceOperationGateStub'
import { measureSerializedBytes } from '@/lib/persistence/capacity'

import { IndexedDbConnectionManager } from './IndexedDbConnectionManager'
import {
  IndexedDbPersistenceRecoverySnapshotRepository,
  PersistenceRecoverySnapshotRepositoryError,
} from './IndexedDbPersistenceRecoverySnapshotRepository'
import { PERSISTENCE_STORE_NAMES } from './persistenceDatabaseSchema'

const retention = {
  maxAgeDays: 7,
  maxAggregateBytes: 2_000,
  maxSnapshots: 2,
  now: 1_000,
} as const

const createRecord = (
  id: string,
  overrides: Partial<PersistenceRecoverySnapshotRecord> = {},
): PersistenceRecoverySnapshotRecord => {
  const data = overrides.data ?? { marker: id }
  return {
    backupSchemaVersion: 2,
    createdAt: 900,
    data,
    expiresAt: 2_000,
    id,
    serializedBytes: measureSerializedBytes(data),
    sourceRevision: 12,
    ...overrides,
  }
}

const seed = async (
  manager: IndexedDbConnectionManager,
  records: readonly PersistenceRecoverySnapshotRecord[],
  revision = 12,
): Promise<void> => {
  const database = await manager.open()
  const transaction = database.transaction(
    [
      PERSISTENCE_STORE_NAMES.metadata,
      PERSISTENCE_STORE_NAMES.recoverySnapshots,
    ],
    'readwrite',
  )
  transaction
    .objectStore(PERSISTENCE_STORE_NAMES.metadata)
    .put({ key: 'revision', value: revision })
  const snapshots = transaction.objectStore(
    PERSISTENCE_STORE_NAMES.recoverySnapshots,
  )
  for (const record of records) {
    snapshots.put(record)
  }
  await new Promise<void>((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve())
    transaction.addEventListener('abort', () =>
      reject(transaction.error ?? new Error('seed aborted')),
    )
  })
}

const readRevision = async (
  manager: IndexedDbConnectionManager,
): Promise<number> => {
  const database = await manager.open()
  const transaction = database.transaction(
    PERSISTENCE_STORE_NAMES.metadata,
    'readonly',
  )
  const request = transaction
    .objectStore(PERSISTENCE_STORE_NAMES.metadata)
    .get('revision')
  return new Promise<number>((resolve, reject) => {
    request.addEventListener('success', () => {
      const value: unknown = request.result
      resolve(
        typeof value === 'object' &&
          value !== null &&
          'value' in value &&
          typeof value.value === 'number'
          ? value.value
          : 0,
      )
    })
    request.addEventListener('error', () =>
      reject(request.error ?? new Error('revision read failed')),
    )
  })
}

describe('IndexedDbPersistenceRecoverySnapshotRepository', () => {
  it('saves and prunes in one strict transaction while incrementing revision', async () => {
    const manager = new IndexedDbConnectionManager({
      databaseName: 'recovery-save-prune',
      indexedDb: new IDBFactory(),
    })
    await seed(manager, [
      createRecord('expired', { createdAt: 100, expiresAt: 999 }),
      createRecord('older', { createdAt: 800 }),
      createRecord('newer', { createdAt: 900 }),
    ])
    const repository = new IndexedDbPersistenceRecoverySnapshotRepository(
      manager,
      createReadyPersistenceOperationGateStub(),
    )
    const candidate = createRecord('candidate', {
      createdAt: 1_000,
      expiresAt: 604_801_000,
    })

    await expect(
      repository.saveWithRetention(candidate, retention),
    ).resolves.toEqual({
      revision: 13,
      snapshot: {
        createdAt: candidate.createdAt,
        expiresAt: candidate.expiresAt,
        id: candidate.id,
        serializedBytes: candidate.serializedBytes,
        sourceRevision: candidate.sourceRevision,
      },
    })

    await expect(repository.listAvailable(1_000)).resolves.toEqual([
      expect.objectContaining({ id: 'candidate' }),
      expect.objectContaining({ id: 'newer' }),
    ])
    await expect(readRevision(manager)).resolves.toBe(13)
    manager.close()
  })

  it('retains the candidate and prunes older snapshots to the aggregate byte limit', async () => {
    const manager = new IndexedDbConnectionManager({
      databaseName: 'recovery-aggregate-prune',
      indexedDb: new IDBFactory(),
    })
    await seed(manager, [
      createRecord('older', {
        createdAt: 900,
        data: { payload: 'x'.repeat(700) },
      }),
    ])
    const repository = new IndexedDbPersistenceRecoverySnapshotRepository(
      manager,
      createReadyPersistenceOperationGateStub(),
    )
    const candidate = createRecord('candidate', {
      createdAt: 1_000,
      data: { payload: 'y'.repeat(700) },
    })

    await repository.saveWithRetention(candidate, {
      ...retention,
      maxAggregateBytes: candidate.serializedBytes,
    })

    await expect(repository.listAvailable(1_000)).resolves.toEqual([
      expect.objectContaining({ id: 'candidate' }),
    ])
    manager.close()
  })

  it('aborts without storing when the source revision is stale', async () => {
    const manager = new IndexedDbConnectionManager({
      databaseName: 'recovery-stale-revision',
      indexedDb: new IDBFactory(),
    })
    await seed(manager, [], 13)
    const repository = new IndexedDbPersistenceRecoverySnapshotRepository(
      manager,
      createReadyPersistenceOperationGateStub(),
    )

    await expect(
      repository.saveWithRetention(createRecord('stale'), retention),
    ).rejects.toMatchObject({
      code: 'SOURCE_REVISION_CHANGED',
      name: 'PersistenceRecoverySnapshotRepositoryError',
    })
    await expect(repository.listAvailable(1_000)).resolves.toEqual([])
    await expect(readRevision(manager)).resolves.toBe(13)
    manager.close()
  })

  it('persists recovery points across connection-manager restart', async () => {
    const indexedDb = new IDBFactory()
    const manager = new IndexedDbConnectionManager({
      databaseName: 'recovery-restart',
      indexedDb,
    })
    await seed(manager, [])
    const repository = new IndexedDbPersistenceRecoverySnapshotRepository(
      manager,
      createReadyPersistenceOperationGateStub(),
    )
    await repository.saveWithRetention(createRecord('durable'), retention)
    manager.close()

    const reopenedManager = new IndexedDbConnectionManager({
      databaseName: 'recovery-restart',
      indexedDb,
    })
    const reopened = new IndexedDbPersistenceRecoverySnapshotRepository(
      reopenedManager,
      createReadyPersistenceOperationGateStub(),
    )

    await expect(reopened.findAvailableById('durable', 1_000)).resolves.toEqual(
      expect.objectContaining({
        data: { marker: 'durable' },
        id: 'durable',
      }),
    )
    reopenedManager.close()
  })

  it('fails closed on malformed internal snapshot records without exposing content', async () => {
    const manager = new IndexedDbConnectionManager({
      databaseName: 'recovery-malformed',
      indexedDb: new IDBFactory(),
    })
    await seed(manager, [
      {
        ...createRecord('private'),
        serializedBytes: -1,
      },
    ])
    const repository = new IndexedDbPersistenceRecoverySnapshotRepository(
      manager,
      createReadyPersistenceOperationGateStub(),
    )

    let receivedError: unknown
    try {
      await repository.listAvailable(1_000)
    } catch (error) {
      receivedError = error
    }
    expect(receivedError).toBeInstanceOf(
      PersistenceRecoverySnapshotRepositoryError,
    )
    expect(receivedError).toMatchObject({ code: 'INVALID_STORED_SNAPSHOT' })
    expect(JSON.stringify(receivedError)).not.toContain('private')
    manager.close()
  })
})
