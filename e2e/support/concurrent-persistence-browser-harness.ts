/* eslint-disable no-restricted-imports -- browser harness exercises production saved-tabs persistence boundaries */
import type { PersistenceOperationGatePort } from '@/contexts/saved-tabs/application/ports/PersistenceBootstrapPort'
import type { PersistenceChangeEvent } from '@/contexts/saved-tabs/application/ports/PersistenceChangePort'
import { PersistenceRevisionConflictError } from '@/contexts/saved-tabs/application/ports/PersistenceV2UnitOfWorkPort'
import { checkPersistenceIntegrity } from '@/contexts/saved-tabs/domain/services/PersistenceIntegrityChecker'
import { createBroadcastChannelPersistenceChangeAdapter } from '@/contexts/saved-tabs/infrastructure/browser/BroadcastChannelPersistenceChangeAdapter'
import {
  createIndexedDbSavedTabsUseCases,
  createNativeIndexedDbSavedTabsRuntime,
} from '@/contexts/saved-tabs/infrastructure/composition/createIndexedDbSavedTabsUseCases'
import { IndexedDbConnectionManager } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbConnectionManager'
import { IndexedDbPersistenceSnapshotReader } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceSnapshotReader'
import {
  createDomainCollectionFixture,
  createMembershipFixture,
  createUrlFixture,
} from '@/test/fixtures/persistenceBrowserFixtures'

const serializeFailure = (error: unknown) => ({
  name: error instanceof Error ? error.name : 'UnknownError',
  ...(error instanceof PersistenceRevisionConflictError
    ? {
        actualRevision: error.actualRevision,
        expectedRevision: error.expectedRevision,
      }
    : {}),
})

type WriteOutcome =
  | { status: 'committed' }
  | ({ status: 'rejected' } & ReturnType<typeof serializeFailure>)

const createHarness = (databaseName: string) => {
  // The ordinary page supplies only the constructor's settings API shape.
  // Domain operations must stay entirely on native IndexedDB.
  const forbidSettingsStorage = (): never => {
    throw new Error('Domain persistence accessed chrome.storage.local.')
  }
  Object.assign(globalThis, {
    chrome: {
      storage: {
        local: {
          get: forbidSettingsStorage,
          remove: forbidSettingsStorage,
          set: forbidSettingsStorage,
        },
      },
    },
  })
  const manager = new IndexedDbConnectionManager({ databaseName })
  const events: PersistenceChangeEvent[] = []
  const unsubscribe =
    createBroadcastChannelPersistenceChangeAdapter().subscribe((event) =>
      events.push(event),
    )
  let heldWrite: Promise<void> | undefined
  let releaseWrite = () => {}
  let writeReachedBarrier = false
  let pendingWrite: Promise<WriteOutcome> | undefined
  const gate: PersistenceOperationGatePort = {
    runIndexedDbRead: async (operation) => operation(),
    runIndexedDbWrite: async (operation) => {
      // Pause before opening the native transaction, after the session read.
      // Each page controls its own barrier; there is no application queue.
      const barrier = heldWrite
      heldWrite = undefined
      if (barrier) {
        writeReachedBarrier = true
        await barrier
      }
      return operation()
    },
  }
  const useCases = createIndexedDbSavedTabsUseCases({
    connectionManager: manager,
    operationGate: gate,
  })
  const runtime = createNativeIndexedDbSavedTabsRuntime({
    connectionManager: manager,
    operationGate: gate,
  })
  const reader = new IndexedDbPersistenceSnapshotReader(manager, gate)
  const addUrl = async (projectId: string, url: string) =>
    useCases.addUrlToCustomProject({ projectId, title: url, url })
  const observeWrite = async (operation: () => Promise<unknown>) => {
    try {
      await operation()
      return { status: 'committed' } as const
    } catch (error) {
      return { status: 'rejected', ...serializeFailure(error) } as const
    }
  }

  return {
    addUrl,
    close: () => {
      unsubscribe()
      manager.close()
    },
    createProject: async () =>
      (await useCases.createCustomProject({ name: 'Concurrent project' }))
        .project.id,
    events: () => structuredClone(events),
    failAtomicWrite: async () =>
      observeWrite(async () => {
        const { revision, savedTabs } =
          await reader.readVerifiedSavedTabsSnapshot()
        const project = savedTabs.collections.find(
          ({ definition }) => definition.type === 'custom',
        )
        if (!project) {
          throw new Error('The rollback scenario requires an existing project.')
        }
        await runtime.deps.unitOfWorkPort.commit(
          {
            // PLAN_KEYS queues categories before collections. This legal put
            // succeeds before the later unique-index failure must roll it back.
            categories: {
              put: [
                {
                  collectionId: project.id,
                  createdAt: 1,
                  id: 'failed-category',
                  keywords: [],
                  name: 'Must roll back',
                  sortOrder: 0,
                  updatedAt: 1,
                },
              ],
            },
            collections: {
              put: [
                {
                  ...createDomainCollectionFixture(
                    'failed-a',
                    'duplicate.test',
                    1,
                  ),
                  definition: { type: 'domain', domain: 'duplicate.test' },
                },
                {
                  ...createDomainCollectionFixture(
                    'failed-b',
                    'duplicate.test',
                    1,
                  ),
                  definition: { type: 'domain', domain: 'duplicate.test' },
                },
              ],
            },
            memberships: {
              put: [
                {
                  ...createMembershipFixture('failed-a', 'failed-url', 1),
                  addedAtProvenance: 'exact',
                },
              ],
            },
            urls: {
              put: [
                {
                  ...createUrlFixture(
                    'failed-url',
                    'https://duplicate.test/rolled-back',
                    'Must roll back',
                    1,
                  ),
                  firstSavedAtProvenance: 'exact',
                  lastSavedAtProvenance: 'exact',
                },
              ],
            },
          },
          { expectedRevision: revision },
        )
      }),
    finishWrite: async () => {
      if (!pendingWrite) {
        throw new Error('No browser write is pending.')
      }
      return pendingWrite
    },
    holdNextWrite: () => {
      writeReachedBarrier = false
      heldWrite = new Promise<void>((resolve) => {
        releaseWrite = resolve
      })
    },
    releaseWrite: () => {
      releaseWrite()
    },
    snapshot: async () => {
      const snapshot = await reader.readVerifiedSavedTabsSnapshot()
      return {
        ...snapshot,
        integrity: checkPersistenceIntegrity(snapshot.savedTabs),
      }
    },
    startAddUrl: (projectId: string, url: string) => {
      pendingWrite = observeWrite(async () => addUrl(projectId, url))
    },
    writeReachedBarrier: () => writeReachedBarrier,
  }
}

export type ConcurrentPersistenceBrowserHarness = ReturnType<
  typeof createHarness
>

declare global {
  // eslint-disable-next-line typescript/consistent-type-definitions -- ambient Window extension requires interface merging
  interface Window {
    __tabbinConcurrentPersistence: ConcurrentPersistenceBrowserHarness
    __initializeTabbinConcurrentPersistence: (databaseName: string) => void
  }
}

Object.assign(globalThis, {
  __initializeTabbinConcurrentPersistence: (databaseName: string) => {
    window.__tabbinConcurrentPersistence = createHarness(databaseName)
  },
})
