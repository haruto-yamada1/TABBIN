import type { SavedTabsUseCases } from '@/contexts/saved-tabs/application/SavedTabsUseCases'
import { createBuildSavedTabsSnapshotUseCase } from '@/contexts/saved-tabs/application/use-cases/BuildSavedTabsSnapshotUseCase'
import { createDeleteSavedUrlsUseCase } from '@/contexts/saved-tabs/application/use-cases/DeleteSavedUrlsUseCase'
import { createDeleteSavedUrlUseCase } from '@/contexts/saved-tabs/application/use-cases/DeleteSavedUrlUseCase'
import { createDeleteTabGroupsUseCase } from '@/contexts/saved-tabs/application/use-cases/DeleteTabGroupsUseCase'
import { createDeleteTabGroupUseCase } from '@/contexts/saved-tabs/application/use-cases/DeleteTabGroupUseCase'
import { createFindUrlRecordByUrlUseCase } from '@/contexts/saved-tabs/application/use-cases/FindUrlRecordByUrlUseCase'
import { createLoadTabGroupsWithUrlsUseCase } from '@/contexts/saved-tabs/application/use-cases/LoadTabGroupsWithUrlsUseCase'
import { createLoadTabGroupUrlsUseCase } from '@/contexts/saved-tabs/application/use-cases/LoadTabGroupUrlsUseCase'
import { createOpenAllSavedUrlsUseCase } from '@/contexts/saved-tabs/application/use-cases/OpenAllSavedUrlsUseCase'
import { createOpenSavedUrlUseCase } from '@/contexts/saved-tabs/application/use-cases/OpenSavedUrlUseCase'
import { createRemoveUnreferencedUrlRecordsUseCase } from '@/contexts/saved-tabs/application/use-cases/RemoveUnreferencedUrlRecordsUseCase'
import { createReorderTabGroupsUseCase } from '@/contexts/saved-tabs/application/use-cases/ReorderTabGroupsUseCase'
import { createReorderTabGroupUrlsUseCase } from '@/contexts/saved-tabs/application/use-cases/ReorderTabGroupUrlsUseCase'
import { createRestoreOpenedUrlsSnapshotUseCase } from '@/contexts/saved-tabs/application/use-cases/RestoreOpenedUrlsSnapshotUseCase'
import { createSetCategoryKeywordsUseCase } from '@/contexts/saved-tabs/application/use-cases/SetCategoryKeywordsUseCase'
import { createSyncCategoryAssignmentsUseCase } from '@/contexts/saved-tabs/application/use-cases/SyncCategoryAssignmentsUseCase'
import { createLibSetCategoryKeywordsAdapter } from '@/contexts/saved-tabs/infrastructure/persistence/chrome-storage/ChromeSetCategoryKeywordsAdapter'

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
 * `chrome.tabs` / `chrome.windows` / `sonner` ベースの port 実装を
 * 1 度だけ組み立て、そこから `saved-tabs` の優先 use-case を生成して返す。
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
    buildSavedTabsSnapshot: createBuildSavedTabsSnapshotUseCase({
      customProjectRepository: repositories.customProjectRepository,
      parentCategoryRepository: repositories.parentCategoryRepository,
      tabGroupRepository: repositories.tabGroupRepository,
      urlRecordRepository: repositories.urlRecordRepository,
    }),
    deleteSavedUrl: createDeleteSavedUrlUseCase({
      customProjectRepository: repositories.customProjectRepository,
      tabGroupRepository: repositories.tabGroupRepository,
      urlRecordRepository: repositories.urlRecordRepository,
    }),
    deleteSavedUrls: createDeleteSavedUrlsUseCase({
      customProjectRepository: repositories.customProjectRepository,
      tabGroupRepository: repositories.tabGroupRepository,
      urlRecordRepository: repositories.urlRecordRepository,
    }),
    deleteTabGroup: createDeleteTabGroupUseCase({
      customProjectRepository: repositories.customProjectRepository,
      tabGroupRepository: repositories.tabGroupRepository,
      urlRecordRepository: repositories.urlRecordRepository,
    }),
    deleteTabGroups: createDeleteTabGroupsUseCase({
      customProjectRepository: repositories.customProjectRepository,
      tabGroupRepository: repositories.tabGroupRepository,
      urlRecordRepository: repositories.urlRecordRepository,
    }),
    findUrlRecordByUrl: createFindUrlRecordByUrlUseCase({
      urlRecordRepository: repositories.urlRecordRepository,
    }),
    loadTabGroupUrls: createLoadTabGroupUrlsUseCase({
      urlRecordRepository: repositories.urlRecordRepository,
    }),
    loadTabGroupsWithUrls: createLoadTabGroupsWithUrlsUseCase({
      urlRecordRepository: repositories.urlRecordRepository,
    }),
    openAllSavedUrls: createOpenAllSavedUrlsUseCase({
      browserTabPort: ports.browserTabPort,
      browserWindowPort: ports.browserWindowPort,
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
    reorderTabGroupUrls: createReorderTabGroupUrlsUseCase({
      tabGroupRepository: repositories.tabGroupRepository,
      urlRecordRepository: repositories.urlRecordRepository,
    }),
    reorderTabGroups: createReorderTabGroupsUseCase({
      tabGroupRepository: repositories.tabGroupRepository,
    }),
    restoreOpenedUrlsSnapshot: createRestoreOpenedUrlsSnapshotUseCase({
      customProjectRepository: repositories.customProjectRepository,
      parentCategoryRepository: repositories.parentCategoryRepository,
      tabGroupRepository: repositories.tabGroupRepository,
      urlRecordRepository: repositories.urlRecordRepository,
    }),
    setCategoryKeywords: createSetCategoryKeywordsUseCase({
      setCategoryKeywordsPort: createLibSetCategoryKeywordsAdapter(),
    }),
    syncCategoryAssignments: createSyncCategoryAssignmentsUseCase({
      parentCategoryRepository: repositories.parentCategoryRepository,
      tabGroupRepository: repositories.tabGroupRepository,
    }),
  }
}
