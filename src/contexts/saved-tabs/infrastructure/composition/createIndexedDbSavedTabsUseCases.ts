import { createSavedTabsUseCases as createApplicationSavedTabsUseCases } from '@/contexts/saved-tabs/application/createSavedTabsUseCases'
import type { IndexedDbSavedTabsDataPlaneDeps } from '@/contexts/saved-tabs/application/IndexedDbSavedTabsDataPlaneDeps'
import type { PersistenceOperationGatePort } from '@/contexts/saved-tabs/application/ports/PersistenceBootstrapPort'
import type { SavedTabsUseCases } from '@/contexts/saved-tabs/application/SavedTabsUseCases'
import { createBroadcastChannelPersistenceChangeAdapter } from '@/contexts/saved-tabs/infrastructure/browser/BroadcastChannelPersistenceChangeAdapter'
import { createPersistenceChangeStorageAdapter } from '@/contexts/saved-tabs/infrastructure/browser/PersistenceChangeStorageAdapter'
import { createSystemIdGenerator } from '@/contexts/saved-tabs/infrastructure/browser/SystemIdGeneratorAdapter'
import type { IndexedDbConnectionManager } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbConnectionManager'
import { IndexedDbPersistenceSnapshotReader } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceSnapshotReader'
import { IndexedDbPersistenceUnitOfWork } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceUnitOfWork'
import { IndexedDbSavedTabsQueryAdapter } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbSavedTabsQueryAdapter'
import { logger } from '@/lib/logging/logger'

import { createIndexedDbSavedTabsExternalDeps } from './createIndexedDbSavedTabsExternalDeps'
import type { CreateSavedTabsUseCasesDepsOptions } from './createIndexedDbSavedTabsExternalDeps'
import { createNotifyingPersistenceV2UnitOfWork } from './createNotifyingPersistenceV2UnitOfWork'
import { IndexedDbSavedTabsSessionService } from './IndexedDbSavedTabsSessionService'
import { createNativeSavedTabsPersistenceAdapters } from './NativeSavedTabsPersistenceAdapters'

export type CreateIndexedDbSavedTabsUseCasesOptions = {
  readonly connectionManager: IndexedDbConnectionManager
  readonly operationGate: PersistenceOperationGatePort
  readonly presentationOptions?: CreateSavedTabsUseCasesDepsOptions
}

export type NativeIndexedDbSavedTabsRuntime = {
  readonly deps: IndexedDbSavedTabsDataPlaneDeps
  readonly session: IndexedDbSavedTabsSessionService
}

export const createNativeIndexedDbSavedTabsRuntime = ({
  connectionManager,
  operationGate: gate,
  presentationOptions = {},
}: CreateIndexedDbSavedTabsUseCasesOptions): NativeIndexedDbSavedTabsRuntime => {
  const snapshotReader = new IndexedDbPersistenceSnapshotReader(
    connectionManager,
    gate,
  )
  const queryPort = new IndexedDbSavedTabsQueryAdapter(snapshotReader)
  const changePort = createBroadcastChannelPersistenceChangeAdapter()
  const unitOfWorkPort = createNotifyingPersistenceV2UnitOfWork({
    changePort,
    idGenerator: createSystemIdGenerator(),
    onNotificationFailure: (diagnostic) => {
      logger.error('persistence_notification_failed_after_commit', diagnostic)
    },
    unitOfWork: new IndexedDbPersistenceUnitOfWork(connectionManager, gate),
  })
  const deps: IndexedDbSavedTabsDataPlaneDeps = {
    ...createIndexedDbSavedTabsExternalDeps(
      createPersistenceChangeStorageAdapter(changePort),
      presentationOptions,
    ),
    queryPort,
    unitOfWorkPort,
  }
  return {
    deps,
    session: new IndexedDbSavedTabsSessionService({
      snapshotReaderPort: snapshotReader,
      unitOfWorkPort,
    }),
  }
}

export const createIndexedDbSavedTabsUseCases = (
  options: CreateIndexedDbSavedTabsUseCasesOptions,
): SavedTabsUseCases => {
  const runtime = createNativeIndexedDbSavedTabsRuntime(options)
  const sessionBacked = new Proxy(
    {},
    {
      get: (_target, property): unknown => {
        if (typeof property !== 'string') {
          return undefined
        }
        return async (...args: readonly unknown[]): Promise<unknown> =>
          runtime.session.run(async (state) => {
            const useCases = createApplicationSavedTabsUseCases(
              createNativeSavedTabsPersistenceAdapters(state, runtime.deps),
            )
            const operation: unknown = Reflect.get(useCases, property)
            if (typeof operation !== 'function') {
              throw new TypeError(`Unknown Saved Tabs operation: ${property}`)
            }
            const invoked: unknown = Reflect.apply(operation, useCases, args)
            const result = await Promise.resolve(invoked)
            return result
          })
      },
    },
  )
  // eslint-disable-next-line typescript/consistent-type-assertions, typescript/no-unsafe-type-assertion -- dynamic dispatch covers the complete SavedTabsUseCases operation table
  return sessionBacked as SavedTabsUseCases
}
