import type { SavedTabsPresentationPorts } from '@/contexts/saved-tabs/application/ports/SavedTabsPresentationPorts'
import type { SavedTabsUseCases } from '@/contexts/saved-tabs/application/SavedTabsUseCases'

export const createSavedTabsUseCasesStub = (
  overrides: Partial<SavedTabsUseCases> = {},
): SavedTabsUseCases =>
  // eslint-disable-next-line typescript/no-unsafe-type-assertion -- test-only fail-fast proxy implements the full public boundary lazily
  new Proxy(overrides, {
    get(target, property, receiver) {
      if (Reflect.has(target, property)) {
        return Reflect.get(target, property, receiver)
      }
      return () => {
        throw new Error(`SavedTabsUseCases.${String(property)} is not stubbed`)
      }
    },
  }) as SavedTabsUseCases

export const createSavedTabsPresentationPortsStub = (
  overrides: Partial<SavedTabsPresentationPorts> = {},
): SavedTabsPresentationPorts => ({
  browserTabPort: overrides.browserTabPort ?? {
    open: async ({ url }) => ({ url }),
  },
  categoryAssignmentPort: overrides.categoryAssignmentPort ?? {
    saveParentCategories: async () => {},
    saveTabGroups: async () => {},
  },
  messagingPort: overrides.messagingPort ?? {
    send: async () => undefined,
  },
  migrationPort: overrides.migrationPort ?? {
    migrateParentCategoriesToDomainNames: async () => {},
    migrateToUrlsStorage: async () => {},
    migrateDomainStorageToHostname: async () => {},
  },
  storageChangePort: overrides.storageChangePort ?? {
    subscribe: () => () => {},
  },
})
