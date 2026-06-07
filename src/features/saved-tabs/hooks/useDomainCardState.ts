import { arrayMove } from '@dnd-kit/sortable'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

import { useI18n } from '@/features/i18n/context/I18nProvider'
import {
  createParentCategory,
  getParentCategories,
} from '@/lib/storage/categories'
import { assignDomainToCategory } from '@/lib/storage/migration'
import { removeUrlFromTabGroup } from '@/lib/storage/tabs'
import type { ParentCategory, TabGroup } from '@/types/storage'

/** UseDomainCardState フックの引数 */
interface UseDomainCardStateParams {
  /** タブグループデータ */
  group: TabGroup
  /** 複数URL削除ハンドラ */
  handleDeleteUrls?: (groupId: string, urls: string[]) => Promise<void>
  /** カテゴリ削除ハンドラ */
  handleDeleteCategory?: (groupId: string, categoryName: string) => void
  /** 並び替えモード状態 */
  isReorderMode: boolean
}
interface CategorizedUrlItem {
  id?: string
  url: string
  title: string
  subCategory?: string
  savedAt?: number
}
type CategorizedUrls = Record<string, CategorizedUrlItem[]>

/** 配列の同値比較ユーティリティ */
const arraysEqual = (a: readonly string[], b: readonly string[]): boolean => {
  if (a.length !== b.length) {
    return false
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false
    }
  }
  return true
}
const sortUrlsByOrder = (
  urls: TabGroup['urls'],
  sortOrder: 'default' | 'asc' | 'desc',
): TabGroup['urls'] => {
// eslint-disable-next-line typescript/prefer-nullish-coalescing
  const sourceUrls = urls || []
  if (sortOrder === 'default') {
    return sourceUrls
  }
  const sortedUrls = [...sourceUrls]
// eslint-disable-next-line typescript/prefer-nullish-coalescing
  sortedUrls.sort((a, b) => (a.savedAt || 0) - (b.savedAt || 0))
  if (sortOrder === 'desc') {
    sortedUrls.reverse()
  }
  return sortedUrls
}
const buildCategorizedUrls = (
  urls: TabGroup['urls'],
  subCategories: TabGroup['subCategories'],
): CategorizedUrls => {
  const uncategorizedCategoryId = '__uncategorized'
  const categorizedUrls: CategorizedUrls = {}
  categorizedUrls[uncategorizedCategoryId] = []
// eslint-disable-next-line unicorn/no-useless-collection-argument
  const subCategorySet = new Set(subCategories ?? [])
// eslint-disable-next-line typescript/prefer-nullish-coalescing
  for (const category of subCategories || []) {
    categorizedUrls[category] = []
  }
// eslint-disable-next-line typescript/prefer-nullish-coalescing
  for (const url of urls || []) {
    if (url.subCategory && subCategorySet.has(url.subCategory)) {
      categorizedUrls[url.subCategory].push(url)
    } else {
      categorizedUrls[uncategorizedCategoryId].push(url)
    }
  }
  return categorizedUrls
}
const buildCategoryOrderFromSaved = (
  savedOrder: string[],
  regularCategories: string[],
  hasUncategorized: boolean,
): string[] => {
  const regularCategorySet = new Set(regularCategories)
  const filteredOrder = savedOrder.filter((id) => {
    if (id === '__uncategorized') {
      return hasUncategorized
    }
    return regularCategorySet.has(id)
  })
  const filteredOrderSet = new Set(filteredOrder)
  for (const category of regularCategories) {
    if (!filteredOrderSet.has(category)) {
      filteredOrder.push(category)
      filteredOrderSet.add(category)
    }
  }
  if (hasUncategorized && !filteredOrderSet.has('__uncategorized')) {
    filteredOrder.push('__uncategorized')
  }
  return filteredOrder
}
/**
 * SortableDomainCard の状態ロジックを管理するカスタムフック
 * @param params フックの引数
 * @returns 折りたたみ・ソート・カテゴリ並び替え・キーワードモーダル・親カテゴリ関連の状態と操作
 */
export const useDomainCardState = ({
  group,
  handleDeleteUrls,
  handleDeleteCategory,
  isReorderMode,
}: UseDomainCardStateParams) => {
  const { t } = useI18n()
  // --- 基本状態 ---
  const [showKeywordModal, setShowKeywordModal] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [userCollapsedState, setUserCollapsedState] = useState(false)
  const [sortOrder, setSortOrder] = useState<'default' | 'asc' | 'desc'>(
    'default',
  )
  const [allCategoryIds, setAllCategoryIds] = useState<string[]>([])
  const [categoryUpdateTrigger, setCategoryUpdateTrigger] = useState(0)
  const [parentCategories, setParentCategories] = useState<ParentCategory[]>([])

  // --- カテゴリ並び替え状態 ---
  const [isCategoryReorderMode, setIsCategoryReorderMode] = useState(false)
  const [_originalCategoryOrder, setOriginalCategoryOrder] = useState<string[]>(
    [],
  )
  const [tempCategoryOrder, setTempCategoryOrder] = useState<string[]>([])

  // --- グローバルドラッグ状態 ---
  const [isDraggingGlobal, setIsDraggingGlobal] = useState<boolean>(false)

  // --- カテゴリ別URL整理（useMemo最適化）---
  const categorizedUrls = useMemo(() => {
    const sortedUrls = sortUrlsByOrder(group.urls, sortOrder)
    return buildCategorizedUrls(sortedUrls, group.subCategories)
  }, [group.urls, group.subCategories, sortOrder])

  // --- 空でないカテゴリIDsを取得 ---
  const getActiveCategoryIds = useCallback(() => {
    console.log('getActiveCategoryIds 関数実行...')
    const usedCategories = new Set<string>()
// eslint-disable-next-line typescript/prefer-nullish-coalescing
    for (const url of group.urls || []) {
      if (url.subCategory) {
        usedCategories.add(url.subCategory)
      }
    }
    console.log('使用されているカテゴリ:', [...usedCategories])
// eslint-disable-next-line typescript/prefer-nullish-coalescing
    const regularCategories = (group.subCategories || []).filter(
      (categoryName) =>
        categorizedUrls[categoryName] &&
        categorizedUrls[categoryName].length > 0,
    )
    console.log('表示すべき通常カテゴリ:', regularCategories)
    const hasUncategorized = (categorizedUrls.__uncategorized?.length || 0) > 0
    if (
      group.subCategoryOrderWithUncategorized &&
      group.subCategoryOrderWithUncategorized.length > 0
    ) {
      const filteredOrder = buildCategoryOrderFromSaved(
        group.subCategoryOrderWithUncategorized,
        regularCategories,
        hasUncategorized,
      )
      console.log('保存された順序から構築（空カテゴリ除外）:', filteredOrder)
      return filteredOrder
    }
    const initialOrder = [...regularCategories]
    if (hasUncategorized) {
      initialOrder.push('__uncategorized')
    }
    console.log('新規作成されたカテゴリ順序:', initialOrder)
    return initialOrder
  }, [
    group.subCategories,
    group.urls,
    group.subCategoryOrderWithUncategorized,
    categorizedUrls,
  ])

  // --- 計算済みカテゴリIDs ---
  const computedCategoryIds = useMemo(
    () => getActiveCategoryIds(),
    [getActiveCategoryIds],
  )

  // --- 保存済みカテゴリ順序の初期化 ---
  useEffect(() => {
    if (
      group.subCategoryOrderWithUncategorized &&
      allCategoryIds.length === 0
    ) {
      const savedOrder = [...group.subCategoryOrderWithUncategorized]
      if (savedOrder.length > 0) {
        console.log('保存済みの順序を読み込み:', savedOrder)
        setAllCategoryIds(savedOrder)
      }
    }
  }, [group.subCategoryOrderWithUncategorized, allCategoryIds.length])

  // --- カテゴリ順序の更新を保存する関数 ---
  const handleUpdateCategoryOrder = useCallback(
    async (updatedOrder: string[], updatedAllOrder: string[]) => {
      try {
        setAllCategoryIds(updatedAllOrder)
        const { savedTabs = [] } = await chrome.storage.local.get<{
// eslint-disable-next-line typescript/consistent-type-imports
          savedTabs?: import('@/types/storage').TabGroup[]
        }>('savedTabs')
// eslint-disable-next-line oxc/no-map-spread
        const updatedTabs = savedTabs.map((tab: TabGroup) => {
          if (tab.id === group.id) {
            const updatedTab = {
              ...tab,
              subCategoryOrder: updatedOrder,
              subCategoryOrderWithUncategorized: updatedAllOrder,
            }
            console.log(
              '保存するカテゴリ順序:',
              updatedTab.subCategoryOrderWithUncategorized,
            )
            return updatedTab
          }
          return tab
        })
        await chrome.storage.local.set({
          savedTabs: updatedTabs,
        })
        console.log('カテゴリ順序を更新しました:', updatedOrder)
        console.log('未分類含む順序も更新:', updatedAllOrder)
      } catch (error) {
        console.error('カテゴリ順序の更新に失敗しました:', error)
      }
    },
    [group.id],
  )

  // --- 新規カテゴリ順序の自動保存 ---
  useEffect(() => {
    if (
      allCategoryIds.length > 0 &&
      !group.subCategoryOrderWithUncategorized &&
      allCategoryIds.includes('__uncategorized')
    ) {
      const regularOrder = allCategoryIds.filter(
        (id) => id !== '__uncategorized',
      )
// eslint-disable-next-line typescript/no-floating-promises
      handleUpdateCategoryOrder(regularOrder, allCategoryIds)
    }
  }, [
    allCategoryIds,
    group.subCategoryOrderWithUncategorized,
    handleUpdateCategoryOrder,
  ])

  // --- カテゴリ表示の初期化 ---
  useEffect(() => {
    if (allCategoryIds.length === 0 && computedCategoryIds.length > 0) {
      console.log('初期カテゴリID設定:', computedCategoryIds)
      setAllCategoryIds(computedCategoryIds)
    }
  }, [allCategoryIds.length, computedCategoryIds])

  // --- カテゴリ設定変更の監視 ---
  useEffect(() => {
    if (
      categoryUpdateTrigger > 0 &&
      !arraysEqual(computedCategoryIds, allCategoryIds)
    ) {
      console.log('カテゴリ設定変更を検知 - 表示を更新:', computedCategoryIds)
      setAllCategoryIds(computedCategoryIds)
    }
  }, [categoryUpdateTrigger, computedCategoryIds, allCategoryIds])

  // --- タブ変更の監視 ---
  const prevUrlsRef = useRef<TabGroup['urls']>([])
// eslint-disable-next-line eslint/complexity
  useEffect(() => {
    const prevUrls = prevUrlsRef.current
    const currentUrls = group.urls
    const hasSubCategoryChanges =
// eslint-disable-next-line typescript/prefer-nullish-coalescing
      (prevUrls?.length || 0) > 0 &&
// eslint-disable-next-line typescript/prefer-nullish-coalescing
      ((prevUrls?.length || 0) !== (currentUrls?.length || 0) ||
// eslint-disable-next-line typescript/prefer-nullish-coalescing
        (prevUrls || []).some(
          (prevUrl, i) =>
// eslint-disable-next-line typescript/prefer-nullish-coalescing
            i >= (currentUrls?.length || 0) ||
            prevUrl.subCategory !== currentUrls?.[i]?.subCategory,
        ))
    if (
      hasSubCategoryChanges &&
      !arraysEqual(computedCategoryIds, allCategoryIds)
    ) {
      console.log('タブのサブカテゴリ変更を検出 - 表示を更新')
      setAllCategoryIds(computedCategoryIds)
    }
// eslint-disable-next-line typescript/prefer-nullish-coalescing
    prevUrlsRef.current = [...(currentUrls || [])]
  }, [group.urls, computedCategoryIds, allCategoryIds])

  // --- カテゴリDnDハンドラ ---
  const handleCategoryDragEnd = useCallback(
    (event: {
      active: {
        id: string | number
      }
      over: {
        id: string | number
      } | null
    }) => {
      const { active, over } = event
      if (over && active.id !== over.id) {
        const currentOrder = isCategoryReorderMode
          ? tempCategoryOrder
          : allCategoryIds
// eslint-disable-next-line typescript/no-unsafe-type-assertion
        const oldIndex = currentOrder.indexOf(active.id as string)
// eslint-disable-next-line typescript/no-unsafe-type-assertion
        const newIndex = currentOrder.indexOf(over.id as string)
        if (oldIndex !== -1 && newIndex !== -1) {
          const updatedAllCategoryIds = arrayMove(
            currentOrder,
            oldIndex,
            newIndex,
          )
          if (isCategoryReorderMode) {
            setTempCategoryOrder(updatedAllCategoryIds)
          } else {
            setIsCategoryReorderMode(true)
            setOriginalCategoryOrder([...allCategoryIds])
            setTempCategoryOrder(updatedAllCategoryIds)
          }
          console.log('一時的なカテゴリ順序:', updatedAllCategoryIds)
        }
      }
    },
    [isCategoryReorderMode, tempCategoryOrder, allCategoryIds],
  )

  // --- 並び替え確定 ---
  const handleConfirmCategoryReorder = useCallback(async () => {
    if (!isCategoryReorderMode) {
      return
    }
    const updatedCategoryOrder = tempCategoryOrder.filter(
      (id) => id !== '__uncategorized' && group.subCategories?.includes(id),
    )
    await handleUpdateCategoryOrder(updatedCategoryOrder, tempCategoryOrder)
    setAllCategoryIds(tempCategoryOrder)
    setIsCategoryReorderMode(false)
    setOriginalCategoryOrder([])
    setTempCategoryOrder([])
    toast.success(t('savedTabs.subCategory.reorderUpdated'))
  }, [
    isCategoryReorderMode,
    tempCategoryOrder,
    group.subCategories,
    handleUpdateCategoryOrder,
    t,
  ])

  // --- 並び替えキャンセル ---
  const handleCancelCategoryReorder = useCallback(() => {
    if (!isCategoryReorderMode) {
      return
    }
    setTempCategoryOrder([])
    setIsCategoryReorderMode(false)
    setOriginalCategoryOrder([])
    toast.info(t('savedTabs.subCategory.reorderCanceled'))
  }, [isCategoryReorderMode, t])

  // --- キーワードモーダル閉じる ---
  const handleCloseKeywordModal = useCallback(() => {
    setShowKeywordModal(false)
    setCategoryUpdateTrigger((prev) => prev + 1)
    Promise.resolve()
      .then(async () => {
        await new Promise((resolve) => requestAnimationFrame(resolve))
        setCategoryUpdateTrigger((prev) => prev + 1)
      })
      .catch(() => {})
  }, [])

  // --- カテゴリ削除後の処理 ---
  const handleCategoryDelete = useCallback(
    (groupId: string, categoryName: string) => {
      if (handleDeleteCategory) {
        handleDeleteCategory(groupId, categoryName)
        setCategoryUpdateTrigger((prev) => prev + 1)
      }
    },
    [handleDeleteCategory],
  )

  // --- カテゴリ内の全タブ削除 ---
  const handleDeleteAllTabsInCategory = useCallback(
    async (
      categoryName: string,
      urlsToDelete: {
        id?: string
        url: string
      }[],
    ) => {
      try {
        const urlsToRemove = urlsToDelete.map((item) => item.url)
        if (urlsToRemove.length === 0) {
          return
        }
        console.log(
          `「${categoryName}」から${urlsToRemove.length}件のタブを削除します`,
        )
        if (handleDeleteUrls) {
          await handleDeleteUrls(group.id, urlsToRemove)
        } else {
          await Promise.all(
            urlsToRemove.map((url) => removeUrlFromTabGroup(group.id, url)),
          )
        }
        console.log(
          `「${categoryName}」カテゴリから${urlsToRemove.length}件のタブを削除完了`,
        )
      } catch (error) {
        console.error('カテゴリ内タブ削除エラー:', error)
      }
    },
    [group.id, handleDeleteUrls],
  )

  // --- 親カテゴリ読み込み ---
  useEffect(() => {
    const loadParentCategories = async () => {
      try {
        const categories = await getParentCategories()
        setParentCategories(categories)
      } catch (error) {
        console.error('親カテゴリの読み込みに失敗しました:', error)
      }
    }
// eslint-disable-next-line typescript/no-floating-promises
    loadParentCategories()
  }, [])

  // --- 親カテゴリ作成ハンドラ ---
  const handleCreateParentCategory = useCallback(async (name: string) => {
    try {
      const newCategory = await createParentCategory(name)
      setParentCategories((prev) => [...prev, newCategory])
      return newCategory
    } catch (error) {
      console.error('親カテゴリ作成エラー:', error)
      throw error
    }
  }, [])

  // --- ドメインを親カテゴリに割り当て ---
  const handleAssignToParentCategory = useCallback(
    async (groupId: string, categoryId: string) => {
      try {
        await assignDomainToCategory(groupId, categoryId)
      } catch (error) {
        console.error('ドメイン割り当てエラー:', error)
        throw error
      }
    },
    [],
  )

  // --- 親カテゴリ更新 ---
  const handleUpdateParentCategories = useCallback(
    (categories: ParentCategory[]) => {
      setParentCategories(categories)
    },
    [],
  )

  // --- グローバルドラッグ監視コールバック ---
  const dndMonitorHandlers = useMemo(
    () => ({
      onDragCancel: () => {
        setIsDraggingGlobal(false)
        if (!isReorderMode) {
          setIsCollapsed(false)
        }
      },
      onDragEnd: () => {
        setIsDraggingGlobal(false)
        if (!isReorderMode) {
          setIsCollapsed(false)
        }
      },
      onDragStart: () => {
        setIsDraggingGlobal(true)
      },
    }),
    [isReorderMode],
  )

  // --- ドラッグ・並び替えモード時の折りたたみ制御 ---
  useEffect(() => {
    if (isDraggingGlobal || isReorderMode) {
      setIsCollapsed(true)
    } else {
      setIsCollapsed(userCollapsedState)
    }
  }, [isDraggingGlobal, isReorderMode, userCollapsedState])
  return {
    /** カテゴリ操作 */
    categoryActions: {
      handleCategoryDelete,
      handleDeleteAllTabsInCategory,
    },
    /** カテゴリ並び替え関連 */
    categoryReorder: {
      allCategoryIds,
      handleCancelCategoryReorder,
      handleCategoryDragEnd,
      handleConfirmCategoryReorder,
      isCategoryReorderMode,
      tempCategoryOrder,
    },
    /** 折りたたみ関連 */
    collapse: {
      isCollapsed,
      setIsCollapsed,
      setUserCollapsedState,
      userCollapsedState,
    },
    /** 計算済みデータ */
    computed: {
      categorizedUrls,
    },
    /** DnDモニターハンドラ */
    dndMonitorHandlers,
    /** キーワードモーダル関連 */
    keywordModal: {
      handleCloseKeywordModal,
      setShowKeywordModal,
      showKeywordModal,
    },
    /** 親カテゴリ関連 */
    parentCategories: {
      categories: parentCategories,
      handleAssignToParentCategory,
      handleCreateParentCategory,
      handleUpdateParentCategories,
    },
    /** ソート関連 */
    sort: {
      setSortOrder,
      sortOrder,
    },
  }
}

export {
  arraysEqual,
  buildCategorizedUrls,
  buildCategoryOrderFromSaved,
  sortUrlsByOrder,
}
