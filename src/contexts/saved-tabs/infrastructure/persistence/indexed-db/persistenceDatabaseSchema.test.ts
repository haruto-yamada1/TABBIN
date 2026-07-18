import { IDBFactory, forceCloseDatabase } from 'fake-indexeddb'
import { describe, expect, it, vi } from 'vitest'

import {
  IndexedDbConnectionError,
  IndexedDbConnectionManager,
} from './IndexedDbConnectionManager'
import {
  PERSISTENCE_DATABASE_VERSION,
  PERSISTENCE_STORE_NAMES,
} from './persistenceDatabaseSchema'

const requestResult = async <Value>(
  request: IDBRequest<Value>,
): Promise<Value> => {
  return new Promise((resolve, reject) => {
    request.addEventListener('error', () => {
      reject(request.error ?? new Error('IndexedDB request failed.'))
    })
    request.addEventListener('success', () => {
      resolve(request.result)
    })
  })
}

describe('Persistence v2 IndexedDB schema', () => {
  it('Storage Placement Matrix に対応する store と index を作成する', async () => {
    const manager = new IndexedDbConnectionManager({
      databaseName: 'schema-contract',
      indexedDb: new IDBFactory(),
    })

    const database = await manager.open()

    expect([...database.objectStoreNames]).toEqual(
      Object.values(PERSISTENCE_STORE_NAMES).toSorted(),
    )

    const transaction = database.transaction(
      [...database.objectStoreNames],
      'readonly',
    )
    const urls = transaction.objectStore(PERSISTENCE_STORE_NAMES.urls)
    const memberships = transaction.objectStore(
      PERSISTENCE_STORE_NAMES.memberships,
    )

    expect(urls.keyPath).toBe('id')
    expect(urls.index('normalizedUrl').unique).toBe(false)
    expect([...urls.indexNames]).toEqual([
      'firstSavedAt',
      'lastSavedAt',
      'normalizedUrl',
    ])
    expect(memberships.keyPath).toEqual(['collectionId', 'urlId'])
    expect([...memberships.indexNames]).toEqual([
      'addedAt',
      'collectionAndCategory',
      'collectionId',
      'collectionOrder',
      'urlId',
    ])
    expect(database.version).toBe(PERSISTENCE_DATABASE_VERSION)

    manager.close()
  })
})

describe('IndexedDbConnectionManager', () => {
  it('同一 context の concurrent open を single-flight 化する', async () => {
    const indexedDb = new IDBFactory()
    const openSpy = vi.spyOn(indexedDb, 'open')
    const manager = new IndexedDbConnectionManager({
      databaseName: 'single-flight',
      indexedDb,
    })

    const [first, second] = await Promise.all([manager.open(), manager.open()])

    expect(first).toBe(second)
    expect(openSpy).toHaveBeenCalledOnce()
    manager.close()
  })

  it('versionchange で古い connection を閉じて upgrade を妨げない', async () => {
    const indexedDb = new IDBFactory()
    const onVersionChange = vi.fn()
    const oldManager = new IndexedDbConnectionManager({
      databaseName: 'version-change',
      databaseVersion: 1,
      indexedDb,
      onVersionChange,
    })
    const oldDatabase = await oldManager.open()

    const newManager = new IndexedDbConnectionManager({
      databaseName: 'version-change',
      databaseVersion: 2,
      indexedDb,
    })
    const newDatabase = await newManager.open()

    expect(onVersionChange).toHaveBeenCalledOnce()
    expect(newDatabase.version).toBe(2)
    expect(() =>
      oldDatabase.transaction(PERSISTENCE_STORE_NAMES.urls, 'readonly'),
    ).toThrow(/./)
    newManager.close()
  })

  it('協調しない古い connection がある blocked upgrade を通知する', async () => {
    const indexedDb = new IDBFactory()
    const initialRequest = indexedDb.open('blocked-upgrade', 1)
    initialRequest.addEventListener('upgradeneeded', () => {
      initialRequest.result.createObjectStore(PERSISTENCE_STORE_NAMES.urls, {
        keyPath: 'id',
      })
    })
    const blocker = await requestResult(initialRequest)
    blocker.addEventListener('versionchange', () => undefined)
    const onBlocked = vi.fn()
    const manager = new IndexedDbConnectionManager({
      databaseName: 'blocked-upgrade',
      databaseVersion: 2,
      indexedDb,
      onBlocked,
    })

    const opening = manager.open()
    await vi.waitFor(() => expect(onBlocked).toHaveBeenCalledOnce())
    blocker.close()

    await expect(opening).resolves.toMatchObject({ version: 2 })
    manager.close()
  })

  it('MV3 restart 相当の manager 再生成後に同じ database を再接続する', async () => {
    const indexedDb = new IDBFactory()
    const firstManager = new IndexedDbConnectionManager({
      databaseName: 'mv3-restart',
      indexedDb,
    })
    const firstDatabase = await firstManager.open()
    const write = firstDatabase.transaction(
      PERSISTENCE_STORE_NAMES.urls,
      'readwrite',
    )
    write.objectStore(PERSISTENCE_STORE_NAMES.urls).put({
      firstSavedAt: 1,
      id: 'url-1',
      lastSavedAt: 1,
      normalizedUrl: 'https://example.com/',
      title: 'Example',
      updatedAt: 1,
      url: 'https://example.com/',
    })
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
    firstManager.close()

    const restartedManager = new IndexedDbConnectionManager({
      databaseName: 'mv3-restart',
      indexedDb,
    })
    const restartedDatabase = await restartedManager.open()
    const read = restartedDatabase.transaction(
      PERSISTENCE_STORE_NAMES.urls,
      'readonly',
    )
    const record = await requestResult(
      read.objectStore(PERSISTENCE_STORE_NAMES.urls).get('url-1'),
    )

    expect(record).toMatchObject({ id: 'url-1' })
    restartedManager.close()
  })

  it('IndexedDB factory不在をOPEN_FAILEDとして分類する', () => {
    expect(() =>
      Reflect.construct(IndexedDbConnectionManager, [
        { indexedDb: { open: 'not-a-function' } },
      ]),
    ).toThrow(IndexedDbConnectionError)
  })

  it('schema upgrade callback failureをUPGRADE_FAILEDとして分類する', async () => {
    const manager = new IndexedDbConnectionManager({
      databaseName: 'upgrade-failure',
      indexedDb: new IDBFactory(),
      upgrade: () => {
        throw new Error('broken schema migration')
      },
    })

    await expect(manager.open()).rejects.toMatchObject({
      code: 'UPGRADE_FAILED',
      name: 'IndexedDbConnectionError',
    })
  })

  it('databaseVersion downgrade failureをOPEN_FAILEDとして分類する', async () => {
    const indexedDb = new IDBFactory()
    const currentManager = new IndexedDbConnectionManager({
      databaseName: 'open-failure',
      databaseVersion: PERSISTENCE_DATABASE_VERSION + 1,
      indexedDb,
    })
    await currentManager.open()
    currentManager.close()

    const staleManager = new IndexedDbConnectionManager({
      databaseName: 'open-failure',
      databaseVersion: PERSISTENCE_DATABASE_VERSION,
      indexedDb,
    })
    await expect(staleManager.open()).rejects.toMatchObject({
      code: 'OPEN_FAILED',
      name: 'IndexedDbConnectionError',
    })
  })

  it('factory.openの同期throwを分類し、次のopenで再試行する', async () => {
    const indexedDb = new IDBFactory()
    let shouldThrow = true
    const constructed: unknown = Reflect.construct(IndexedDbConnectionManager, [
      {
        databaseName: 'synchronous-open-error',
        indexedDb: {
          open: (databaseName: string, version?: number) => {
            if (shouldThrow) {
              shouldThrow = false
              throw new DOMException('Blocked by policy.', 'SecurityError')
            }

            return indexedDb.open(databaseName, version)
          },
        },
      },
    ])
    expect(constructed).toBeInstanceOf(IndexedDbConnectionManager)
    if (!(constructed instanceof IndexedDbConnectionManager)) {
      throw new TypeError('Failed to construct IndexedDbConnectionManager.')
    }

    await expect(constructed.open()).rejects.toMatchObject({
      code: 'OPEN_FAILED',
      name: 'IndexedDbConnectionError',
    })
    await expect(constructed.open()).resolves.toMatchObject({
      name: 'synchronous-open-error',
    })
    constructed.close()
  })

  it('abnormal close event後にconnectionをreopenする', async () => {
    const manager = new IndexedDbConnectionManager({
      databaseName: 'abnormal-close',
      indexedDb: new IDBFactory(),
    })
    const first = await manager.open()
    Reflect.apply(forceCloseDatabase, undefined, [first])

    const reopened = await manager.open()
    expect(reopened).not.toBe(first)
    manager.close()
  })
})
