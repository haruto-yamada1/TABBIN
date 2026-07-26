import type { PersistenceOperationGatePort } from '@/contexts/saved-tabs/application/ports/PersistenceBootstrapPort'

export const createReadyPersistenceOperationGateStub =
  (): PersistenceOperationGatePort => ({
    runIndexedDbRead: async (operation) => operation(),
    runIndexedDbWrite: async (operation) => operation(),
    runLegacyRead: async (operation) => operation(),
    runLegacyWrite: async (operation) => operation(),
  })
