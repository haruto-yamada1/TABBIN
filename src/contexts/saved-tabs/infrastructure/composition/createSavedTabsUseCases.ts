import type { SavedTabsUseCases } from '../../application/SavedTabsUseCases'
import { createBuildSavedTabsSnapshotUseCase } from '../../application/use-cases/BuildSavedTabsSnapshotUseCase'
import { createDeleteSavedUrlsUseCase } from '../../application/use-cases/DeleteSavedUrlsUseCase'
import { createDeleteSavedUrlUseCase } from '../../application/use-cases/DeleteSavedUrlUseCase'
import { createDeleteTabGroupsUseCase } from '../../application/use-cases/DeleteTabGroupsUseCase'
import { createDeleteTabGroupUseCase } from '../../application/use-cases/DeleteTabGroupUseCase'
import { createOpenAllSavedUrlsUseCase } from '../../application/use-cases/OpenAllSavedUrlsUseCase'
import { createOpenSavedUrlUseCase } from '../../application/use-cases/OpenSavedUrlUseCase'
import { createRemoveUnreferencedUrlRecordsUseCase } from '../../application/use-cases/RemoveUnreferencedUrlRecordsUseCase'
import { createReorderTabGroupsUseCase } from '../../application/use-cases/ReorderTabGroupsUseCase'
import { createRestoreOpenedUrlsSnapshotUseCase } from '../../application/use-cases/RestoreOpenedUrlsSnapshotUseCase'
import { createSyncCategoryAssignmentsUseCase } from '../../application/use-cases/SyncCategoryAssignmentsUseCase'
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
  buildSavedTabsSnapshot: createBuildSavedTabsSnapshotUseCase({
    customProjectRepository: deps.customProjectRepository,
    parentCategoryRepository: deps.parentCategoryRepository,
    tabGroupRepository: deps.tabGroupRepository,
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
  removeUnreferencedUrlRecords: createRemoveUnreferencedUrlRecordsUseCase({
    customProjectRepository: deps.customProjectRepository,
    tabGroupRepository: deps.tabGroupRepository,
    urlRecordRepository: deps.urlRecordRepository,
  }),
  reorderTabGroups: createReorderTabGroupsUseCase({
    tabGroupRepository: deps.tabGroupRepository,
  }),
  restoreOpenedUrlsSnapshot: createRestoreOpenedUrlsSnapshotUseCase({
    customProjectRepository: deps.customProjectRepository,
    parentCategoryRepository: deps.parentCategoryRepository,
    tabGroupRepository: deps.tabGroupRepository,
    urlRecordRepository: deps.urlRecordRepository,
  }),
  syncCategoryAssignments: createSyncCategoryAssignmentsUseCase({
    parentCategoryRepository: deps.parentCategoryRepository,
    tabGroupRepository: deps.tabGroupRepository,
  }),
})
