import type { SavedTabsUseCases } from '@/contexts/saved-tabs/application/SavedTabsUseCases'
import { createDeleteTabGroupUseCase } from '@/contexts/saved-tabs/application/use-cases/DeleteTabGroupUseCase'
import { createOpenSavedUrlUseCase } from '@/contexts/saved-tabs/application/use-cases/OpenSavedUrlUseCase'
import { createRemoveUnreferencedUrlRecordsUseCase } from '@/contexts/saved-tabs/application/use-cases/RemoveUnreferencedUrlRecordsUseCase'
import { createRestoreOpenedUrlsSnapshotUseCase } from '@/contexts/saved-tabs/application/use-cases/RestoreOpenedUrlsSnapshotUseCase'
import { createSyncCategoryAssignmentsUseCase } from '@/contexts/saved-tabs/application/use-cases/SyncCategoryAssignmentsUseCase'

import { createSavedTabsPorts } from './createSavedTabsPorts'
import { createSavedTabsRepositories } from './createSavedTabsRepositories'

/**
 * `createSavedTabsUseCases` 呼び出し時に渡せる任意設定。
 *
 * presentation 層が `openUrlInBackground` 設定をランタイムで反映するため、
 * `resolveActive` を渡せるようにしている。`BrowserTabPort` の adapter に
 * 委譲される。`createSavedTabsPorts` の同名 option と同じ意味。
 */
export interface CreateSavedTabsUseCasesOptions {
  readonly resolveActive?: () => boolean
}

/**
 * `src/app/composition/` レベルの composition root。
 *
 * `chrome.storage.local` ベースの repository 実装と
 * `chrome.tabs` / `sonner` ベースの port 実装を 1 度だけ組み立て、
 * そこから `saved-tabs` の優先 use-case 5 種を生成して返す。
 *
 * この関数以降、UI / hook / テストは
 * `chrome.*` API を直接触れず、use-case だけを呼び出す形になる。
 *
 * `options.resolveActive` を渡すと presentation 層が `openUrlInBackground`
 * のような設定値をランタイムで `BrowserTabPort` に反映できる。
 *
 * @example
 * ```ts
 * const useCases = createSavedTabsUseCases({
 *   resolveActive: () => !settings.openUrlInBackground,
 * })
 * await useCases.openSavedUrl({ urlRecordId, origin: 'click', settings })
 * ```
 */
export const createSavedTabsUseCases = (
  options: CreateSavedTabsUseCasesOptions = {},
): SavedTabsUseCases => {
  const repositories = createSavedTabsRepositories()
  const ports = createSavedTabsPorts(
    options.resolveActive ? { resolveActive: options.resolveActive } : {},
  )

  return {
    deleteTabGroup: createDeleteTabGroupUseCase({
      customProjectRepository: repositories.customProjectRepository,
      tabGroupRepository: repositories.tabGroupRepository,
      urlRecordRepository: repositories.urlRecordRepository,
    }),
    openSavedUrl: createOpenSavedUrlUseCase({
      browserTabPort: ports.browserTabPort,
      customProjectRepository: repositories.customProjectRepository,
      tabGroupRepository: repositories.tabGroupRepository,
      urlRecordRepository: repositories.urlRecordRepository,
    }),
    removeUnreferencedUrlRecords: createRemoveUnreferencedUrlRecordsUseCase({
      customProjectRepository: repositories.customProjectRepository,
      tabGroupRepository: repositories.tabGroupRepository,
      urlRecordRepository: repositories.urlRecordRepository,
    }),
    restoreOpenedUrlsSnapshot: createRestoreOpenedUrlsSnapshotUseCase({
      customProjectRepository: repositories.customProjectRepository,
      parentCategoryRepository: repositories.parentCategoryRepository,
      tabGroupRepository: repositories.tabGroupRepository,
      urlRecordRepository: repositories.urlRecordRepository,
    }),
    syncCategoryAssignments: createSyncCategoryAssignmentsUseCase({
      parentCategoryRepository: repositories.parentCategoryRepository,
      tabGroupRepository: repositories.tabGroupRepository,
    }),
  }
}
