import { createGetCustomProjectOrderQuery } from '../../application/queries/GetCustomProjectOrderQuery'
import { createGetCustomProjectRawsQuery } from '../../application/queries/GetCustomProjectRawsQuery'
import { createGetCustomProjectsQuery } from '../../application/queries/GetCustomProjectsQuery'
import { createGetCustomProjectUndoSnapshotQuery } from '../../application/queries/GetCustomProjectUndoSnapshotQuery'
import { createGetSavedTabsPageDataQuery } from '../../application/queries/GetSavedTabsPageDataQuery'
import { createGetSavedTabsQuery } from '../../application/queries/GetSavedTabsQuery'
import type { SavedTabsUseCases } from '../../application/SavedTabsUseCases'
import { createAddDomainToParentCategoryUseCase } from '../../application/use-cases/AddDomainToParentCategoryUseCase'
import { createAssignDomainToCategoryUseCase } from '../../application/use-cases/AssignDomainToCategoryUseCase'
import { createBuildSavedTabsSnapshotUseCase } from '../../application/use-cases/BuildSavedTabsSnapshotUseCase'
import { createCreateCustomProjectUseCase } from '../../application/use-cases/CreateCustomProjectUseCase'
import { createCreateParentCategoryUseCase } from '../../application/use-cases/CreateParentCategoryUseCase'
import { createDeleteCustomProjectUseCase } from '../../application/use-cases/DeleteCustomProjectUseCase'
import { createDeleteParentCategoryUseCase } from '../../application/use-cases/DeleteParentCategoryUseCase'
import { createDeleteSavedUrlsUseCase } from '../../application/use-cases/DeleteSavedUrlsUseCase'
import { createDeleteSavedUrlUseCase } from '../../application/use-cases/DeleteSavedUrlUseCase'
import { createDeleteTabGroupsUseCase } from '../../application/use-cases/DeleteTabGroupsUseCase'
import { createDeleteTabGroupUseCase } from '../../application/use-cases/DeleteTabGroupUseCase'
import { createFindUrlRecordByUrlUseCase } from '../../application/use-cases/FindUrlRecordByUrlUseCase'
import { createGetProjectUrlsUseCase } from '../../application/use-cases/GetProjectUrlsUseCase'
import { createLoadTabGroupsWithUrlsUseCase } from '../../application/use-cases/LoadTabGroupsWithUrlsUseCase'
import { createLoadTabGroupUrlsUseCase } from '../../application/use-cases/LoadTabGroupUrlsUseCase'
import { createMoveDomainBetweenCategoriesUseCase } from '../../application/use-cases/MoveDomainBetweenCategoriesUseCase'
import { createOpenAllSavedUrlsUseCase } from '../../application/use-cases/OpenAllSavedUrlsUseCase'
import { createOpenSavedUrlUseCase } from '../../application/use-cases/OpenSavedUrlUseCase'
import { createPrepareTabGroupDeletionUseCase } from '../../application/use-cases/PrepareTabGroupDeletionUseCase'
import { createPrepareTabGroupsDeletionUseCase } from '../../application/use-cases/PrepareTabGroupsDeletionUseCase'
import { createRemoveDomainFromParentCategoryUseCase } from '../../application/use-cases/RemoveDomainFromParentCategoryUseCase'
import { createRemoveDomainsFromParentCategoriesUseCase } from '../../application/use-cases/RemoveDomainsFromParentCategoriesUseCase'
import { createRemoveSubCategoryFromTabGroupsUseCase } from '../../application/use-cases/RemoveSubCategoryFromTabGroupsUseCase'
import { createRemoveUnreferencedUrlRecordsUseCase } from '../../application/use-cases/RemoveUnreferencedUrlRecordsUseCase'
import { createRemoveUrlsFromCustomProjectsUseCase } from '../../application/use-cases/RemoveUrlsFromCustomProjectsUseCase'
import { createRenameParentCategoryUseCase } from '../../application/use-cases/RenameParentCategoryUseCase'
import { createReorderDomainsInCategoryUseCase } from '../../application/use-cases/ReorderDomainsInCategoryUseCase'
import { createReorderParentCategoriesUseCase } from '../../application/use-cases/ReorderParentCategoriesUseCase'
import { createReorderTabGroupsUseCase } from '../../application/use-cases/ReorderTabGroupsUseCase'
import { createReorderTabGroupUrlsUseCase } from '../../application/use-cases/ReorderTabGroupUrlsUseCase'
import { createRepairTabGroupParentCategoryIdsUseCase } from '../../application/use-cases/RepairTabGroupParentCategoryIdsUseCase'
import { createRestoreCustomProjectsSnapshotUseCase } from '../../application/use-cases/RestoreCustomProjectsSnapshotUseCase'
import { createRestoreOpenedUrlsSnapshotUseCase } from '../../application/use-cases/RestoreOpenedUrlsSnapshotUseCase'
import { createRestoreOpenedUrlsSnapshotViewUseCase } from '../../application/use-cases/RestoreOpenedUrlsSnapshotViewUseCase'
import { createSaveCustomProjectOrderUseCase } from '../../application/use-cases/SaveCustomProjectOrderUseCase'
import { createSaveCustomProjectsUseCase } from '../../application/use-cases/SaveCustomProjectsUseCase'
import { createSetCategoryKeywordsUseCase } from '../../application/use-cases/SetCategoryKeywordsUseCase'
import { createSyncCategoryAssignmentsUseCase } from '../../application/use-cases/SyncCategoryAssignmentsUseCase'
import { createUpdateCustomProjectNameUseCase } from '../../application/use-cases/UpdateCustomProjectNameUseCase'
import type { SavedTabsUseCasesDeps } from './createSavedTabsUseCasesDeps'

/**
 * presentation 層（controller hook / page）へ公開する SavedTabs の
 * 主要 use-case バンドル interface の re-export。
 *
 * `SavedTabsUseCases` interface の source of truth は
 * `application/SavedTabsUseCases.ts` に集約し、ここでは依存先
 * import を壊さないための型 re-export だけを保つ。`SavedTabsUseCases` を
 * `infrastructure/composition/` 配下から import している既存テスト
 * （`useSavedTabsController.test.ts` など）の互換性維持が目的。
 */
export type { SavedTabsUseCases }

/**
 * `SavedTabsUseCasesDeps` から `SavedTabsUseCases` を組み立てる composition 関数。
 *
 * `application` 層は React / chrome.* に依存しない pure な use-case なので、
 * ここで関数バインドを行い、controller hook 側では「関数を受け取って呼ぶ」だけに閉じる。
 *
 * @example
 * ```ts
 * const deps = createSavedTabsUseCasesDeps()
 * const useCases = createSavedTabsUseCases(deps)
 * await useCases.openSavedUrl({ urlRecordId, origin: 'click', settings })
 * ```
 */
export const createSavedTabsUseCases = (
  deps: SavedTabsUseCasesDeps,
): SavedTabsUseCases => ({
  addDomainToParentCategory: createAddDomainToParentCategoryUseCase({
    parentCategoryRepository: deps.parentCategoryRepository,
  }),
  assignDomainToCategory: createAssignDomainToCategoryUseCase({
    domainCategoryMappingRepository: deps.domainCategoryMappingRepository,
    parentCategoryRepository: deps.parentCategoryRepository,
    tabGroupRepository: deps.tabGroupRepository,
  }),
  buildSavedTabsSnapshot: createBuildSavedTabsSnapshotUseCase({
    customProjectRepository: deps.customProjectRepository,
    parentCategoryRepository: deps.parentCategoryRepository,
    tabGroupRepository: deps.tabGroupRepository,
    urlRecordRepository: deps.urlRecordRepository,
  }),
  createCustomProject: createCreateCustomProjectUseCase({
    customProjectRepository: deps.customProjectRepository,
  }),
  createParentCategory: createCreateParentCategoryUseCase({
    generateId: () => crypto.randomUUID(),
    parentCategoryRepository: deps.parentCategoryRepository,
  }),
  deleteCustomProject: createDeleteCustomProjectUseCase({
    customProjectRepository: deps.customProjectRepository,
    uncategorizedProjectId:
      // `lib/storage/projects` 側の sentinel に揃える。`chrome.storage.local`
      // 上に必ず存在するシステム予約 project として、id 文字列を
      // そのまま port 実装に伝搬する。
      'custom-uncategorized',
  }),
  deleteParentCategory: createDeleteParentCategoryUseCase({
    parentCategoryRepository: deps.parentCategoryRepository,
  }),
  deleteSavedUrl: createDeleteSavedUrlUseCase({
    customProjectRepository: deps.customProjectRepository,
    tabGroupRepository: deps.tabGroupRepository,
    urlRecordRepository: deps.urlRecordRepository,
  }),
  deleteSavedUrls: createDeleteSavedUrlsUseCase({
    customProjectRepository: deps.customProjectRepository,
    tabGroupRepository: deps.tabGroupRepository,
    urlRecordRepository: deps.urlRecordRepository,
  }),
  deleteTabGroup: createDeleteTabGroupUseCase({
    customProjectRepository: deps.customProjectRepository,
    tabGroupRepository: deps.tabGroupRepository,
    urlRecordRepository: deps.urlRecordRepository,
  }),
  deleteTabGroups: createDeleteTabGroupsUseCase({
    customProjectRepository: deps.customProjectRepository,
    tabGroupRepository: deps.tabGroupRepository,
    urlRecordRepository: deps.urlRecordRepository,
  }),
  findUrlRecordByUrl: createFindUrlRecordByUrlUseCase({
    urlRecordRepository: deps.urlRecordRepository,
  }),
  getProjectUrls: createGetProjectUrlsUseCase({
    customProjectRepository: deps.customProjectRepository,
    urlRecordRepository: deps.urlRecordRepository,
  }),
  getCustomProjects: createGetCustomProjectsQuery({
    customProjectRepository: deps.customProjectRepository,
  }),
  getCustomProjectOrder: createGetCustomProjectOrderQuery({
    customProjectRepository: deps.customProjectRepository,
  }),
  getCustomProjectUndoSnapshot: createGetCustomProjectUndoSnapshotQuery({
    customProjectRepository: deps.customProjectRepository,
  }),
  getCustomProjectRaws: createGetCustomProjectRawsQuery({
    customProjectRepository: deps.customProjectRepository,
  }),
  saveCustomProjectOrder: createSaveCustomProjectOrderUseCase({
    customProjectRepository: deps.customProjectRepository,
  }),
  saveCustomProjects: createSaveCustomProjectsUseCase({
    customProjectRepository: deps.customProjectRepository,
  }),
  restoreCustomProjectsSnapshot: createRestoreCustomProjectsSnapshotUseCase({
    customProjectRepository: deps.customProjectRepository,
  }),
  getSavedTabsPageData: createGetSavedTabsPageDataQuery({
    parentCategoryRepository: deps.parentCategoryRepository,
    tabGroupRepository: deps.tabGroupRepository,
    userSettingsRepository: deps.userSettingsRepository,
  }),
  getSavedTabs: createGetSavedTabsQuery({
    tabGroupRepository: deps.tabGroupRepository,
  }),
  repairTabGroupParentCategoryIds: createRepairTabGroupParentCategoryIdsUseCase(
    {
      parentCategoryRepository: deps.parentCategoryRepository,
      tabGroupRepository: deps.tabGroupRepository,
    },
  ),
  loadTabGroupUrls: createLoadTabGroupUrlsUseCase({
    urlRecordRepository: deps.urlRecordRepository,
  }),
  loadTabGroupsWithUrls: createLoadTabGroupsWithUrlsUseCase({
    urlRecordRepository: deps.urlRecordRepository,
  }),
  openAllSavedUrls: createOpenAllSavedUrlsUseCase({
    browserTabPort: deps.browserTabPort,
    browserWindowPort: deps.browserWindowPort,
    customProjectRepository: deps.customProjectRepository,
    tabGroupRepository: deps.tabGroupRepository,
    urlRecordRepository: deps.urlRecordRepository,
  }),
  openSavedUrl: createOpenSavedUrlUseCase({
    browserTabPort: deps.browserTabPort,
    customProjectRepository: deps.customProjectRepository,
    tabGroupRepository: deps.tabGroupRepository,
    urlRecordRepository: deps.urlRecordRepository,
  }),
  prepareTabGroupDeletion: createPrepareTabGroupDeletionUseCase({
    categoriesCommandService: deps.categoriesCommandService,
    domainCategoryMappingRepository: deps.domainCategoryMappingRepository,
    parentCategoryRepository: deps.parentCategoryRepository,
    tabGroupRepository: deps.tabGroupRepository,
  }),
  prepareTabGroupsDeletion: createPrepareTabGroupsDeletionUseCase({
    categoriesCommandService: deps.categoriesCommandService,
    domainCategoryMappingRepository: deps.domainCategoryMappingRepository,
    parentCategoryRepository: deps.parentCategoryRepository,
    tabGroupRepository: deps.tabGroupRepository,
  }),
  removeDomainFromParentCategory: createRemoveDomainFromParentCategoryUseCase({
    parentCategoryRepository: deps.parentCategoryRepository,
  }),
  removeDomainsFromParentCategories:
    createRemoveDomainsFromParentCategoriesUseCase({
      parentCategoryRepository: deps.parentCategoryRepository,
    }),
  removeUnreferencedUrlRecords: createRemoveUnreferencedUrlRecordsUseCase({
    customProjectRepository: deps.customProjectRepository,
    tabGroupRepository: deps.tabGroupRepository,
    urlRecordRepository: deps.urlRecordRepository,
  }),
  removeUrlsFromCustomProjects: createRemoveUrlsFromCustomProjectsUseCase({
    customProjectsCommandService: deps.customProjectsCommandService,
    loadTabGroupUrls: createLoadTabGroupUrlsUseCase({
      urlRecordRepository: deps.urlRecordRepository,
    }),
  }),
  renameParentCategory: createRenameParentCategoryUseCase({
    parentCategoryRepository: deps.parentCategoryRepository,
  }),
  moveDomainBetweenCategories: createMoveDomainBetweenCategoriesUseCase({
    parentCategoryRepository: deps.parentCategoryRepository,
  }),
  reorderDomainsInCategory: createReorderDomainsInCategoryUseCase({
    parentCategoryRepository: deps.parentCategoryRepository,
  }),
  reorderTabGroupUrls: createReorderTabGroupUrlsUseCase({
    tabGroupRepository: deps.tabGroupRepository,
    urlRecordRepository: deps.urlRecordRepository,
  }),
  reorderTabGroups: createReorderTabGroupsUseCase({
    tabGroupRepository: deps.tabGroupRepository,
  }),
  reorderParentCategories: createReorderParentCategoriesUseCase({
    parentCategoryRepository: deps.parentCategoryRepository,
  }),
  removeSubCategoryFromTabGroups: createRemoveSubCategoryFromTabGroupsUseCase({
    removeSubCategoryFromTabGroupPort: deps.removeSubCategoryFromTabGroupPort,
  }),
  restoreOpenedUrlsSnapshot: createRestoreOpenedUrlsSnapshotUseCase({
    customProjectRepository: deps.customProjectRepository,
    parentCategoryRepository: deps.parentCategoryRepository,
    tabGroupRepository: deps.tabGroupRepository,
    urlRecordRepository: deps.urlRecordRepository,
  }),
  restoreOpenedUrlsSnapshotView: (() => {
    const restoreOpenedUrlsSnapshot = createRestoreOpenedUrlsSnapshotUseCase({
      customProjectRepository: deps.customProjectRepository,
      parentCategoryRepository: deps.parentCategoryRepository,
      tabGroupRepository: deps.tabGroupRepository,
      urlRecordRepository: deps.urlRecordRepository,
    })
    return createRestoreOpenedUrlsSnapshotViewUseCase({
      restoreOpenedUrlsSnapshot,
    })
  })(),
  setCategoryKeywords: createSetCategoryKeywordsUseCase({
    setCategoryKeywordsPort: deps.setCategoryKeywordsPort,
  }),
  syncCategoryAssignments: createSyncCategoryAssignmentsUseCase({
    parentCategoryRepository: deps.parentCategoryRepository,
    tabGroupRepository: deps.tabGroupRepository,
  }),
  updateCustomProjectName: createUpdateCustomProjectNameUseCase({
    customProjectRepository: deps.customProjectRepository,
  }),
})
