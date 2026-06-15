import type { GetSavedTabsPageDataQuery } from './queries/GetSavedTabsPageDataQuery'
import type { AddDomainToParentCategoryUseCase } from './use-cases/AddDomainToParentCategoryUseCase'
import type { AssignDomainToCategoryUseCase } from './use-cases/AssignDomainToCategoryUseCase'
import type { BuildSavedTabsSnapshotUseCase } from './use-cases/BuildSavedTabsSnapshotUseCase'
import type { CreateCustomProjectUseCase } from './use-cases/CreateCustomProjectUseCase'
import type { CreateParentCategoryUseCase } from './use-cases/CreateParentCategoryUseCase'
import type { DeleteCustomProjectUseCase } from './use-cases/DeleteCustomProjectUseCase'
import type { DeleteParentCategoryUseCase } from './use-cases/DeleteParentCategoryUseCase'
import type { DeleteSavedUrlsUseCase } from './use-cases/DeleteSavedUrlsUseCase'
import type { DeleteSavedUrlUseCase } from './use-cases/DeleteSavedUrlUseCase'
import type { DeleteTabGroupsUseCase } from './use-cases/DeleteTabGroupsUseCase'
import type { DeleteTabGroupUseCase } from './use-cases/DeleteTabGroupUseCase'
import type { FindUrlRecordByUrlUseCase } from './use-cases/FindUrlRecordByUrlUseCase'
import type { GetProjectUrlsUseCase } from './use-cases/GetProjectUrlsUseCase'
import type { LoadTabGroupsWithUrlsUseCase } from './use-cases/LoadTabGroupsWithUrlsUseCase'
import type { LoadTabGroupUrlsUseCase } from './use-cases/LoadTabGroupUrlsUseCase'
import type { OpenAllSavedUrlsUseCase } from './use-cases/OpenAllSavedUrlsUseCase'
import type { OpenSavedUrlUseCase } from './use-cases/OpenSavedUrlUseCase'
import type { RemoveDomainFromParentCategoryUseCase } from './use-cases/RemoveDomainFromParentCategoryUseCase'
import type { RemoveUnreferencedUrlRecordsUseCase } from './use-cases/RemoveUnreferencedUrlRecordsUseCase'
import type { RenameParentCategoryUseCase } from './use-cases/RenameParentCategoryUseCase'
import type { ReorderTabGroupsUseCase } from './use-cases/ReorderTabGroupsUseCase'
import type { ReorderTabGroupUrlsUseCase } from './use-cases/ReorderTabGroupUrlsUseCase'
import type { RestoreOpenedUrlsSnapshotUseCase } from './use-cases/RestoreOpenedUrlsSnapshotUseCase'
import type { SetCategoryKeywordsUseCase } from './use-cases/SetCategoryKeywordsUseCase'
import type { SyncCategoryAssignmentsUseCase } from './use-cases/SyncCategoryAssignmentsUseCase'
import type { UpdateCustomProjectNameUseCase } from './use-cases/UpdateCustomProjectNameUseCase'

/**
 * `saved-tabs` の優先 use-case を 1 つに束ねたバンドル interface。
 *
 * presentation / composition 層はこの interface 越しに use-case を受け取り、
 * UI からは個別関数を呼び出す。`domain` 層・`application` 層には
 * React / chrome.* / storage への直接依存を持ち込まない方針のため、
 * この interface も pure な関数シグネチャだけを公開する。
 *
 * バンドル化することで:
 * - composition root からの取得窓口を 1 つに絞り、
 *   個別 use-case を presentation 各所から個別 import する散らかりを防ぐ。
 * - presentation hook の dependency array に use-case オブジェクトを 1 個
 *   渡せば済む形にして、テスト時の差し替えを簡単にする。
 * - 新しい use-case を追加するときに presentation 側の import 修正を
 *   最小化（必要なら interface に追加するだけ）する。
 *
 * 実装は `src/contexts/saved-tabs/infrastructure/composition/createSavedTabsUseCases.ts`
 * および `src/app/composition/createSavedTabsUseCases.ts` が提供する。
 */
export interface SavedTabsUseCases {
  readonly openSavedUrl: OpenSavedUrlUseCase
  readonly openAllSavedUrls: OpenAllSavedUrlsUseCase
  readonly deleteTabGroup: DeleteTabGroupUseCase
  readonly deleteTabGroups: DeleteTabGroupsUseCase
  readonly deleteSavedUrl: DeleteSavedUrlUseCase
  readonly deleteSavedUrls: DeleteSavedUrlsUseCase
  readonly restoreOpenedUrlsSnapshot: RestoreOpenedUrlsSnapshotUseCase
  readonly syncCategoryAssignments: SyncCategoryAssignmentsUseCase
  readonly removeUnreferencedUrlRecords: RemoveUnreferencedUrlRecordsUseCase
  readonly buildSavedTabsSnapshot: BuildSavedTabsSnapshotUseCase
  readonly reorderTabGroups: ReorderTabGroupsUseCase
  readonly reorderTabGroupUrls: ReorderTabGroupUrlsUseCase
  readonly loadTabGroupsWithUrls: LoadTabGroupsWithUrlsUseCase
  readonly loadTabGroupUrls: LoadTabGroupUrlsUseCase
  readonly findUrlRecordByUrl: FindUrlRecordByUrlUseCase
  readonly setCategoryKeywords: SetCategoryKeywordsUseCase
  readonly renameParentCategory: RenameParentCategoryUseCase
  readonly addDomainToParentCategory: AddDomainToParentCategoryUseCase
  readonly removeDomainFromParentCategory: RemoveDomainFromParentCategoryUseCase
  readonly createParentCategory: CreateParentCategoryUseCase
  readonly deleteParentCategory: DeleteParentCategoryUseCase
  readonly assignDomainToCategory: AssignDomainToCategoryUseCase
  readonly createCustomProject: CreateCustomProjectUseCase
  readonly deleteCustomProject: DeleteCustomProjectUseCase
  readonly updateCustomProjectName: UpdateCustomProjectNameUseCase
  readonly getProjectUrls: GetProjectUrlsUseCase
  readonly getSavedTabsPageData: GetSavedTabsPageDataQuery
}
