import type { DragEndEvent } from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

import { useI18n } from '@/features/i18n/context/I18nProvider'
import type { ParentCategory, TabGroup } from '@/types/storage'

import { useSortOrder } from './useSortOrder'

/** UseCategoryGroupState フックの引数 */
interface UseCategoryGroupStateParams {
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
}
const ensureCategoryPresence = (
  categoryGroups: ParentCategory[],
  categoryId: string,
  newName: string,
): ParentCategory[] => {
  const existingCategory = categoryGroups.find((cat) => cat.id === categoryId)
  if (existingCategory) {
    return categoryGroups
  }
  return [
    ...categoryGroups,
    {
      domainNames: [],
      domains: [],
      id: categoryId,
      name: newName,
    },
  ]
}
const renameCategoryInGroups = (
  categoryGroups: ParentCategory[],
  categoryId: string,
  newName: string,
): ParentCategory[] =>
  categoryGroups.map((cat) => {
    if (cat.id !== categoryId) {
      return cat
    }
    return {
      ...cat,
      name: newName,
      domainNames: [...(cat.domainNames || [])],
    }
  })
const confirmCategorySaved = async (
  categoryId: string,
  newName: string,
  updatedGroups: ParentCategory[],
): Promise<void> => {
  const checkResult = await chrome.storage.local.get<{
// eslint-disable-next-line typescript/consistent-type-imports
    parentCategories?: import('@/types/storage').ParentCategory[]
  }>('parentCategories')
  const categoryById = new Map(
    (checkResult.parentCategories ?? []).map((cat: ParentCategory) => [
      cat.id,
      cat,
    ]),
  )
  const savedCategory = categoryById.get(categoryId)
  if (savedCategory?.name === newName) {
    console.log('CategoryGroup - 保存の確認に成功:', savedCategory)
  } else {
    console.log('CategoryGroup - 保存の確認に失敗したため再保存します')
    await chrome.storage.local.set({
      parentCategories: updatedGroups,
    })
  }
  const finalCheck = await chrome.storage.local.get<{
// eslint-disable-next-line typescript/consistent-type-imports
    parentCategories?: import('@/types/storage').ParentCategory[]
  }>('parentCategories')
  const finalCategory = new Map(
    (finalCheck.parentCategories ?? []).map((cat: ParentCategory) => [
      cat.id,
      cat,
    ]),
  ).get(categoryId)
  if (finalCategory?.name !== newName) {
    throw new Error('カテゴリ名の更新が反映されていません')
  }
  console.log('CategoryGroup - カテゴリ更新が完了しました:', finalCategory)
}
/**
 * CategoryGroup の状態ロジックを管理するカスタムフック
 * @param params フックの引数
 * @returns 折りたたみ・ソート・並び替え・モーダル・DnD関連の状態と操作
 */
export const useCategoryGroupState = ({
  category,
  domains,
  handleUpdateDomainsOrder,
  handleDeleteGroup,
  isCategoryReorderMode,
}: UseCategoryGroupStateParams) => {
  const { t } = useI18n()
  // --- 基本状態 ---
  const [{ isCollapsed, userCollapsedState }, setCollapseState] = useState({
    isCollapsed: false,
    userCollapsedState: false,
  })
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
  const [_isDraggingOver, setIsDraggingOver] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isDraggingDomains, setIsDraggingDomains] = useState(false)
  const [isDraggingGlobal, setIsDraggingGlobal] = useState<boolean>(false)

  // --- 並び替え状態 ---
  const [isReorderMode, setIsReorderMode] = useState(false)
  const [_originalDomainOrder, setOriginalDomainOrder] = useState<TabGroup[]>(
    [],
  )
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
        const result = await chrome.storage.local.get<{
          parentCategories?: ParentCategory[]
        }>(['parentCategories'])
// eslint-disable-next-line typescript/prefer-nullish-coalescing
        const baseGroups: ParentCategory[] = result.parentCategories || []
        const categoryGroups = ensureCategoryPresence(
          baseGroups,
          categoryId,
          newName,
        )
        const updatedGroups = renameCategoryInGroups(
          categoryGroups,
          categoryId,
          newName,
        )
        await chrome.storage.local.set({
          parentCategories: updatedGroups,
        })
        await confirmCategorySaved(categoryId, newName, updatedGroups)
      } catch (error) {
        console.error('CategoryGroup - カテゴリ名の更新に失敗:', error)
        toast.error(t('savedTabs.categoryManagement.renameError'))
      }
    },
    [category, t],
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
  useEffect(() => {
    if (isDraggingGlobal && !isCategoryReorderMode) {
      setIsCollapsed(true)
    }
  }, [isDraggingGlobal, isCategoryReorderMode, setIsCollapsed])

  // --- 親カテゴリ並び替えモード中の折りたたみ ---
  const prevReorderModeRef = useRef<boolean>(false)
  useEffect(() => {
    if (isCategoryReorderMode && !prevReorderModeRef.current) {
      setCollapseState({
        isCollapsed: true,
        userCollapsedState: isCollapsed,
      })
      prevReorderModeRef.current = true
    } else if (!isCategoryReorderMode && prevReorderModeRef.current) {
      setCollapseState((prev) => ({
        ...prev,
        isCollapsed: userCollapsedState,
      }))
      prevReorderModeRef.current = false
    }
  }, [isCategoryReorderMode, isCollapsed, userCollapsedState])

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
  const handleConfirmReorder = useCallback(async () => {
    if (!isReorderMode) {
      return
    }
    try {
      if (handleUpdateDomainsOrder) {
        await handleUpdateDomainsOrder(category.id, tempDomainOrder)
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
    async (domainId: string) => {
      await handleDeleteGroup(domainId)
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
