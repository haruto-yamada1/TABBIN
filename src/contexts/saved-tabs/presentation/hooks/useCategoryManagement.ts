/**
 * @file useCategoryManagement.ts
 * @description 親カテゴリの CRUD・並び替えモード・ドメイン移動を担うカスタムフック。
 */
import type { DragEndEvent } from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import { useCallback, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { toast } from 'sonner'

import { useI18n } from '@/features/i18n/context/I18nProvider'
import { saveParentCategories } from '@/lib/storage/categories'
import type { ParentCategory, TabGroup } from '@/types/storage'

import type { TabGroupRepository } from '@/contexts/saved-tabs/domain/repositories/TabGroupRepository'

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
   */
  handleMoveDomainToCategory: (
    domainId: string,
    fromCategoryId: string | null,
    toCategoryId: string,
    tabGroups: TabGroup[],
  ) => Promise<void>
}
const removeSubCategoryFromGroup = (
  group: TabGroup,
  groupId: string,
  categoryName: string,
): TabGroup => {
  if (group.id !== groupId) {
    return group
  }
  console.log('削除前のサブカテゴリ:', group.subCategories)
  const updatedSubCategories =
    group.subCategories?.filter((cat) => cat !== categoryName) ?? []
  console.log('削除後のサブカテゴリ:', updatedSubCategories)
  const updatedUrlSubCategories = {
    ...group.urlSubCategories,
  }
  if (updatedUrlSubCategories) {
    for (const urlId in updatedUrlSubCategories) {
      if (updatedUrlSubCategories[urlId] === categoryName) {
        // eslint-disable-next-line typescript/no-dynamic-delete
        delete updatedUrlSubCategories[urlId]
      }
    }
  }
  return {
    ...group,
    categoryKeywords:
      group.categoryKeywords?.filter(
        (ck) => ck.categoryName !== categoryName,
      ) ?? [],
    subCategories: updatedSubCategories,
    urlSubCategories: updatedUrlSubCategories,
  }
}
const buildReorderedCategoryOrder = (params: {
  activeId: string
  overId: string
  isCategoryReorderMode: boolean
  tempCategoryOrder: string[]
  categoryOrder: string[]
}): string[] | null => {
  const {
    activeId,
    overId,
    isCategoryReorderMode,
    tempCategoryOrder,
    categoryOrder,
  } = params
  const currentOrder = isCategoryReorderMode ? tempCategoryOrder : categoryOrder
  const oldIndex = currentOrder.indexOf(activeId)
  const newIndex = currentOrder.indexOf(overId)
  if (oldIndex === -1 || newIndex === -1) {
    return null
  }
  return arrayMove(currentOrder, oldIndex, newIndex)
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
   * タブグループ永続化先。`presentation` 層から直接
   * `chrome.storage.local` を触らず、repository 経由で読み書きする。
   */
  tabGroupRepository: TabGroupRepository
}
/**
 * 親カテゴリ管理フック。
 * カテゴリの読み込み・並び替えモード・ドメイン間移動を担う。
 *
 * @param params - フック引数
 * @returns UseCategoryManagementReturn
 */
const useCategoryManagement = (
  params: UseCategoryManagementParams,
): UseCategoryManagementReturn => {
  // eslint-disable-line eslint/max-lines-per-function
  const { tabGroupRepository } = params
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
        console.log(`カテゴリ ${categoryName} の削除を開始します...`)
        const savedTabs = await tabGroupRepository.findAll()

        // 削除前にグループを取得して現在のカテゴリを確認
        const targetGroup = savedTabs.find((group) => group.id === groupId)
        if (!targetGroup) {
          console.error('カテゴリ削除対象のグループが見つかりません:', groupId)
          return
        }
        // `domain.TabGroup` には presentation 専用の `subCategories` /
        // `urlSubCategories` / `categoryKeywords` フィールドが型上存在しない
        // ため、保存形式 (`storage.TabGroup`) へキャストして
        // `removeSubCategoryFromGroup` を適用する。
        // eslint-disable-next-line typescript/no-unsafe-type-assertion
        const updatedGroups = (
          savedTabs as unknown as readonly TabGroup[]
        ).map((group) =>
          removeSubCategoryFromGroup(group, groupId, categoryName),
        )
        console.log(`カテゴリ ${categoryName} を削除します`)
        // domain entity は readonly + branded、`storage.TabGroup` は
        // mutable + plain string なので双方向で直接代入不可。`saveAll` は
        // 内部 mapper で raw へ変換するため、エンティティ相当の構造的
        // スーパーセットとして渡せば十分。
        await tabGroupRepository.saveAll(
          updatedGroups as unknown as Parameters<
            typeof tabGroupRepository.saveAll
          >[0],
        )
        await refreshTabGroupsWithUrls(updatedGroups)
        console.log(`カテゴリ ${groupId} を削除しました`)
      } catch (error) {
        console.error('カテゴリ削除エラー:', error)
      }
    },
    [tabGroupRepository],
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
        setTempCategoryOrder(newOrder)
        return
      }
      setIsCategoryReorderMode(true)
      setOriginalCategoryOrder([...categoryOrder])
      setTempCategoryOrder(newOrder)
    },
    [isCategoryReorderMode, tempCategoryOrder, categoryOrder],
  )

  /** 並び替えを確定してストレージに保存する */
  const handleConfirmCategoryReorder = useCallback(async (): Promise<void> => {
    if (!isCategoryReorderMode) {
      return
    }
    try {
      // カテゴリ順序を更新
      setCategoryOrder(tempCategoryOrder)

      // 新しい順序に基づいてカテゴリを並び替え
      const orderedCategories = categories.toSorted(
        (a, b) =>
          tempCategoryOrder.indexOf(a.id) - tempCategoryOrder.indexOf(b.id),
      )

      // ストレージに保存
      await saveParentCategories(orderedCategories)
      setCategories(orderedCategories)

      // 並び替えモードを終了
      setIsCategoryReorderMode(false)
      setOriginalCategoryOrder([])
      setTempCategoryOrder([])
      toast.success(t('savedTabs.categoryManagement.reorderUpdated'))
    } catch (error) {
      console.error('親カテゴリ順序の更新に失敗しました:', error)
      toast.error(t('savedTabs.categoryManagement.reorderUpdateError'))
    }
  }, [categories, isCategoryReorderMode, setCategories, t, tempCategoryOrder])

  /** 並び替えをキャンセルして元の順序に戻す */
  const handleCancelCategoryReorder = useCallback((): void => {
    if (!isCategoryReorderMode) {
      return
    }

    // 元の順序に戻す
    setTempCategoryOrder([])

    // 並び替えモードを終了
    setIsCategoryReorderMode(false)
    setOriginalCategoryOrder([])
    toast.info(t('savedTabs.categoryManagement.reorderCanceled'))
  }, [isCategoryReorderMode, t])

  /** カテゴリ内のドメイン順序を更新する */
  const handleUpdateDomainsOrder = useCallback(
    async (categoryId: string, updatedDomains: TabGroup[]): Promise<void> => {
      try {
        console.log('カテゴリ内のドメイン順序を更新:', categoryId)
        console.log(
          '更新後のドメイン順序:',
          updatedDomains.map((d) => d.domain),
        )

        // 更新するカテゴリを探す
        const targetCategory = categories.find((cat) => cat.id === categoryId)
        if (!targetCategory) {
          console.error('更新対象のカテゴリが見つかりません:', categoryId)
          return
        }

        // 更新するドメインIDの配列を作成
        const updatedDomainIds = updatedDomains.map((domain) => domain.id)

        // カテゴリ内のドメイン順序を更新
        const updatedCategories = categories.map((category) => {
          if (category.id === categoryId) {
            return {
              ...category,
              domains: updatedDomainIds,
            }
          }
          return category
        })

        // ストレージに保存
        await saveParentCategories(updatedCategories)
        setCategories(updatedCategories)
        console.log('カテゴリ内のドメイン順序を更新しました:', categoryId)
      } catch (error) {
        console.error('カテゴリ内ドメイン順序更新エラー:', error)
      }
    },
    [categories, setCategories],
  )

  /**
   * ドメインを別のカテゴリに移動する。
   * tabGroups は main.tsx から渡す（useTabData に依存するため引数として受け取る）。
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
        let updatedCategories = [...categories]
        if (fromCategoryId) {
          updatedCategories = updatedCategories.map((cat) =>
            cat.id === fromCategoryId
              ? {
                  ...cat,
                  domainNames: cat.domainNames
                    ? cat.domainNames.filter((d) => d !== domainGroup.domain)
                    : [],
                  domains: cat.domains.filter((d) => d !== domainId),
                }
              : cat,
          )
        }
        updatedCategories = updatedCategories.map((cat) =>
          cat.id === toCategoryId
            ? {
                ...cat,
                domainNames: cat.domainNames?.includes(domainGroup.domain)
                  ? cat.domainNames
                  : [...(cat.domainNames || []), domainGroup.domain],
                domains: cat.domains.includes(domainId)
                  ? cat.domains
                  : [...cat.domains, domainId],
              }
            : cat,
        )
        await saveParentCategories(updatedCategories)
        setCategories(updatedCategories)
        console.log(
          `ドメイン ${domainGroup.domain} を ${fromCategoryId || '未分類'} から ${toCategoryId} に移動しました`, // eslint-disable-line typescript/prefer-nullish-coalescing -- fromCategoryId could be empty string
        )
      } catch (error) {
        console.error('カテゴリ間ドメイン移動エラー:', error)
      }
    },
    [categories, setCategories],
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
