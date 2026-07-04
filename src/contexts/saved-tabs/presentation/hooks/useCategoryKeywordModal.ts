import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'

import type {
  SavedTabsParentCategoryDto as ParentCategory,
  SavedTabsTabGroupDto as TabGroup,
} from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDto'
import {
  toPresentationTabGroups,
  toStorageParentCategory,
} from '@/contexts/saved-tabs/application/mappers/SavedTabsSnapshotMapper'
import type { CategoryAssignmentPort } from '@/contexts/saved-tabs/application/ports/CategoryAssignmentPort'
import type { StorageChangePort } from '@/contexts/saved-tabs/application/ports/StorageChangePort'
import type { GetSavedTabsPageDataQuery } from '@/contexts/saved-tabs/application/queries/GetSavedTabsPageDataQuery'
import { useI18n } from '@/features/i18n/context/I18nProvider'
import { hasNormalizedDomain } from '@/utils/domain-normalize'

/** カテゴリ名のバリデーションスキーマ */
const MAX_CATEGORY_NAME_LENGTH = 25

const createCategoryNameSchema = (t: ReturnType<typeof useI18n>['t']) =>
  z
    .string()
    .trim()
    .min(1, {
      message: t('savedTabs.categoryModal.validation.empty'),
    })
    .max(MAX_CATEGORY_NAME_LENGTH, {
      message: t('savedTabs.categoryModal.validation.maxLength'),
    })

/** UseCategoryKeywordModal フックの依存 (issue #510) */
interface UseCategoryKeywordModalDeps {
  /** カテゴリ / タブグループの永続化 port */
  categoryAssignmentPort: CategoryAssignmentPort
  /** 保存タブページ全体 query (parentCategories 読み取り) */
  getSavedTabsPageDataQuery: GetSavedTabsPageDataQuery
}

/** UseCategoryKeywordModal フックの引数 */
interface UseCategoryKeywordModalParams {
  /** タブグループデータ */
  group: TabGroup
  /** モーダル開閉状態 */
  isOpen: boolean
  /** 保存ハンドラ */
  onSave: (groupId: string, categoryName: string, keywords: string[]) => void
  /** カテゴリ削除ハンドラ */
  onDeleteCategory: (groupId: string, categoryName: string) => void
  /** 初期の親カテゴリリスト */
  initialParentCategories: ParentCategory[]
  /** 親カテゴリ更新ハンドラ */
  onUpdateParentCategories?: (categories: ParentCategory[]) => void
  /** 永続化依存（Repository 群）。`chrome.storage.local` 直叩きを撤去するため必須。 */
  deps: UseCategoryKeywordModalDeps
  /**
   * storage 変更通知 port。`StorageChangePort` 経由でのみ storage 変更を
   * 購読する（issue #503）。chrome API の詳細は infrastructure 層の
   * `ChromeStorageChangeAdapter` に閉じ込めており、presentation 層から
   * 購読 / 解除を直接行う場合は本 port を使う。未指定時は購読を行わず、
   * 初回 `loadParentCategories` 呼び出しだけで親カテゴリを同期する
   * （テストで chrome 依存を完全に切りたい場合用）。
   */
  readonly storageChangePort?: StorageChangePort
}
const resolveSelectedParentCategoryId = (
  storedCategories: ParentCategory[],
  group: TabGroup,
): string => {
  if (group.parentCategoryId) {
    return group.parentCategoryId
  }
  const matchedCategory = storedCategories.find(
    (category) =>
      category.domains.includes(group.id) ||
      hasNormalizedDomain(category.domainNames, group.domain),
  )
  return matchedCategory ? matchedCategory.id : 'none'
}
const renameCategoryInTab = (
  tab: TabGroup,
  groupId: string,
  activeCategory: string,
  validName: string,
): TabGroup => {
  if (tab.id !== groupId) {
    return tab
  }
  const updatedSubCategories =
    tab.subCategories?.map((cat) =>
      cat === activeCategory ? validName : cat,
    ) ?? []
  const updatedCategoryKeywords =
    tab.categoryKeywords?.map((ck) =>
      ck.categoryName === activeCategory
        ? {
            ...ck,
            categoryName: validName,
          }
        : ck,
    ) ?? []
  const updatedUrls = (tab.urls ?? []).map((url) =>
    url.subCategory === activeCategory
      ? {
          ...url,
          subCategory: validName,
        }
      : url,
  )
  const updatedSubCategoryOrder = (tab.subCategoryOrder ?? []).map((cat) =>
    cat === activeCategory ? validName : cat,
  )
  const updatedAllOrder = (tab.subCategoryOrderWithUncategorized ?? []).map(
    (cat) => (cat === activeCategory ? validName : cat),
  )
  return {
    ...tab,
    categoryKeywords: updatedCategoryKeywords,
    subCategories: updatedSubCategories,
    subCategoryOrder: updatedSubCategoryOrder,
    subCategoryOrderWithUncategorized: updatedAllOrder,
    urls: updatedUrls,
  }
}
/**
 * CategoryKeywordModal の状態ロジックを管理するカスタムフック
 * @param params フックの引数
 * @returns サブカテゴリ・キーワード・リネーム・削除・親カテゴリ関連の状態と操作
 */
export const useCategoryKeywordModal = ({
  // eslint-disable-line eslint/max-lines-per-function
  group,
  isOpen,
  onSave,
  onDeleteCategory,
  initialParentCategories,
  onUpdateParentCategories,
  deps,
  storageChangePort,
}: UseCategoryKeywordModalParams) => {
  const { categoryAssignmentPort, getSavedTabsPageDataQuery } = deps
  const { t } = useI18n()
  // --- サブカテゴリ選択状態 ---
  const [activeCategory, setActiveCategory] = useState<string>(
    group.subCategories && group.subCategories.length > 0
      ? group.subCategories[0]
      : '',
  )

  // --- キーワード・リネーム状態 ---
  const [categoryEditState, setCategoryEditState] = useState({
    isRenaming: false,
    keywords: [] as string[],
    newCategoryName: '',
  })
  const { keywords, isRenaming, newCategoryName } = categoryEditState
  const updateCategoryEditState = useCallback(
    (updates: Partial<typeof categoryEditState>) => {
      setCategoryEditState((current) => ({ ...current, ...updates }))
    },
    [],
  )

  // --- キーワード入力状態 ---
  const [newKeyword, setNewKeyword] = useState('')

  // --- サブカテゴリ追加状態 ---
  const [newSubCategory, setNewSubCategory] = useState('')
  const [subCategoryNameError, setSubCategoryNameError] = useState<
    string | null
  >(null)

  // --- 削除状態 ---
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // --- 処理中フラグ ---
  const [isProcessing, setIsProcessing] = useState(false)
  const modalContentRef = useRef<HTMLDivElement>(null)

  // --- リネーム状態 ---
  const [categoryRenameError, setCategoryRenameError] = useState<string | null>(
    null,
  )

  // --- 親カテゴリ状態 ---
  const [internalParentCategories, setInternalParentCategories] = useState<
    ParentCategory[]
  >(initialParentCategories)
  const [selectedParentCategory, setSelectedParentCategory] = useState<string>(
    group.parentCategoryId ?? 'none',
  )
  const [prevParentCategoryId, setPrevParentCategoryId] = useState(
    group.parentCategoryId,
  )

  if (prevParentCategoryId !== group.parentCategoryId) {
    setPrevParentCategoryId(group.parentCategoryId)
    setSelectedParentCategory(group.parentCategoryId ?? 'none')
  }

  // --- バリデーション ---
  const validateCategoryName = useCallback(
    (
      name: string,
      setError: React.Dispatch<React.SetStateAction<string | null>>,
    ): boolean => {
      const result = createCategoryNameSchema(t).safeParse(name)
      if (result.success) {
        setError(null)
        return true
      }
      setError(result.error.issues[0]?.message ?? '')
      return false
    },
    [t],
  )

  // --- 親カテゴリ読み込み ---
  // 以下の値 (group, onUpdateParentCategories, getSavedTabsPageDataQuery, t) は
  // 呼び出しごとに新しい参照になるケース (テストモック / i18n オブジェクト等) でも
  // loadParentCategories の再生成で useEffect が無限ループしないように ref 経由で
  // 読み取る。`selectedParentCategory` も同様に最新値参照用 ref を使うことで
  // コールバック本体を安定化し、`useEffect` の依存に入れても再実行を避ける。
  const groupRef = useRef(group)
  groupRef.current = group
  const onUpdateParentCategoriesRef = useRef(onUpdateParentCategories)
  onUpdateParentCategoriesRef.current = onUpdateParentCategories
  const getSavedTabsPageDataQueryRef = useRef(getSavedTabsPageDataQuery)
  getSavedTabsPageDataQueryRef.current = getSavedTabsPageDataQuery
  const tRef = useRef(t)
  tRef.current = t
  const selectedParentCategoryRef = useRef(selectedParentCategory)
  selectedParentCategoryRef.current = selectedParentCategory

  const loadParentCategories = useCallback(async () => {
    try {
      // domain → storage 投影は mapper 内に閉じ、`as unknown as` を排除する。
      const stored = (await getSavedTabsPageDataQueryRef.current())
        .parentCategories
      const storedCategories = stored.map(toStorageParentCategory)
      setInternalParentCategories(storedCategories)
      const updateCallback = onUpdateParentCategoriesRef.current
      if (updateCallback) {
        // eslint-disable-next-line typescript/no-confusing-void-expression
        await updateCallback(storedCategories) // eslint-disable-line typescript/await-thenable
      }
      const newParentId = resolveSelectedParentCategoryId(
        storedCategories,
        groupRef.current,
      )
      // 関数型 setState を使うことで、ref 読み取りの最新値と setter を
      // 同期させ、不要な state 変更を React に弾かせる。
      setSelectedParentCategory((current) =>
        current === newParentId ? current : newParentId,
      )
    } catch (error) {
      console.error('親カテゴリの読み込みに失敗:', error)
      toast.error(tRef.current('savedTabs.categoryModal.loadError'))
    }
  }, [])

  // --- モーダル開閉時の初期化 ---
  // `loadParentCategories` / `storageChangePort` の参照が頻繁に変わっても
  // useEffect が無限ループしないように、`storageChangePort` のみ ref 経由で
  // 参照し、`loadParentCategories` は上記で安定化済み (deps 空) なので
  // クリーンアップ用の参照だけ保持する。
  const storageChangePortRef = useRef(storageChangePort)
  storageChangePortRef.current = storageChangePort
  useEffect(() => {
    if (!isOpen) {
      return undefined
    }

    void loadParentCategories()

    const port = storageChangePortRef.current
    if (!port) {
      return undefined
    }

    const unsubscribe = port.subscribe((changes) => {
      if (changes.some((change) => change.key === 'parentCategories')) {
        void loadParentCategories()
      }
    })

    return () => {
      unsubscribe()
    }
  }, [isOpen, loadParentCategories])

  // --- カテゴリ変更時のキーワード読み込み ---
  const keywordSyncKey = isOpen && activeCategory ? activeCategory : ''
  const [prevKeywordSyncKey, setPrevKeywordSyncKey] = useState<string | null>(
    null,
  )

  if (keywordSyncKey !== prevKeywordSyncKey) {
    setPrevKeywordSyncKey(keywordSyncKey)
    if (isOpen && activeCategory) {
      const categoryKeywords = group.categoryKeywords?.find(
        (ck) => ck.categoryName === activeCategory,
      )
      const loadedKeywords = categoryKeywords?.keywords ?? []
      setCategoryEditState((current) => ({
        ...current,
        isRenaming: false,
        keywords: loadedKeywords,
        newCategoryName: '',
      }))
    }
  }

  // --- キーワード追加 ---
  const handleAddKeyword = useCallback(() => {
    if (!newKeyword.trim()) {
      return
    }
    const trimmedKeyword = newKeyword.trim()
    const isDuplicate = keywords.some(
      (keyword) => keyword.toLowerCase() === trimmedKeyword.toLowerCase(),
    )
    if (isDuplicate) {
      toast.error(t('savedTabs.keywords.duplicate'))
      return
    }
    const updatedKeywords = [...keywords, trimmedKeyword]
    updateCategoryEditState({ keywords: updatedKeywords })
    setNewKeyword('')
    onSave(group.id, activeCategory, updatedKeywords)
  }, [
    newKeyword,
    keywords,
    group.id,
    activeCategory,
    onSave,
    t,
    updateCategoryEditState,
  ])

  // --- キーワード削除 ---
  const handleRemoveKeyword = useCallback(
    async (keywordToRemove: string) => {
      const updatedKeywords = keywords.filter((k) => k !== keywordToRemove)
      updateCategoryEditState({ keywords: updatedKeywords })
      try {
        const pageData = await getSavedTabsPageDataQuery()
        // domain.TabGroup → presentation shape 投影と port 入口の
        // domain 復帰は mapper (`toPresentationTabGroups` /
        // `toDomainTabGroupFromStorage`) 内に閉じ、呼び出し側からは
        // `as unknown as ...` disable を排除する。
        const savedTabs = toPresentationTabGroups(pageData.tabGroups)
        const updatedGroups = savedTabs.map((g) =>
          g.id === group.id
            ? {
                ...g,
                categoryKeywords: (g.categoryKeywords ?? []).map((ck) =>
                  ck.categoryName === activeCategory
                    ? {
                        ...ck,
                        keywords: updatedKeywords,
                      }
                    : ck,
                ),
                urls: (g.urls ?? []).map((item) =>
                  item.subCategory === activeCategory
                    ? {
                        ...item,
                        subCategory: undefined,
                      }
                    : item,
                ),
              }
            : g,
        )
        await categoryAssignmentPort.saveTabGroups(updatedGroups)
      } catch (error) {
        console.error('キーワード削除に伴う保存処理に失敗しました:', error)
      }
    },
    [
      activeCategory,
      categoryAssignmentPort,
      getSavedTabsPageDataQuery,
      group.id,
      keywords,
      updateCategoryEditState,
    ],
  )

  // --- サブカテゴリ名入力ハンドラ ---
  const handleSubCategoryNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const { value } = e.target
      setNewSubCategory(value)
      validateCategoryName(value, setSubCategoryNameError)
    },
    [validateCategoryName],
  )

  // --- リネーム入力ハンドラ ---
  const handleRenameCategoryNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const { value } = e.target
      updateCategoryEditState({ newCategoryName: value })
      validateCategoryName(value, setCategoryRenameError)
    },
    [validateCategoryName, updateCategoryEditState],
  )

  // --- サブカテゴリ追加 ---
  const handleAddSubCategory = useCallback(async () => {
    if (!newSubCategory.trim() || isProcessing) {
      return
    }
    if (!validateCategoryName(newSubCategory.trim(), setSubCategoryNameError)) {
      return
    }
    if (group.subCategories?.includes(newSubCategory.trim())) {
      const duplicateMessage = t('savedTabs.subCategory.duplicateName')
      setSubCategoryNameError(duplicateMessage)
      toast.error(duplicateMessage)
      return
    }
    setIsProcessing(true)
    try {
      const validName = newSubCategory.trim()
      const pageData = await getSavedTabsPageDataQuery()
      // domain → presentation 投影は mapper に閉じ、呼び出し側の
      // `as unknown as ...` disable を排除する。
      const savedTabs = toPresentationTabGroups(pageData.tabGroups)
      const updatedTabs = savedTabs.map((tab) => {
        if (tab.id === group.id) {
          return {
            ...tab,
            subCategories: [...(tab.subCategories ?? []), validName],
          }
        }
        return tab
      })
      await categoryAssignmentPort.saveTabGroups(updatedTabs)
      setActiveCategory(validName)
      setNewSubCategory('')
      setSubCategoryNameError(null)
      toast.success(
        t('savedTabs.subCategory.created', undefined, {
          name: validName,
        }),
      )
    } catch (error) {
      console.error('子カテゴリ追加エラー:', error)
      toast.error(t('savedTabs.subCategory.createError'))
    } finally {
      setIsProcessing(false)
    }
  }, [
    categoryAssignmentPort,
    getSavedTabsPageDataQuery,
    group.id,
    group.subCategories,
    isProcessing,
    newSubCategory,
    t,
    validateCategoryName,
  ])

  // --- カテゴリ削除 ---
  const handleDeleteCategory = useCallback(async () => {
    if (!activeCategory) {
      return
    }
    if (!(onDeleteCategory instanceof Function)) {
      console.error('削除関数が定義されていません')
      return
    }
    try {
      const categoryToDelete = activeCategory
      // eslint-disable-next-line typescript/no-confusing-void-expression
      await onDeleteCategory(group.id, categoryToDelete) // eslint-disable-line typescript/await-thenable
      if (group.subCategories && group.subCategories.length > 1) {
        const updatedSubCategories = group.subCategories.filter(
          (cat: string) => cat !== categoryToDelete,
        )
        if (updatedSubCategories.length > 0) {
          setActiveCategory(updatedSubCategories[0])
        } else {
          setActiveCategory('')
        }
      } else {
        setActiveCategory('')
      }
      setShowDeleteConfirm(false)
    } catch (error) {
      console.error('カテゴリ削除エラー:', error)
    }
  }, [activeCategory, onDeleteCategory, group.id, group.subCategories])

  // --- リネーム開始 ---
  const handleStartRenaming = useCallback(() => {
    updateCategoryEditState({
      isRenaming: true,
      newCategoryName: activeCategory,
    })
    requestAnimationFrame(() => {
      const inputElement = document.querySelector<HTMLInputElement>(
        'input[data-rename-input]',
      )
      if (inputElement) {
        inputElement.focus()
        inputElement.select()
      }
    })
  }, [activeCategory, updateCategoryEditState])

  // --- リネームキャンセル ---
  const handleCancelRenaming = useCallback(() => {
    updateCategoryEditState({
      isRenaming: false,
      newCategoryName: '',
    })
  }, [updateCategoryEditState])

  // --- リネーム保存 ---
  const handleSaveRenaming = useCallback(async () => {
    if (!newCategoryName.trim() || newCategoryName.trim() === activeCategory) {
      updateCategoryEditState({
        isRenaming: false,
        newCategoryName: '',
      })
      setCategoryRenameError(null)
      return
    }
    if (isProcessing) {
      return
    }
    if (!validateCategoryName(newCategoryName.trim(), setCategoryRenameError)) {
      requestAnimationFrame(() => {
        const inputElement = document.querySelector<HTMLInputElement>(
          'input[data-rename-input]',
        )
        if (inputElement) {
          inputElement.focus()
        }
      })
      return
    }
    if (group.subCategories?.includes(newCategoryName.trim())) {
      const duplicateMessage = t('savedTabs.subCategory.duplicateName')
      setCategoryRenameError(duplicateMessage)
      toast.error(duplicateMessage)
      requestAnimationFrame(() => {
        const inputElement = document.querySelector<HTMLInputElement>(
          'input[data-rename-input]',
        )
        if (inputElement) {
          inputElement.focus()
        }
      })
      return
    }
    setIsProcessing(true)
    try {
      const validName = newCategoryName.trim()
      const pageData = await getSavedTabsPageDataQuery()
      // domain → presentation 投影は mapper に閉じ、呼び出し側の
      // `as unknown as ...` disable を排除する。
      const savedTabs = toPresentationTabGroups(pageData.tabGroups)
      const updatedTabs = savedTabs.map((tab) =>
        renameCategoryInTab(tab, group.id, activeCategory, validName),
      )
      await categoryAssignmentPort.saveTabGroups(updatedTabs)
      setActiveCategory(validName)
      updateCategoryEditState({
        isRenaming: false,
        newCategoryName: '',
      })
      setCategoryRenameError(null)
      toast.success(
        t('savedTabs.subCategory.renamed', undefined, {
          after: validName,
          before: activeCategory,
        }),
      )
    } catch (error) {
      console.error('カテゴリ名の変更中にエラーが発生しました:', error)
      toast.error(t('savedTabs.subCategory.renameError'))
    } finally {
      setIsProcessing(false)
    }
  }, [
    activeCategory,
    categoryAssignmentPort,
    getSavedTabsPageDataQuery,
    group.id,
    group.subCategories,
    isProcessing,
    newCategoryName,
    t,
    updateCategoryEditState,
    validateCategoryName,
  ])
  return {
    /** 削除関連 */
    deletion: {
      handleDeleteCategory,
      setShowDeleteConfirm,
      showDeleteConfirm,
    },
    /** 共通 */
    isProcessing,
    /** キーワード関連 */
    keywords: {
      handleAddKeyword,
      handleRemoveKeyword,
      keywords,
      newKeyword,
      setNewKeyword,
    },
    modalContentRef,
    /** 親カテゴリ関連 */
    parentCategory: {
      internalParentCategories,
      selectedParentCategory,
      setSelectedParentCategory,
    },
    /** リネーム関連 */
    rename: {
      categoryRenameError,
      handleCancelRenaming,
      handleRenameCategoryNameChange,
      handleSaveRenaming,
      handleStartRenaming,
      isRenaming,
      newCategoryName,
    },
    /** サブカテゴリ関連 */
    subcategory: {
      activeCategory,
      handleAddSubCategory,
      handleSubCategoryNameChange,
      newSubCategory,
      setActiveCategory,
      subCategoryNameError,
    },
  }
}

export { renameCategoryInTab, resolveSelectedParentCategoryId }
