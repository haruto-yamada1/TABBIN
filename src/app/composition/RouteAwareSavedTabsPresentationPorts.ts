import type { PersistenceDataPlaneRouterPort } from '@/contexts/saved-tabs/application/ports/PersistenceBootstrapPort'
import type { SavedTabsPresentationPorts } from '@/contexts/saved-tabs/application/ports/SavedTabsPresentationPorts'
import type {
  StorageChangePort,
  TypedSavedTabsStorageChange,
} from '@/contexts/saved-tabs/application/ports/StorageChangePort'

type PersistencePresentationPorts = Pick<
  SavedTabsPresentationPorts,
  'categoryAssignmentPort' | 'migrationPort' | 'storageChangePort'
>

export type RouteAwareSavedTabsPresentationPortsOptions = {
  readonly indexeddb: PersistencePresentationPorts
  readonly legacy: PersistencePresentationPorts
  readonly onRoutingFailure: (error: unknown) => void
  readonly router: PersistenceDataPlaneRouterPort
}

export const createRouteAwareSavedTabsPresentationPorts = ({
  indexeddb,
  legacy,
  onRoutingFailure,
  router,
}: RouteAwareSavedTabsPresentationPortsOptions): PersistencePresentationPorts => {
  const routeChange = (
    route: 'indexeddb' | 'legacy',
    listener: (changes: readonly TypedSavedTabsStorageChange[]) => void,
    changes: readonly TypedSavedTabsStorageChange[],
  ): void => {
    const settingsChanges = changes.filter(
      (change) => change.key === 'userSettings',
    )
    if (route === 'legacy' && settingsChanges.length > 0) {
      listener(settingsChanges)
    }
    const persistenceChanges = changes.filter(
      (change) => change.key !== 'userSettings',
    )
    if (persistenceChanges.length === 0) {
      return
    }
    void router
      .read({
        indexeddb: async () => {
          await Promise.resolve()
          if (route === 'indexeddb') {
            listener(persistenceChanges)
          }
        },
        legacy: async () => {
          await Promise.resolve()
          if (route === 'legacy') {
            listener(persistenceChanges)
          }
        },
      })
      .catch(onRoutingFailure)
  }

  const storageChangePort: StorageChangePort = {
    subscribe: (listener) => {
      const unsubscribeLegacy = legacy.storageChangePort.subscribe(
        (changes) => {
          routeChange('legacy', listener, changes)
        },
      )
      const unsubscribeIndexedDb = indexeddb.storageChangePort.subscribe(
        (changes) => {
          routeChange('indexeddb', listener, changes)
        },
      )
      return () => {
        unsubscribeLegacy()
        unsubscribeIndexedDb()
      }
    },
  }

  return {
    categoryAssignmentPort: {
      saveParentCategories: async (categories) =>
        router.write({
          indexeddb: async () =>
            indexeddb.categoryAssignmentPort.saveParentCategories(categories),
          legacy: async () =>
            legacy.categoryAssignmentPort.saveParentCategories(categories),
        }),
      saveTabGroups: async (tabGroups) =>
        router.write({
          indexeddb: async () =>
            indexeddb.categoryAssignmentPort.saveTabGroups(tabGroups),
          legacy: async () =>
            legacy.categoryAssignmentPort.saveTabGroups(tabGroups),
        }),
    },
    migrationPort: {
      migrateDomainStorageToHostname: async () =>
        router.write({
          indexeddb: indexeddb.migrationPort.migrateDomainStorageToHostname,
          legacy: legacy.migrationPort.migrateDomainStorageToHostname,
        }),
      migrateParentCategoriesToDomainNames: async () =>
        router.write({
          indexeddb:
            indexeddb.migrationPort.migrateParentCategoriesToDomainNames,
          legacy: legacy.migrationPort.migrateParentCategoriesToDomainNames,
        }),
      migrateToUrlsStorage: async () =>
        router.write({
          indexeddb: indexeddb.migrationPort.migrateToUrlsStorage,
          legacy: legacy.migrationPort.migrateToUrlsStorage,
        }),
    },
    storageChangePort,
  }
}
