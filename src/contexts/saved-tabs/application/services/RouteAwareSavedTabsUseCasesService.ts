import { PersistenceUnavailableError } from '@/contexts/saved-tabs/application/errors/PersistenceUnavailableError'
import type { PersistenceDataPlaneRouterPort } from '@/contexts/saved-tabs/application/ports/PersistenceBootstrapPort'
import type { SavedTabsUseCases } from '@/contexts/saved-tabs/application/SavedTabsUseCases'

export type RouteAwareSavedTabsUseCasesOptions = {
  readonly indexeddb?: SavedTabsUseCases
  readonly legacy: SavedTabsUseCases
  readonly router: PersistenceDataPlaneRouterPort
}

const requireIndexedDb = async <Arguments extends unknown[], Result>(
  operation: ((...args: Arguments) => Promise<Result>) | undefined,
  args: Arguments,
): Promise<Result> => {
  if (!operation) {
    throw new PersistenceUnavailableError(
      'PERSISTENCE_CONTROL_STATE_UNAVAILABLE',
    )
  }
  return operation(...args)
}

const routeRead =
  <Arguments extends unknown[], Result>(
    router: PersistenceDataPlaneRouterPort,
    legacy: (...args: Arguments) => Promise<Result>,
    indexeddb?: (...args: Arguments) => Promise<Result>,
  ): ((...args: Arguments) => Promise<Result>) =>
  async (...args) =>
    router.read({
      indexeddb: async () => requireIndexedDb(indexeddb, args),
      legacy: async () => legacy(...args),
    })

const routeWrite =
  <Arguments extends unknown[], Result>(
    router: PersistenceDataPlaneRouterPort,
    legacy: (...args: Arguments) => Promise<Result>,
    indexeddb?: (...args: Arguments) => Promise<Result>,
  ): ((...args: Arguments) => Promise<Result>) =>
  async (...args) =>
    router.write({
      indexeddb: async () => requireIndexedDb(indexeddb, args),
      legacy: async () => legacy(...args),
    })

/**
 * Moves the complete presentation-facing use-case bundle behind one
 * authoritative route. Backend-specific shapes stay behind the two bundles;
 * the returned contract remains `SavedTabsUseCases`.
 */
// eslint-disable-next-line eslint/complexity -- explicit type-safe mapping avoids an unsafe dynamic proxy at this architecture boundary.
export const createRouteAwareSavedTabsUseCases = ({
  indexeddb,
  legacy,
  router,
}: RouteAwareSavedTabsUseCasesOptions): SavedTabsUseCases => ({
  openSavedUrl: routeWrite(
    router,
    legacy.openSavedUrl,
    indexeddb?.openSavedUrl,
  ),
  openAllSavedUrls: routeWrite(
    router,
    legacy.openAllSavedUrls,
    indexeddb?.openAllSavedUrls,
  ),
  deleteTabGroup: routeWrite(
    router,
    legacy.deleteTabGroup,
    indexeddb?.deleteTabGroup,
  ),
  deleteTabGroups: routeWrite(
    router,
    legacy.deleteTabGroups,
    indexeddb?.deleteTabGroups,
  ),
  prepareTabGroupDeletion: routeWrite(
    router,
    legacy.prepareTabGroupDeletion,
    indexeddb?.prepareTabGroupDeletion,
  ),
  prepareTabGroupsDeletion: routeWrite(
    router,
    legacy.prepareTabGroupsDeletion,
    indexeddb?.prepareTabGroupsDeletion,
  ),
  deleteSavedUrl: routeWrite(
    router,
    legacy.deleteSavedUrl,
    indexeddb?.deleteSavedUrl,
  ),
  deleteSavedUrls: routeWrite(
    router,
    legacy.deleteSavedUrls,
    indexeddb?.deleteSavedUrls,
  ),
  restoreOpenedUrlsSnapshot: routeWrite(
    router,
    legacy.restoreOpenedUrlsSnapshot,
    indexeddb?.restoreOpenedUrlsSnapshot,
  ),
  restoreOpenedUrlsSnapshotView: routeWrite(
    router,
    legacy.restoreOpenedUrlsSnapshotView,
    indexeddb?.restoreOpenedUrlsSnapshotView,
  ),
  syncCategoryAssignments: routeWrite(
    router,
    legacy.syncCategoryAssignments,
    indexeddb?.syncCategoryAssignments,
  ),
  removeUnreferencedUrlRecords: routeWrite(
    router,
    legacy.removeUnreferencedUrlRecords,
    indexeddb?.removeUnreferencedUrlRecords,
  ),
  removeUrlsFromCustomProjects: routeWrite(
    router,
    legacy.removeUrlsFromCustomProjects,
    indexeddb?.removeUrlsFromCustomProjects,
  ),
  buildSavedTabsSnapshot: routeRead(
    router,
    legacy.buildSavedTabsSnapshot,
    indexeddb?.buildSavedTabsSnapshot,
  ),
  reorderTabGroups: routeWrite(
    router,
    legacy.reorderTabGroups,
    indexeddb?.reorderTabGroups,
  ),
  reorderParentCategories: routeWrite(
    router,
    legacy.reorderParentCategories,
    indexeddb?.reorderParentCategories,
  ),
  removeSubCategoryFromTabGroups: routeWrite(
    router,
    legacy.removeSubCategoryFromTabGroups,
    indexeddb?.removeSubCategoryFromTabGroups,
  ),
  reorderTabGroupUrls: routeWrite(
    router,
    legacy.reorderTabGroupUrls,
    indexeddb?.reorderTabGroupUrls,
  ),
  loadTabGroupsWithUrls: routeRead(
    router,
    legacy.loadTabGroupsWithUrls,
    indexeddb?.loadTabGroupsWithUrls,
  ),
  loadTabGroupUrls: routeRead(
    router,
    legacy.loadTabGroupUrls,
    indexeddb?.loadTabGroupUrls,
  ),
  findUrlRecordByUrl: routeRead(
    router,
    legacy.findUrlRecordByUrl,
    indexeddb?.findUrlRecordByUrl,
  ),
  setCategoryKeywords: routeWrite(
    router,
    legacy.setCategoryKeywords,
    indexeddb?.setCategoryKeywords,
  ),
  renameParentCategory: routeWrite(
    router,
    legacy.renameParentCategory,
    indexeddb?.renameParentCategory,
  ),
  addDomainToParentCategory: routeWrite(
    router,
    legacy.addDomainToParentCategory,
    indexeddb?.addDomainToParentCategory,
  ),
  removeDomainFromParentCategory: routeWrite(
    router,
    legacy.removeDomainFromParentCategory,
    indexeddb?.removeDomainFromParentCategory,
  ),
  moveDomainBetweenCategories: routeWrite(
    router,
    legacy.moveDomainBetweenCategories,
    indexeddb?.moveDomainBetweenCategories,
  ),
  reorderDomainsInCategory: routeWrite(
    router,
    legacy.reorderDomainsInCategory,
    indexeddb?.reorderDomainsInCategory,
  ),
  removeDomainsFromParentCategories: routeWrite(
    router,
    legacy.removeDomainsFromParentCategories,
    indexeddb?.removeDomainsFromParentCategories,
  ),
  createParentCategory: routeWrite(
    router,
    legacy.createParentCategory,
    indexeddb?.createParentCategory,
  ),
  deleteParentCategory: routeWrite(
    router,
    legacy.deleteParentCategory,
    indexeddb?.deleteParentCategory,
  ),
  assignDomainToCategory: routeWrite(
    router,
    legacy.assignDomainToCategory,
    indexeddb?.assignDomainToCategory,
  ),
  createCustomProject: routeWrite(
    router,
    legacy.createCustomProject,
    indexeddb?.createCustomProject,
  ),
  deleteCustomProject: routeWrite(
    router,
    legacy.deleteCustomProject,
    indexeddb?.deleteCustomProject,
  ),
  updateCustomProjectName: routeWrite(
    router,
    legacy.updateCustomProjectName,
    indexeddb?.updateCustomProjectName,
  ),
  addUrlToCustomProject: routeWrite(
    router,
    legacy.addUrlToCustomProject,
    indexeddb?.addUrlToCustomProject,
  ),
  removeUrlFromCustomProject: routeWrite(
    router,
    legacy.removeUrlFromCustomProject,
    indexeddb?.removeUrlFromCustomProject,
  ),
  removeUrlsFromCustomProject: routeWrite(
    router,
    legacy.removeUrlsFromCustomProject,
    indexeddb?.removeUrlsFromCustomProject,
  ),
  setCustomProjectUrlCategory: routeWrite(
    router,
    legacy.setCustomProjectUrlCategory,
    indexeddb?.setCustomProjectUrlCategory,
  ),
  updateCustomProjectCategoryOrder: routeWrite(
    router,
    legacy.updateCustomProjectCategoryOrder,
    indexeddb?.updateCustomProjectCategoryOrder,
  ),
  reorderCustomProjectUrls: routeWrite(
    router,
    legacy.reorderCustomProjectUrls,
    indexeddb?.reorderCustomProjectUrls,
  ),
  renameCustomProjectCategory: routeWrite(
    router,
    legacy.renameCustomProjectCategory,
    indexeddb?.renameCustomProjectCategory,
  ),
  updateCustomProjectKeywords: routeWrite(
    router,
    legacy.updateCustomProjectKeywords,
    indexeddb?.updateCustomProjectKeywords,
  ),
  addCategoryToCustomProject: routeWrite(
    router,
    legacy.addCategoryToCustomProject,
    indexeddb?.addCategoryToCustomProject,
  ),
  removeCategoryFromCustomProject: routeWrite(
    router,
    legacy.removeCategoryFromCustomProject,
    indexeddb?.removeCategoryFromCustomProject,
  ),
  moveUrlBetweenCustomProjects: routeWrite(
    router,
    legacy.moveUrlBetweenCustomProjects,
    indexeddb?.moveUrlBetweenCustomProjects,
  ),
  getCustomProjects: routeRead(
    router,
    legacy.getCustomProjects,
    indexeddb?.getCustomProjects,
  ),
  getCustomProjectOrder: routeRead(
    router,
    legacy.getCustomProjectOrder,
    indexeddb?.getCustomProjectOrder,
  ),
  getCustomProjectUndoSnapshot: routeRead(
    router,
    legacy.getCustomProjectUndoSnapshot,
    indexeddb?.getCustomProjectUndoSnapshot,
  ),
  getCustomProjectRaws: routeRead(
    router,
    legacy.getCustomProjectRaws,
    indexeddb?.getCustomProjectRaws,
  ),
  saveCustomProjectOrder: routeWrite(
    router,
    legacy.saveCustomProjectOrder,
    indexeddb?.saveCustomProjectOrder,
  ),
  saveCustomProjects: routeWrite(
    router,
    legacy.saveCustomProjects,
    indexeddb?.saveCustomProjects,
  ),
  restoreCustomProjectsSnapshot: routeWrite(
    router,
    legacy.restoreCustomProjectsSnapshot,
    indexeddb?.restoreCustomProjectsSnapshot,
  ),
  getProjectUrls: routeRead(
    router,
    legacy.getProjectUrls,
    indexeddb?.getProjectUrls,
  ),
  getSavedTabsPageData: routeRead(
    router,
    legacy.getSavedTabsPageData,
    indexeddb?.getSavedTabsPageData,
  ),
  getSavedTabs: routeRead(router, legacy.getSavedTabs, indexeddb?.getSavedTabs),
  repairTabGroupParentCategoryIds: routeWrite(
    router,
    legacy.repairTabGroupParentCategoryIds,
    indexeddb?.repairTabGroupParentCategoryIds,
  ),
})
