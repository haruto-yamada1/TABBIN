import { createDeleteTabGroupUseCase } from '../../application/use-cases/DeleteTabGroupUseCase'
import type { DeleteTabGroupUseCase } from '../../application/use-cases/DeleteTabGroupUseCase'
import { createOpenSavedUrlUseCase } from '../../application/use-cases/OpenSavedUrlUseCase'
import type { OpenSavedUrlUseCase } from '../../application/use-cases/OpenSavedUrlUseCase'
import { createRemoveUnreferencedUrlRecordsUseCase } from '../../application/use-cases/RemoveUnreferencedUrlRecordsUseCase'
import type { RemoveUnreferencedUrlRecordsUseCase } from '../../application/use-cases/RemoveUnreferencedUrlRecordsUseCase'
import { createRestoreOpenedUrlsSnapshotUseCase } from '../../application/use-cases/RestoreOpenedUrlsSnapshotUseCase'
import type { RestoreOpenedUrlsSnapshotUseCase } from '../../application/use-cases/RestoreOpenedUrlsSnapshotUseCase'
import { createSyncCategoryAssignmentsUseCase } from '../../application/use-cases/SyncCategoryAssignmentsUseCase'
import type { SyncCategoryAssignmentsUseCase } from '../../application/use-cases/SyncCategoryAssignmentsUseCase'
import type { SavedTabsUseCasesDeps } from './createSavedTabsUseCasesDeps'

/**
 * presentation 層（controller hook / page）へ公開する SavedTabs の
 * 主要 use-case バンドル。
 *
 * 各 use-case は repository 実装と port 実装を
 * `createSavedTabsUseCasesDeps()` から受け取り、純関数として保持する。
 * React 側はこのバンドルから個別 use-case を取り出して呼び出す。
 */
export interface SavedTabsUseCases {
  readonly openSavedUrl: OpenSavedUrlUseCase
  readonly deleteTabGroup: DeleteTabGroupUseCase
  readonly restoreOpenedUrlsSnapshot: RestoreOpenedUrlsSnapshotUseCase
  readonly syncCategoryAssignments: SyncCategoryAssignmentsUseCase
  readonly removeUnreferencedUrlRecords: RemoveUnreferencedUrlRecordsUseCase
}

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
  deleteTabGroup: createDeleteTabGroupUseCase({
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
