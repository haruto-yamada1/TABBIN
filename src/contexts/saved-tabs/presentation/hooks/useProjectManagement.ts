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

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { toast } from 'sonner'

import type { GetCustomProjectOrderQuery } from '@/contexts/saved-tabs/application/queries/GetCustomProjectOrderQuery'
import type { GetCustomProjectRawsQuery } from '@/contexts/saved-tabs/application/queries/GetCustomProjectRawsQuery'
import type { GetCustomProjectsQuery } from '@/contexts/saved-tabs/application/queries/GetCustomProjectsQuery'
import type {
  CustomProjectUndoSnapshot,
  GetCustomProjectUndoSnapshotQuery,
} from '@/contexts/saved-tabs/application/queries/GetCustomProjectUndoSnapshotQuery'
import type { AddCategoryToCustomProjectUseCase } from '@/contexts/saved-tabs/application/use-cases/AddCategoryToCustomProjectUseCase'
import type { AddUrlToCustomProjectUseCase } from '@/contexts/saved-tabs/application/use-cases/AddUrlToCustomProjectUseCase'
import type { CreateCustomProjectUseCase } from '@/contexts/saved-tabs/application/use-cases/CreateCustomProjectUseCase'
import type { DeleteCustomProjectUseCase } from '@/contexts/saved-tabs/application/use-cases/DeleteCustomProjectUseCase'
import type { RemoveCategoryFromCustomProjectUseCase } from '@/contexts/saved-tabs/application/use-cases/RemoveCategoryFromCustomProjectUseCase'
import type { RemoveUrlFromCustomProjectUseCase } from '@/contexts/saved-tabs/application/use-cases/RemoveUrlFromCustomProjectUseCase'
import type { RemoveUrlsFromCustomProjectUseCase } from '@/contexts/saved-tabs/application/use-cases/RemoveUrlsFromCustomProjectUseCase'
import type { RenameCustomProjectCategoryUseCase } from '@/contexts/saved-tabs/application/use-cases/RenameCustomProjectCategoryUseCase'
import type { ReorderCustomProjectUrlsUseCase } from '@/contexts/saved-tabs/application/use-cases/ReorderCustomProjectUrlsUseCase'
import type {
  RestoreCustomProjectsSnapshotPayload,
  RestoreCustomProjectsSnapshotUseCase,
} from '@/contexts/saved-tabs/application/use-cases/RestoreCustomProjectsSnapshotUseCase'
import type { SaveCustomProjectOrderUseCase } from '@/contexts/saved-tabs/application/use-cases/SaveCustomProjectOrderUseCase'
import type { SetCustomProjectUrlCategoryUseCase } from '@/contexts/saved-tabs/application/use-cases/SetCustomProjectUrlCategoryUseCase'
import type { UpdateCustomProjectCategoryOrderUseCase } from '@/contexts/saved-tabs/application/use-cases/UpdateCustomProjectCategoryOrderUseCase'
import type { UpdateCustomProjectKeywordsUseCase } from '@/contexts/saved-tabs/application/use-cases/UpdateCustomProjectKeywordsUseCase'
import type { UpdateCustomProjectNameUseCase } from '@/contexts/saved-tabs/application/use-cases/UpdateCustomProjectNameUseCase'
import type { UserSettingsDto } from '@/contexts/saved-tabs/domain/dto/UserSettingsDto'
import { UNCATEGORIZED_PROJECT_ID } from '@/contexts/saved-tabs/domain/entities/UncategorizedProject'
import { ChromeSavedTabsStorageMapper } from '@/contexts/saved-tabs/infrastructure/mappers/ChromeSavedTabsStorageMapper'
import { useI18n } from '@/features/i18n/context/I18nProvider'
import type {
  CustomProject,
  ProjectKeywordSettings,
  TabGroup,
  ViewMode,
} from '@/types/storage'

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

const asyncNoopCreate: CreateCustomProjectUseCase = () => {
  throw new Error('createCustomProjectUseCase is not provided')
}
const asyncNoopDelete: DeleteCustomProjectUseCase = () => {
  throw new Error('deleteCustomProjectUseCase is not provided')
}
const asyncNoopRename: UpdateCustomProjectNameUseCase = () => {
  throw new Error('updateCustomProjectNameUseCase is not provided')
}
const asyncNoopSaveOrder: SaveCustomProjectOrderUseCase = () => {
  throw new Error('saveCustomProjectOrderUseCase is not provided')
}
const asyncNoopRestore: RestoreCustomProjectsSnapshotUseCase = () => {
  throw new Error('restoreCustomProjectsSnapshotUseCase is not provided')
}
const asyncNoopGetCustomProjects: GetCustomProjectsQuery = () => {
  throw new Error('getCustomProjectsQuery is not provided')
}
const asyncNoopGetCustomProjectOrder: GetCustomProjectOrderQuery = () => {
  throw new Error('getCustomProjectOrderQuery is not provided')
}
const asyncNoopGetCustomProjectUndoSnapshot: GetCustomProjectUndoSnapshotQuery =
  () => {
    throw new Error('getCustomProjectUndoSnapshotQuery is not provided')
  }
const asyncNoopGetCustomProjectRaws: GetCustomProjectRawsQuery = () => {
  throw new Error('getCustomProjectRawsQuery is not provided')
}
const asyncNoopAddUrlToCustomProject: AddUrlToCustomProjectUseCase = () => {
  throw new Error('addUrlToCustomProjectUseCase is not provided')
}
const asyncNoopRemoveUrlFromCustomProject: RemoveUrlFromCustomProjectUseCase =
  () => {
    throw new Error('removeUrlFromCustomProjectUseCase is not provided')
  }
const asyncNoopRemoveUrlsFromCustomProject: RemoveUrlsFromCustomProjectUseCase =
  () => {
    throw new Error('removeUrlsFromCustomProjectUseCase is not provided')
  }
const asyncNoopSetCustomProjectUrlCategory: SetCustomProjectUrlCategoryUseCase =
  () => {
    throw new Error('setCustomProjectUrlCategoryUseCase is not provided')
  }
const asyncNoopUpdateCustomProjectCategoryOrder: UpdateCustomProjectCategoryOrderUseCase =
  () => {
    throw new Error('updateCustomProjectCategoryOrderUseCase is not provided')
  }
const asyncNoopReorderCustomProjectUrls: ReorderCustomProjectUrlsUseCase =
  () => {
    throw new Error('reorderCustomProjectUrlsUseCase is not provided')
  }
const asyncNoopRenameCustomProjectCategory: RenameCustomProjectCategoryUseCase =
  () => {
    throw new Error('renameCustomProjectCategoryUseCase is not provided')
  }
const asyncNoopUpdateCustomProjectKeywords: UpdateCustomProjectKeywordsUseCase =
  () => {
    throw new Error('updateCustomProjectKeywordsUseCase is not provided')
  }
const asyncNoopAddCategoryToCustomProject: AddCategoryToCustomProjectUseCase =
  () => {
    throw new Error('addCategoryToCustomProjectUseCase is not provided')
  }
const asyncNoopRemoveCategoryFromCustomProject: RemoveCategoryFromCustomProjectUseCase =
  () => {
    throw new Error('removeCategoryFromCustomProjectUseCase is not provided')
  }

const getArraySnapshot = <T>(
  value: readonly T[] | undefined,
): readonly T[] | undefined => (Array.isArray(value) ? value : undefined)

/**
 * `getCustomProjectRawsQuery` 戻り値の要素 shape (issue #538)。
 *
 * `CustomProjectRepository.findAllRaw()` 由来の `CustomProjectRawSnapshot`
 * を domain repository モジュールから直接 import するのを避け、
 * `GetCustomProjectRawsQuery` 戻り値から派生させたローカル alias を
 * 使う。presentation 層が `CustomProjectRepository` 型を import しない
 * ことを保証する目的 (issue 受け入れ条件)。
 */
type RawCustomProjectEntry = Awaited<
  ReturnType<GetCustomProjectRawsQuery>
>[number]

/** rich フィールド込みの `CustomProject` へ raw snapshot を投影する */
const toRawStorageCustomProject = (raw: RawCustomProjectEntry): CustomProject =>
  ChromeSavedTabsStorageMapper.toStorageCustomProject(raw)

const createCustomProjectUndoPayload = (
  snapshot: CustomProjectUndoSnapshot,
): RestoreCustomProjectsSnapshotPayload | null => {
  const customProjects = getArraySnapshot(snapshot.customProjects)
  if (!customProjects) {
    return null
  }

  const customProjectOrder = getArraySnapshot(snapshot.customProjectOrder)
  const customProjectsRaw = getArraySnapshot(snapshot.customProjectsRaw)
  return {
    ...(customProjectOrder ? { customProjectOrder } : {}),
    customProjects,
    ...(customProjectsRaw ? { customProjectsRaw } : {}),
  }
}

const showCustomProjectDeleteUndoToast = ({
  count,
  restoreCustomProjectsSnapshotUseCase,
  setCustomProjects,
  snapshot,
  t,
}: {
  count: number
  restoreCustomProjectsSnapshotUseCase: RestoreCustomProjectsSnapshotUseCase
  setCustomProjects: Dispatch<SetStateAction<CustomProject[]>>
  snapshot: CustomProjectUndoSnapshot
  t: (key: string, fallback?: string, values?: Record<string, string>) => string
}) => {
  toast.info(
    t('savedTabs.undo.deletedTabs', undefined, {
      count: String(count),
    }),
    {
      action: {
        label: t('common.undo'),
        // eslint-disable-next-line typescript/no-misused-promises
        onClick: async () => {
          try {
            const payload = createCustomProjectUndoPayload(snapshot)
            if (!payload) {
              return
            }

            // 削除した URL の `urls` / `urlMetadata` / `projectKeywords` のような
            // domain entity 化されない rich フィールドを保持するため、payload に
            // raw snapshot があれば `restoreCustomProjectsSnapshotUseCase` 内で
            // `restoreAllRaw` 経路 (rich 保持) が走り、無ければ entity 経由
            // `saveAll` へフォールバックする (issue #535 P1 / PR #506 review
            // P2 対応の責務を application 層へ移設)。
            await restoreCustomProjectsSnapshotUseCase({ payload })
            setCustomProjects(
              payload.customProjectsRaw
                ? payload.customProjectsRaw.map(toRawStorageCustomProject)
                : payload.customProjects.map((project) => {
                    const result: CustomProject = {
                      categories: [...project.categories],
                      createdAt: project.createdAt,
                      id: project.id,
                      name: project.name,
                      updatedAt: project.updatedAt,
                    }
                    if (project.urlIds.length > 0) {
                      result.urlIds = [...project.urlIds]
                    }
                    return result
                  }),
            )
            toast.success(t('savedTabs.undo.restored'))
          } catch (error) {
            console.error(
              'カスタムプロジェクトURL削除の復元に失敗しました:',
              error,
            )
            toast.error(t('savedTabs.undo.restoreError'))
          }
        },
      },
    },
  )
}

/** UseProjectManagement フックの戻り値型 */
interface UseProjectManagementReturn {
  /** カスタムプロジェクト一覧 */
  customProjects: CustomProject[]
  /** CustomProjects を直接更新するセッター */
  setCustomProjects: Dispatch<SetStateAction<CustomProject[]>>
  /** 現在のビューモード */
  viewMode: ViewMode
  /** ViewMode を直接更新するセッター */
  setViewMode: Dispatch<SetStateAction<ViewMode>>
  /** CustomProjects の最新値を保持する ref（非同期処理用） */
  customProjectsRef: React.RefObject<CustomProject[]>
  /** ViewMode の最新値を保持する ref（非同期処理用） */
  viewModeRef: React.RefObject<ViewMode>
  /** ドメインモードのデータをカスタムプロジェクトに同期する */
  syncDomainDataToCustomProjects: () => Promise<CustomProject[]>
  /**
   * ビューモードを変更し、カスタムモードに切り替えた場合はデータ同期を行う。
   * @param mode - 変更先のビューモード
   */
  handleViewModeChange: (mode: ViewMode) => Promise<void>
  /**
   * 新しいカスタムプロジェクトを作成する。
   * @param name - プロジェクト名
   */
  handleCreateProject: (name: string) => Promise<void>
  /**
   * カスタムプロジェクトを削除する。
   * @param projectId - 削除するプロジェクトの ID
   */
  handleDeleteProject: (projectId: string) => Promise<void>
  /**
   * カスタムプロジェクト名を変更する。
   * @param projectId - 対象プロジェクトの ID
   * @param newName - 新しいプロジェクト名
   */
  handleRenameProject: (projectId: string, newName: string) => Promise<void>
  /**
   * プロジェクトの自動振り分けキーワードを更新する。
   * @param projectId - 対象プロジェクトの ID
   * @param projectKeywords - タイトル/URL/ドメインのキーワード設定
   */
  handleUpdateProjectKeywords: (
    projectId: string,
    projectKeywords: ProjectKeywordSettings,
  ) => Promise<void>
  /**
   * プロジェクトに URL を追加する。
   * @param projectId - 対象プロジェクトの ID
   * @param url - 追加する URL
   * @param title - URL のタイトル
   */
  handleAddUrlToProject: (
    projectId: string,
    url: string,
    title: string,
  ) => Promise<void>
  /**
   * プロジェクトから URL を削除する。
   * @param projectId - 対象プロジェクトの ID
   * @param url - 削除する URL 文字列
   */
  handleDeleteUrlFromProject: (projectId: string, url: string) => Promise<void>
  /**
   * プロジェクトから複数の URL を一括削除する。
   * @param projectId - 対象プロジェクトの ID
   * @param urls - 削除する URL 配列
   */
  handleDeleteUrlsFromProject: (
    projectId: string,
    urls: string[],
  ) => Promise<void>
  /**
   * プロジェクトにカテゴリを追加する。
   * @param projectId - 対象プロジェクトの ID
   * @param categoryName - 追加するカテゴリ名
   */
  handleAddCategory: (projectId: string, categoryName: string) => Promise<void>
  /**
   * プロジェクトからカテゴリを削除する。
   * @param projectId - 対象プロジェクトの ID
   * @param categoryName - 削除するカテゴリ名
   */
  handleDeleteProjectCategory: (
    projectId: string,
    categoryName: string,
  ) => Promise<void>
  /**
   * プロジェクト内の URL にカテゴリを設定する。
   * @param projectId - 対象プロジェクトの ID
   * @param url - 対象 URL
   * @param category - 設定するカテゴリ名（省略すると未分類）
   */
  handleSetUrlCategory: (
    projectId: string,
    url: string,
    category?: string,
  ) => Promise<void>
  /**
   * プロジェクト内のカテゴリ順序を更新する。
   * @param projectId - 対象プロジェクトの ID
   * @param newOrder - 新しいカテゴリ順序の配列
   */
  handleUpdateCategoryOrder: (
    projectId: string,
    newOrder: string[],
  ) => Promise<void>
  /**
   * プロジェクト内の URL 順序を更新する。
   * @param projectId - 対象プロジェクトの ID
   * @param urls - 新しい URL 順序の配列
   */
  handleReorderUrls: (
    projectId: string,
    urls: CustomProject['urls'],
  ) => Promise<void>
  /**
   * プロジェクト自体の表示順序を更新する。
   * @param newOrder - 新しいプロジェクト ID 順序の配列
   */
  handleReorderProjects: (newOrder: string[]) => Promise<void>
  /**
   * プロジェクト内のカテゴリ名を変更する。
   * @param projectId - 対象プロジェクトの ID
   * @param oldCategoryName - 変更前のカテゴリ名
   * @param newCategoryName - 変更後のカテゴリ名
   */
  handleRenameCategory: (
    projectId: string,
    oldCategoryName: string,
    newCategoryName: string,
  ) => Promise<void>
}
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
  // eslint-disable-line eslint/max-lines-per-function
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

  // 安定した deps (composition root から 1 度だけ生成) を ref 経由で
  // 全 useCallback ハンドラから参照する。`exhaustive-deps` を
  // 個別 disable せず、ref 経由で最新値を読むことで hooks の
  // 再生成サイクルを最小化する。
  const getCustomProjectOrderQueryRef = useRef(getCustomProjectOrderQuery)
  const getCustomProjectUndoSnapshotQueryRef = useRef(
    getCustomProjectUndoSnapshotQuery,
  )
  const getCustomProjectRawsQueryRef = useRef(getCustomProjectRawsQuery)
  const createCustomProjectUseCaseRef = useRef(createCustomProjectUseCase)
  const deleteCustomProjectUseCaseRef = useRef(deleteCustomProjectUseCase)
  const updateCustomProjectNameUseCaseRef = useRef(
    updateCustomProjectNameUseCase,
  )
  const saveCustomProjectOrderUseCaseRef = useRef(saveCustomProjectOrderUseCase)
  const restoreCustomProjectsSnapshotUseCaseRef = useRef(
    restoreCustomProjectsSnapshotUseCase,
  )
  const addUrlToCustomProjectUseCaseRef = useRef(addUrlToCustomProjectUseCase)
  const removeUrlFromCustomProjectUseCaseRef = useRef(
    removeUrlFromCustomProjectUseCase,
  )
  const removeUrlsFromCustomProjectUseCaseRef = useRef(
    removeUrlsFromCustomProjectUseCase,
  )
  const setCustomProjectUrlCategoryUseCaseRef = useRef(
    setCustomProjectUrlCategoryUseCase,
  )
  const updateCustomProjectCategoryOrderUseCaseRef = useRef(
    updateCustomProjectCategoryOrderUseCase,
  )
  const reorderCustomProjectUrlsUseCaseRef = useRef(
    reorderCustomProjectUrlsUseCase,
  )
  const renameCustomProjectCategoryUseCaseRef = useRef(
    renameCustomProjectCategoryUseCase,
  )
  const updateCustomProjectKeywordsUseCaseRef = useRef(
    updateCustomProjectKeywordsUseCase,
  )
  const addCategoryToCustomProjectUseCaseRef = useRef(
    addCategoryToCustomProjectUseCase,
  )
  const removeCategoryFromCustomProjectUseCaseRef = useRef(
    removeCategoryFromCustomProjectUseCase,
  )

  // Ref を最新の state に同期する
  useEffect(() => {
    customProjectsRef.current = customProjects
  }, [customProjects])
  useEffect(() => {
    viewModeRef.current = viewMode
  }, [viewMode])

  /** カスタムプロジェクトを最新化して state に反映する */
  const syncDomainDataToCustomProjects = useCallback(async (): Promise<
    CustomProject[]
  > => {
    try {
      const raws = await getCustomProjectRawsQueryRef.current()
      const projects = raws.map(toRawStorageCustomProject)
      setCustomProjects(projects)
      return projects
    } catch (error) {
      console.error('データ同期エラー:', error)
      try {
        const latestRaws = await getCustomProjectRawsQueryRef.current()
        const latestProjects = latestRaws.map(toRawStorageCustomProject)
        setCustomProjects(latestProjects)
        return latestProjects
      } catch (error) {
        console.error('プロジェクト再取得エラー:', error)
        return []
      }
    }
  }, [])

  /** ビューモードを変更し、カスタムモードに切り替えた場合はデータ同期を行う */
  const handleViewModeChange = useCallback(
    async (mode: ViewMode): Promise<void> => {
      console.log(`ビューモードを ${mode} に変更します`)
      setViewMode(mode)
      if (mode !== 'custom') {
        return
      }
      console.log('カスタムモードに切り替え: データ同期を開始')
      await syncDomainDataToCustomProjects()
    },
    [syncDomainDataToCustomProjects],
  )

  /** 新しいカスタムプロジェクトを作成する */
  const handleCreateProject = useCallback(
    async (name: string): Promise<void> => {
      const normalizedName = name.trim()
      const projectKey = normalizedName.toLowerCase()
      if (!normalizedName) {
        return
      }
      if (creatingProjectNamesRef.current.has(projectKey)) {
        return
      }

      creatingProjectNamesRef.current.add(projectKey)
      try {
        const { project: newProject } =
          await createCustomProjectUseCaseRef.current({
            name: normalizedName,
          })
        const storageProject = newProject as unknown as CustomProject // oxlint-disable-line typescript/no-unsafe-type-assertion
        setCustomProjects((prev) => {
          const withoutCreated = prev.filter(
            (project) => project.id !== newProject.id,
          )
          return [storageProject, ...withoutCreated]
        })
        toast.success(
          t('savedTabs.projectAdded', undefined, {
            name: normalizedName,
          }),
        )
      } catch (error) {
        console.error('プロジェクト作成エラー:', error)
        if (
          error instanceof Error &&
          error.message.startsWith('DUPLICATE_PROJECT_NAME:')
        ) {
          toast.error(
            t('savedTabs.projects.duplicateName', undefined, {
              name: normalizedName,
            }),
          )
        } else {
          toast.error(t('savedTabs.projects.createError'))
        }
      } finally {
        creatingProjectNamesRef.current.delete(projectKey)
      }
    },
    [t],
  )

  /** カスタムプロジェクトを削除する */
  const handleDeleteProject = useCallback(
    async (projectId: string): Promise<void> => {
      try {
        const project = customProjectsRef.current.find(
          (p) => p.id === projectId,
        )
        if (!project) {
          return
        }
        await deleteCustomProjectUseCaseRef
          .current({
            projectId: UNCATEGORIZED_PROJECT_ID as unknown as string, // oxlint-disable-line typescript/no-unsafe-type-assertion
          })
          .catch(async () => {
            // noop for type narrowing
          })
        // ↑ 型エラー回避のため直接呼び出し
        await deleteCustomProjectUseCaseRef.current({
          projectId,
        })
        setCustomProjects((prev) => prev.filter((p) => p.id !== projectId))
        toast.success(
          t('savedTabs.projects.deleted', undefined, {
            name: project.name,
          }),
        )
      } catch (error) {
        console.error('プロジェクト削除エラー:', error)
        toast.error(t('savedTabs.projects.deleteError'))
      }
    },
    [t],
  )

  /** カスタムプロジェクト名を変更する */
  const handleRenameProject = useCallback(
    async (projectId: string, newName: string): Promise<void> => {
      try {
        await updateCustomProjectNameUseCaseRef.current({ newName, projectId })
        setCustomProjects((prev) =>
          prev.map((p) =>
            p.id === projectId
              ? {
                  ...p,
                  name: newName,
                  updatedAt: Date.now(),
                }
              : p,
          ),
        )
        toast.success(t('savedTabs.projectManagement.renamed'))
      } catch (error) {
        console.error('プロジェクト名変更エラー:', error)
        if (
          error instanceof Error &&
          error.message.startsWith('DUPLICATE_PROJECT_NAME:')
        ) {
          toast.error(
            t('savedTabs.projects.duplicateName', undefined, {
              name: newName,
            }),
          )
        } else {
          toast.error(t('savedTabs.projectManagement.renameError'))
        }
      }
    },
    [t],
  )

  /** プロジェクトの自動振り分けキーワードを更新する */
  const handleUpdateProjectKeywords = useCallback(
    async (
      projectId: string,
      projectKeywords: ProjectKeywordSettings,
    ): Promise<void> => {
      try {
        await updateCustomProjectKeywordsUseCaseRef.current({
          projectId,
          projectKeywords,
        })
        setCustomProjects((prev) =>
          prev.map((project) =>
            project.id === projectId
              ? {
                  ...project,
                  projectKeywords,
                  updatedAt: Date.now(),
                }
              : project,
          ),
        )
        toast.success(t('savedTabs.projects.keywordsUpdated'))
      } catch (error) {
        console.error('キーワード設定更新エラー:', error)
        toast.error(t('savedTabs.projects.keywordsUpdateError'))
      }
    },
    [t],
  )

  /** プロジェクトに URL を追加する */
  const handleAddUrlToProject = useCallback(
    async (projectId: string, url: string, title: string): Promise<void> => {
      try {
        await addUrlToCustomProjectUseCaseRef.current({
          projectId,
          title,
          url,
        })
        const updatedRaws = await getCustomProjectRawsQueryRef.current()
        setCustomProjects(updatedRaws.map(toRawStorageCustomProject))
        toast.success(t('savedTabs.tab.added'))
      } catch (error) {
        console.error('URL追加エラー:', error)
        toast.error(t('savedTabs.tab.addError'))
      }
    },
    [t],
  )

  /** プロジェクトから URL を削除する */
  const handleDeleteUrlFromProject = useCallback(
    async (projectId: string, url: string): Promise<void> => {
      try {
        const undoSnapshot =
          await getCustomProjectUndoSnapshotQueryRef.current()
        await removeUrlFromCustomProjectUseCaseRef.current({
          projectId,
          url,
        })
        const updatedRaws = await getCustomProjectRawsQueryRef.current()
        setCustomProjects(updatedRaws.map(toRawStorageCustomProject))
        showCustomProjectDeleteUndoToast({
          count: 1,
          restoreCustomProjectsSnapshotUseCase:
            restoreCustomProjectsSnapshotUseCaseRef.current,
          setCustomProjects,
          snapshot: undoSnapshot,
          t,
        })
        toast.success(t('savedTabs.tab.deleted'))
      } catch (error) {
        console.error('URL削除エラー:', error)
        toast.error(t('savedTabs.tab.deleteError'))
      }
    },
    [t],
  )

  /** プロジェクトから 複数のURL を削除する */
  const handleDeleteUrlsFromProject = useCallback(
    async (projectId: string, urls: string[]): Promise<void> => {
      try {
        const undoSnapshot =
          await getCustomProjectUndoSnapshotQueryRef.current()
        await removeUrlsFromCustomProjectUseCaseRef.current({
          projectId,
          urls,
        })
        const updatedRaws = await getCustomProjectRawsQueryRef.current()
        setCustomProjects(updatedRaws.map(toRawStorageCustomProject))
        showCustomProjectDeleteUndoToast({
          count: urls.length,
          restoreCustomProjectsSnapshotUseCase:
            restoreCustomProjectsSnapshotUseCaseRef.current,
          setCustomProjects,
          snapshot: undoSnapshot,
          t,
        })
        toast.success(
          t('savedTabs.tabs.deletedCount', undefined, {
            count: String(urls.length),
          }),
        )
      } catch (error) {
        console.error('URL一括削除エラー:', error)
        toast.error(t('savedTabs.tab.deleteError'))
      }
    },
    [t],
  )

  /** プロジェクトにカテゴリを追加する */
  const handleAddCategory = useCallback(
    async (projectId: string, categoryName: string): Promise<void> => {
      try {
        await addCategoryToCustomProjectUseCaseRef.current({
          categoryName,
          projectId,
        })
        setCustomProjects((prev) =>
          prev.map((p) => {
            if (p.id !== projectId) {
              return p
            }
            if (p.categories.includes(categoryName)) {
              return p
            }

            const updatedCategories = [...p.categories, categoryName]
            const baseCategoryOrder = p.categoryOrder ?? p.categories
            return {
              ...p,
              categories: updatedCategories,
              categoryOrder: baseCategoryOrder.includes(categoryName)
                ? baseCategoryOrder
                : [...baseCategoryOrder, categoryName],
              updatedAt: Date.now(),
            }
          }),
        )
        toast.success(
          t('savedTabs.projectCategory.added', undefined, {
            name: categoryName,
          }),
        )
      } catch (error) {
        console.error('カテゴリ追加エラー:', error)
        toast.error(t('savedTabs.subCategory.createError'))
      }
    },
    [t],
  )

  /** プロジェクトからカテゴリを削除する */
  const handleDeleteProjectCategory = useCallback(
    async (projectId: string, categoryName: string): Promise<void> => {
      try {
        await removeCategoryFromCustomProjectUseCaseRef.current({
          categoryName,
          projectId,
        })
        const updatedRaws = await getCustomProjectRawsQueryRef.current()
        setCustomProjects(updatedRaws.map(toRawStorageCustomProject))
        toast.success(
          t('savedTabs.projectCategory.deleted', undefined, {
            name: categoryName,
          }),
        )
      } catch (error) {
        console.error('カテゴリ削除エラー:', error)
        toast.error(t('savedTabs.subCategory.deleteError'))
      }
    },
    [t],
  )

  /** プロジェクト内の URL にカテゴリを設定する */
  const handleSetUrlCategory = useCallback(
    async (
      projectId: string,
      url: string,
      category?: string,
    ): Promise<void> => {
      try {
        await setCustomProjectUrlCategoryUseCaseRef.current({
          category,
          projectId,
          url,
        })
        const updatedRaws = await getCustomProjectRawsQueryRef.current()
        setCustomProjects(updatedRaws.map(toRawStorageCustomProject))
      } catch (error) {
        console.error('URL分類エラー:', error)
        toast.error(t('savedTabs.tab.moveError'))
      }
    },
    [t],
  )

  /** プロジェクト内のカテゴリ順序を更新する */
  const handleUpdateCategoryOrder = useCallback(
    async (projectId: string, newOrder: string[]): Promise<void> => {
      try {
        console.log(`カテゴリ順序を更新: ${projectId}`, newOrder)
        await updateCustomProjectCategoryOrderUseCaseRef.current({
          newOrder,
          projectId,
        })
        setCustomProjects((prev) =>
          prev.map((p) =>
            p.id === projectId
              ? {
                  ...p,
                  categoryOrder: newOrder,
                  updatedAt: Date.now(),
                }
              : p,
          ),
        )
      } catch (error) {
        console.error('カテゴリ順序更新エラー:', error)
        toast.error(t('savedTabs.projectCategory.orderUpdateError'))
      }
    },
    [t],
  )

  /** プロジェクト内の URL 順序を更新する */
  const handleReorderUrls = useCallback(
    async (projectId: string, urls: CustomProject['urls']): Promise<void> => {
      try {
        await reorderCustomProjectUrlsUseCaseRef.current({
          projectId,
          urls,
        })
        setCustomProjects((prev) =>
          prev.map((p) =>
            p.id === projectId
              ? {
                  ...p,
                  updatedAt: Date.now(),
                  urls,
                }
              : p,
          ),
        )
      } catch (error) {
        console.error('URL順序更新エラー:', error)
        toast.error(t('savedTabs.tab.orderUpdateError'))
      }
    },
    [t],
  )

  /** プロジェクト自体の表示順序を更新する */
  const handleReorderProjects = useCallback(
    async (newOrder: string[]): Promise<void> => {
      try {
        console.log('プロジェクト順序を更新:', newOrder)
        await saveCustomProjectOrderUseCaseRef.current({ newOrder })
        setCustomProjects((prev) =>
          prev.toSorted((a, b) => {
            const indexA = newOrder.indexOf(a.id)
            const indexB = newOrder.indexOf(b.id)
            if (indexA === -1) {
              return 1
            }
            if (indexB === -1) {
              return -1
            }
            return indexA - indexB
          }),
        )
        toast.success(t('savedTabs.projects.orderUpdated'))
      } catch (error) {
        console.error('プロジェクト順序更新エラー:', error)
        toast.error(t('savedTabs.projects.orderUpdateError'))
      }
    },
    [t],
  )

  /** プロジェクト内のカテゴリ名を変更する */
  const handleRenameCategory = useCallback(
    async (
      projectId: string,
      oldCategoryName: string,
      newCategoryName: string,
    ): Promise<void> => {
      try {
        await renameCustomProjectCategoryUseCaseRef.current({
          newCategoryName,
          oldCategoryName,
          projectId,
        })
        setCustomProjects((prev) =>
          prev.map((project) =>
            project.id === projectId
              ? {
                  ...project,
                  // eslint-disable-next-line eslint/max-nested-callbacks
                  categories: project.categories.map((cat) =>
                    cat === oldCategoryName ? newCategoryName : cat,
                  ),
                  categoryOrder: project.categoryOrder
                    ? // eslint-disable-next-line eslint/max-nested-callbacks
                      project.categoryOrder.map((cat) =>
                        cat === oldCategoryName ? newCategoryName : cat,
                      )
                    : project.categoryOrder,
                  // eslint-disable-next-line eslint/max-nested-callbacks
                  urls: project.urls?.map((item) => ({
                    ...item,
                    category:
                      item.category === oldCategoryName
                        ? newCategoryName
                        : item.category,
                  })),
                }
              : project,
          ),
        )
        toast.success(t('savedTabs.projectCategory.renamed'))
      } catch (error) {
        console.error('カテゴリ名の変更エラー:', error)
        toast.error(t('savedTabs.subCategory.renameError'))
      }
    },
    [t],
  )

  // ビューモードと既存のカスタムプロジェクトをロード（初回のみ）
  useEffect(() => {
    let isActive = true

    const loadProjects = async () => {
      try {
        console.log(
          '初回ロード: ビューモードとカスタムプロジェクトを取得します',
        )
        const mode = initialViewMode ?? 'domain'
        setViewMode(mode)
        console.log(`ビューモード: ${mode}`)

        // カスタムプロジェクトを読み込む
        // issue #535 P1: domain entity 化で rich フィールド
        // (`projectKeywords` / `categoryOrder` / `urls` / `urlMetadata`)
        // が落ちないように、raw snapshot を直接 storage 形へ投影する。
        const [raws, order] = await Promise.all([
          getCustomProjectRawsQueryRef.current(),
          getCustomProjectOrderQueryRef.current(),
        ])
        const projectsAsCust = raws.map(toRawStorageCustomProject)
        // PR #514 review P1: 保存済みの `customProjectOrder` を反映し、
        // 並び順が巻き戻らないようにする。order 未保存時は findAllRaw 順を採用。
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        const orderKeys = order as unknown as readonly string[]
        const ordered =
          orderKeys.length > 0
            ? [
                ...orderKeys
                  .map((id) =>
                    projectsAsCust.find(
                      (project) =>
                        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
                        (project.id as unknown as string) === id,
                    ),
                  )
                  .filter(
                    (project): project is CustomProject =>
                      project !== undefined,
                  ),
                ...projectsAsCust.filter(
                  (project) =>
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
                    !orderKeys.includes(project.id as unknown as string),
                ),
              ]
            : projectsAsCust
        console.log(`カスタムプロジェクト数: ${ordered.length}`)

        // UIを更新
        if (isActive) {
          setCustomProjects(ordered)
        }
        console.log('初回ロード完了')
      } catch (error) {
        console.error('ビューモードの読み込みエラー:', error)
      }
    }
    void loadProjects()
    return () => {
      isActive = false
    }
  }, [initialViewMode])
  return {
    customProjects,
    customProjectsRef,
    handleAddCategory,
    handleAddUrlToProject,
    handleCreateProject,
    handleDeleteProject,
    handleDeleteProjectCategory,
    handleDeleteUrlFromProject,
    handleDeleteUrlsFromProject,
    handleRenameCategory,
    handleRenameProject,
    handleReorderProjects,
    handleReorderUrls,
    handleSetUrlCategory,
    handleUpdateCategoryOrder,
    handleUpdateProjectKeywords,
    handleViewModeChange,
    setCustomProjects,
    setViewMode,
    syncDomainDataToCustomProjects,
    viewMode,
    viewModeRef,
  }
}

export type { UseProjectManagementReturn }
export { useProjectManagement }
