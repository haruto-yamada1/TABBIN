import type { DragEndEvent } from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import type { Dispatch, SetStateAction } from 'react'
import { useCallback } from 'react'
import { toast } from 'sonner'

import type { SavedTabsUseCases } from '@/contexts/saved-tabs/application/createSavedTabsUseCases'
import type { TranslateFn } from '@/features/i18n/context/I18nProvider'
import type { TabGroup } from '@/types/storage'

import { toDomainTabGroupsForReorder } from '../savedTabsApp.helpers'

interface UseUncategorizedReorderHandlersDeps {
  isUncategorizedReorderMode: boolean
  setIsUncategorizedReorderMode: Dispatch<SetStateAction<boolean>>
  tempUncategorizedOrder: TabGroup[]
  setTempUncategorizedOrder: Dispatch<SetStateAction<TabGroup[]>>
  uncategorized: TabGroup[]
  categorized: Record<string, TabGroup[]>
  refreshTabGroupsWithUrls: (tabGroups?: TabGroup[]) => Promise<TabGroup[]>
  savedTabsUseCases: SavedTabsUseCases
  t: TranslateFn
}

export const useUncategorizedReorderHandlers = ({
  isUncategorizedReorderMode,
  setIsUncategorizedReorderMode,
  tempUncategorizedOrder,
  setTempUncategorizedOrder,
  uncategorized,
  categorized,
  refreshTabGroupsWithUrls,
  savedTabsUseCases,
  t,
}: UseUncategorizedReorderHandlersDeps) => {
  // 未分類ドメインの並び替えをキャンセルする
  const handleCancelUncategorizedReorder = useCallback(() => {
    if (!isUncategorizedReorderMode) {
      return
    }

    // 元の順序に戻す
    setTempUncategorizedOrder([])

    // 並び替えモードを終了
    setIsUncategorizedReorderMode(false)
    toast.info(t('savedTabs.domainOrder.canceled'))
  }, [
    isUncategorizedReorderMode,
    setIsUncategorizedReorderMode,
    setTempUncategorizedOrder,
    t,
  ])

  // 未分類ドメインのドラッグエンド処理（並び替えモード対応）
  const handleUncategorizedDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (over && active.id !== over.id) {
        const currentOrder = isUncategorizedReorderMode
          ? tempUncategorizedOrder
          : uncategorized
        const oldIndex = currentOrder.findIndex(
          (group) => group.id === active.id,
        )
        const newIndex = currentOrder.findIndex((group) => group.id === over.id)
        if (oldIndex !== -1 && newIndex !== -1) {
          const updatedOrder = arrayMove(currentOrder, oldIndex, newIndex)
          if (isUncategorizedReorderMode) {
            // 既に並び替えモード中：一時的な順序を更新
            setTempUncategorizedOrder(updatedOrder)
          } else {
            // 初回の並び替え時：並び替えモードを開始
            setIsUncategorizedReorderMode(true)
            setTempUncategorizedOrder(updatedOrder)
          }
        }
      }
    },
    [
      isUncategorizedReorderMode,
      setIsUncategorizedReorderMode,
      setTempUncategorizedOrder,
      tempUncategorizedOrder,
      uncategorized,
    ],
  )

  // 未分類ドメインの並び替えを確定する
  const handleConfirmUncategorizedReorder = useCallback(async () => {
    if (!isUncategorizedReorderMode) {
      return
    }
    try {
      const categorizedDomains = Object.values(categorized).flat()

      // 新しい順序：カテゴリ分類されたドメイン + 並び替えた未分類ドメイン
      const newTabGroups = [...categorizedDomains, ...tempUncategorizedOrder]

      // 並び替え保存は `ReorderTabGroupsUseCase` 経由で
      // `TabGroupRepository.saveAll` に委譲する
      // （旧 storage 直叩きは use-case 経由へ移行済み、issue #494）。
      // Repository 実装側の mapper が
      // `urls` / `urlSubCategories` などのリッチ補助フィールドを持ち越す。
      await savedTabsUseCases.reorderTabGroups({
        tabGroups: toDomainTabGroupsForReorder(newTabGroups),
      })
      await refreshTabGroupsWithUrls(newTabGroups)

      // 並び替えモードを終了
      setIsUncategorizedReorderMode(false)
      setTempUncategorizedOrder([])
      toast.success(t('savedTabs.domainOrder.updated'))
    } catch (error) {
      console.error('未分類ドメイン順序の更新に失敗しました:', error)
      toast.error(t('savedTabs.domainOrder.updateError'))
    }
  }, [
    isUncategorizedReorderMode,
    setIsUncategorizedReorderMode,
    setTempUncategorizedOrder,
    categorized,
    tempUncategorizedOrder,
    refreshTabGroupsWithUrls,
    savedTabsUseCases,
    t,
  ])

  return {
    handleCancelUncategorizedReorder,
    handleUncategorizedDragEnd,
    handleConfirmUncategorizedReorder,
  }
}
