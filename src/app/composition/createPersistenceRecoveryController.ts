import type { PersistenceRecoveryControllerPort } from '@/contexts/saved-tabs/application/ports/PersistenceBootstrapPort'
import { getPersistenceBootstrapRuntime } from '@/contexts/saved-tabs/infrastructure/composition/persistenceBootstrapRuntime'

export const getPersistenceRecoveryController =
  (): PersistenceRecoveryControllerPort =>
    getPersistenceBootstrapRuntime().recovery
