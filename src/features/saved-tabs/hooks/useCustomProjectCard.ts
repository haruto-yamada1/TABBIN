import type { CollisionDetection, DragEndEvent } from '@dnd-kit/core'
import { closestCenter } from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { toast } from 'sonner'

import { useI18n } from '@/features/i18n/context/I18nProvider'
import { getMessage } from '@/features/i18n/lib/language'
import { getProjectUrls } from '@/lib/storage/projects'
import type { CustomProject, UrlRecord } from '@/types/storage'

import { useCategoryDnD } from './useCategoryDnD'

/** UseCustomProjectCard フックの引数 */
interface UseCustomProjectCardParams {
  /** プロジェクトデータ */
  project: CustomProject
  /** URL削除ハンドラ */
  handleDeleteUrl: (projectId: string, url: string) => void
  /** URLカテゴリ設定ハンドラ */
  handleSetUrlCategory: (
    projectId: string,
    url: string,
    category?: string,
  ) => void
  /** カテゴリ順序更新ハンドラ */
  handleUpdateCategoryOrder: (projectId: string, newOrder: string[]) => void
  /** URL並び替えハンドラ */
  handleReorderUrls: (projectId: string, urls: CustomProject['urls']) => void
}
type ProjectUrlItem = UrlRecord & {
  notes?: string
  category?: string
}
const isPointerDroppedInUncategorizedArea = (
  event: DragEndEvent,
  hasSourceCategory: boolean,
): boolean => {
  if (!hasSourceCategory || !(event.activatorEvent instanceof MouseEvent)) {
    return false
  }
  const activatorEvent = event.activatorEvent
  const { delta } = event
  const dropX = activatorEvent.clientX + delta.x
  const dropY = activatorEvent.clientY + delta.y
  // eslint-disable-next-line typescript/no-unsafe-type-assertion
  const dropEl = document.elementFromPoint(dropX, dropY) as HTMLElement | null
  return Boolean(dropEl?.closest('[data-uncategorized-area="true"]'))
}
const isUncategorizedDropTarget = (
  over: DragEndEvent['over'],
  projectId: string,
): boolean => {
  if (!over) {
    return false
  }
  if (over.data?.current?.type === 'uncategorized') {
    return true
  }
  if (over.id === `uncategorized-${projectId}`) {
    return true
  }
  return typeof over.id === 'string' && over.id.includes('uncategorized')
}
const reorderUrlsInBucket = (
  projectUrls: ProjectUrlItem[],
  sourceCategory: string | undefined,
  actualUrl: string,
  overId: string,
): ProjectUrlItem[] | null => {
  const urlsInTarget = projectUrls.filter((u) => u.category === sourceCategory)
  const oldIndex = urlsInTarget.findIndex((u) => u.url === actualUrl)
  const newIndex = urlsInTarget.findIndex((u) => u.url === overId)
  if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
    return null
  }
  const moved = arrayMove(urlsInTarget, oldIndex, newIndex)
  let movedIndex = 0
  return projectUrls.map((u) => {
    if (u.category === sourceCategory) {
      return moved[movedIndex++]
    }
    return u
  })
}
const resolveOverCategory = (
  over: DragEndEvent['over'],
): string | undefined => {
  if (!over) {
    return undefined
  }
  if (over.data?.current?.type === 'category') {
    // eslint-disable-next-line typescript/no-unsafe-return
    return over.data.current.categoryName
  }
  // eslint-disable-next-line typescript/no-unsafe-return
  return over.data?.current?.category
}
type UrlToUrlDropResult =
  | {
      kind: 'noop'
    }
  | {
      kind: 'reordered'
      reorderedUrls: ProjectUrlItem[]
    }
  | {
      kind: 'moved'
      overCategory: string | undefined
    }
const shouldMoveToUncategorized = (params: {
  event: DragEndEvent
  isUncategorizedOver: boolean
  dragSourceCategory: string | undefined
  over: DragEndEvent['over']
  projectId: string
}): boolean => {
  const { event, isUncategorizedOver, dragSourceCategory, over, projectId } =
    params
  if (!dragSourceCategory) {
    return false
  }
  if (isPointerDroppedInUncategorizedArea(event, true)) {
    return true
  }
  if (isUncategorizedOver) {
    return true
  }
  return isUncategorizedDropTarget(over, projectId)
}
const applyMovedCategoryToUrls = (
  urls: ProjectUrlItem[],
  actualUrl: string,
  overCategory: string | undefined,
): ProjectUrlItem[] =>
  urls.map((url) =>
    url.url === actualUrl
      ? {
          ...url,
          category: overCategory,
        }
      : url,
  )
const handleProcessedUrlDrop = (params: {
  projectId: string
  actualUrl: string
  dragSourceCategory: string | undefined
  over: DragEndEvent['over']
  event: DragEndEvent
  isUncategorizedOver: boolean
  projectUrls: ProjectUrlItem[]
  handleSetUrlCategory: (
    projectId: string,
    url: string,
    category?: string,
  ) => void
  handleReorderUrls: (projectId: string, urls: CustomProject['urls']) => void
  setProjectUrls: Dispatch<SetStateAction<ProjectUrlItem[]>>
  clearDragState: () => void
  language: 'ja' | 'en'
}): void => {
  const {
    projectId,
    actualUrl,
    dragSourceCategory,
    over,
    event,
    isUncategorizedOver,
    projectUrls,
    handleSetUrlCategory,
    handleReorderUrls,
    setProjectUrls,
    clearDragState,
    language,
  } = params
  const moveToUncategorized = () => {
    handleSetUrlCategory(projectId, actualUrl, undefined)
    toast.success(getMessage(language, 'savedTabs.tab.movedToUncategorized'))
    clearDragState()
  }
  if (
    shouldMoveToUncategorized({
      dragSourceCategory,
      event,
      isUncategorizedOver,
      over,
      projectId,
    })
  ) {
    moveToUncategorized()
    return
  }
  const urlToUrlDropResult = processUrlToUrlDrop({
    active: event.active,
    actualUrl,
    dragSourceCategory,
    over,
    projectUrls,
  })
  if (urlToUrlDropResult.kind === 'reordered') {
    handleReorderUrls(projectId, urlToUrlDropResult.reorderedUrls)
    setProjectUrls(urlToUrlDropResult.reorderedUrls)
    toast.success(getMessage(language, 'savedTabs.tab.orderUpdated'))
    clearDragState()
    return
  }
  if (urlToUrlDropResult.kind === 'moved') {
    handleSetUrlCategory(projectId, actualUrl, urlToUrlDropResult.overCategory)
    setProjectUrls((prev) =>
      applyMovedCategoryToUrls(
        prev,
        actualUrl,
        urlToUrlDropResult.overCategory,
      ),
    )
    toast.success(
      urlToUrlDropResult.overCategory
        ? getMessage(language, 'savedTabs.tab.movedToCategory', undefined, {
            name: urlToUrlDropResult.overCategory,
          })
        : getMessage(language, 'savedTabs.tab.movedToUncategorized'),
    )
    clearDragState()
    return
  }
  if (over?.data?.current?.type === 'category') {
    // eslint-disable-next-line typescript/no-unsafe-assignment
    const targetCategory = over.data.current.categoryName
    if (targetCategory && targetCategory !== dragSourceCategory) {
      // eslint-disable-next-line typescript/no-unsafe-argument
      handleSetUrlCategory(projectId, actualUrl, targetCategory)
      toast.success(
        getMessage(language, 'savedTabs.tab.movedToCategory', undefined, {
          // eslint-disable-next-line typescript/no-unsafe-assignment
          name: targetCategory,
        }),
      )
      clearDragState()
      return
    }
  }
  clearDragState()
}
const processUrlToUrlDrop = (params: {
  active: DragEndEvent['active']
  over: DragEndEvent['over']
  projectUrls: ProjectUrlItem[]
  dragSourceCategory: string | undefined
  actualUrl: string
}): UrlToUrlDropResult => {
  const { active, over, projectUrls, dragSourceCategory, actualUrl } = params
  const isUrlToUrlDrop =
    active.data.current?.type === 'url' &&
    over?.data.current?.type === 'url' &&
    over.id !== active.id
  if (!isUrlToUrlDrop) {
    return {
      kind: 'noop',
    }
  }
  const overCategory = resolveOverCategory(over)
  const isSameBucket =
    // eslint-disable-next-line typescript/prefer-nullish-coalescing
    !(dragSourceCategory || overCategory) || dragSourceCategory === overCategory
  if (!isSameBucket) {
    return {
      kind: 'moved',
      overCategory,
    }
  }
  const reorderedUrls = reorderUrlsInBucket(
    projectUrls,
    dragSourceCategory,
    actualUrl,
    String(over.id),
  )
  if (!reorderedUrls) {
    return {
      kind: 'noop',
    }
  }
  return {
    kind: 'reordered',
    reorderedUrls,
  }
}
/**
 * CustomProjectCard の状態ロジックを管理するカスタムフック
 * @param params フックの引数
 * @returns プロジェクトURL・DnD・衝突検出関連の状態と操作
 */
export const useCustomProjectCard = ({
  project,
  handleSetUrlCategory,
  handleUpdateCategoryOrder,
  handleReorderUrls,
}: UseCustomProjectCardParams) => {
  const { t, language } = useI18n()
  // --- プロジェクトURL状態 ---
  const [urlState, setUrlState] = useState({
    isLoadingUrls: true,
    projectUrls: [] as ProjectUrlItem[],
  })
  const { isLoadingUrls, projectUrls } = urlState
  const setProjectUrls: Dispatch<SetStateAction<ProjectUrlItem[]>> =
    useCallback((action) => {
      setUrlState((current) => ({
        ...current,
        projectUrls:
          action instanceof Function ? action(current.projectUrls) : action,
      }))
    }, [])
  const projectUrlsRef = useRef(projectUrls)
  const handleSetUrlCategoryRef = useRef(handleSetUrlCategory)
  useEffect(() => {
    projectUrlsRef.current = projectUrls
  }, [projectUrls])
  useEffect(() => {
    handleSetUrlCategoryRef.current = handleSetUrlCategory
  }, [handleSetUrlCategory])

  // --- DnD状態管理 ---
  const {
    isDraggingCategory,
    draggedCategoryName,
    activeId,
    draggedOverCategory,
    setDraggedOverCategory,
    setActiveId,
    handleDragStart,
    handleDragOver,
    resetDnD,
  } = useCategoryDnD()

  // --- プロジェクトURL読み込み ---
  useEffect(() => {
    const loadProjectUrls = async () => {
      let nextProjectUrls: ProjectUrlItem[] = []
      try {
        nextProjectUrls = await getProjectUrls(project)
      } catch (error) {
        console.error('プロジェクトURLの取得エラー:', error)
      }
      setUrlState({ isLoadingUrls: false, projectUrls: nextProjectUrls })
    }
    // eslint-disable-next-line typescript/no-floating-promises
    loadProjectUrls()
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- URL loading intentionally tracks the project fields that affect stored URLs.
  }, [project.id, project.updatedAt, project.urlIds, project.urls])

  // --- 衝突検出ストラテジー ---
  const collisionDetectionStrategy: CollisionDetection = useCallback(
    (args) => closestCenter(args),
    [],
  )

  // --- URLドラッグ終了時 ---
  const handleUrlDragEnd = useCallback(
    (event: DragEndEvent, isUncategorizedOver: boolean) => {
      const { active, over } = event
      // eslint-disable-next-line typescript/prefer-nullish-coalescing
      const actualUrl = active.data.current?.url || String(active.id) // eslint-disable-line typescript/no-unsafe-assignment
      // eslint-disable-next-line typescript/no-unsafe-assignment
      const dragSourceCategory = active.data.current?.category
      setActiveId(null)
      const clearDragState = () => {
        setDraggedOverCategory(null)
      }
      if (!over) {
        clearDragState()
        return
      }
      handleProcessedUrlDrop({
        // eslint-disable-next-line typescript/no-unsafe-assignment
        actualUrl,
        clearDragState,
        // eslint-disable-next-line typescript/no-unsafe-assignment
        dragSourceCategory,
        event,
        handleReorderUrls,
        handleSetUrlCategory,
        isUncategorizedOver,
        language,
        over,
        projectId: project.id,
        projectUrls,
        setProjectUrls,
      })
    },
    [
      project.id,
      projectUrls,
      handleSetUrlCategory,
      handleReorderUrls,
      setActiveId,
      setDraggedOverCategory,
      setProjectUrls,
      language,
    ],
  )

  // --- カテゴリドラッグ終了時 ---
  const handleCategoryDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      resetDnD()
      if (!over) {
        return
      }
      if (isDraggingCategory && draggedCategoryName && active.id !== over.id) {
        const oldIndex =
          // eslint-disable-next-line typescript/no-unsafe-type-assertion
          project.categoryOrder?.indexOf(active.id as string) ??
          // eslint-disable-next-line typescript/no-unsafe-type-assertion
          project.categories.indexOf(active.id as string)
        const newIndex =
          // eslint-disable-next-line typescript/no-unsafe-type-assertion
          project.categoryOrder?.indexOf(over.id as string) ??
          // eslint-disable-next-line typescript/no-unsafe-type-assertion
          project.categories.indexOf(over.id as string)
        if (oldIndex !== -1 && newIndex !== -1) {
          const newOrder = arrayMove(
            // eslint-disable-next-line typescript/prefer-nullish-coalescing
            project.categoryOrder || project.categories,
            oldIndex,
            newIndex,
          )
          handleUpdateCategoryOrder(project.id, newOrder)
          toast.success(t('savedTabs.projectCategory.orderUpdated'))
        }
      }
    },
    [
      isDraggingCategory,
      draggedCategoryName,
      project.categoryOrder,
      project.categories,
      project.id,
      handleUpdateCategoryOrder,
      resetDnD,
      t,
    ],
  )

  // --- Alt+クリックによるカテゴリ解除 ---
  useEffect(() => {
    const handleManualCategoryReset = (e: MouseEvent) => {
      if (e.altKey) {
        // eslint-disable-next-line typescript/no-unsafe-type-assertion
        const targetElement = document.elementFromPoint(
          e.clientX,
          e.clientY,
        ) as HTMLElement
        if (targetElement) {
          const urlAttr =
            // eslint-disable-next-line typescript/prefer-nullish-coalescing
            targetElement.getAttribute('data-url') ||
            targetElement.closest('[data-url]')?.getAttribute('data-url')
          if (
            urlAttr &&
            projectUrlsRef.current.some((u) => u.url === urlAttr)
          ) {
            handleSetUrlCategoryRef.current(project.id, urlAttr, undefined)
            toast.success(t('savedTabs.tab.categoryClearedAlt'))
          }
        }
      }
    }
    document.addEventListener('click', handleManualCategoryReset)
    return () => {
      document.removeEventListener('click', handleManualCategoryReset)
    }
  }, [project.id, t])

  // --- 計算済みデータ ---
  const uncategorizedUrls = projectUrls.filter((url) => !url.category)
  // eslint-disable-next-line typescript/prefer-nullish-coalescing
  const categoryOrder = project.categoryOrder || project.categories
  return {
    /** カテゴリ表示順 */
    categoryOrder,
    /** DnD関連 */
    dnd: {
      activeId,
      collisionDetectionStrategy,
      draggedCategoryName,
      draggedOverCategory,
      handleCategoryDragEnd,
      handleDragOver,
      handleDragStart,
      handleUrlDragEnd,
      isDraggingCategory,
      resetDnD,
      setActiveId,
      setDraggedOverCategory,
    },
    /** プロジェクトURL関連 */
    urls: {
      isLoadingUrls,
      projectUrls,
      setProjectUrls,
      uncategorizedUrls,
    },
  }
}
