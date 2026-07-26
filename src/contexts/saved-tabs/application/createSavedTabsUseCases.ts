import { toSavedTabsDisplayTabGroupDto } from './mappers/SavedTabsPresentationMapper'
import { createGetCustomProjectOrderQuery } from './queries/GetCustomProjectOrderQuery'
import { createGetCustomProjectRawsQuery } from './queries/GetCustomProjectRawsQuery'
import { createGetCustomProjectsQuery } from './queries/GetCustomProjectsQuery'
import { createGetCustomProjectUndoSnapshotQuery } from './queries/GetCustomProjectUndoSnapshotQuery'
import { createGetSavedTabsPageDataQuery } from './queries/GetSavedTabsPageDataQuery'
import { createGetSavedTabsQuery } from './queries/GetSavedTabsQuery'
import type { SavedTabsUseCases } from './SavedTabsUseCases'
import type { SavedTabsUseCasesDeps } from './SavedTabsUseCasesDeps'
import { createAddCategoryToCustomProjectUseCase } from './use-cases/AddCategoryToCustomProjectUseCase'
import { createAddDomainToParentCategoryUseCase } from './use-cases/AddDomainToParentCategoryUseCase'
import { createAddUrlToCustomProjectUseCase } from './use-cases/AddUrlToCustomProjectUseCase'
import { createAssignDomainToCategoryUseCase } from './use-cases/AssignDomainToCategoryUseCase'
import { createBuildSavedTabsSnapshotUseCase } from './use-cases/BuildSavedTabsSnapshotUseCase'
import { createCreateCustomProjectUseCase } from './use-cases/CreateCustomProjectUseCase'
import { createCreateParentCategoryUseCase } from './use-cases/CreateParentCategoryUseCase'
import { createDeleteCustomProjectUseCase } from './use-cases/DeleteCustomProjectUseCase'
import { createDeleteParentCategoryUseCase } from './use-cases/DeleteParentCategoryUseCase'
import { createDeleteSavedUrlsUseCase } from './use-cases/DeleteSavedUrlsUseCase'
import { createDeleteSavedUrlUseCase } from './use-cases/DeleteSavedUrlUseCase'
import { createDeleteTabGroupsUseCase } from './use-cases/DeleteTabGroupsUseCase'
import { createDeleteTabGroupUseCase } from './use-cases/DeleteTabGroupUseCase'
import { createFindUrlRecordByUrlUseCase } from './use-cases/FindUrlRecordByUrlUseCase'
import { createGetProjectUrlsUseCase } from './use-cases/GetProjectUrlsUseCase'
import { createLoadTabGroupsWithUrlsUseCase } from './use-cases/LoadTabGroupsWithUrlsUseCase'
import { createLoadTabGroupUrlsUseCase } from './use-cases/LoadTabGroupUrlsUseCase'
import { createMoveDomainBetweenCategoriesUseCase } from './use-cases/MoveDomainBetweenCategoriesUseCase'
import { createMoveUrlBetweenCustomProjectsUseCase } from './use-cases/MoveUrlBetweenCustomProjectsUseCase'
import { createOpenAllSavedUrlsUseCase } from './use-cases/OpenAllSavedUrlsUseCase'
import { createOpenSavedUrlUseCase } from './use-cases/OpenSavedUrlUseCase'
import { createPrepareTabGroupDeletionUseCase } from './use-cases/PrepareTabGroupDeletionUseCase'
import { createPrepareTabGroupsDeletionUseCase } from './use-cases/PrepareTabGroupsDeletionUseCase'
import { createRemoveCategoryFromCustomProjectUseCase } from './use-cases/RemoveCategoryFromCustomProjectUseCase'
import { createRemoveDomainFromParentCategoryUseCase } from './use-cases/RemoveDomainFromParentCategoryUseCase'
import { createRemoveDomainsFromParentCategoriesUseCase } from './use-cases/RemoveDomainsFromParentCategoriesUseCase'
import { createRemoveSubCategoryFromTabGroupsUseCase } from './use-cases/RemoveSubCategoryFromTabGroupsUseCase'
import { createRemoveUnreferencedUrlRecordsUseCase } from './use-cases/RemoveUnreferencedUrlRecordsUseCase'
import { createRemoveUrlFromCustomProjectUseCase } from './use-cases/RemoveUrlFromCustomProjectUseCase'
import { createRemoveUrlsFromCustomProjectsUseCase } from './use-cases/RemoveUrlsFromCustomProjectsUseCase'
import { createRemoveUrlsFromCustomProjectUseCase } from './use-cases/RemoveUrlsFromCustomProjectUseCase'
import { createRenameCustomProjectCategoryUseCase } from './use-cases/RenameCustomProjectCategoryUseCase'
import { createRenameParentCategoryUseCase } from './use-cases/RenameParentCategoryUseCase'
import { createReorderCustomProjectUrlsUseCase } from './use-cases/ReorderCustomProjectUrlsUseCase'
import { createReorderDomainsInCategoryUseCase } from './use-cases/ReorderDomainsInCategoryUseCase'
import { createReorderParentCategoriesUseCase } from './use-cases/ReorderParentCategoriesUseCase'
import { createReorderTabGroupsUseCase } from './use-cases/ReorderTabGroupsUseCase'
import { createReorderTabGroupUrlsUseCase } from './use-cases/ReorderTabGroupUrlsUseCase'
import { createRepairTabGroupParentCategoryIdsUseCase } from './use-cases/RepairTabGroupParentCategoryIdsUseCase'
import { createRestoreCustomProjectsSnapshotUseCase } from './use-cases/RestoreCustomProjectsSnapshotUseCase'
import { createRestoreOpenedUrlsSnapshotUseCase } from './use-cases/RestoreOpenedUrlsSnapshotUseCase'
import { createRestoreOpenedUrlsSnapshotViewUseCase } from './use-cases/RestoreOpenedUrlsSnapshotViewUseCase'
import { createSaveCustomProjectOrderUseCase } from './use-cases/SaveCustomProjectOrderUseCase'
import { createSaveCustomProjectsUseCase } from './use-cases/SaveCustomProjectsUseCase'
import { createSetCategoryKeywordsUseCase } from './use-cases/SetCategoryKeywordsUseCase'
import { createSetCustomProjectUrlCategoryUseCase } from './use-cases/SetCustomProjectUrlCategoryUseCase'
import { createSyncCategoryAssignmentsUseCase } from './use-cases/SyncCategoryAssignmentsUseCase'
import { createUpdateCustomProjectCategoryOrderUseCase } from './use-cases/UpdateCustomProjectCategoryOrderUseCase'
import { createUpdateCustomProjectKeywordsUseCase } from './use-cases/UpdateCustomProjectKeywordsUseCase'
import { createUpdateCustomProjectNameUseCase } from './use-cases/UpdateCustomProjectNameUseCase'

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
    clock: deps.clock,
    customProjectRepository: deps.customProjectRepository,
    idGenerator: deps.idGenerator,
  }),
  createParentCategory: createCreateParentCategoryUseCase({
    idGenerator: deps.idGenerator,
    parentCategoryRepository: deps.parentCategoryRepository,
  }),
  deleteCustomProject: createDeleteCustomProjectUseCase({
    clock: deps.clock,
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
    tabGroupReadPort: deps.savedTabsTabGroupReadPort ?? {
      findAll: async () =>
        (await deps.tabGroupRepository.findAll()).map(
          toSavedTabsDisplayTabGroupDto,
        ),
    },
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
  // issue #539: CustomProject URL / カテゴリ操作 use-case 群。port
  // (customProjectsCommandService) 経由の呼び出しを application
  // use-case へ移設し、presentation 層は use-case 関数だけを受ける形
  // に統一する。
  addUrlToCustomProject: createAddUrlToCustomProjectUseCase({
    customProjectsCommandService: deps.customProjectsCommandService,
  }),
  removeUrlFromCustomProject: createRemoveUrlFromCustomProjectUseCase({
    customProjectsCommandService: deps.customProjectsCommandService,
  }),
  removeUrlsFromCustomProject: createRemoveUrlsFromCustomProjectUseCase({
    customProjectsCommandService: deps.customProjectsCommandService,
  }),
  setCustomProjectUrlCategory: createSetCustomProjectUrlCategoryUseCase({
    customProjectsCommandService: deps.customProjectsCommandService,
  }),
  updateCustomProjectCategoryOrder:
    createUpdateCustomProjectCategoryOrderUseCase({
      customProjectsCommandService: deps.customProjectsCommandService,
    }),
  reorderCustomProjectUrls: createReorderCustomProjectUrlsUseCase({
    customProjectsCommandService: deps.customProjectsCommandService,
  }),
  renameCustomProjectCategory: createRenameCustomProjectCategoryUseCase({
    customProjectsCommandService: deps.customProjectsCommandService,
  }),
  updateCustomProjectKeywords: createUpdateCustomProjectKeywordsUseCase({
    customProjectsCommandService: deps.customProjectsCommandService,
  }),
  // issue #540: 旧 `useProjectManagement` 配下に残っていた
  // `CustomProjectsCommandService` 直叩き 2 操作
  // (`addCategoryToProject` / `removeCategoryFromProject`) を
  // application use-case へ移設し、presentation 層が port
  // (`CustomProjectsCommandService`) を直接 import しない形へ
  // 統一する。
  addCategoryToCustomProject: createAddCategoryToCustomProjectUseCase({
    customProjectsCommandService: deps.customProjectsCommandService,
  }),
  removeCategoryFromCustomProject: createRemoveCategoryFromCustomProjectUseCase(
    {
      customProjectsCommandService: deps.customProjectsCommandService,
    },
  ),
  // issue #540: 旧 `SavedTabsApp.handleMoveUrlBetweenProjects` 内
  // の `customProjectsCommandService.moveUrlBetweenCustomProjects`
  // 直叩きを application use-case へ移設し、`SavedTabsApp` が port
  // を直接扱わない構成に寄せる。
  moveUrlBetweenCustomProjects: createMoveUrlBetweenCustomProjectsUseCase({
    customProjectsCommandService: deps.customProjectsCommandService,
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
    clock: deps.clock,
    customProjectRepository: deps.customProjectRepository,
  }),
})
