import { useCallback, useEffect } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { toast } from 'sonner'

import type { ViewMode } from '@/contexts/saved-tabs/presentation/types/mode'
import type { SavedTabsCustomProjectDto as CustomProject } from '@/contexts/saved-tabs/presentation/types/SavedTabsCompatibilityViewModel'

import { toRawStorageCustomProject } from './projectManagementDefaults'
import type { ProjectManagementRefs } from './useProjectManagementRefs'

type ProjectCategoryHandlerDeps = {
  refs: ProjectManagementRefs
  setCustomProjects: Dispatch<SetStateAction<CustomProject[]>>
  setViewMode: Dispatch<SetStateAction<ViewMode>>
  initialViewMode: ViewMode | undefined
  t: (key: string, fallback?: string, values?: Record<string, string>) => string
}

type CustomProjectUrl = NonNullable<CustomProject['urls']>[number]

const renameUrlCategory = (
  item: CustomProjectUrl,
  oldCategoryName: string,
  newCategoryName: string,
): CustomProjectUrl => {
  const nextCategory =
    item.category === oldCategoryName ? newCategoryName : item.category
  const { category: _category, ...itemWithoutCategory } = item
  return {
    ...itemWithoutCategory,
    ...(nextCategory !== undefined ? { category: nextCategory } : {}),
  }
}

const renameProjectCategory = (
  project: CustomProject,
  projectId: string,
  oldCategoryName: string,
  newCategoryName: string,
): CustomProject => {
  if (project.id !== projectId) {
    return project
  }
  const categoryOrder = project.categoryOrder?.map((category) =>
    category === oldCategoryName ? newCategoryName : category,
  )
  const urls = project.urls?.map((item) =>
    renameUrlCategory(item, oldCategoryName, newCategoryName),
  )
  return {
    ...project,
    categories: project.categories.map((category) =>
      category === oldCategoryName ? newCategoryName : category,
    ),
    ...(categoryOrder !== undefined ? { categoryOrder } : {}),
    ...(urls !== undefined ? { urls } : {}),
  }
}

const renameProjectCategoryState = (
  projects: CustomProject[],
  projectId: string,
  oldCategoryName: string,
  newCategoryName: string,
): CustomProject[] =>
  projects.map((project) =>
    renameProjectCategory(project, projectId, oldCategoryName, newCategoryName),
  )

const useProjectCategoryHandlers = ({
  refs,
  setCustomProjects,
  setViewMode,
  initialViewMode,
  t,
}: ProjectCategoryHandlerDeps) => {
  const handleAddCategory = useCallback(
    async (projectId: string, categoryName: string): Promise<void> => {
      try {
        await refs.addCategoryToCustomProjectUseCaseRef.current({
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
    [refs.addCategoryToCustomProjectUseCaseRef, setCustomProjects, t],
  )

  const handleDeleteProjectCategory = useCallback(
    async (projectId: string, categoryName: string): Promise<void> => {
      try {
        await refs.removeCategoryFromCustomProjectUseCaseRef.current({
          categoryName,
          projectId,
        })
        const updatedRaws = await refs.getCustomProjectRawsQueryRef.current()
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
    [
      refs.removeCategoryFromCustomProjectUseCaseRef,
      refs.getCustomProjectRawsQueryRef,
      setCustomProjects,
      t,
    ],
  )

  const handleSetUrlCategory = useCallback(
    async (
      projectId: string,
      url: string,
      category?: string,
    ): Promise<void> => {
      try {
        await refs.setCustomProjectUrlCategoryUseCaseRef.current({
          ...(category !== undefined ? { category } : {}),
          projectId,
          url,
        })
        const updatedRaws = await refs.getCustomProjectRawsQueryRef.current()
        setCustomProjects(updatedRaws.map(toRawStorageCustomProject))
      } catch (error) {
        console.error('URL分類エラー:', error)
        toast.error(t('savedTabs.tab.moveError'))
      }
    },
    [
      refs.setCustomProjectUrlCategoryUseCaseRef,
      refs.getCustomProjectRawsQueryRef,
      setCustomProjects,
      t,
    ],
  )

  const handleUpdateCategoryOrder = useCallback(
    async (projectId: string, newOrder: string[]): Promise<void> => {
      try {
        console.log(`カテゴリ順序を更新: ${projectId}`, newOrder)
        await refs.updateCustomProjectCategoryOrderUseCaseRef.current({
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
    [refs.updateCustomProjectCategoryOrderUseCaseRef, setCustomProjects, t],
  )

  const handleReorderUrls = useCallback(
    async (projectId: string, urls: CustomProject['urls']): Promise<void> => {
      try {
        const resolvedUrls = (urls ?? []).flatMap((url) =>
          url.id
            ? [
                {
                  ...url,
                  id: url.id,
                  savedAt: url.savedAt ?? 0,
                },
              ]
            : [],
        )
        await refs.reorderCustomProjectUrlsUseCaseRef.current({
          projectId,
          urls: resolvedUrls,
        })
        setCustomProjects((prev) =>
          prev.map((project) => {
            if (project.id !== projectId) {
              return project
            }
            const { urls: _currentUrls, ...projectWithoutUrls } = project
            return {
              ...projectWithoutUrls,
              updatedAt: Date.now(),
              ...(urls !== undefined ? { urls } : {}),
            }
          }),
        )
      } catch (error) {
        console.error('URL順序更新エラー:', error)
        toast.error(t('savedTabs.tab.orderUpdateError'))
      }
    },
    [refs.reorderCustomProjectUrlsUseCaseRef, setCustomProjects, t],
  )

  const handleReorderProjects = useCallback(
    async (newOrder: string[]): Promise<void> => {
      try {
        console.log('プロジェクト順序を更新:', newOrder)
        await refs.saveCustomProjectOrderUseCaseRef.current({ newOrder })
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
    [refs.saveCustomProjectOrderUseCaseRef, setCustomProjects, t],
  )

  const handleRenameCategory = useCallback(
    async (
      projectId: string,
      oldCategoryName: string,
      newCategoryName: string,
    ): Promise<void> => {
      try {
        await refs.renameCustomProjectCategoryUseCaseRef.current({
          newCategoryName,
          oldCategoryName,
          projectId,
        })
        setCustomProjects((projects) =>
          renameProjectCategoryState(
            projects,
            projectId,
            oldCategoryName,
            newCategoryName,
          ),
        )
        toast.success(t('savedTabs.projectCategory.renamed'))
      } catch (error) {
        console.error('カテゴリ名の変更エラー:', error)
        toast.error(t('savedTabs.subCategory.renameError'))
      }
    },
    [refs.renameCustomProjectCategoryUseCaseRef, setCustomProjects, t],
  )

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

        const [raws, order] = await Promise.all([
          refs.getCustomProjectRawsQueryRef.current(),
          refs.getCustomProjectOrderQueryRef.current(),
        ])
        const projectsAsCust = raws.map(toRawStorageCustomProject)
        const orderKeys = [...order]
        const ordered =
          orderKeys.length > 0
            ? [
                ...orderKeys
                  .map((id) =>
                    projectsAsCust.find((project) => project.id === id),
                  )
                  .filter(
                    (project): project is CustomProject =>
                      project !== undefined,
                  ),
                ...projectsAsCust.filter(
                  (project) => !orderKeys.includes(project.id),
                ),
              ]
            : projectsAsCust
        console.log(`カスタムプロジェクト数: ${ordered.length}`)

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
  }, [
    initialViewMode,
    refs.getCustomProjectOrderQueryRef,
    refs.getCustomProjectRawsQueryRef,
    setCustomProjects,
    setViewMode,
  ])

  return {
    handleAddCategory,
    handleDeleteProjectCategory,
    handleRenameCategory,
    handleReorderProjects,
    handleReorderUrls,
    handleSetUrlCategory,
    handleUpdateCategoryOrder,
  }
}

export { useProjectCategoryHandlers }
