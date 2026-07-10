import { useCallback, useEffect, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'

import type {
  SavedTabsParentCategoryDto as ParentCategory,
  SavedTabsTabGroupDto as TabGroup,
} from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDto'
import { toStorageParentCategory } from '@/contexts/saved-tabs/application/mappers/SavedTabsSnapshotMapper'
import type { GetSavedTabsPageDataQuery } from '@/contexts/saved-tabs/application/queries/GetSavedTabsPageDataQuery'
import type { AssignDomainToCategoryUseCase } from '@/contexts/saved-tabs/application/use-cases/AssignDomainToCategoryUseCase'
import type { CreateParentCategoryUseCase } from '@/contexts/saved-tabs/application/use-cases/CreateParentCategoryUseCase'
import type { DeleteParentCategoryUseCase } from '@/contexts/saved-tabs/application/use-cases/DeleteParentCategoryUseCase'
import { useI18n } from '@/features/i18n/context/I18nProvider'

/** UseCategoryModal フックの引数 */
type UseCategoryModalParams = {
  /** タブグループ一覧 */
  tabGroups: TabGroup[]
  /** 保存タブページ全体 query。`parentCategoryRepository.findAll` 直叩きを置換 (issue #510)。*/
  getSavedTabsPageDataQuery: GetSavedTabsPageDataQuery
  /** 親カテゴリ作成 use-case（issue #509）。*/
  createParentCategoryUseCase: CreateParentCategoryUseCase
  /** 親カテゴリ削除 use-case（issue #509）。*/
  deleteParentCategoryUseCase: DeleteParentCategoryUseCase
  /** ドメイン割当 use-case（issue #509）。*/
  assignDomainToCategoryUseCase: AssignDomainToCategoryUseCase
}
type DomainCategoryMap = Record<
  string,
  {
    id: string
    name: string
  } | null
>
const buildDomainCategoriesMap = (
  tabGroups: TabGroup[],
  parentCategories: ParentCategory[],
): DomainCategoryMap => {
  const domainCategoriesMap: DomainCategoryMap = {}
  const categoryByDomainName = new Map<string, ParentCategory>()
  for (const category of parentCategories) {
    for (const domainName of category.domainNames) {
      categoryByDomainName.set(domainName, category)
    }
  }
  for (const group of tabGroups) {
    const foundCategory = categoryByDomainName.get(group.domain)
    domainCategoriesMap[group.id] = foundCategory
      ? {
          id: foundCategory.id,
          name: foundCategory.name,
        }
      : null
  }
  return domainCategoriesMap
}
const clearCategoryFromDomainMap = (
  currentMap: DomainCategoryMap,
  deletedCategoryId: string,
): DomainCategoryMap => {
  const updatedMap: DomainCategoryMap = {
    ...currentMap,
  }
  for (const groupId of Object.keys(updatedMap)) {
    if (updatedMap[groupId]?.id === deletedCategoryId) {
      updatedMap[groupId] = null
    }
  }
  return updatedMap
}
const applyDomainCategoryToggle = (params: {
  currentMap: DomainCategoryMap
  domainId: string
  selectedCategory: ParentCategory
  selectedCategoryId: string
  newChecked: boolean
}): DomainCategoryMap => {
  const {
    currentMap,
    domainId,
    selectedCategory,
    selectedCategoryId,
    newChecked,
  } = params
  const updated = {
    ...currentMap,
  }
  if (newChecked) {
    updated[domainId] = {
      id: selectedCategory.id,
      name: selectedCategory.name,
    }
    return updated
  }
  if (updated[domainId]?.id === selectedCategoryId) {
    updated[domainId] = null
  }
  return updated
}
const applyDomainSelectionChange = async (params: {
  domainId: string
  newChecked: boolean
  selectedCategoryId: string
  selectedCategory: ParentCategory
  domainCategories: DomainCategoryMap
  groupDomain: string
  setCategories: Dispatch<SetStateAction<ParentCategory[]>>
  setDomainCategories: Dispatch<SetStateAction<DomainCategoryMap>>
  t: (key: string, fallback?: string, values?: Record<string, string>) => string
  assignDomainToCategoryUseCase: AssignDomainToCategoryUseCase
  getSavedTabsPageDataQuery: GetSavedTabsPageDataQuery
}) => {
  const {
    domainId,
    newChecked,
    selectedCategoryId,
    selectedCategory,
    domainCategories,
    groupDomain,
    setCategories,
    setDomainCategories,
    t,
    assignDomainToCategoryUseCase,
    getSavedTabsPageDataQuery,
  } = params
  await assignDomainToCategoryUseCase({
    categoryId: newChecked ? selectedCategoryId : 'none',
    domainId,
  })
  const nextDomainCategories = applyDomainCategoryToggle({
    currentMap: domainCategories,
    domainId,
    newChecked,
    selectedCategory,
    selectedCategoryId,
  })
  const updatedCategories = (
    await getSavedTabsPageDataQuery()
  ).parentCategories.map(toStorageParentCategory)
  setCategories(updatedCategories)
  setDomainCategories(nextDomainCategories)
  toast.success(
    t(
      newChecked
        ? 'savedTabs.categoryModal.domainAssigned'
        : 'savedTabs.categoryModal.domainRemoved',
      undefined,
      {
        categoryName: selectedCategory.name,
        domain: groupDomain,
      },
    ),
    {
      duration: 1500,
    },
  )
}
/**
 * CategoryModal の状態ロジックを管理するカスタムフック
 * @param params フックの引数
 * @returns カテゴリ作成・選択・削除・ドメイン選択関連の状態と操作
 */
export const useCategoryModal = ({
  tabGroups,
  getSavedTabsPageDataQuery,
  createParentCategoryUseCase,
  deleteParentCategoryUseCase,
  assignDomainToCategoryUseCase,
}: UseCategoryModalParams) => {
  // eslint-disable-line eslint/max-lines-per-function
  const { t } = useI18n()
  // --- 新規カテゴリ名状態 ---
  const [newCategoryName, setNewCategoryName] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)

  // --- カテゴリリスト・選択状態 ---
  const [categoryData, setCategoryData] = useState<{
    categories: ParentCategory[]
    domainCategories: DomainCategoryMap
    selectedCategoryId: string | null
  }>({
    categories: [],
    domainCategories: {},
    selectedCategoryId: null,
  })
  const { categories, domainCategories, selectedCategoryId } = categoryData
  const setCategories: Dispatch<SetStateAction<ParentCategory[]>> = useCallback(
    (action) => {
      setCategoryData((current) => ({
        ...current,
        categories:
          action instanceof Function ? action(current.categories) : action,
      }))
    },
    [],
  )
  const setDomainCategories: Dispatch<SetStateAction<DomainCategoryMap>> =
    useCallback((action) => {
      setCategoryData((current) => ({
        ...current,
        domainCategories:
          action instanceof Function
            ? action(current.domainCategories)
            : action,
      }))
    }, [])
  const setSelectedCategoryId = useCallback((nextCategoryId: string | null) => {
    setCategoryData((current) => ({
      ...current,
      selectedCategoryId: nextCategoryId,
    }))
  }, [])

  // --- ドメイン選択状態 ---
  const [selectedDomains, setSelectedDomains] = useState<
    Record<string, boolean>
  >({})

  // --- 処理中状態 ---
  const [isCategoryUpdating, setIsCategoryUpdating] = useState(false)
  const isLoading = isCategoryUpdating

  // --- 削除確認UI状態 ---
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [categoryToDelete, setCategoryToDelete] =
    useState<ParentCategory | null>(null)

  const MAX_CATEGORY_NAME_LENGTH = 25

  const validateCategoryName = useCallback(
    (value: string) =>
      z
        .string()
        .min(1, t('savedTabs.categoryModal.validation.empty'))
        .max(
          MAX_CATEGORY_NAME_LENGTH,
          t('savedTabs.categoryModal.validation.maxLength'),
        )
        .safeParse(value),
    [t],
  )

  // --- ドメイン選択状態の更新 ---
  const updateSelectedDomains = useCallback(
    (category: ParentCategory | 'uncategorized') => {
      const newSelectedDomains: Record<string, boolean> = {}
      const categoryDomainNames =
        category === 'uncategorized'
          ? null
          : // eslint-disable-next-line unicorn/no-useless-collection-argument
            new Set(category.domainNames)
      for (const group of tabGroups) {
        if (category === 'uncategorized') {
          newSelectedDomains[group.id] = !domainCategories[group.id]
        } else {
          const isDomainInCategory =
            categoryDomainNames?.has(group.domain) ?? false
          newSelectedDomains[group.id] = isDomainInCategory
        }
      }
      setSelectedDomains(newSelectedDomains)
    },
    [tabGroups, domainCategories],
  )

  // --- カテゴリリスト初期ロード ---
  useEffect(() => {
    const loadCategories = async () => {
      try {
        const fromRepo = (
          await getSavedTabsPageDataQuery()
        ).parentCategories.map(toStorageParentCategory)
        setCategoryData({
          categories: fromRepo,
          domainCategories: buildDomainCategoriesMap(tabGroups, fromRepo),
          selectedCategoryId: fromRepo.length > 0 ? fromRepo[0].id : null,
        })
      } catch (error) {
        console.error('カテゴリの取得に失敗しました', error)
        toast.error(t('savedTabs.categoryModal.loadError'))
      }
    }
    void loadCategories()
  }, [getSavedTabsPageDataQuery, t, tabGroups])

  // --- 選択カテゴリ変更時のドメイン選択更新 ---
  const [prevDomainSync, setPrevDomainSync] = useState<{
    selectedCategoryId: string | null
    categories: typeof categories
    updateFn: typeof updateSelectedDomains
  } | null>(null)

  if (
    prevDomainSync === null ||
    prevDomainSync.selectedCategoryId !== selectedCategoryId ||
    prevDomainSync.categories !== categories ||
    prevDomainSync.updateFn !== updateSelectedDomains
  ) {
    setPrevDomainSync({
      selectedCategoryId,
      categories,
      updateFn: updateSelectedDomains,
    })
    if (selectedCategoryId === 'uncategorized') {
      updateSelectedDomains('uncategorized')
    } else if (selectedCategoryId) {
      const selectedCategory = categories.find(
        (c) => c.id === selectedCategoryId,
      )
      if (selectedCategory) {
        updateSelectedDomains(selectedCategory)
      }
    }
  }

  // --- カテゴリ選択ハンドラ ---
  const handleCategoryChange = useCallback(
    (value: string) => {
      if (value === 'uncategorized') {
        setSelectedCategoryId('uncategorized')
        updateSelectedDomains('uncategorized')
      } else {
        setSelectedCategoryId(value)
        const selectedCategory = categories.find((c) => c.id === value)
        if (selectedCategory) {
          updateSelectedDomains(selectedCategory)
        }
      }
    },
    [categories, setSelectedCategoryId, updateSelectedDomains],
  )

  // --- 新規カテゴリ作成ハンドラ ---
  const handleCreateCategory = useCallback(async () => {
    const result = validateCategoryName(newCategoryName)
    if (!result.success) {
      const errorMessage =
        result.error.issues[0]?.message || t('savedTabs.categoryModal.invalid')
      setNameError(errorMessage)
      toast.error(errorMessage)
      return
    }

    try {
      setIsCategoryUpdating(true)
      const { category: newCategory, all } = await createParentCategoryUseCase({
        name: newCategoryName,
      })
      // domain.ParentCategory → storage shape 投影は mapper 内に閉じ、
      // 呼び出し側の `as unknown as` / `as never` disable を排除する。
      const updatedAll = all.map(toStorageParentCategory)
      setCategories(updatedAll)
      setSelectedCategoryId(newCategory.id)
      setNewCategoryName('')
      toast.success(t('savedTabs.categoryModal.created'))
      updateSelectedDomains(toStorageParentCategory(newCategory))
    } catch (error) {
      console.error('カテゴリの作成に失敗しました', error)
      if (
        error instanceof Error &&
        error.message.startsWith('DUPLICATE_CATEGORY_NAME:')
      ) {
        toast.error(
          t('savedTabs.categoryModal.duplicateName', undefined, {
            name: newCategoryName,
          }),
        )
      } else {
        toast.error(t('savedTabs.categoryModal.createError'))
      }
    } finally {
      setIsCategoryUpdating(false)
    }
  }, [
    createParentCategoryUseCase,
    newCategoryName,
    setCategories,
    setSelectedCategoryId,
    t,
    updateSelectedDomains,
    validateCategoryName,
  ])

  // --- 入力フィールド変更ハンドラ ---
  const handleCategoryNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const { value } = e.target
      setNewCategoryName(value)
      const result = validateCategoryName(value)
      if (result.success) {
        setNameError(null)
      } else {
        setNameError(
          result.error.issues[0]?.message ||
            t('savedTabs.categoryModal.invalid'),
        )
      }
    },
    [t, validateCategoryName],
  )

  // --- エンターキーハンドラ ---
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        if (newCategoryName.trim() && !nameError && !isLoading) {
          void handleCreateCategory()
        }
      }
    },
    [newCategoryName, nameError, isLoading, handleCreateCategory],
  )

  // --- フォーカスアウトハンドラ ---
  const handleBlur = useCallback(() => {
    if (newCategoryName.trim() && !nameError && !isLoading) {
      void handleCreateCategory()
    }
  }, [newCategoryName, nameError, isLoading, handleCreateCategory])

  // --- カテゴリ削除ハンドラ ---
  const handleDeleteCategory = useCallback(async () => {
    if (!categoryToDelete) {
      return
    }
    try {
      setIsCategoryUpdating(true)
      const { all } = await deleteParentCategoryUseCase({
        categoryId: categoryToDelete.id,
      })
      const updatedAll = all.map(toStorageParentCategory)
      setCategories(updatedAll)
      const updatedDomainCategories = clearCategoryFromDomainMap(
        domainCategories,
        categoryToDelete.id,
      )
      setDomainCategories(updatedDomainCategories)
      if (selectedCategoryId === categoryToDelete.id) {
        setSelectedCategoryId(updatedAll.length > 0 ? updatedAll[0].id : null)
        if (updatedAll.length > 0) {
          updateSelectedDomains(updatedAll[0])
        } else {
          setSelectedDomains({})
        }
      }
      toast.success(
        t('savedTabs.categoryModal.deleted', undefined, {
          name: categoryToDelete.name,
        }),
      )
      setCategoryToDelete(null)
    } catch (error) {
      console.error('カテゴリの削除に失敗しました:', error)
      toast.error(t('savedTabs.categoryModal.deleteError'))
    } finally {
      setIsCategoryUpdating(false)
      setShowDeleteConfirm(false)
    }
  }, [
    categoryToDelete,
    deleteParentCategoryUseCase,
    domainCategories,
    selectedCategoryId,
    setCategories,
    setDomainCategories,
    setSelectedCategoryId,
    t,
    updateSelectedDomains,
  ])

  // --- 削除ボタンクリック ---
  const handleDeleteClick = useCallback(() => {
    const target = categories.find((c) => c.id === selectedCategoryId)
    if (!target) {
      toast.error(t('savedTabs.categoryModal.deleteSelectionMissing'))
      return
    }
    setCategoryToDelete(target)
    setShowDeleteConfirm(true)
  }, [categories, selectedCategoryId, t])

  // --- ドメイン選択切り替え ---
  const toggleDomainSelection = useCallback(
    (domainId: string) => {
      const previousChecked = selectedDomains[domainId]
      const rollbackSelection = () => {
        setSelectedDomains((prev) => ({
          ...prev,
          [domainId]: previousChecked,
        }))
      }
      const newChecked = !previousChecked
      setSelectedDomains((prev) => ({
        ...prev,
        [domainId]: newChecked,
      }))
      if (!selectedCategoryId) {
        return
      }
      const group = tabGroups.find((g) => g.id === domainId)
      if (!group) {
        rollbackSelection()
        return
      }
      if (selectedCategoryId === 'uncategorized') {
        if (newChecked) {
          rollbackSelection()
          toast.error(t('savedTabs.categoryModal.uncategorizedDirectEditError'))
        }
        return
      }
      const selectedCategory = categories.find(
        (c) => c.id === selectedCategoryId,
      )
      if (!selectedCategory) {
        rollbackSelection()
        return
      }
      setIsCategoryUpdating(true)
      void applyDomainSelectionChange({
        assignDomainToCategoryUseCase,
        domainCategories,
        domainId,
        getSavedTabsPageDataQuery,
        groupDomain: group.domain,
        newChecked,
        selectedCategory,
        selectedCategoryId,
        setCategories,
        setDomainCategories,
        t,
      })
        .catch((error: unknown) => {
          console.error('カテゴリの設定に失敗しました:', error)
          toast.error(t('savedTabs.categoryModal.toggleError'))
          rollbackSelection()
        })
        .finally(() => {
          setIsCategoryUpdating(false)
        })
    },
    [
      selectedDomains,
      selectedCategoryId,
      tabGroups,
      domainCategories,
      categories,
      setCategories,
      setDomainCategories,
      t,
      assignDomainToCategoryUseCase,
      getSavedTabsPageDataQuery,
    ],
  )
  return {
    /** カテゴリ作成関連 */
    create: {
      handleBlur,
      handleCategoryNameChange,
      handleCreateCategory,
      handleKeyDown,
      nameError,
      newCategoryName,
    },
    /** 削除関連 */
    deletion: {
      categoryToDelete,
      handleDeleteCategory,
      handleDeleteClick,
      setShowDeleteConfirm,
      showDeleteConfirm,
    },
    /** ドメイン選択関連 */
    domains: {
      domainCategories,
      selectedDomains,
      toggleDomainSelection,
    },
    /** 処理中状態 */
    isLoading,
    /** カテゴリ選択関連 */
    selection: {
      categories,
      handleCategoryChange,
      selectedCategoryId,
    },
  }
}
