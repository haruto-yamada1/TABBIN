import { IDBFactory } from 'fake-indexeddb'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { resetPersistenceBootstrapRuntimeForTesting } from '@/contexts/saved-tabs/infrastructure/composition/persistenceBootstrapRuntime'
import { IndexedDbConnectionManager } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbConnectionManager'
import { waitForIndexedDbTransaction } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbTransaction'

import { exportSavedTabsRecoveryData } from './persistenceRecoveryExport'

const { downloadAsJson } = vi.hoisted(() => ({ downloadAsJson: vi.fn() }))
vi.mock('@/features/options/lib/import-export', () => ({ downloadAsJson }))

afterEach(() => {
  resetPersistenceBootstrapRuntimeForTesting()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
  downloadAsJson.mockReset()
})

const initialize = async () => {
  vi.stubGlobal('indexedDB', new IDBFactory())
  vi.stubGlobal('navigator', {
    locks: {
      request: async (
        _name: string,
        _options: unknown,
        callback: () => Promise<unknown>,
      ) => callback(),
    },
  })
  const manager = new IndexedDbConnectionManager()
  const database = await manager.open()
  const write = database.transaction('urls', 'readwrite')
  write.objectStore('urls').put({ id: 'broken', firstSavedAt: 'not-a-number' })
  await waitForIndexedDbTransaction(write)
  manager.close()
}

describe('exportSavedTabsRecoveryData', () => {
  it('downloads a separate recovery file despite decode failure and closes its connection', async () => {
    await initialize()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-15T00:00:00Z'))
    const close = vi.spyOn(IndexedDbConnectionManager.prototype, 'close')
    await exportSavedTabsRecoveryData()
    expect(downloadAsJson).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        format: 'tabbin-saved-tabs-recovery',
        stores: expect.objectContaining({
          urls: ['json', [{ id: 'broken', firstSavedAt: 'not-a-number' }]],
        }),
      }),
      'tabbin-saved-tabs-recovery-2026-10-15.json',
    )
    expect(close).toHaveBeenCalledOnce()
  })

  it('closes its connection when download fails and propagates failure to the UI', async () => {
    await initialize()
    const close = vi.spyOn(IndexedDbConnectionManager.prototype, 'close')
    const failure = new Error('private download failure')
    downloadAsJson.mockRejectedValueOnce(failure)
    await expect(exportSavedTabsRecoveryData()).rejects.toBe(failure)
    expect(close).toHaveBeenCalledOnce()
  })

  it('does not create a partial download when the database cannot be opened', async () => {
    vi.stubGlobal('indexedDB', undefined)
    await expect(exportSavedTabsRecoveryData()).rejects.toThrow(
      'PERSISTENCE_RECOVERY_REQUIRED',
    )
    expect(downloadAsJson).not.toHaveBeenCalled()
  })
})
