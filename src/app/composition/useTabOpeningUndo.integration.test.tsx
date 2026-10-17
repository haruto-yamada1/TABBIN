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
  readonly id?: string | number
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

describe('bulk opening recovery Undo boundary', () => {
  it.each(['retry-first', 'resume-first'] as const)(
    'uses one cumulative Undo across cancellation and both recovery partitions (%s)',
    async (order) => {
      const manager = new IndexedDbConnectionManager({
        databaseName: `bulk-undo-${order}`,
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
      let failOnce = true
      let holdRecovery = false
      const recoveryStarted = Promise.withResolvers<undefined>()
      const recoveryReleased = Promise.withResolvers<undefined>()
      vi.stubGlobal('chrome', {
        storage: {
          local: { get: async () => ({}), set: vi.fn(), remove: vi.fn() },
        },
        tabs: {
          create: async ({ url }: { url: string }) => {
            if (holdRecovery) {
              recoveryStarted.resolve(undefined)
              await recoveryReleased.promise
            }
            if (url.endsWith('/1') && failOnce) {
              failOnce = false
              throw new Error('Permission denied')
            }
            return { url }
          },
        },
      })
      const useCases = createIndexedDbSavedTabsUseCases({
        connectionManager: manager,
        operationGate: gate,
      })
      const nativeOpen = useCases.openAllSavedUrls
      const { result } = renderHook(() =>
        useTabOpeningHandlers({
          categories: [],
          deps: createSavedTabsPresentationPortsStub(),
          savedTabsUseCases: createSavedTabsUseCasesStub({
            buildSavedTabsSnapshot: useCases.buildSavedTabsSnapshot,
            restoreOpenedUrlsSnapshotView:
              useCases.restoreOpenedUrlsSnapshotView,
            openAllSavedUrls: async (command, options) =>
              nativeOpen(command, {
                ...options,
                onProgress: (progress) => {
                  options?.onProgress?.(progress)
                  if (
                    command.urls.length === 8 &&
                    progress.opened + progress.failed > 0
                  ) {
                    result.current.cancelOpening()
                  }
                },
              }),
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
        expect(result.current.openingOperation).toMatchObject({
          opened: 4,
          failedUrls: [{ url: records[1]?.url, reason: 'permission' }],
          cancelledUrls: records.slice(5).map(({ url }) => url),
        })
        const reader = new IndexedDbPersistenceSnapshotReader(manager, gate)
        const initialUndo = notifications.info.mock.calls[0]?.[1]
        assert.isDefined(initialUndo)
        const beforeRecovery = await reader.readConsistentSnapshot()
        holdRecovery = true
        let recovery: Promise<void> | undefined
        await act(async () => {
          recovery =
            order === 'retry-first'
              ? result.current.retryFailedUrls()
              : result.current.resumeCancelledUrls()
          await recoveryStarted.promise
        })
        // A stale Undo action cannot mutate persistence while the partition is opening.
        await act(async () => {
          await initialUndo.action.onClick()
        })
        expect((await reader.readConsistentSnapshot()).revision).toBe(
          beforeRecovery.revision,
        )
        await act(async () => {
          holdRecovery = false
          recoveryReleased.resolve(undefined)
          await recovery
          if (order === 'retry-first') {
            await result.current.resumeCancelledUrls()
          } else {
            await result.current.retryFailedUrls()
          }
        })
        expect(
          (await reader.readConsistentSnapshot()).savedTabs.urls,
        ).toHaveLength(0)
        expect(notifications.info).toHaveBeenCalledTimes(3)
        const first = notifications.info.mock.calls[0]?.[1]
        const last = notifications.info.mock.calls.at(-1)
        assert.isDefined(first)
        assert.isDefined(last)
        expect(first.id).toBeDefined()
        expect(
          new Set(
            notifications.info.mock.calls.map(([, options]) => options.id),
          ).size,
        ).toBe(1)
        expect(last[0]).toBe('savedTabs.undo.removedAfterOpen:8')
        await act(async () => {
          await first.action.onClick()
        })
        const restored = await reader.readConsistentSnapshot()
        expect(restored.savedTabs.urls).toHaveLength(8)
        expect(restored.savedTabs.memberships).toHaveLength(16)
        await act(async () => {
          await last[1].action.onClick()
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
