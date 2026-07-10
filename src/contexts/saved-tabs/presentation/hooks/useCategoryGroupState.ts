import type { DragEndEvent } from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import { useCallback, useMemo, useState } from 'react'
import { toast } from 'sonner'

import type {
  SavedTabsParentCategoryDto as ParentCategory,
  SavedTabsTabGroupDto as TabGroup,
} from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDto'
import type { RenameParentCategoryUseCase } from '@/contexts/saved-tabs/application/use-cases/RenameParentCategoryUseCase'
import { useI18n } from '@/features/i18n/context/I18nProvider'

import { useSortOrder } from './useSortOrder'

/** UseCategoryGroupState フックの引数 */
type UseCategoryGroupStateParams = {
  /** 親カテゴリデータ */
  category: ParentCategory
  /** ドメイン一覧 */
  domains: TabGroup[]
  /** ドメイン順序更新ハンドラ */
  handleUpdateDomainsOrder?: (
    categoryId: string,
    updatedDomains: TabGroup[],
  ) => void
  /** ドメイン削除ハンドラ */
  handleDeleteGroup: (id: string) => void
  /** 親カテゴリ並び替えモード状態 */
  isCategoryReorderMode: boolean
  /**
   * 親カテゴリ名リネーム use-case (issue #502)。
   * presentation 層から `chrome.storage.local` を直叩きせず
   * application 層へ委譲する。
   */
  renameParentCategoryUseCase: RenameParentCategoryUseCase
}
/**
 * CategoryGroup の状態ロジックを管理するカスタムフック
 * @param params フックの引数
 * @returns 折りたたみ・ソート・並び替え・モーダル・DnD関連の状態と操作
 */
export const useCategoryGroupState = ({
  // eslint-disable-line eslint/max-lines-per-function
  category,
  domains,
  handleUpdateDomainsOrder,
  handleDeleteGroup,
  isCategoryReorderMode,
  renameParentCategoryUseCase,
}: UseCategoryGroupStateParams) => {
  const { t } = useI18n()
  // --- 基本状態 ---
  const [collapseState, setCollapseState] = useState({
    isCollapsed: false,
    userCollapsedState: false,
  })
  const { isCollapsed, userCollapsedState } = collapseState
  const setIsCollapsed = useCallback((nextIsCollapsed: boolean) => {
    setCollapseState((prev) => ({
      ...prev,
      isCollapsed: nextIsCollapsed,
    }))
  }, [])
  const setUserCollapsedState = useCallback(
    (nextUserCollapsedState: boolean) => {
      setCollapseState((prev) => ({
        ...prev,
        userCollapsedState: nextUserCollapsedState,
      }))
    },
    [],
  )
  const [, setIsDraggingOver] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isDraggingDomains, setIsDraggingDomains] = useState(false)
  const [isDraggingGlobal, setIsDraggingGlobal] = useState<boolean>(false)

  // --- 並び替え状態 ---
  const [isReorderMode, setIsReorderMode] = useState(false)
  const [, setOriginalDomainOrder] = useState<TabGroup[]>([])
  const [tempDomainOrder, setTempDomainOrder] = useState<typeof domains>([])

  // --- ドメイン状態とソート ---
  const localDomains = domains
  const {
    sortOrder,
    setSortOrder,
    sortedItems: sortedDomains,
  } = useSortOrder(localDomains, (d) => d.domain)

  // --- カテゴリ名更新ハンドラ ---
  const handleCategoryUpdate = useCallback(
    async (categoryId: string, newName: string) => {
      try {
        console.log('CategoryGroup - handleCategoryUpdate開始:', {
          categoryId,
          currentCategory: category,
          newName,
        })
        await renameParentCategoryUseCase({
          // storage 層 `categoryId` (plain string) を branded 化は
          // domain factory に閉じ、`as unknown as` を排除する。
          categoryId,
          newName,
        })
      } catch (error) {
        console.error('CategoryGroup - カテゴリ名の更新に失敗:', error)
        toast.error(t('savedTabs.categoryManagement.renameError'))
      }
    },
    [category, renameParentCategoryUseCase, t],
  )

  // --- グローバルドラッグ監視 ---
  const handleGlobalDragStart = useCallback(() => {
    setIsDraggingGlobal(true)
  }, [])
  const handleGlobalDragFinish = useCallback(() => {
    setIsDraggingGlobal(false)
    if (!(isReorderMode || isCategoryReorderMode)) {
      setIsCollapsed(false)
    }
  }, [isReorderMode, isCategoryReorderMode, setIsCollapsed])
  const dndMonitorHandlers = useMemo(
    () => ({
      onDragCancel: handleGlobalDragFinish,
      onDragEnd: handleGlobalDragFinish,
      onDragStart: handleGlobalDragStart,
    }),
    [handleGlobalDragStart, handleGlobalDragFinish],
  )

  // --- ドラッグ中の折りたたみ制御 ---
  const [prevDragSync, setPrevDragSync] = useState<{
    isDraggingGlobal: boolean
    isCategoryReorderMode: boolean
  } | null>(null)

  if (
    !prevDragSync ||
    prevDragSync.isDraggingGlobal !== isDraggingGlobal ||
    prevDragSync.isCategoryReorderMode !== isCategoryReorderMode
  ) {
    setPrevDragSync({ isDraggingGlobal, isCategoryReorderMode })
    if (isDraggingGlobal && !isCategoryReorderMode) {
      setIsCollapsed(true)
    }
  }

  // --- 親カテゴリ並び替えモード中の折りたたみ ---
  const [prevReorderMode, setPrevReorderMode] = useState(false)

  if (prevReorderMode !== isCategoryReorderMode) {
    setPrevReorderMode(isCategoryReorderMode)
    if (isCategoryReorderMode) {
      setCollapseState({
        isCollapsed: true,
        userCollapsedState: isCollapsed,
      })
    } else {
      setCollapseState((prev) => ({
        ...prev,
        isCollapsed: userCollapsedState,
      }))
    }
  }

  // --- ネイティブDnDハンドラ ---
  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    setIsDraggingOver(true)
  }, [])
  const handleDragLeave = useCallback(() => {
    setIsDraggingOver(false)
  }, [])
  const handleDrop = useCallback(
    (
      event: React.DragEvent,
      handleMoveDomainToCategory?: (
        domainId: string,
        fromCategoryId: string | null,
        toCategoryId: string,
      ) => void,
    ) => {
      event.preventDefault()
      setIsDraggingOver(false)
      const domainId = event.dataTransfer.getData('domain-id')
      const fromCategoryId = event.dataTransfer.getData('from-category-id')
      if (
        domainId &&
        handleMoveDomainToCategory &&
        fromCategoryId !== category.id
      ) {
        handleMoveDomainToCategory(
          domainId,
          fromCategoryId || null,
          category.id,
        )
      }
    },
    [category.id],
  )

  // --- ドメインDnDハンドラ ---
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (over && active.id !== over.id) {
        const currentOrder = isReorderMode ? tempDomainOrder : localDomains
        const oldIndex = currentOrder.findIndex(
          (domain) => domain.id === active.id,
        )
        const newIndex = currentOrder.findIndex(
          (domain) => domain.id === over.id,
        )
        if (oldIndex !== -1 && newIndex !== -1) {
          const updatedDomains = arrayMove(currentOrder, oldIndex, newIndex)
          if (isReorderMode) {
            setTempDomainOrder(updatedDomains)
          } else {
            setIsReorderMode(true)
            setOriginalDomainOrder(
              localDomains.map((domain) => {
                const { urls, ...rest } = domain
                return {
                  ...rest,
                  urls: urls ?? [],
                }
              }),
            )
            setTempDomainOrder(
              updatedDomains.map((domain) => {
                const { urls, ...rest } = domain
                return {
                  ...rest,
                  urls: urls ?? [],
                }
              }),
            )
          }
        }
      }
      setIsDraggingDomains(false)
    },
    [isReorderMode, tempDomainOrder, localDomains],
  )
  const handleDragStart = useCallback(() => {
    setIsDraggingDomains(true)
  }, [])

  // --- 並び替え確定 ---
  const handleConfirmReorder = useCallback(() => {
    if (!isReorderMode) {
      return
    }
    try {
      if (handleUpdateDomainsOrder) {
        // eslint-disable-next-line typescript/no-confusing-void-expression
        handleUpdateDomainsOrder(category.id, tempDomainOrder)
      }
      setIsReorderMode(false)
      setOriginalDomainOrder([])
      setTempDomainOrder([])
      toast.success(t('savedTabs.domainOrder.updated'))
    } catch (error) {
      console.error('ドメイン順序の更新に失敗しました:', error)
      toast.error(t('savedTabs.domainOrder.updateError'))
    }
  }, [isReorderMode, handleUpdateDomainsOrder, category.id, tempDomainOrder, t])

  // --- 並び替えキャンセル ---
  const handleCancelReorder = useCallback(() => {
    if (!isReorderMode) {
      return
    }
    setTempDomainOrder([])
    setIsReorderMode(false)
    setOriginalDomainOrder([])
    toast.info(t('savedTabs.domainOrder.canceled'))
  }, [isReorderMode, t])

  // --- 個別ドメイン削除のラッパー ---
  const handleDeleteSingleDomain = useCallback(
    (domainId: string) => {
      // eslint-disable-next-line typescript/no-confusing-void-expression
      handleDeleteGroup(domainId)
      if (isReorderMode) {
        const filteredTempOrder = tempDomainOrder.filter(
          (domain) => domain.id !== domainId,
        )
        setTempDomainOrder(filteredTempOrder)
        if (filteredTempOrder.length === 0) {
          setIsReorderMode(false)
          setOriginalDomainOrder([])
        }
      }
    },
    [handleDeleteGroup, isReorderMode, tempDomainOrder],
  )
  return {
    /** 折りたたみ関連 */
    collapse: {
      isCollapsed,
      setIsCollapsed,
      setUserCollapsedState,
      userCollapsedState,
    },
    /** DnDモニターハンドラ */
    dndMonitorHandlers,
    /** カテゴリ更新 */
    handleCategoryUpdate,
    /** ローカルドメイン */
    localDomains,
    /** モーダル関連 */
    modal: {
      isModalOpen,
      setIsModalOpen,
    },
    /** ネイティブDnDイベント */
    nativeDnD: {
      handleDragLeave,
      handleDragOver,
      handleDrop,
    },
    /** ドメイン並び替え関連 */
    reorder: {
      handleCancelReorder,
      handleConfirmReorder,
      handleDeleteSingleDomain,
      handleDragEnd,
      handleDragStart,
      isDraggingDomains,
      isReorderMode,
      tempDomainOrder,
    },
    /** ソート関連 */
    sort: {
      setSortOrder,
      sortOrder,
      sortedDomains,
    },
  }
}
