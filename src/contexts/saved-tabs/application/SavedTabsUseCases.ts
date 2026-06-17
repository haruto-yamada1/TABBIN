import type { GetCustomProjectOrderQuery } from './queries/GetCustomProjectOrderQuery'
import type { GetCustomProjectRawsQuery } from './queries/GetCustomProjectRawsQuery'
import type { GetCustomProjectsQuery } from './queries/GetCustomProjectsQuery'
import type { GetCustomProjectUndoSnapshotQuery } from './queries/GetCustomProjectUndoSnapshotQuery'
import type { GetSavedTabsPageDataQuery } from './queries/GetSavedTabsPageDataQuery'
import type { GetSavedTabsQuery } from './queries/GetSavedTabsQuery'
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
import type { MoveDomainBetweenCategoriesUseCase } from './use-cases/MoveDomainBetweenCategoriesUseCase'
import type { OpenAllSavedUrlsUseCase } from './use-cases/OpenAllSavedUrlsUseCase'
import type { OpenSavedUrlUseCase } from './use-cases/OpenSavedUrlUseCase'
import type { PrepareTabGroupDeletionUseCase } from './use-cases/PrepareTabGroupDeletionUseCase'
import type { PrepareTabGroupsDeletionUseCase } from './use-cases/PrepareTabGroupsDeletionUseCase'
import type { RemoveDomainFromParentCategoryUseCase } from './use-cases/RemoveDomainFromParentCategoryUseCase'
import type { RemoveDomainsFromParentCategoriesUseCase } from './use-cases/RemoveDomainsFromParentCategoriesUseCase'
import type { RemoveSubCategoryFromTabGroupsUseCase } from './use-cases/RemoveSubCategoryFromTabGroupsUseCase'
import type { RemoveUnreferencedUrlRecordsUseCase } from './use-cases/RemoveUnreferencedUrlRecordsUseCase'
import type { RemoveUrlsFromCustomProjectsUseCase } from './use-cases/RemoveUrlsFromCustomProjectsUseCase'
import type { RenameParentCategoryUseCase } from './use-cases/RenameParentCategoryUseCase'
import type { ReorderDomainsInCategoryUseCase } from './use-cases/ReorderDomainsInCategoryUseCase'
import type { ReorderParentCategoriesUseCase } from './use-cases/ReorderParentCategoriesUseCase'
import type { ReorderTabGroupsUseCase } from './use-cases/ReorderTabGroupsUseCase'
import type { ReorderTabGroupUrlsUseCase } from './use-cases/ReorderTabGroupUrlsUseCase'
import type { RepairTabGroupParentCategoryIdsUseCase } from './use-cases/RepairTabGroupParentCategoryIdsUseCase'
import type { RestoreCustomProjectsSnapshotUseCase } from './use-cases/RestoreCustomProjectsSnapshotUseCase'
import type { RestoreOpenedUrlsSnapshotUseCase } from './use-cases/RestoreOpenedUrlsSnapshotUseCase'
import type { RestoreOpenedUrlsSnapshotViewUseCase } from './use-cases/RestoreOpenedUrlsSnapshotViewUseCase'
import type { SaveCustomProjectOrderUseCase } from './use-cases/SaveCustomProjectOrderUseCase'
import type { SaveCustomProjectsUseCase } from './use-cases/SaveCustomProjectsUseCase'
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
  /**
   * 単一 TabGroup 削除前に走る application 側副作用 use-case (issue #524)。
   * 旧 `presentation/lib/tab-operations.handleTabGroupRemoval` の
   * 責務 (`CategoriesCommandService.updateDomainCategorySettings` /
   * 親カテゴリ `domainNames` への `domain` 追加 /
   * `DomainCategoryMapping` の差し替え) を application 層へ移設する。
   * 削除本体 (`savedTabs` / `urlRecords` 削除) は
   * `DeleteTabGroupUseCase` 側に残す。
   */
  readonly prepareTabGroupDeletion: PrepareTabGroupDeletionUseCase
  /**
   * 複数 TabGroup 削除前に走る application 側副作用 use-case (issue #524)。
   * 単数版 `prepareTabGroupDeletion` を bulk で orchestration する。
   */
  readonly prepareTabGroupsDeletion: PrepareTabGroupsDeletionUseCase
  readonly deleteSavedUrl: DeleteSavedUrlUseCase
  readonly deleteSavedUrls: DeleteSavedUrlsUseCase
  readonly restoreOpenedUrlsSnapshot: RestoreOpenedUrlsSnapshotUseCase
  readonly restoreOpenedUrlsSnapshotView: RestoreOpenedUrlsSnapshotViewUseCase
  readonly syncCategoryAssignments: SyncCategoryAssignmentsUseCase
  readonly removeUnreferencedUrlRecords: RemoveUnreferencedUrlRecordsUseCase
  readonly removeUrlsFromCustomProjects: RemoveUrlsFromCustomProjectsUseCase
  readonly buildSavedTabsSnapshot: BuildSavedTabsSnapshotUseCase
  readonly reorderTabGroups: ReorderTabGroupsUseCase
  /**
   * 親カテゴリの並び替え保存 use-case (issue #519)。
   * 旧 `useCategoryManagement.handleConfirmCategoryReorder` 内の
   * `categoryAssignmentPort.saveParentCategories` 直叩きを置換する。
   */
  readonly reorderParentCategories: ReorderParentCategoriesUseCase
  /**
   * カテゴリ削除時の `TabGroup` 更新 use-case (issue #519)。
   * 旧 `useCategoryManagement.handleDeleteCategory` 内の
   * `removeSubCategoryFromGroup` pure logic と
   * `categoryAssignmentPort.saveTabGroups` 直叩きを置換する。
   */
  readonly removeSubCategoryFromTabGroups: RemoveSubCategoryFromTabGroupsUseCase
  readonly reorderTabGroupUrls: ReorderTabGroupUrlsUseCase
  readonly loadTabGroupsWithUrls: LoadTabGroupsWithUrlsUseCase
  readonly loadTabGroupUrls: LoadTabGroupUrlsUseCase
  readonly findUrlRecordByUrl: FindUrlRecordByUrlUseCase
  readonly setCategoryKeywords: SetCategoryKeywordsUseCase
  readonly renameParentCategory: RenameParentCategoryUseCase
  readonly addDomainToParentCategory: AddDomainToParentCategoryUseCase
  readonly removeDomainFromParentCategory: RemoveDomainFromParentCategoryUseCase
  /**
   * カテゴリ間のドメイン移動 use-case (issue #525)。
   * 旧 `useCategoryManagement.handleMoveDomainToCategory` 内の
   * `tabGroups` 引き当て / `domains` / `domainNames` 移動 /
   * `reorderParentCategoriesUseCase` 直叩きを 1 つの application
   * use-case に統合する。
   */
  readonly moveDomainBetweenCategories: MoveDomainBetweenCategoriesUseCase
  /**
   * カテゴリ内ドメイン順序更新 use-case (issue #525)。
   * 旧 `useCategoryManagement.handleUpdateDomainsOrder` 内の
   * 並び替え / `reorderParentCategoriesUseCase` 直叩きを
   * application use-case へ統合する。
   */
  readonly reorderDomainsInCategory: ReorderDomainsInCategoryUseCase
  /**
   * 親カテゴリの `domains` (TabGroupId 配列) から指定 ID を横断削除する
   * use-case (issue #523)。
   * 旧 `SavedTabsApp.removeDomainFromParentCategories` ヘルパーと
   * `handleDeleteGroups` 内の `parentCategoryRepository.saveAll` 直叩きを
   * 1 つの bulk use-case に統一する。
   */
  readonly removeDomainsFromParentCategories: RemoveDomainsFromParentCategoriesUseCase
  readonly createParentCategory: CreateParentCategoryUseCase
  readonly deleteParentCategory: DeleteParentCategoryUseCase
  readonly assignDomainToCategory: AssignDomainToCategoryUseCase
  readonly createCustomProject: CreateCustomProjectUseCase
  readonly deleteCustomProject: DeleteCustomProjectUseCase
  readonly updateCustomProjectName: UpdateCustomProjectNameUseCase
  /**
   * `CustomProject` ドメイン entity 一覧の読み取り query (issue #538)。
   * 旧 `useProjectManagement` 内の `customProjectRepository.findAll`
   * 直叩きを置換する application query 経由の読み取り口。
   */
  readonly getCustomProjects: GetCustomProjectsQuery
  /**
   * `CustomProject` の表示順 (`customProjectOrder`) 読み取り query
   * (issue #538)。旧 `customProjectRepository.findOrder` 直叩きを置換。
   */
  readonly getCustomProjectOrder: GetCustomProjectOrderQuery
  /**
   * undo 用途の `CustomProject` snapshot 読み取り query (issue #538)。
   * `customProjectOrder` + `customProjects` (entity) + `customProjectsRaw`
   * を 1 関数で束ねる。旧 `useProjectManagement` 内の
   * `getCustomProjectUndoSnapshot` private helper 責務を application
   * 層へ移設。
   */
  readonly getCustomProjectUndoSnapshot: GetCustomProjectUndoSnapshotQuery
  /**
   * rich フィールド付き `CustomProject` raw snapshot 読み取り query
   * (issue #538)。undo 復元 / sync で raw 経路を保ったまま storage
   * 形へ投影したい場面で利用。
   */
  readonly getCustomProjectRaws: GetCustomProjectRawsQuery
  /**
   * `CustomProject` 表示順保存 use-case (issue #538)。
   * 旧 `useProjectManagement.handleReorderProjects` 内の
   * `customProjectRepository.saveOrder` 直叩きを置換。
   */
  readonly saveCustomProjectOrder: SaveCustomProjectOrderUseCase
  /**
   * `CustomProject` entity 保存 use-case (issue #538)。
   * undo 復元で `restoreAllRaw` が無い / 無い時の entity 経由
   * フォールバックのラッパ。
   */
  readonly saveCustomProjects: SaveCustomProjectsUseCase
  /**
   * undo 復元 use-case (issue #538)。
   * 旧 `useProjectManagement.showCustomProjectDeleteUndoToast` 内の
   * `restoreAllRaw` / `saveAll` / `saveOrder` 3 段呼び出しを
   * 1 つの use-case に統合。
   */
  readonly restoreCustomProjectsSnapshot: RestoreCustomProjectsSnapshotUseCase
  readonly getProjectUrls: GetProjectUrlsUseCase
  readonly getSavedTabsPageData: GetSavedTabsPageDataQuery
  /**
   * 保存タブ一覧の軽量 query。`tabGroupRepository.findAll` の
   * application 側ラッパ (issue #517)。`useTabData` の
   * `refreshTabGroupsWithUrls()` 引数なし経路から利用される。
   */
  readonly getSavedTabs: GetSavedTabsQuery
  /**
   * `parentCategoryId` 未設定の `TabGroup` を `ParentCategory` 側の
   * `domains` / `domainNames` から修復する use-case (issue #517)。
   * 旧 `useTabData.repairSavedTabParentCategoryIds` の application 移植。
   */
  readonly repairTabGroupParentCategoryIds: RepairTabGroupParentCategoryIdsUseCase
}
