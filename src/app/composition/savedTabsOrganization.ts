import { createPersistenceMutationCoordinator } from '@/contexts/saved-tabs/application/services/PersistenceMutationCoordinatorService'
import { createSavedTabsOrganizationService } from '@/contexts/saved-tabs/application/services/SavedTabsOrganizationService'
import type { SavedTabsOrganizationService } from '@/contexts/saved-tabs/application/services/SavedTabsOrganizationService'
import { createBroadcastChannelPersistenceChangeAdapter } from '@/contexts/saved-tabs/infrastructure/browser/BroadcastChannelPersistenceChangeAdapter'
import { createSystemIdGenerator } from '@/contexts/saved-tabs/infrastructure/browser/SystemIdGeneratorAdapter'
import { getPersistenceBootstrapRuntime } from '@/contexts/saved-tabs/infrastructure/composition/persistenceBootstrapRuntime'
import { IndexedDbPersistenceSnapshotReader } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceSnapshotReader'
import { IndexedDbPersistenceUnitOfWork } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceUnitOfWork'

let productionService: SavedTabsOrganizationService | undefined

export const getSavedTabsOrganizationService =
  (): SavedTabsOrganizationService => {
    if (productionService === undefined) {
      const runtime = getPersistenceBootstrapRuntime()
      const idGenerator = createSystemIdGenerator()
      productionService = createSavedTabsOrganizationService({
        clock: { now: () => Date.now() },
        idGenerator,
        mutationCoordinator: createPersistenceMutationCoordinator({
          changePort: createBroadcastChannelPersistenceChangeAdapter(),
          idGenerator,
          unitOfWork: new IndexedDbPersistenceUnitOfWork(
            runtime.connectionManager,
            runtime.operationGate,
          ),
        }),
        snapshotReader: new IndexedDbPersistenceSnapshotReader(
          runtime.connectionManager,
          runtime.operationGate,
        ),
      })
    }
    return productionService
  }
