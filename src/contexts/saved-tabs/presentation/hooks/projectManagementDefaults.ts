/**
 * @file projectManagementDefaults.ts
 * @description useProjectManagement から抽出したデフォルト値・ヘルパー・戻り値型。
 */

import type { Dispatch, RefObject, SetStateAction } from 'react'
import { toast } from 'sonner'

import type {
  SavedTabsCustomProjectDto as CustomProject,
  SavedTabsProjectKeywordSettingsDto as ProjectKeywordSettings,
} from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDto'
import { toStorageCustomProjectFromRaw } from '@/contexts/saved-tabs/application/mappers/SavedTabsSnapshotMapper'
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
import type { ViewMode } from '@/contexts/saved-tabs/presentation/types/mode'

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
  toStorageCustomProjectFromRaw(raw)

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
                    if ((project.urlIds ?? []).length > 0) {
                      result.urlIds = [...(project.urlIds ?? [])]
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
type UseProjectManagementReturn = {
  /** カスタムプロジェクト一覧 */
  customProjects: CustomProject[]
  /** CustomProjects を直接更新するセッター */
  setCustomProjects: Dispatch<SetStateAction<CustomProject[]>>
  /** 現在のビューモード */
  viewMode: ViewMode
  /** ViewMode を直接更新するセッター */
  setViewMode: Dispatch<SetStateAction<ViewMode>>
  /** CustomProjects の最新値を保持する ref（非同期処理用） */
  customProjectsRef: RefObject<CustomProject[]>
  /** ViewMode の最新値を保持する ref（非同期処理用） */
  viewModeRef: RefObject<ViewMode>
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

export type { UseProjectManagementReturn }
export {
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
  showCustomProjectDeleteUndoToast,
  toRawStorageCustomProject,
}
