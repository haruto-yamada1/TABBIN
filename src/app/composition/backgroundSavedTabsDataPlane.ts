import { createBroadcastChannelPersistenceChangeAdapter } from '@/contexts/saved-tabs/infrastructure/browser/BroadcastChannelPersistenceChangeAdapter'
import { createSystemIdGenerator } from '@/contexts/saved-tabs/infrastructure/browser/SystemIdGeneratorAdapter'
import { createNotifyingPersistenceV2UnitOfWork } from '@/contexts/saved-tabs/infrastructure/composition/createNotifyingPersistenceV2UnitOfWork'
import { IndexedDbSavedTabsSessionService } from '@/contexts/saved-tabs/infrastructure/composition/IndexedDbSavedTabsSessionService'
import { getPersistenceBootstrapRuntime } from '@/contexts/saved-tabs/infrastructure/composition/persistenceBootstrapRuntime'
import { IndexedDbPersistenceSnapshotReader } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceSnapshotReader'
import { IndexedDbPersistenceUnitOfWork } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceUnitOfWork'
import { logger } from '@/lib/logging/logger'

import type { BackgroundSavedTabsDataPlane } from './backgroundSavedTabsDataPlaneTypes'
import { createBackgroundSavedTabsIndexedDbDataPlane } from './backgroundSavedTabsIndexedDbDataPlane'

export type {
  BackgroundSavedTabInput,
  BackgroundSavedTabsDataPlane,
  SavedTabsAnalyticsMetric,
  SavedTabsAnalyticsRecord,
  SavedTabsInsightRecord,
} from './backgroundSavedTabsDataPlaneTypes'

const createProductionBackgroundSavedTabsDataPlane =
  (): BackgroundSavedTabsDataPlane => {
    const runtime = getPersistenceBootstrapRuntime()
    const snapshotReader = new IndexedDbPersistenceSnapshotReader(
      runtime.connectionManager,
      runtime.operationGate,
    )
    const unitOfWork = createNotifyingPersistenceV2UnitOfWork({
      changePort: createBroadcastChannelPersistenceChangeAdapter(),
      idGenerator: createSystemIdGenerator(),
      onNotificationFailure: (diagnostic) => {
        logger.error('persistence_notification_failed_after_commit', diagnostic)
      },
      unitOfWork: new IndexedDbPersistenceUnitOfWork(
        runtime.connectionManager,
        runtime.operationGate,
      ),
    })
    return createBackgroundSavedTabsIndexedDbDataPlane({
      idGenerator: () => crypto.randomUUID(),
      now: () => Date.now(),
      readSnapshot: async () => snapshotReader.readVerifiedSavedTabsSnapshot(),
      session: new IndexedDbSavedTabsSessionService({
        snapshotReaderPort: snapshotReader,
        unitOfWorkPort: unitOfWork,
      }),
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
