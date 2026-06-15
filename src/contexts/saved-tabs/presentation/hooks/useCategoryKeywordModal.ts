import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'

import type { StorageChangePort } from '@/contexts/saved-tabs/application/ports/StorageChangePort'
import type { ParentCategoryRepository } from '@/contexts/saved-tabs/domain/repositories/ParentCategoryRepository'
import type { TabGroupRepository } from '@/contexts/saved-tabs/domain/repositories/TabGroupRepository'
import { useI18n } from '@/features/i18n/context/I18nProvider'
import type { ParentCategory, TabGroup } from '@/types/storage'

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

/** UseCategoryKeywordModal フックの依存（Repository 群） */
interface UseCategoryKeywordModalDeps {
  /** TabGroup 永続化 Repository */
  tabGroupRepository: TabGroupRepository
  /** ParentCategory 永続化 Repository */
  parentCategoryRepository: ParentCategoryRepository
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
   * storage 変更通知 port。`chrome.storage.onChanged` の直叩きは禁止の
   * ため、presentation 層は本 port 経由でのみ storage 変更を購読する。
   * 未指定時は購読を行わず、初回 `loadParentCategories` 呼び出しだけで
   * 親カテゴリを同期する（テストで chrome 依存を完全に切りたい場合用）。
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
      category.domainNames.includes(group.domain),
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
  const { tabGroupRepository, parentCategoryRepository } = deps
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
  const [selectedParentCategory, setSelectedParentCategory] =
    useState<string>('none')

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

  // --- 初期値の設定 ---
  useEffect(() => {
    if (group.parentCategoryId) {
      setSelectedParentCategory(group.parentCategoryId)
    }
  }, [group.parentCategoryId])

  // --- 親カテゴリ読み込み ---
  const loadParentCategories = useCallback(async () => {
    try {
      // eslint-disable-next-line eslint/no-restricted-properties -- TODO(#488-followup): presentation 層から chrome.* を撤去し Repository / Port 経由へ移行
      // eslint-disable-next-line eslint/no-restricted-properties, typescript/unbound-method -- TODO(#488-followup): presentation 層から chrome.* を撤去し Repository / Port 経由へ移行
      const stored =
        // eslint-disable-next-line typescript/no-unsafe-type-assertion -- TODO(#502-followup): storage 層 ParentCategory と domain 層 ParentCategory の branded 差異
        (await parentCategoryRepository.findAll()) as unknown as readonly ParentCategory[]
      const storedCategories = [...stored]
      setInternalParentCategories(storedCategories)
      if (onUpdateParentCategories) {
        // eslint-disable-next-line typescript/no-confusing-void-expression
        await onUpdateParentCategories(storedCategories) // eslint-disable-line typescript/await-thenable
      }
      const newParentId = resolveSelectedParentCategoryId(
        storedCategories,
        group,
      )
      if (selectedParentCategory !== newParentId) {
        setSelectedParentCategory(newParentId)
      }
    } catch (error) {
      console.error('親カテゴリの読み込みに失敗:', error)
      toast.error(t('savedTabs.categoryModal.loadError'))
    }
  }, [
    group,
    onUpdateParentCategories,
    parentCategoryRepository,
    selectedParentCategory,
    t,
  ])

  // --- モーダル開閉時の初期化 ---
  useEffect(() => {
    if (!isOpen) {
      return undefined
    }

    void loadParentCategories()

    if (!storageChangePort) {
      return undefined
    }

    const unsubscribe = storageChangePort.subscribe((changes) => {
      if (changes.some((change) => change.key === 'parentCategories')) {
        void loadParentCategories()
      }
    })

    return () => {
      unsubscribe()
    }
  }, [isOpen, loadParentCategories, storageChangePort])

  // --- カテゴリ変更時のキーワード読み込み ---
  useEffect(() => {
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
  }, [isOpen, activeCategory, group])

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
        const savedTabs =
          // eslint-disable-next-line typescript/no-unsafe-type-assertion -- TODO(#502-followup): storage 層 TabGroup と domain 層 TabGroup の branded 差異
          (await tabGroupRepository.findAll()) as unknown as readonly TabGroup[]
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
        await tabGroupRepository.saveAll(
          // eslint-disable-next-line typescript/no-unsafe-type-assertion -- TODO(#502-followup): storage 層 TabGroup と domain 層 TabGroup の branded 差異
          updatedGroups as unknown as Parameters<
            typeof tabGroupRepository.saveAll
          >[0],
        )
      } catch (error) {
        console.error('キーワード削除に伴う保存処理に失敗しました:', error)
      }
    },
    [
      activeCategory,
      group.id,
      keywords,
      tabGroupRepository,
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
      const savedTabs =
        // eslint-disable-next-line typescript/no-unsafe-type-assertion -- TODO(#502-followup): storage 層 TabGroup と domain 層 TabGroup の branded 差異
        (await tabGroupRepository.findAll()) as unknown as readonly TabGroup[]
      const updatedTabs = savedTabs.map((tab: TabGroup) => {
        if (tab.id === group.id) {
          return {
            ...tab,
            subCategories: [...(tab.subCategories ?? []), validName],
          }
        }
        return tab
      })
      await tabGroupRepository.saveAll(
        // eslint-disable-next-line typescript/no-unsafe-type-assertion -- TODO(#502-followup): storage 層 TabGroup と domain 層 TabGroup の branded 差異
        updatedTabs as unknown as Parameters<
          typeof tabGroupRepository.saveAll
        >[0],
      )
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
    group.id,
    group.subCategories,
    isProcessing,
    newSubCategory,
    tabGroupRepository,
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
      const savedTabs =
        // eslint-disable-next-line typescript/no-unsafe-type-assertion -- TODO(#502-followup): storage 層 TabGroup と domain 層 TabGroup の branded 差異
        (await tabGroupRepository.findAll()) as unknown as readonly TabGroup[]
      const updatedTabs = savedTabs.map((tab: TabGroup) =>
        renameCategoryInTab(tab, group.id, activeCategory, validName),
      )
      await tabGroupRepository.saveAll(
        // eslint-disable-next-line typescript/no-unsafe-type-assertion -- TODO(#502-followup): storage 層 TabGroup と domain 層 TabGroup の branded 差異
        updatedTabs as unknown as Parameters<
          typeof tabGroupRepository.saveAll
        >[0],
      )
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
    group.id,
    group.subCategories,
    isProcessing,
    newCategoryName,
    tabGroupRepository,
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
