/**
 * @file useProjectManagement.ts
 * @description カスタムプロジェクトの CRUD・ビューモード切替・URL管理・
 * プロジェクト内カテゴリ管理を担うカスタムフック。
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { toast } from 'sonner'

import { useI18n } from '@/features/i18n/context/I18nProvider'
import {
  addCategoryToProject,
  addUrlToCustomProject,
  createCustomProject,
  deleteCustomProject,
  getCustomProjects,
  removeCategoryFromProject,
  removeUrlFromCustomProject,
  removeUrlsFromCustomProject,
  renameCategoryInProject,
  reorderProjectUrls,
  setUrlCategory,
  updateCategoryOrder,
  updateCustomProjectName,
  updateProjectKeywords,
  updateProjectOrder,
} from '@/lib/storage/projects'
import type {
  CustomProject,
  ProjectKeywordSettings,
  TabGroup,
  UserSettings,
  ViewMode,
} from '@/types/storage'

interface CustomProjectUndoSnapshot {
  customProjectOrder?: string[]
  customProjects?: CustomProject[]
}

interface CustomProjectUndoPayload {
  customProjectOrder?: string[]
  customProjects: CustomProject[]
}

const getArraySnapshot = <T>(value: T[] | undefined): T[] | undefined =>
  Array.isArray(value) ? value : undefined

const getCustomProjectUndoSnapshot =
  async (): Promise<CustomProjectUndoSnapshot> =>
    chrome.storage.local.get<CustomProjectUndoSnapshot>([
      'customProjects',
      'customProjectOrder',
    ])

const createCustomProjectUndoPayload = (
  snapshot: CustomProjectUndoSnapshot,
): CustomProjectUndoPayload | null => {
  const customProjects = getArraySnapshot(snapshot.customProjects)
  if (!customProjects) {
    return null
  }

  const customProjectOrder = getArraySnapshot(snapshot.customProjectOrder)
  return {
    ...(customProjectOrder ? { customProjectOrder } : {}),
    customProjects,
  }
}

const showCustomProjectDeleteUndoToast = ({
  count,
  setCustomProjects,
  snapshot,
  t,
}: {
  count: number
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

            await chrome.storage.local.set(payload)
            setCustomProjects(payload.customProjects)
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
 * @param tabGroups - 現在のタブグループ一覧（ドメインモードのデータ）
 * @param _settings - ユーザー設定（将来の拡張用）
 * @returns UseProjectManagementReturn
 */
const useProjectManagement = (
  _tabGroups: TabGroup[],
  _settings: UserSettings,
  initialViewMode?: ViewMode,
): UseProjectManagementReturn => {
  const { t } = useI18n()
  const [customProjects, setCustomProjects] = useState<CustomProject[]>([])
  const [viewMode, setViewMode] = useState<ViewMode>(
    initialViewMode ?? 'domain',
  )
  const customProjectsRef = useRef<CustomProject[]>([])
  const viewModeRef = useRef<ViewMode>(initialViewMode ?? 'domain')
  const creatingProjectNamesRef = useRef<Set<string>>(new Set())

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
      const projects = await getCustomProjects()
      setCustomProjects(projects)
      return projects
    } catch (error) {
      console.error('データ同期エラー:', error)
      try {
        const latestProjects = await getCustomProjects()
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
        const newProject = await createCustomProject(normalizedName)
        setCustomProjects((prev) => {
          const withoutCreated = prev.filter(
            (project) => project.id !== newProject.id,
          )
          return [newProject, ...withoutCreated]
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
        await deleteCustomProject(projectId)
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
        await updateCustomProjectName(projectId, newName)
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
        await updateProjectKeywords(projectId, projectKeywords)
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
        await addUrlToCustomProject(projectId, url, title)
        const updatedProjects = await getCustomProjects()
        setCustomProjects(updatedProjects)
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
        const undoSnapshot = await getCustomProjectUndoSnapshot()
        const updatedProjects = await Promise.resolve(
          removeUrlFromCustomProject(projectId, url),
        ).then(() => getCustomProjects())
        setCustomProjects(updatedProjects)
        showCustomProjectDeleteUndoToast({
          count: 1,
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
        const undoSnapshot = await getCustomProjectUndoSnapshot()
        const updatedProjects = await Promise.resolve(
          removeUrlsFromCustomProject(projectId, urls),
        ).then(() => getCustomProjects())
        setCustomProjects(updatedProjects)
        showCustomProjectDeleteUndoToast({
          count: urls.length,
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
        await addCategoryToProject(projectId, categoryName)
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
        await removeCategoryFromProject(projectId, categoryName)
        const updatedProjects = await getCustomProjects()
        setCustomProjects(updatedProjects)
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
        await setUrlCategory(projectId, url, category)
        const updatedProjects = await getCustomProjects()
        setCustomProjects(updatedProjects)
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
        await updateCategoryOrder(projectId, newOrder)
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
        await reorderProjectUrls(projectId, urls)
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
        await updateProjectOrder(newOrder)
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
        await renameCategoryInProject(
          projectId,
          oldCategoryName,
          newCategoryName,
        )
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
// eslint-disable-next-line eslint/max-nested-callbacks
                    ? project.categoryOrder.map((cat) =>
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
        const projects = await getCustomProjects()
        console.log(`カスタムプロジェクト数: ${projects.length}`)

        // UIを更新
        if (isActive) {
          setCustomProjects(projects)
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
