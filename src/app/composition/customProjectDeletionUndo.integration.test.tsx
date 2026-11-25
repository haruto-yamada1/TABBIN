import { act, renderHook } from '@testing-library/react'
import { IDBFactory } from 'fake-indexeddb'
import { toast } from 'sonner'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { PersistenceOperationGatePort } from '@/contexts/saved-tabs/application/ports/PersistenceBootstrapPort'
import { createIndexedDbSavedTabsUseCases } from '@/contexts/saved-tabs/infrastructure/composition/createIndexedDbSavedTabsUseCases'
import { IndexedDbConnectionManager } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbConnectionManager'
import { IndexedDbPersistenceSnapshotReader } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceSnapshotReader'
import { IndexedDbPersistenceUnitOfWork } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceUnitOfWork'
import { useProjectCrudHandlers } from '@/contexts/saved-tabs/presentation/hooks/useProjectCrudHandlers'

vi.mock('sonner', () => ({
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() },
}))

const clickUndo = async () => {
  const action = vi.mocked(toast.info).mock.calls.at(-1)?.[1]?.action
  if (!action || typeof action !== 'object' || !('onClick' in action)) {
    throw new Error('Undo action missing')
  }
  await act(async () => {
    await Reflect.apply(action.onClick, undefined, [undefined])
  })
}

const createFixture = async (shared = false) => {
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.stubGlobal('chrome', {
    storage: {
      local: { get: vi.fn(async () => ({})), set: vi.fn(), remove: vi.fn() },
    },
  })
  const indexedDb = new IDBFactory()
  const databaseName = 'project-crud-review'
  const manager = new IndexedDbConnectionManager({ databaseName, indexedDb })
  let writes = 0
  let rejectWrite = -1
  const failure = new Error('second project commit failed')
  const gate: PersistenceOperationGatePort = {
    runIndexedDbRead: async (operation) => operation(),
    runIndexedDbWrite: async (operation) => {
      writes += 1
      if (writes === rejectWrite) {
        throw failure
      }
      return operation()
    },
  }
  const urls = ['a', 'b'].map((id) => ({
    firstSavedAt: 1,
    firstSavedAtProvenance: 'exact' as const,
    id,
    lastSavedAt: 2,
    lastSavedAtProvenance: 'exact' as const,
    normalizedUrl: `https://example.com/${id}`,
    title: id,
    updatedAt: 2,
    url: `https://example.com/${id}`,
  }))
  await new IndexedDbPersistenceUnitOfWork(manager, gate).commit({
    collections: {
      put: [
        {
          createdAt: 1,
          definition: { type: 'domain', domain: 'example.com' },
          id: 'domain',
          name: 'example.com',
          sortOrder: 0,
          updatedAt: 1,
        },
        ...['first', 'second'].map((id, sortOrder) => ({
          createdAt: 1,
          definition: {
            type: 'custom' as const,
            projectKeywords: {
              domainKeywords: [],
              titleKeywords: [],
              urlKeywords: [],
            },
          },
          id,
          name: id,
          sortOrder,
          updatedAt: 1,
        })),
      ],
    },
    memberships: {
      put: [
        ...urls.flatMap(({ id }, sortOrder) =>
          ['domain', id === 'a' ? 'first' : 'second'].map((collectionId) => ({
            addedAt: 1,
            addedAtProvenance: 'exact' as const,
            collectionId,
            sortOrder,
            updatedAt: 1,
            urlId: id,
          })),
        ),
        ...(shared
          ? [
              {
                addedAt: 1,
                addedAtProvenance: 'exact' as const,
                collectionId: 'second',
                sortOrder: 4,
                updatedAt: 1,
                urlId: 'a',
              },
            ]
          : []),
      ],
    },
    urls: { put: urls },
  })
  const useCases = createIndexedDbSavedTabsUseCases({
    connectionManager: manager,
    operationGate: gate,
  })
  const reader = new IndexedDbPersistenceSnapshotReader(manager, gate)
  const getRaws = vi.fn(useCases.getCustomProjectRaws)
  const ref = <Value,>(current: Value) => ({ current })
  const deps: Parameters<typeof useProjectCrudHandlers>[0] = {
    refs: {
      getCustomProjectOrderQueryRef: ref(useCases.getCustomProjectOrder),
      getCustomProjectUndoSnapshotQueryRef: ref(
        useCases.getCustomProjectUndoSnapshot,
      ),
      getCustomProjectRawsQueryRef: ref(getRaws),
      createCustomProjectUseCaseRef: ref(useCases.createCustomProject),
      deleteCustomProjectUseCaseRef: ref(useCases.deleteCustomProject),
      updateCustomProjectNameUseCaseRef: ref(useCases.updateCustomProjectName),
      saveCustomProjectOrderUseCaseRef: ref(useCases.saveCustomProjectOrder),
      restoreCustomProjectsSnapshotUseCaseRef: ref(
        useCases.restoreCustomProjectsSnapshot,
      ),
      addUrlToCustomProjectUseCaseRef: ref(useCases.addUrlToCustomProject),
      removeUrlFromCustomProjectUseCaseRef: ref(
        useCases.removeUrlFromCustomProject,
      ),
      removeUrlsFromCustomProjectUseCaseRef: ref(
        useCases.removeUrlsFromCustomProject,
      ),
      setCustomProjectUrlCategoryUseCaseRef: ref(
        useCases.setCustomProjectUrlCategory,
      ),
      updateCustomProjectCategoryOrderUseCaseRef: ref(
        useCases.updateCustomProjectCategoryOrder,
      ),
      reorderCustomProjectUrlsUseCaseRef: ref(
        useCases.reorderCustomProjectUrls,
      ),
      renameCustomProjectCategoryUseCaseRef: ref(
        useCases.renameCustomProjectCategory,
      ),
      updateCustomProjectKeywordsUseCaseRef: ref(
        useCases.updateCustomProjectKeywords,
      ),
      addCategoryToCustomProjectUseCaseRef: ref(
        useCases.addCategoryToCustomProject,
      ),
      removeCategoryFromCustomProjectUseCaseRef: ref(
        useCases.removeCategoryFromCustomProject,
      ),
    },
    setCustomProjects: vi.fn(),
    setViewMode: vi.fn(),
    customProjectsRef: ref([]),
    creatingProjectNamesRef: ref(new Set<string>()),
    t: (key) => key,
  }
  const hook = renderHook(() => useProjectCrudHandlers(deps))
  return {
    ...hook,
    errors,
    useCases,
    reader,
    getRaws,
    deps,
    failure,
    failSecondDeletion: () => {
      rejectWrite = writes + 2
    },
    readAfterReopen: async () => {
      manager.close()
      const reopened = new IndexedDbConnectionManager({
        databaseName,
        indexedDb,
      })
      try {
        return await new IndexedDbPersistenceSnapshotReader(
          reopened,
          gate,
        ).readVerifiedSavedTabsSnapshot()
      } finally {
        reopened.close()
      }
    },
    close: () => {
      hook.unmount()
      manager.close()
    },
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

describe('custom deletion Undo at the UI and persistence boundary', () => {
  it.each(['single', 'bulk'] as const)(
    '%s retains a working Undo when list reload fails after the committed deletion',
    async (mode) => {
      const fixture = await createFixture()
      try {
        const before = await fixture.reader.readVerifiedSavedTabsSnapshot()
        fixture.getRaws.mockRejectedValueOnce(new Error('list read failed'))
        await act(async () => {
          if (mode === 'single') {
            await fixture.result.current.handleDeleteUrlFromProject(
              'first',
              'https://example.com/a',
            )
          } else {
            await fixture.result.current.handleDeleteUrlsFromProject('first', [
              'https://example.com/a',
            ])
          }
        })
        expect(
          (
            await fixture.reader.readVerifiedSavedTabsSnapshot()
          ).savedTabs.urls.map(({ id }) => id),
        ).toEqual(['b'])
        expect(toast.info).toHaveBeenCalledOnce()
        const undoCall = vi.mocked(toast.info).mock.invocationCallOrder[0]
        const reloadCall = fixture.getRaws.mock.invocationCallOrder[0]
        if (undoCall === undefined || reloadCall === undefined) {
          throw new Error('Undo registration or list read missing')
        }
        expect(undoCall).toBeLessThan(reloadCall)
        expect(toast.error).toHaveBeenCalledWith(
          'savedTabs.selection.refreshFailed',
        )
        expect(toast.error).not.toHaveBeenCalledWith(
          'savedTabs.tab.deleteError',
        )
        await clickUndo()
        const restored = await fixture.readAfterReopen()
        expect(restored.savedTabs.urls).toEqual(before.savedTabs.urls)
        expect(restored.savedTabs.memberships).toEqual(
          before.savedTabs.memberships,
        )
      } finally {
        fixture.close()
      }
    },
  )

  it.each([false, true])(
    'partial selection Undo restores only committed targets, preserving later deletions (shared=%s)',
    async (shared) => {
      const fixture = await createFixture(shared)
      try {
        fixture.failSecondDeletion()
        await act(async () => {
          await expect(
            fixture.result.current.handleDeleteSelectedUrls([
              { groupId: 'first', title: 'a', url: 'https://example.com/a' },
              { groupId: 'second', title: 'b', url: 'https://example.com/b' },
            ]),
          ).rejects.toBe(fixture.failure)
        })
        expect(
          (
            await fixture.reader.readVerifiedSavedTabsSnapshot()
          ).savedTabs.urls.map(({ id }) => id),
        ).toEqual(['b'])
        expect(toast.info).toHaveBeenCalledOnce()
        expect(fixture.errors).toHaveBeenCalledWith(
          '選択URL削除エラー:',
          fixture.failure,
        )
        await fixture.useCases.removeUrlFromCustomProject({
          projectId: 'second',
          url: 'https://example.com/b',
        })
        await clickUndo()
        const restored = await fixture.readAfterReopen()
        expect(restored.savedTabs.urls.map(({ id }) => id)).toEqual(['a'])
        expect(restored.savedTabs.memberships).toMatchObject([
          { collectionId: 'domain', urlId: 'a' },
          { collectionId: 'first', urlId: 'a' },
          ...(shared ? [{ collectionId: 'second', urlId: 'a' }] : []),
        ])
        expect(restored.savedTabs.memberships).toHaveLength(shared ? 3 : 2)
      } finally {
        fixture.close()
      }
    },
  )
})
