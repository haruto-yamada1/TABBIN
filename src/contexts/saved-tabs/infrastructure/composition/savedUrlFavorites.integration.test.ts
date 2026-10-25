import { IDBFactory } from 'fake-indexeddb'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createBackgroundSavedTabsIndexedDbDataPlane } from '@/app/composition/backgroundSavedTabsIndexedDbDataPlane'
import type { PersistenceOperationGatePort } from '@/contexts/saved-tabs/application/ports/PersistenceBootstrapPort'
import { IndexedDbConnectionManager } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbConnectionManager'
import { IndexedDbPersistenceSnapshotReader } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceSnapshotReader'

import {
  createIndexedDbSavedTabsUseCases,
  createNativeIndexedDbSavedTabsRuntime,
} from './createIndexedDbSavedTabsUseCases'

const setup = async () => {
  let failWrite = false
  const gate: PersistenceOperationGatePort = {
    runIndexedDbRead: async (operation) => operation(),
    runIndexedDbWrite: async (operation) => {
      if (failWrite) {
        throw new Error('write rejected')
      }
      return operation()
    },
  }
  vi.stubGlobal('chrome', {
    tabs: { create: vi.fn(async () => ({})) },
    storage: { local: { get: vi.fn(async () => ({})), set: vi.fn() } },
  })
  const manager = new IndexedDbConnectionManager({
    databaseName: 'favorites',
    indexedDb: new IDBFactory(),
  })
  const reader = new IndexedDbPersistenceSnapshotReader(manager, gate)
  const runtime = createNativeIndexedDbSavedTabsRuntime({
    connectionManager: manager,
    operationGate: gate,
  })
  let id = 0
  const dataPlane = createBackgroundSavedTabsIndexedDbDataPlane({
    idGenerator: () => `id-${id++}`,
    now: () => 10,
    readSnapshot: async () => reader.readVerifiedSavedTabsSnapshot(),
    session: runtime.session,
  })
  await dataPlane.saveTabs([
    { url: 'https://example.com/a', title: 'A' },
    { url: 'https://example.com/b', title: 'B' },
  ])
  const useCases = createIndexedDbSavedTabsUseCases({
    connectionManager: manager,
    operationGate: gate,
  })
  return {
    manager,
    reader,
    useCases,
    dataPlane,
    rejectWrites: () => {
      failWrite = true
    },
  }
}

afterEach(() => vi.unstubAllGlobals())

describe('saved URL favorites in IndexedDB', () => {
  it('shares the flag in both modes and persists through reopen, recapture, expiration and Undo', async () => {
    const { manager, reader, useCases, dataPlane } = await setup()
    const analyticsBefore = await dataPlane.readAnalyticsRecords()
    const before = await reader.readVerifiedSavedTabsSnapshot()
    await useCases.setSavedUrlFavorite({
      url: 'https://example.com/a',
      isFavorite: true,
    })
    const committed = await reader.readVerifiedSavedTabsSnapshot()
    await useCases.setSavedUrlFavorite({
      url: 'https://example.com/a',
      isFavorite: true,
    })
    expect(await reader.readVerifiedSavedTabsSnapshot()).toEqual(committed)
    expect(await dataPlane.readAnalyticsRecords()).toEqual(analyticsBefore)
    manager.close()
    const favorite = (
      await reader.readVerifiedSavedTabsSnapshot()
    ).savedTabs.urls.find(({ url }) => url.endsWith('/a'))
    expect(favorite).toEqual(
      expect.objectContaining({
        isFavorite: true,
        firstSavedAt: 10,
        lastSavedAt: 10,
      }),
    )
    expect(
      (await reader.readVerifiedSavedTabsSnapshot()).savedTabs.memberships,
    ).toEqual(before.savedTabs.memberships)
    expect(
      (await useCases.getSavedTabsPageData()).tabGroups[0]?.resolvedUrls,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          isFavorite: true,
          url: 'https://example.com/a',
        }),
      ]),
    )
    const project = (await useCases.getCustomProjects())[0]
    expect(project).toBeDefined()
    if (!project) {
      throw new Error('Missing project')
    }
    expect(await useCases.getProjectUrls(project)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          isFavorite: true,
          url: 'https://example.com/a',
        }),
      ]),
    )
    await dataPlane.saveTabs([
      { url: 'https://example.com/a', title: 'Updated' },
    ])
    expect(
      (await reader.readVerifiedSavedTabsSnapshot()).savedTabs.urls.find(
        ({ url }) => url.endsWith('/a'),
      )?.isFavorite,
    ).toBe(true)
    expect(await dataPlane.removeExpiredUrls(11, 12)).toEqual({
      removedCount: 1,
      sourceCount: 2,
    })
    const opened = await useCases.openSavedUrl({
      urlRecordId: favorite?.id ?? '',
      origin: 'click',
      settings: { removeTabAfterOpen: true, removeTabAfterExternalDrop: false },
    })
    expect(opened.snapshot?.urlRecords).toEqual(
      expect.arrayContaining([expect.objectContaining({ isFavorite: true })]),
    )
    if (!opened.snapshot) {
      throw new Error('Missing Undo snapshot')
    }
    await useCases.restoreOpenedUrlsSnapshot({ snapshot: opened.snapshot })
    expect(
      (await reader.readVerifiedSavedTabsSnapshot()).savedTabs.urls.find(
        ({ url }) => url.endsWith('/a'),
      )?.isFavorite,
    ).toBe(true)
    await useCases.setSavedUrlFavorite({
      url: 'https://example.com/a',
      isFavorite: false,
    })
    expect(await dataPlane.removeExpiredUrls(11, 12)).toEqual({
      removedCount: 1,
      sourceCount: 1,
    })
    manager.close()
  })

  it('does not change persistence on a rejected write or a missing URL', async () => {
    const { manager, reader, useCases, rejectWrites } = await setup()
    const before = await reader.readVerifiedSavedTabsSnapshot()
    await expect(
      useCases.setSavedUrlFavorite({
        url: 'https://missing.example/',
        isFavorite: true,
      }),
    ).rejects.toMatchObject({ code: 'URL_RECORD_NOT_FOUND' })
    rejectWrites()
    await expect(
      useCases.setSavedUrlFavorite({
        url: 'https://example.com/a',
        isFavorite: true,
      }),
    ).rejects.toThrow('write rejected')
    manager.close()
    expect(await reader.readVerifiedSavedTabsSnapshot()).toEqual(before)
    manager.close()
  })
})
