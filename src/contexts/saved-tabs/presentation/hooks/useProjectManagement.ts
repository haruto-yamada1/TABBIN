/**
 * @file useProjectManagement.ts
 * @description カスタムプロジェクトの CRUD・ビューモード切替・URL管理・
 * プロジェクト内カテゴリ管理を担うカスタムフック。
 *
 * 旧 `customProjectRepository` 直接依存 (issue #538) と
 * 旧 `CustomProjectsCommandService` 直接依存 (issue #539 / #540) を
 * 撤去し、読み取り系は application query、更新・復元系は application
 * use-case 経由のみに寄せた。presentation 層は port モジュール
 * (`CustomProjectsCommandService`) も repository モジュール
 * (`CustomProjectRepository`) も import せず、deps は query 関数と
 * use-case 関数だけを受け取る。
 */

import { useEffect, useRef, useState } from 'react'

import type {
  SavedTabsCustomProjectDto as CustomProject,
  SavedTabsTabGroupDto as TabGroup,
  SavedTabsUserSettingsDto as UserSettingsDto,
} from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDto'
import type { GetCustomProjectOrderQuery } from '@/contexts/saved-tabs/application/queries/GetCustomProjectOrderQuery'
import type { GetCustomProjectRawsQuery } from '@/contexts/saved-tabs/application/queries/GetCustomProjectRawsQuery'
import type { GetCustomProjectsQuery } from '@/contexts/saved-tabs/application/queries/GetCustomProjectsQuery'
import type { GetCustomProjectUndoSnapshotQuery } from '@/contexts/saved-tabs/application/queries/GetCustomProjectUndoSnapshotQuery'
import type { AddCategoryToCustomProjectUseCase } from '@/contexts/saved-tabs/application/use-cases/AddCategoryToCustomProjectUseCase'
import type { AddUrlToCustomProjectUseCase } from '@/contexts/saved-tabs/application/use-cases/AddUrlToCustomProjectUseCase'
import type { CreateCustomProjectUseCase } from '@/contexts/saved-tabs/application/use-cases/CreateCustomProjectUseCase'
import type { DeleteCustomProjectUseCase } from '@/contexts/saved-tabs/application/use-cases/DeleteCustomProjectUseCase'
import type { RemoveCategoryFromCustomProjectUseCase } from '@/contexts/saved-tabs/application/use-cases/RemoveCategoryFromCustomProjectUseCase'
import type { RemoveUrlFromCustomProjectUseCase } from '@/contexts/saved-tabs/application/use-cases/RemoveUrlFromCustomProjectUseCase'
import type { RemoveUrlsFromCustomProjectUseCase } from '@/contexts/saved-tabs/application/use-cases/RemoveUrlsFromCustomProjectUseCase'
import type { RenameCustomProjectCategoryUseCase } from '@/contexts/saved-tabs/application/use-cases/RenameCustomProjectCategoryUseCase'
import type { ReorderCustomProjectUrlsUseCase } from '@/contexts/saved-tabs/application/use-cases/ReorderCustomProjectUrlsUseCase'
import type { RestoreCustomProjectsSnapshotUseCase } from '@/contexts/saved-tabs/application/use-cases/RestoreCustomProjectsSnapshotUseCase'
import type { SaveCustomProjectOrderUseCase } from '@/contexts/saved-tabs/application/use-cases/SaveCustomProjectOrderUseCase'
import type { SetCustomProjectUrlCategoryUseCase } from '@/contexts/saved-tabs/application/use-cases/SetCustomProjectUrlCategoryUseCase'
import type { UpdateCustomProjectCategoryOrderUseCase } from '@/contexts/saved-tabs/application/use-cases/UpdateCustomProjectCategoryOrderUseCase'
import type { UpdateCustomProjectKeywordsUseCase } from '@/contexts/saved-tabs/application/use-cases/UpdateCustomProjectKeywordsUseCase'
import type { UpdateCustomProjectNameUseCase } from '@/contexts/saved-tabs/application/use-cases/UpdateCustomProjectNameUseCase'
import type { ViewMode } from '@/contexts/saved-tabs/presentation/types/mode'
import { useI18n } from '@/features/i18n/context/I18nProvider'

import type { UseProjectManagementReturn } from './projectManagementDefaults'
import {
  asyncNoopAddCategoryToCustomProject,
  asyncNoopAddUrlToCustomProject,
  asyncNoopCreate,
  asyncNoopDelete,
  asyncNoopGetCustomProjectOrder,
  asyncNoopGetCustomProjectRaws,
  asyncNoopGetCustomProjects,
  asyncNoopGetCustomProjectUndoSnapshot,
  asyncNoopRemoveCategoryFromCustomProject,
  asyncNoopRemoveUrlFromCustomProject,
  asyncNoopRemoveUrlsFromCustomProject,
  asyncNoopRename,
  asyncNoopRenameCustomProjectCategory,
  asyncNoopReorderCustomProjectUrls,
  asyncNoopRestore,
  asyncNoopSaveOrder,
  asyncNoopSetCustomProjectUrlCategory,
  asyncNoopUpdateCustomProjectCategoryOrder,
  asyncNoopUpdateCustomProjectKeywords,
} from './projectManagementDefaults'
import { useProjectCategoryHandlers } from './useProjectCategoryHandlers'
import { useProjectCrudHandlers } from './useProjectCrudHandlers'
import { useProjectManagementRefs } from './useProjectManagementRefs'
/**
 * issue #539 / #540 で `useProjectManagement` から application
 * use-case へ移設した 10 操作。
 *
 * - issue #539 範囲 (8 操作): `addUrlToCustomProject` /
 *   `removeUrlFromCustomProject` / `removeUrlsFromCustomProject` /
 *   `setUrlCategory` / `updateCategoryOrder` / `reorderProjectUrls` /
 *   `renameCategoryInProject` / `updateProjectKeywords`
 * - issue #540 範囲 (2 操作): `addCategoryToProject` /
 *   `removeCategoryFromProject`
 *
 * 旧 `CustomProjectsCommandService` パラメータは issue #540 で完全
 * に撤去され、port (`CustomProjectsCommandService`) 自体を
 * presentation 層から import しない形に統一した (受け入れ条件
 * 「useProjectManagement へ渡す CustomProject 依存が use-case /
 * query 中心になっている」)。
 */

/**
 * カスタムプロジェクト管理フック。
 * ビューモード切替・CRUD・URL管理・プロジェクト内カテゴリ管理を担う。
 *
 * 旧 `customProjectRepository` 直接依存 (issue #538) は application
 * query / use-case 経由へ移行済み。issue #539 で 8 操作を
 * `CustomProjectsCommandService` 直叩きから application use-case 経由
 * へ移設し、issue #540 で残っていた `addCategoryToProject` /
 * `removeCategoryFromProject` も application use-case へ移設する
 * ことで、port (`CustomProjectsCommandService`) 自体を presentation
 * 層から完全に撤去した (受け入れ条件「useProjectManagement へ渡す
 * CustomProject 依存が use-case / query 中心になっている」)。
 *
 * @param getCustomProjectsQuery - `CustomProject` 一覧 query
 * @param getCustomProjectOrderQuery - 表示順 query
 * @param getCustomProjectUndoSnapshotQuery - undo 用途 snapshot query
 * @param getCustomProjectRawsQuery - rich フィールド付き raw snapshot query
 * @param _tabGroups - 現在のタブグループ一覧（ドメインモードのデータ）
 * @param _settings - ユーザー設定（将来の拡張用）
 * @param initialViewMode - 初期表示モード
 * @param createCustomProjectUseCase - プロジェクト作成 use-case
 * @param deleteCustomProjectUseCase - プロジェクト削除 use-case
 * @param updateCustomProjectNameUseCase - プロジェクト名変更 use-case
 * @param saveCustomProjectOrderUseCase - 表示順保存 use-case
 * @param restoreCustomProjectsSnapshotUseCase - undo 復元 use-case
 * @param addUrlToCustomProjectUseCase - プロジェクト URL 追加 use-case
 * @param removeUrlFromCustomProjectUseCase - プロジェクト URL 削除 use-case
 * @param removeUrlsFromCustomProjectUseCase - プロジェクト URL 一括削除 use-case
 * @param setCustomProjectUrlCategoryUseCase - プロジェクト URL カテゴリ設定 use-case
 * @param updateCustomProjectCategoryOrderUseCase - カテゴリ順序更新 use-case
 * @param reorderCustomProjectUrlsUseCase - URL 順序更新 use-case
 * @param renameCustomProjectCategoryUseCase - カテゴリ名変更 use-case
 * @param updateCustomProjectKeywordsUseCase - キーワード更新 use-case
 * @param addCategoryToCustomProjectUseCase - カテゴリ追加 use-case (issue #540)
 * @param removeCategoryFromCustomProjectUseCase - カテゴリ削除 use-case (issue #540)
 * @returns UseProjectManagementReturn
 */
// eslint-disable-next-line eslint/max-params, eslint/complexity -- presentation 入口でフック引数を束ねるため
const useProjectManagement = (
  getCustomProjectsQuery: GetCustomProjectsQuery = asyncNoopGetCustomProjects,
  getCustomProjectOrderQuery: GetCustomProjectOrderQuery = asyncNoopGetCustomProjectOrder,
  getCustomProjectUndoSnapshotQuery: GetCustomProjectUndoSnapshotQuery = asyncNoopGetCustomProjectUndoSnapshot,
  getCustomProjectRawsQuery: GetCustomProjectRawsQuery = asyncNoopGetCustomProjectRaws,
  _tabGroups: TabGroup[] = [],
  _settings?: UserSettingsDto,
  initialViewMode?: ViewMode,
  createCustomProjectUseCase: CreateCustomProjectUseCase = asyncNoopCreate,
  deleteCustomProjectUseCase: DeleteCustomProjectUseCase = asyncNoopDelete,
  updateCustomProjectNameUseCase: UpdateCustomProjectNameUseCase = asyncNoopRename,
  saveCustomProjectOrderUseCase: SaveCustomProjectOrderUseCase = asyncNoopSaveOrder,
  restoreCustomProjectsSnapshotUseCase: RestoreCustomProjectsSnapshotUseCase = asyncNoopRestore,
  addUrlToCustomProjectUseCase: AddUrlToCustomProjectUseCase = asyncNoopAddUrlToCustomProject,
  removeUrlFromCustomProjectUseCase: RemoveUrlFromCustomProjectUseCase = asyncNoopRemoveUrlFromCustomProject,
  removeUrlsFromCustomProjectUseCase: RemoveUrlsFromCustomProjectUseCase = asyncNoopRemoveUrlsFromCustomProject,
  setCustomProjectUrlCategoryUseCase: SetCustomProjectUrlCategoryUseCase = asyncNoopSetCustomProjectUrlCategory,
  updateCustomProjectCategoryOrderUseCase: UpdateCustomProjectCategoryOrderUseCase = asyncNoopUpdateCustomProjectCategoryOrder,
  reorderCustomProjectUrlsUseCase: ReorderCustomProjectUrlsUseCase = asyncNoopReorderCustomProjectUrls,
  renameCustomProjectCategoryUseCase: RenameCustomProjectCategoryUseCase = asyncNoopRenameCustomProjectCategory,
  updateCustomProjectKeywordsUseCase: UpdateCustomProjectKeywordsUseCase = asyncNoopUpdateCustomProjectKeywords,
  addCategoryToCustomProjectUseCase: AddCategoryToCustomProjectUseCase = asyncNoopAddCategoryToCustomProject,
  removeCategoryFromCustomProjectUseCase: RemoveCategoryFromCustomProjectUseCase = asyncNoopRemoveCategoryFromCustomProject,
): UseProjectManagementReturn => {
  const { t } = useI18n()
  const [customProjects, setCustomProjects] = useState<CustomProject[]>([])
  const [viewMode, setViewMode] = useState<ViewMode>(
    initialViewMode ?? 'domain',
  )
  const customProjectsRef = useRef<CustomProject[]>([])
  const viewModeRef = useRef<ViewMode>(initialViewMode ?? 'domain')
  const creatingProjectNamesRef = useRef<Set<string>>(new Set())

  const refs = useProjectManagementRefs(
    getCustomProjectOrderQuery,
    getCustomProjectUndoSnapshotQuery,
    getCustomProjectRawsQuery,
    createCustomProjectUseCase,
    deleteCustomProjectUseCase,
    updateCustomProjectNameUseCase,
    saveCustomProjectOrderUseCase,
    restoreCustomProjectsSnapshotUseCase,
    addUrlToCustomProjectUseCase,
    removeUrlFromCustomProjectUseCase,
    removeUrlsFromCustomProjectUseCase,
    setCustomProjectUrlCategoryUseCase,
    updateCustomProjectCategoryOrderUseCase,
    reorderCustomProjectUrlsUseCase,
    renameCustomProjectCategoryUseCase,
    updateCustomProjectKeywordsUseCase,
    addCategoryToCustomProjectUseCase,
    removeCategoryFromCustomProjectUseCase,
  )

  useEffect(() => {
    customProjectsRef.current = customProjects
  }, [customProjects])
  useEffect(() => {
    viewModeRef.current = viewMode
  }, [viewMode])

  const crudHandlers = useProjectCrudHandlers({
    creatingProjectNamesRef,
    customProjectsRef,
    refs,
    setCustomProjects,
    setViewMode,
    t,
  })
  const categoryHandlers = useProjectCategoryHandlers({
    initialViewMode,
    refs,
    setCustomProjects,
    setViewMode,
    t,
  })

  return {
    customProjects,
    customProjectsRef,
    ...crudHandlers,
    ...categoryHandlers,
    setCustomProjects,
    setViewMode,
    viewMode,
    viewModeRef,
  }
}

export type { UseProjectManagementReturn } from './projectManagementDefaults'
export { useProjectManagement }
