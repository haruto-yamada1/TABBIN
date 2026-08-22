import type { CollisionDetection, DragEndEvent } from '@dnd-kit/core'
import { closestCenter } from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { toast } from 'sonner'

import type { GetProjectUrlsUseCase } from '@/contexts/saved-tabs/application/use-cases/GetProjectUrlsUseCase'
import { toCustomProjectFromViewModel } from '@/contexts/saved-tabs/presentation/mappers/SavedTabsCompatibilityViewModelMapper'
import type {
  SavedTabsCustomProjectDto as CustomProject,
  SavedTabsUrlRecordDto as UrlRecord,
} from '@/contexts/saved-tabs/presentation/types/SavedTabsCompatibilityViewModel'
import { useI18n } from '@/features/i18n/context/I18nProvider'
import { getMessage } from '@/features/i18n/lib/language'

import { useCategoryDnD } from './useCategoryDnD'

/** UseCustomProjectCard フックの引数 */
type UseCustomProjectCardParams = {
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
  /**
   * プロジェクト URL 取得 use-case（issue #509）。
   * テストで `useCustomProjectCard` 全体をモックする
   * ケースを考慮して optional とし、未指定時は空配列を返す
   * no-op 関数としてフォールバックする。
   */
  getProjectUrlsUseCase?: GetProjectUrlsUseCase
}
type ProjectUrlItem = UrlRecord & {
  notes?: string
  category?: string
}
type UrlState = {
  isLoadingUrls: boolean
  projectUrls: ProjectUrlItem[]
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
  const dropEl = document.elementFromPoint(dropX, dropY)
  const dropHTMLEl = dropEl instanceof HTMLElement ? dropEl : null
  return Boolean(dropHTMLEl?.closest('[data-uncategorized-area="true"]'))
}
const isUncategorizedDropTarget = (
  over: DragEndEvent['over'],
  projectId: string,
): boolean => {
  if (!over) {
    return false
  }
  if (over.data.current?.type === 'uncategorized') {
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
  if (over.data.current?.type === 'category') {
    // eslint-disable-next-line typescript/no-unsafe-return
    return over.data.current.categoryName
  }
  // eslint-disable-next-line typescript/no-unsafe-return
  return over.data.current?.category
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
  urls.map((url) => {
    if (url.url !== actualUrl) {
      return url
    }
    const { category: _category, ...urlWithoutCategory } = url
    return {
      ...urlWithoutCategory,
      ...(overCategory !== undefined ? { category: overCategory } : {}),
    }
  })
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
  if (over?.data.current?.type === 'category') {
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
    // `||` needed: empty string category should be treated as absent
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
const noopGetProjectUrls: GetProjectUrlsUseCase = async () => {
  await Promise.resolve()
  return []
}

export const useCustomProjectCard = ({
  project,
  handleSetUrlCategory,
  handleUpdateCategoryOrder,
  handleReorderUrls,
  getProjectUrlsUseCase = noopGetProjectUrls,
}: UseCustomProjectCardParams) => {
  const { t, language } = useI18n()
  // --- プロジェクトURL状態 ---
  const [urlState, setUrlState] = useState<UrlState>({
    isLoadingUrls: true,
    projectUrls: [],
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
  // use case は `project.id` / `project.urlIds` / `project.urls` /
  // `project.updatedAt` のみ参照する。親が project フィールド変更時に
  // 新しい参照で再レンダリングする前提で、`project` 参照自体を deps に
  // 置く。`void run()` で `no-floating-promises` を満たし、
  // `isCancelled` flag で unmount 後の state 書き込みを防ぐ。
  useEffect(() => {
    let isCancelled = false
    const run = async () => {
      let nextProjectUrls: ProjectUrlItem[] = []
      try {
        nextProjectUrls = await getProjectUrlsUseCase(
          toCustomProjectFromViewModel(project),
        )
      } catch (error) {
        console.error('プロジェクトURLの取得エラー:', error)
      }
      if (!isCancelled) {
        setUrlState({ isLoadingUrls: false, projectUrls: nextProjectUrls })
      }
    }
    void run()
    return () => {
      isCancelled = true
    }
  }, [getProjectUrlsUseCase, project])

  // --- 衝突検出ストラテジー ---
  const collisionDetectionStrategy: CollisionDetection = useCallback(
    (args) => closestCenter(args),
    [],
  )

  // --- URLドラッグ終了時 ---
  const handleUrlDragEnd = useCallback(
    (event: DragEndEvent, isUncategorizedOver: boolean) => {
      const { active, over } = event
      // `||` needed: url could be empty string; fallback to active.id
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
        const activeId = String(active.id)
        const overId = String(over.id)
        const oldIndex =
          project.categoryOrder?.indexOf(activeId) ??
          project.categories.indexOf(activeId)
        const newIndex =
          project.categoryOrder?.indexOf(overId) ??
          project.categories.indexOf(overId)
        if (oldIndex !== -1 && newIndex !== -1) {
          const newOrder = arrayMove(
            // `||` needed: empty array [] categoryOrder should fall through to project.categories
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
        const targetElement = document.elementFromPoint(e.clientX, e.clientY)
        if (!(targetElement instanceof HTMLElement)) {
          return
        }

        const urlAttr =
          // `||` needed: getAttribute could return empty string
          // eslint-disable-next-line typescript/prefer-nullish-coalescing
          targetElement.getAttribute('data-url') ||
          targetElement.closest('[data-url]')?.getAttribute('data-url')
        if (urlAttr && projectUrlsRef.current.some((u) => u.url === urlAttr)) {
          handleSetUrlCategoryRef.current(project.id, urlAttr, undefined)
          toast.success(t('savedTabs.tab.categoryClearedAlt'))
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
  // `||` needed: empty array [] categoryOrder should fall through to project.categories
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
