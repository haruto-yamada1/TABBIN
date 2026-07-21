import {
  getPersistenceStorageLocal as getContextPersistenceStorageLocal,
  getRequiredPersistenceStorageLocal as getRequiredContextPersistenceStorageLocal,
} from '@/contexts/saved-tabs/infrastructure/composition/persistenceBootstrapRuntime'
import type { PersistenceStorageLocal } from '@/contexts/saved-tabs/infrastructure/composition/persistenceBootstrapRuntime'

export const getPersistenceStorageLocal = (): PersistenceStorageLocal | null =>
  getContextPersistenceStorageLocal()

export const getRequiredPersistenceStorageLocal = (): PersistenceStorageLocal =>
  getRequiredContextPersistenceStorageLocal()
