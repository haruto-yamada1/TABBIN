import type { SavedTabsPresentationPorts } from '@/contexts/saved-tabs/application/ports/SavedTabsPresentationPorts'
import type { SavedTabsUseCases } from '@/contexts/saved-tabs/application/SavedTabsUseCases'
import type { CreateSavedTabsUseCasesDepsOptions } from '@/contexts/saved-tabs/infrastructure/composition/createIndexedDbSavedTabsExternalDeps'
import {
  createIndexedDbSavedTabsUseCases,
  createNativeIndexedDbSavedTabsRuntime,
} from '@/contexts/saved-tabs/infrastructure/composition/createIndexedDbSavedTabsUseCases'
import { createNativeCategoryAssignmentPort } from '@/contexts/saved-tabs/infrastructure/composition/NativeSavedTabsPersistenceAdapters'
import { getPersistenceBootstrapRuntime } from '@/contexts/saved-tabs/infrastructure/composition/persistenceBootstrapRuntime'

export type CreateSavedTabsUseCasesOptions = CreateSavedTabsUseCasesDepsOptions

/** Production composition has one authoritative persistence backend. */
export const createSavedTabsUseCases = (
  options: CreateSavedTabsUseCasesOptions = {},
): SavedTabsUseCases => {
  const runtime = getPersistenceBootstrapRuntime()
  return createIndexedDbSavedTabsUseCases({
    connectionManager: runtime.connectionManager,
    operationGate: runtime.operationGate,
    presentationOptions: options,
  })
}

export const createSavedTabsPresentationComposition = (
  options: CreateSavedTabsUseCasesOptions = {},
): {
  readonly deps: SavedTabsPresentationPorts
  readonly useCases: SavedTabsUseCases
} => {
  const runtime = getPersistenceBootstrapRuntime()
  const native = createNativeIndexedDbSavedTabsRuntime({
    connectionManager: runtime.connectionManager,
    operationGate: runtime.operationGate,
    presentationOptions: options,
  })
  return {
    deps: {
      browserTabPort: native.deps.browserTabPort,
      messagingPort: native.deps.messagingPort,
      storageChangePort: native.deps.storageChangePort,
      categoryAssignmentPort: {
        saveParentCategories: async (categories) =>
          native.session.run(async (state) => {
            await createNativeCategoryAssignmentPort(
              state,
              native.deps,
            ).saveParentCategories(categories)
          }),
        saveTabGroups: async (tabGroups) =>
          native.session.run(async (state) => {
            await createNativeCategoryAssignmentPort(
              state,
              native.deps,
            ).saveTabGroups(tabGroups)
          }),
      },
    },
    useCases: createSavedTabsUseCases(options),
  }
}
