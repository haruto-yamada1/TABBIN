import {
  getPersistenceStorageLocal as getContextPersistenceStorageLocal,
  getRequiredPersistenceStorageLocal as getRequiredContextPersistenceStorageLocal,
} from '@/contexts/saved-tabs/infrastructure/composition/persistenceBootstrapRuntime'

export const getPersistenceStorageLocal = ():
  | typeof chrome.storage.local
  | null => getContextPersistenceStorageLocal()

export const getRequiredPersistenceStorageLocal =
  (): typeof chrome.storage.local => getRequiredContextPersistenceStorageLocal()
