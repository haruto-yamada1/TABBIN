import type { SavedTabsUseCases } from '@/contexts/saved-tabs/application/SavedTabsUseCases'
import { createDeleteTabGroupUseCase } from '@/contexts/saved-tabs/application/use-cases/DeleteTabGroupUseCase'
import { createOpenSavedUrlUseCase } from '@/contexts/saved-tabs/application/use-cases/OpenSavedUrlUseCase'
import { createRemoveUnreferencedUrlRecordsUseCase } from '@/contexts/saved-tabs/application/use-cases/RemoveUnreferencedUrlRecordsUseCase'
import { createRestoreOpenedUrlsSnapshotUseCase } from '@/contexts/saved-tabs/application/use-cases/RestoreOpenedUrlsSnapshotUseCase'
import { createSyncCategoryAssignmentsUseCase } from '@/contexts/saved-tabs/application/use-cases/SyncCategoryAssignmentsUseCase'

import { createSavedTabsPorts } from './createSavedTabsPorts'
import { createSavedTabsRepositories } from './createSavedTabsRepositories'

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
 * @example
 * ```ts
 * const useCases = createSavedTabsUseCases()
 * await useCases.openSavedUrl({ urlRecordId, origin: 'click', settings })
 * ```
 */
export const createSavedTabsUseCases = (): SavedTabsUseCases => {
  const repositories = createSavedTabsRepositories()
  const ports = createSavedTabsPorts()

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
