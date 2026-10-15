import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it } from 'vitest'

import { createReadyPersistenceOperationGateStub } from '@/contexts/saved-tabs/application/testing/PersistenceOperationGateStub'
import { inspectBackupV2 } from '@/features/options/lib/import-export/v2/BackupV2Inspector'

import { IndexedDbConnectionManager } from './IndexedDbConnectionManager'
import { IndexedDbPersistenceSnapshotReader } from './IndexedDbPersistenceSnapshotReader'
import { readSavedTabsRecoveryData } from './IndexedDbSavedTabsRecoveryReader'
import { waitForIndexedDbTransaction } from './IndexedDbTransaction'
import { PERSISTENCE_STORE_NAMES } from './persistenceDatabaseSchema'

const gate = createReadyPersistenceOperationGateStub()

describe('readSavedTabsRecoveryData', () => {
  it('preserves corrupt records, unsafe numbers and metadata without altering the database', async () => {
    const manager = new IndexedDbConnectionManager({
      indexedDb: new IDBFactory(),
    })
    const database = await manager.open()
    const corrupt = {
      id: 'private-url-id',
      firstSavedAt: 'invalid-date',
      lastSavedAt: Number.NaN,
      url: 'https://private.example/',
      extras: [undefined, -0, Infinity, -Infinity, 7n, new Date(0)],
      collision: ['number', 'NaN'],
    }
    const write = database.transaction(['urls', 'metadata'], 'readwrite')
    write.objectStore('urls').put(corrupt)
    write.objectStore('metadata').put({ key: 'revision', value: 9 })
    await waitForIndexedDbTransaction(write)
    const reader = new IndexedDbPersistenceSnapshotReader(manager, gate)
    await expect(reader.readVerifiedSavedTabsSnapshot()).rejects.toThrow(
      'invalid persistence record',
    )

    const data = await readSavedTabsRecoveryData(manager, gate)
    expect(data).toMatchObject({
      encoding: 'tagged-json-v1',
      format: 'tabbin-saved-tabs-recovery',
      version: 1,
      stores: { metadata: ['json', [{ key: 'revision', value: 9 }]] },
    })
    const serialized = JSON.stringify(data)
    expect(JSON.parse(serialized)).toEqual(data)
    expect(data.stores.urls).toEqual([
      'array',
      [
        [
          'object',
          [
            ['id', ['json', 'private-url-id']],
            ['firstSavedAt', ['json', 'invalid-date']],
            ['lastSavedAt', ['number', 'NaN']],
            ['url', ['json', 'https://private.example/']],
            [
              'extras',
              [
                'array',
                [
                  ['undefined'],
                  ['number', '-0'],
                  ['number', 'Infinity'],
                  ['number', '-Infinity'],
                  ['bigint', '7'],
                  ['date', ['json', 0]],
                ],
              ],
            ],
            ['collision', ['json', ['number', 'NaN']]],
          ],
        ],
      ],
    ])
    expect(() => inspectBackupV2(data)).toThrow(
      'Legacy backup format is unsupported',
    )
    const read = database.transaction('urls', 'readonly')
    const rows = read.objectStore('urls').getAll()
    await waitForIndexedDbTransaction(read)
    expect(rows.result).toEqual([corrupt])
    manager.close()
  })

  it.each(['map', 'cycle', 'sparse-array', 'array-property'])(
    'rejects unsupported %s explicitly without dropping a record',
    async (kind) => {
      const manager = new IndexedDbConnectionManager({
        indexedDb: new IDBFactory(),
      })
      const database = await manager.open()
      const cycle: Record<string, unknown> = {}
      cycle.self = cycle
      const sparse: unknown[] = []
      sparse.length = 1
      const values: Record<string, unknown> = {
        map: new Map(),
        cycle,
        'sparse-array': sparse,
        'array-property': Object.assign([...sparse], {
          privateField: 'private',
        }),
      }
      const corrupt = {
        id: 'private-id',
        value: values[kind],
      }
      const write = database.transaction(
        PERSISTENCE_STORE_NAMES.urls,
        'readwrite',
      )
      write.objectStore(PERSISTENCE_STORE_NAMES.urls).put(corrupt)
      await waitForIndexedDbTransaction(write)
      await expect(readSavedTabsRecoveryData(manager, gate)).rejects.toThrow(
        'Saved-tab recovery export contains an unsupported value.',
      )
      const read = database.transaction(
        PERSISTENCE_STORE_NAMES.urls,
        'readonly',
      )
      const rows = read.objectStore(PERSISTENCE_STORE_NAMES.urls).getAll()
      await waitForIndexedDbTransaction(read)
      expect(rows.result).toEqual([corrupt])
      manager.close()
    },
  )
})
