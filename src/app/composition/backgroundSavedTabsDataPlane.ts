import { PersistenceUnavailableError } from '@/contexts/saved-tabs/application/errors/PersistenceUnavailableError'
import type {
  PersistenceDataPlaneRouterPort,
  PersistenceOperationGatePort,
} from '@/contexts/saved-tabs/application/ports/PersistenceBootstrapPort'
import { createBroadcastChannelPersistenceChangeAdapter } from '@/contexts/saved-tabs/infrastructure/browser/BroadcastChannelPersistenceChangeAdapter'
import { createSystemIdGenerator } from '@/contexts/saved-tabs/infrastructure/browser/SystemIdGeneratorAdapter'
import { createNotifyingPersistenceV2UnitOfWork } from '@/contexts/saved-tabs/infrastructure/composition/createNotifyingPersistenceV2UnitOfWork'
import { IndexedDbSavedTabsSessionService } from '@/contexts/saved-tabs/infrastructure/composition/IndexedDbSavedTabsSessionService'
import { getPersistenceBootstrapRuntime } from '@/contexts/saved-tabs/infrastructure/composition/persistenceBootstrapRuntime'
import { IndexedDbPersistenceSnapshotReader } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceSnapshotReader'
import { IndexedDbPersistenceUnitOfWork } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceUnitOfWork'
import { getChromeStorageLocal } from '@/lib/browser/chrome-storage'
import { logger } from '@/lib/logging/logger'

import type { BackgroundSavedTabsDataPlane } from './backgroundSavedTabsDataPlaneTypes'
import { createBackgroundSavedTabsIndexedDbDataPlane } from './backgroundSavedTabsIndexedDbDataPlane'
import { createBackgroundSavedTabsLegacyDataPlane } from './backgroundSavedTabsLegacyDataPlane'
import type { CreateBackgroundSavedTabsDataPlaneOptions } from './backgroundSavedTabsLegacyDataPlane'

export { createBackgroundSavedTabsDataPlane } from './backgroundSavedTabsLegacyDataPlane'
export type {
  BackgroundSavedTabInput,
  BackgroundSavedTabsDataPlane,
  SavedTabsAnalyticsMetric,
  SavedTabsAnalyticsRecord,
  SavedTabsInsightRecord,
} from './backgroundSavedTabsDataPlaneTypes'
export type {
  CreateBackgroundSavedTabsDataPlaneOptions,
  SavedTabsCompatibilityStorage,
} from './backgroundSavedTabsLegacyDataPlane'

export type CreateRouteAwareBackgroundSavedTabsDataPlaneOptions = {
  readonly indexeddb: BackgroundSavedTabsDataPlane
  readonly legacy: BackgroundSavedTabsDataPlane
  readonly router: PersistenceDataPlaneRouterPort
}

export const createRouteAwareBackgroundSavedTabsDataPlane = ({
  indexeddb,
  legacy,
  router,
}: CreateRouteAwareBackgroundSavedTabsDataPlaneOptions): BackgroundSavedTabsDataPlane => ({
  readAnalyticsRecords: async () =>
    router.read({
      indexeddb: indexeddb.readAnalyticsRecords,
      legacy: legacy.readAnalyticsRecords,
    }),
  readInsightRecords: async () =>
    router.read({
      indexeddb: indexeddb.readInsightRecords,
      legacy: legacy.readInsightRecords,
    }),
  readUndoSnapshot: async () =>
    router.read({
      indexeddb: indexeddb.readUndoSnapshot,
      legacy: legacy.readUndoSnapshot,
    }),
  removeExpiredUrls: async (cutoffTime, currentTime) =>
    router.write({
      indexeddb: async () =>
        indexeddb.removeExpiredUrls(cutoffTime, currentTime),
      legacy: async () => legacy.removeExpiredUrls(cutoffTime, currentTime),
    }),
  removeUrl: async (url) =>
    router.write({
      indexeddb: async () => indexeddb.removeUrl(url),
      legacy: async () => legacy.removeUrl(url),
    }),
  removeUrlIds: async (urlIds) =>
    router.write({
      indexeddb: async () => indexeddb.removeUrlIds(urlIds),
      legacy: async () => legacy.removeUrlIds(urlIds),
    }),
  restoreUndoSnapshot: async (snapshot) =>
    router.write({
      indexeddb: async () => indexeddb.restoreUndoSnapshot(snapshot),
      legacy: async () => legacy.restoreUndoSnapshot(snapshot),
    }),
  saveTabs: async (tabs) =>
    router.write({
      indexeddb: async () => indexeddb.saveTabs(tabs),
      legacy: async () => legacy.saveTabs(tabs),
    }),
  updateTabTimestamps: async (timestamp) =>
    router.write({
      indexeddb: async () => indexeddb.updateTabTimestamps(timestamp),
      legacy: async () => legacy.updateTabTimestamps(timestamp),
    }),
})

const selectedIndexedDbGate: PersistenceOperationGatePort = {
  runIndexedDbRead: async (operation) => operation(),
  runIndexedDbWrite: async (operation) => operation(),
  // eslint-disable-next-line typescript/require-await -- the outer router has already selected IndexedDB
  runLegacyRead: async () => {
    throw new PersistenceUnavailableError('PERSISTENCE_ROUTE_MISMATCH')
  },
  // eslint-disable-next-line typescript/require-await -- the outer router has already selected IndexedDB
  runLegacyWrite: async () => {
    throw new PersistenceUnavailableError('PERSISTENCE_ROUTE_MISMATCH')
  },
}

const createUnavailableDataPlane = (): BackgroundSavedTabsDataPlane => {
  const unavailable = new Proxy(
    {},
    {
      // eslint-disable-next-line typescript/require-await -- fail-closed dynamic bundle rejects every operation
      get: () => async () => {
        throw new PersistenceUnavailableError(
          'PERSISTENCE_CONTROL_STATE_UNAVAILABLE',
        )
      },
    },
  )
  // eslint-disable-next-line typescript/consistent-type-assertions, typescript/no-unsafe-type-assertion -- every data-plane method shares the same fail-closed implementation
  return unavailable as BackgroundSavedTabsDataPlane
}

const createProductionBackgroundSavedTabsDataPlane =
  (): BackgroundSavedTabsDataPlane => {
    const runtime = getPersistenceBootstrapRuntime()
    const storage = getChromeStorageLocal()
    const legacy = storage
      ? createBackgroundSavedTabsLegacyDataPlane({
          idGenerator: () => crypto.randomUUID(),
          legacyStorage: {
            get: async (key) => storage.get(key),
            set: async (items) => storage.set(items),
          },
          now: () => Date.now(),
        })
      : createUnavailableDataPlane()
    const indexeddb = runtime.connectionManager
      ? (() => {
          const snapshotReader = new IndexedDbPersistenceSnapshotReader(
            runtime.connectionManager,
            selectedIndexedDbGate,
          )
          const unitOfWork = createNotifyingPersistenceV2UnitOfWork({
            changePort: createBroadcastChannelPersistenceChangeAdapter(),
            idGenerator: createSystemIdGenerator(),
            onNotificationFailure: (diagnostic) => {
              logger.error(
                'persistence_notification_failed_after_commit',
                diagnostic,
              )
            },
            unitOfWork: new IndexedDbPersistenceUnitOfWork(
              runtime.connectionManager,
              selectedIndexedDbGate,
            ),
          })
          const session = new IndexedDbSavedTabsSessionService({
            snapshotReaderPort: snapshotReader,
            unitOfWorkPort: unitOfWork,
          })
          return createBackgroundSavedTabsIndexedDbDataPlane({
            idGenerator: () => crypto.randomUUID(),
            now: () => Date.now(),
            readSnapshot: async () =>
              snapshotReader.readVerifiedSavedTabsSnapshot(),
            session,
          })
        })()
      : createUnavailableDataPlane()
    return createRouteAwareBackgroundSavedTabsDataPlane({
      indexeddb,
      legacy,
      router: runtime.dataPlaneRouter,
    })
  }

let productionDataPlane: BackgroundSavedTabsDataPlane | undefined

export const getBackgroundSavedTabsDataPlane =
  (): BackgroundSavedTabsDataPlane => {
    productionDataPlane ??= createProductionBackgroundSavedTabsDataPlane()
    return productionDataPlane
  }

export const resetBackgroundSavedTabsDataPlaneForTesting = (): void => {
  productionDataPlane = undefined
}

type _CompatibilityTestFactoryOptions =
  CreateBackgroundSavedTabsDataPlaneOptions
