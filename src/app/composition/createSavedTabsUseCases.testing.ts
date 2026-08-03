import { createSavedTabsUseCases as createApplicationSavedTabsUseCases } from '@/contexts/saved-tabs/application/createSavedTabsUseCases'
import type { PersistenceDataPlaneRouterPort } from '@/contexts/saved-tabs/application/ports/PersistenceBootstrapPort'
import type { SavedTabsUseCases } from '@/contexts/saved-tabs/application/SavedTabsUseCases'
import { createRouteAwareSavedTabsUseCases } from '@/contexts/saved-tabs/application/services/RouteAwareSavedTabsUseCasesService'
import { createSelectedLegacySavedTabsUseCasesDeps } from '@/contexts/saved-tabs/infrastructure/composition/createSavedTabsUseCasesDeps'
import type { CreateSavedTabsUseCasesDepsOptions } from '@/contexts/saved-tabs/infrastructure/composition/createSavedTabsUseCasesDeps'

export type CreateRouteAwareSavedTabsUseCasesForTestingOptions = {
  readonly indexeddb: SavedTabsUseCases
  readonly legacyOptions?: CreateSavedTabsUseCasesDepsOptions
  readonly router: PersistenceDataPlaneRouterPort
}

/**
 * Integration seam for #722 and migration smoke tests.
 *
 * Production composition never accepts an alternate cutover policy or an
 * injected IndexedDB bundle. Tests can combine this factory with the explicit
 * complete-cutover bootstrap testing factory and a real IndexedDB use-case
 * bundle without changing the production default.
 */
export const createRouteAwareSavedTabsUseCasesForTesting = (
  options: CreateRouteAwareSavedTabsUseCasesForTestingOptions,
): SavedTabsUseCases =>
  createRouteAwareSavedTabsUseCases({
    indexeddb: options.indexeddb,
    legacy: createApplicationSavedTabsUseCases(
      createSelectedLegacySavedTabsUseCasesDeps(options.legacyOptions),
    ),
    router: options.router,
  })
