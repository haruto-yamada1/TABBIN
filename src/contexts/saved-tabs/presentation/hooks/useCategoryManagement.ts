/**
 * @file useCategoryManagement.ts
 * @description 親カテゴリの CRUD・並び替えモード・ドメイン移動を担うカスタムフック。
 */
import type { DragEndEvent } from '@dnd-kit/core'
import { useCallback, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { toast } from 'sonner'

import { toStorageParentCategory } from '@/contexts/saved-tabs/application/mappers/SavedTabsSnapshotMapper'
import type { MoveDomainBetweenCategoriesUseCase } from '@/contexts/saved-tabs/application/use-cases/MoveDomainBetweenCategoriesUseCase'
import type { RemoveSubCategoryFromTabGroupsUseCase } from '@/contexts/saved-tabs/application/use-cases/RemoveSubCategoryFromTabGroupsUseCase'
import type { ReorderDomainsInCategoryUseCase } from '@/contexts/saved-tabs/application/use-cases/ReorderDomainsInCategoryUseCase'
import type { ReorderParentCategoriesUseCase } from '@/contexts/saved-tabs/application/use-cases/ReorderParentCategoriesUseCase'
import { buildReorderedCategoryOrder } from '@/contexts/saved-tabs/domain/services/ParentCategoryReorderService'
import { useI18n } from '@/features/i18n/context/I18nProvider'
import type { ParentCategory, TabGroup } from '@/types/storage'

/** UseCategoryManagement フックの戻り値型 */
interface UseCategoryManagementReturn {
  /** 親カテゴリ一覧 */
  categories: ParentCategory[]
  /** Categories を直接更新するセッター */
  setCategories: Dispatch<SetStateAction<ParentCategory[]>>
  /** カテゴリ表示順序（カテゴリ ID 配列） */
  categoryOrder: string[]
  /** CategoryOrder を直接更新するセッター */
  setCategoryOrder: Dispatch<SetStateAction<string[]>>
  /** 並び替えモード中かどうか */
  isCategoryReorderMode: boolean
  /** 並び替え開始前の元の順序（キャンセル用） */
  originalCategoryOrder: string[]
  /** 並び替え中の一時的な順序 */
  tempCategoryOrder: string[]
  /**
   * 子カテゴリ（サブカテゴリ）を削除する。
   * @param groupId - 対象グループの ID
   * @param categoryName - 削除するカテゴリ名
   */
  handleDeleteCategory: (
    groupId: string,
    categoryName: string,
    refreshTabGroupsWithUrls: (nextGroups?: TabGroup[]) => Promise<TabGroup[]>,
  ) => Promise<void>
  /**
   * 親カテゴリのドラッグエンド処理（並び替えモード開始または更新）。
   * @param event - dnd-kit の DragEndEvent
   */
  handleCategoryDragEnd: (event: DragEndEvent) => void
  /** 並び替えを確定してストレージに保存する */
  handleConfirmCategoryReorder: () => Promise<void>
  /** 並び替えをキャンセルして元の順序に戻す */
  handleCancelCategoryReorder: () => void
  /**
   * カテゴリ内のドメイン順序を更新する。
   * @param categoryId - 対象カテゴリの ID
   * @param updatedDomains - 新しいドメイン順序の配列
   */
  handleUpdateDomainsOrder: (
    categoryId: string,
    updatedDomains: TabGroup[],
  ) => Promise<void>
  /**
   * ドメインを別のカテゴリに移動する。
   * @param domainId - 移動するドメインの ID
   * @param fromCategoryId - 移動元カテゴリの ID（未分類の場合は null）
   * @param toCategoryId - 移動先カテゴリの ID
   * @param tabGroups - ドメイン全体のスナップショット
   */
  handleMoveDomainToCategory: (
    domainId: string,
    fromCategoryId: string | null,
    toCategoryId: string,
    tabGroups: TabGroup[],
  ) => Promise<void>
}

const isStateSetter = <T>(value: SetStateAction<T>): value is (prev: T) => T =>
  typeof value === 'function'

const resolveStateValue = <T>(
  nextValue: SetStateAction<T>,
  previousValue: T,
): T => (isStateSetter(nextValue) ? nextValue(previousValue) : nextValue)

/** UseCategoryManagement フックの引数 */
interface UseCategoryManagementParams {
  /**
   * 親カテゴリの並び替え保存 use-case (issue #519)。
   * 旧 `categoryAssignmentPort.saveParentCategories` 直叩きを
   * use-case 経由へ移す。
   */
  reorderParentCategoriesUseCase: ReorderParentCategoriesUseCase
  /**
   * カテゴリ削除時の `TabGroup` 更新 use-case (issue #519)。
   * 旧 `categoryAssignmentPort.saveTabGroups` 直叩きを use-case 経由
   * へ移し、 port 実装側で `chrome.storage.local` の raw レベル
   * 永続化を集約して rich 補助フィールド欠落問題を回避する
   * (`tabGroupRepository.saveAll` 経由では mapper が original の
   * rich フィールドを保持してしまう既存問題に対応)。
   */
  removeSubCategoryFromTabGroupsUseCase: RemoveSubCategoryFromTabGroupsUseCase
  /**
   * カテゴリ間ドメイン移動 use-case (issue #525)。
   * 旧 `useCategoryManagement.handleMoveDomainToCategory` 内の
   * `tabGroups` 引き当て / `domains` / `domainNames` 移動 /
   * `reorderParentCategoriesUseCase` 直叩きを 1 つの application
   * use-case に統合する。
   */
  moveDomainBetweenCategoriesUseCase: MoveDomainBetweenCategoriesUseCase
  /**
   * カテゴリ内ドメイン順序更新 use-case (issue #525)。
   * 旧 `useCategoryManagement.handleUpdateDomainsOrder` 内の
   * 並び替え / `reorderParentCategoriesUseCase` 直叩きを
   * application use-case へ統合する。
   */
  reorderDomainsInCategoryUseCase: ReorderDomainsInCategoryUseCase
}

/**
 * 親カテゴリ管理フック。
 * カテゴリの読み込み・並び替えモード・ドメイン間移動を担う。
 *
 * pure な domain ロジック（並び順計算、 `TabGroup` からの
 * subCategory 削除）は domain / application 層へ移設済み
 * (issue #519)。本フックは UI イベントハンドラと use-case 呼び出しの
 * オーケストレーションに専念する。
 *
 * @param params - フック引数
 * @returns UseCategoryManagementReturn
 */
const useCategoryManagement = (
  params: UseCategoryManagementParams,
): UseCategoryManagementReturn => {
  // eslint-disable-line eslint/max-lines-per-function
  const {
    reorderParentCategoriesUseCase,
    removeSubCategoryFromTabGroupsUseCase,
    moveDomainBetweenCategoriesUseCase,
    reorderDomainsInCategoryUseCase,
  } = params
  const { t } = useI18n()
  const [categories, setCategoriesState] = useState<ParentCategory[]>([])
  const [categoryOrder, setCategoryOrder] = useState<string[]>([])
  const [isCategoryReorderMode, setIsCategoryReorderMode] = useState(false)
  const [originalCategoryOrder, setOriginalCategoryOrder] = useState<string[]>(
    [],
  )
  const [tempCategoryOrder, setTempCategoryOrder] = useState<string[]>([])
  const setCategories: Dispatch<SetStateAction<ParentCategory[]>> = useCallback(
    (nextCategories) => {
      setCategoriesState((previousCategories) => {
        const resolvedCategories = resolveStateValue(
          nextCategories,
          previousCategories,
        )

        setCategoryOrder(resolvedCategories.map((category) => category.id))
        return resolvedCategories
      })
    },
    [],
  )

  /**
   * 子カテゴリ（サブカテゴリ）を削除する。
   * refreshTabGroupsWithUrls は useTabData から受け取る。
   *
   * 永続化は `removeSubCategoryFromTabGroupsUseCase` 経由 (port 実装
   * は `chrome.storage.local` の raw レベルで rich 補助フィールドを
   * 更新する)。 page ロード時の query 結果 (domain entity で rich
   * 補助フィールド欠落) を widening キャストで流用する旧実装は
   * マッパーで rich フィールドが破棄される既存問題を抱えていたため、
   * use-case 側で port に生 groupId / categoryName を渡し、 port
   * 側で storage raw を直接更新する方式に統一した (issue #519)。
   */
  const handleDeleteCategory = useCallback(
    async (
      groupId: string,
      categoryName: string,
      refreshTabGroupsWithUrls: (
        nextGroups?: TabGroup[],
      ) => Promise<TabGroup[]>,
    ): Promise<void> => {
      try {
        const { tabGroups: updatedGroups } =
          await removeSubCategoryFromTabGroupsUseCase({
            categoryName,
            groupId,
          })
        await refreshTabGroupsWithUrls([...updatedGroups])
      } catch (error) {
        console.error('カテゴリ削除エラー:', error)
      }
    },
    [removeSubCategoryFromTabGroupsUseCase],
  )

  /** 親カテゴリのドラッグエンド処理（並び替えモード開始または更新） */
  const handleCategoryDragEnd = useCallback(
    (event: DragEndEvent): void => {
      const { active, over } = event
      if (!over || active.id === over.id) {
        return
      }
      if (typeof active.id !== 'string' || typeof over.id !== 'string') {
        return
      }
      const newOrder = buildReorderedCategoryOrder({
        activeId: active.id,
        categoryOrder,
        isCategoryReorderMode,
        overId: over.id,
        tempCategoryOrder,
      })
      if (!newOrder) {
        return
      }
      if (isCategoryReorderMode) {
        setTempCategoryOrder([...newOrder])
        return
      }
      setIsCategoryReorderMode(true)
      setOriginalCategoryOrder([...categoryOrder])
      setTempCategoryOrder([...newOrder])
    },
    [isCategoryReorderMode, tempCategoryOrder, categoryOrder],
  )

  /** 並び替えを確定してストレージに保存する */
  const handleConfirmCategoryReorder = useCallback(async (): Promise<void> => {
    if (!isCategoryReorderMode) {
      return
    }
    try {
      setCategoryOrder(tempCategoryOrder)
      const orderedCategories = categories.toSorted(
        (a, b) =>
          tempCategoryOrder.indexOf(a.id) - tempCategoryOrder.indexOf(b.id),
      )
      await reorderParentCategoriesUseCase({
        categories: orderedCategories,
      })
      setCategories(orderedCategories)
      setIsCategoryReorderMode(false)
      setOriginalCategoryOrder([])
      setTempCategoryOrder([])
      toast.success(t('savedTabs.categoryManagement.reorderUpdated'))
    } catch (error) {
      console.error('親カテゴリ順序の更新に失敗しました:', error)
      toast.error(t('savedTabs.categoryManagement.reorderUpdateError'))
    }
  }, [
    categories,
    isCategoryReorderMode,
    reorderParentCategoriesUseCase,
    setCategories,
    t,
    tempCategoryOrder,
  ])

  /** 並び替えをキャンセルして元の順序に戻す */
  const handleCancelCategoryReorder = useCallback((): void => {
    if (!isCategoryReorderMode) {
      return
    }
    setTempCategoryOrder([])
    setIsCategoryReorderMode(false)
    setOriginalCategoryOrder([])
    toast.info(t('savedTabs.categoryManagement.reorderCanceled'))
  }, [isCategoryReorderMode, t])

  /**
   * カテゴリ内のドメイン順序を更新する。
   *
   * 並び順検証 / 永続化は `ReorderDomainsInCategoryUseCase` 経由
   * (issue #525) で実行し、 presentation 層はイベントハンドラと
   * use-case 呼び出しのオーケストレーションに専念する。
   * 旧実装と同じく、対象カテゴリが見つからない場合は use-case 側で
   * no-op として処理される（エラーログは presentation 側で記録）。
   */
  const handleUpdateDomainsOrder = useCallback(
    async (categoryId: string, updatedDomains: TabGroup[]): Promise<void> => {
      try {
        const targetCategory = categories.find((cat) => cat.id === categoryId)
        if (!targetCategory) {
          console.error('更新対象のカテゴリが見つかりません:', categoryId)
          return
        }
        const updatedDomainCategories = await reorderDomainsInCategoryUseCase({
          categoryId,
          updatedDomains,
        })
        setCategories(updatedDomainCategories.map(toStorageParentCategory))
      } catch (error) {
        console.error('カテゴリ内ドメイン順序更新エラー:', error)
      }
    },
    [categories, reorderDomainsInCategoryUseCase, setCategories],
  )

  /**
   * ドメインを別のカテゴリに移動する。
   * tabGroups は main.tsx から渡す（useTabData に依存するため引数として受け取る）。
   *
   * ドメイン引き当て / 移動元 `domains` / `domainNames` 削除 /
   * 移動先 `domains` / `domainNames` 追加 / 永続化は
   * `MoveDomainBetweenCategoriesUseCase` 経由 (issue #525) で実行し、
   * presentation 層はイベントハンドラと use-case 呼び出しの
   * オーケストレーションに専念する。
   */
  const handleMoveDomainToCategory = useCallback(
    async (
      domainId: string,
      fromCategoryId: string | null,
      toCategoryId: string,
      tabGroups: TabGroup[],
    ): Promise<void> => {
      try {
        const domainGroup = tabGroups.find((group) => group.id === domainId)
        if (!domainGroup) {
          return
        }
        const updatedDomainCategories =
          await moveDomainBetweenCategoriesUseCase({
            domainId,
            fromCategoryId,
            tabGroups,
            toCategoryId,
          })
        setCategories(updatedDomainCategories.map(toStorageParentCategory))
        console.log(
          `ドメイン ${domainGroup.domain} を ${fromCategoryId || '未分類'} から ${toCategoryId} に移動しました`, // eslint-disable-line typescript/prefer-nullish-coalescing -- fromCategoryId could be empty string
        )
      } catch (error) {
        console.error('カテゴリ間ドメイン移動エラー:', error)
      }
    },
    [moveDomainBetweenCategoriesUseCase, setCategories],
  )
  return {
    categories,
    categoryOrder,
    handleCancelCategoryReorder,
    handleCategoryDragEnd,
    handleConfirmCategoryReorder,
    handleDeleteCategory,
    handleMoveDomainToCategory,
    handleUpdateDomainsOrder,
    isCategoryReorderMode,
    originalCategoryOrder,
    setCategories,
    setCategoryOrder,
    tempCategoryOrder,
  }
}

export type { UseCategoryManagementReturn }
export { useCategoryManagement }
