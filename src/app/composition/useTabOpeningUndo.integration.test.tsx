import { act, cleanup, renderHook } from '@testing-library/react'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, assert, describe, expect, it, vi } from 'vitest'

import { savedTabsDefaultUserSettings } from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDefaultsDto'
import type { PersistenceOperationGatePort } from '@/contexts/saved-tabs/application/ports/PersistenceBootstrapPort'
import {
  createSavedTabsPresentationPortsStub,
  createSavedTabsUseCasesStub,
} from '@/contexts/saved-tabs/application/testing/SavedTabsPresentationStubs'
import { createIndexedDbSavedTabsUseCases } from '@/contexts/saved-tabs/infrastructure/composition/createIndexedDbSavedTabsUseCases'
import { IndexedDbConnectionManager } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbConnectionManager'
import { IndexedDbPersistenceSnapshotReader } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceSnapshotReader'
import { waitForIndexedDbTransaction } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbTransaction'
import { useTabOpeningHandlers } from '@/contexts/saved-tabs/presentation/app/handlers/useTabOpeningHandlers'
import {
  createCustomCollectionFixture,
  createDomainCollectionFixture,
  createMembershipFixture,
  createUrlFixture,
} from '@/test/fixtures/persistenceBrowserFixtures'

type UndoToastOptions = {
  readonly action: { readonly onClick: () => Promise<void> }
}
const notifications = vi.hoisted(() => ({
  info: vi.fn<(message: string, options: UndoToastOptions) => string>(),
  success: vi.fn(),
  error: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: notifications }))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

const gate: PersistenceOperationGatePort = {
  runIndexedDbRead: async (operation) => operation(),
  runIndexedDbWrite: async (operation) => operation(),
}

describe('bulk opening Undo boundary', () => {
  it.each([false, true])(
    'removes only confirmed successes and restores their URLs and memberships (partial failure: %s)',
    async (partialFailure) => {
      const manager = new IndexedDbConnectionManager({
        databaseName: `bulk-undo-${String(partialFailure)}`,
        indexedDb: new IDBFactory(),
      })
      const records = Array.from({ length: 8 }, (_, i) =>
        createUrlFixture(`url-${i}`, `https://example.com/${i}`, `URL ${i}`, 1),
      )
      const collections = [
        createDomainCollectionFixture('domain', 'example.com', 1),
        createCustomCollectionFixture('custom', 'Project', 1),
      ]
      const database = await manager.open()
      const transaction = database.transaction(
        ['collections', 'collectionMemberships', 'urls', 'metadata'],
        'readwrite',
      )
      for (const collection of collections) {
        transaction.objectStore('collections').put(collection)
        for (const [index, record] of records.entries()) {
          transaction
            .objectStore('collectionMemberships')
            .put(createMembershipFixture(collection.id, record.id, 1, index))
        }
      }
      for (const record of records) {
        transaction.objectStore('urls').put(record)
      }
      transaction.objectStore('metadata').put({ key: 'revision', value: 1 })
      await waitForIndexedDbTransaction(transaction)
      const open = vi.fn(async ({ url }: { url: string }) => {
        if (partialFailure && url.endsWith('/1')) {
          throw new Error('Permission denied')
        }
        return { url }
      })
      vi.stubGlobal('chrome', {
        storage: {
          local: { get: async () => ({}), set: vi.fn(), remove: vi.fn() },
        },
        tabs: {
          create: open,
        },
      })
      const useCases = createIndexedDbSavedTabsUseCases({
        connectionManager: manager,
        operationGate: gate,
      })
      const reader = new IndexedDbPersistenceSnapshotReader(manager, gate)
      const beforeOpening = await reader.readConsistentSnapshot()
      const { result } = renderHook(() =>
        useTabOpeningHandlers({
          categories: [],
          deps: createSavedTabsPresentationPortsStub(),
          savedTabsUseCases: createSavedTabsUseCasesStub({
            buildSavedTabsSnapshot: useCases.buildSavedTabsSnapshot,
            restoreOpenedUrlsSnapshotView:
              useCases.restoreOpenedUrlsSnapshotView,
            openAllSavedUrls: useCases.openAllSavedUrls,
          }),
          settings: {
            ...savedTabsDefaultUserSettings,
            removeTabAfterOpen: true,
          },
          refreshTabGroupsWithUrls: async () => [],
          setCustomProjects: vi.fn(),
          t: (key, _fallback, values) => `${key}:${values?.count ?? ''}`,
        }),
      )
      try {
        await act(async () => {
          await result.current.handleOpenAllTabs(
            records.map(({ url, title }) => ({ url, title })),
          )
        })
        expect(open.mock.calls.map(([{ url }]) => url)).toEqual(
          records.map(({ url }) => url),
        )
        const afterOpening = await reader.readConsistentSnapshot()
        const remainingIds = partialFailure ? ['url-1'] : []
        expect(afterOpening.savedTabs.urls.map(({ id }) => id)).toEqual(
          remainingIds,
        )
        expect(afterOpening.savedTabs.memberships).toEqual(
          beforeOpening.savedTabs.memberships.filter(({ urlId }) =>
            remainingIds.includes(urlId),
          ),
        )
        expect(notifications.error).toHaveBeenCalledTimes(
          partialFailure ? 1 : 0,
        )
        expect(notifications.info).toHaveBeenCalledTimes(1)
        const undo = notifications.info.mock.calls[0]
        assert.isDefined(undo)
        expect(undo[0]).toBe(
          `savedTabs.undo.removedAfterOpen:${partialFailure ? 7 : 8}`,
        )
        await act(async () => {
          await Promise.all([
            undo[1].action.onClick(),
            undo[1].action.onClick(),
          ])
        })
        const restored = await reader.readConsistentSnapshot()
        expect(
          restored.savedTabs.urls.map(({ id, title, url }) => ({
            id,
            title,
            url,
          })),
        ).toEqual(records.map(({ id, title, url }) => ({ id, title, url })))
        expect(
          restored.savedTabs.memberships.map(
            ({ collectionId, sortOrder, urlId }) => ({
              collectionId,
              sortOrder,
              urlId,
            }),
          ),
        ).toEqual(
          beforeOpening.savedTabs.memberships.map(
            ({ collectionId, sortOrder, urlId }) => ({
              collectionId,
              sortOrder,
              urlId,
            }),
          ),
        )
        expect(notifications.success).toHaveBeenCalledWith(
          'savedTabs.undo.restored:',
        )
        expect(notifications.success).toHaveBeenCalledTimes(1)
        await act(async () => {
          await undo[1].action.onClick()
        })
        expect((await reader.readConsistentSnapshot()).revision).toBe(
          restored.revision,
        )
      } finally {
        manager.close()
      }
    },
  )
})
