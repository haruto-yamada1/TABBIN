import { useCallback } from 'react'
import { toast } from 'sonner'

import type {
  SavedTabsParentCategoryDto as ParentCategory,
  SavedTabsTabGroupDto as TabGroup,
} from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDto'

import type { CategoryManagementModalUseCases } from './CategoryManagementModal.types'

interface AvailableDomain {
  id: string
  domain: string
}

export interface UseCategoryActionsParams {
  categoryNameError: string | null
  isProcessing: boolean
  isRenaming: boolean
  localCategoryName: string
  newCategoryName: string
  setCategoryNameError: (error: string | null) => void
  setIsProcessing: (processing: boolean) => void
  setIsRenaming: (renaming: boolean) => void
  setLocalCategoryName: (name: string) => void
  setNewCategoryName: (name: string) => void
  validateCategoryName: (name: string) => boolean
  category: {
    id: string
    name: string
  }
  domains: TabGroup[]
  onClose: () => void
  useCases: CategoryManagementModalUseCases
  activeSelectedDomain: string
  availableDomains: AvailableDomain[]
  setParentCategories: (categories: ParentCategory[]) => void
  setSelectedDomain: (domain: string) => void
  isSaving: boolean
  setIsSaving: (saving: boolean) => void
  inputRef: React.RefObject<HTMLInputElement | null>
  setShowDeleteConfirm: (show: boolean) => void
  t: (key: string, fallback?: string, values?: Record<string, string>) => string
}

export interface UseCategoryActionsReturn {
  handleStartRenaming: () => void
  handleCancelRenaming: () => void
  handleCategoryNameChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  handleSaveRenaming: () => Promise<void>
  handleDeleteCategory: () => Promise<void>
  handleAddDomain: () => Promise<void>
  handleShowDeleteConfirm: () => void
  handleHideDeleteConfirm: () => void
  handleAddDomainClick: (e: React.MouseEvent) => void
  handleRemoveDomain: (domainId: string) => Promise<void>
}

export const useCategoryActions = ({
  isProcessing,
  isRenaming,
  localCategoryName,
  newCategoryName,
  setCategoryNameError,
  setIsProcessing,
  setIsRenaming,
  setLocalCategoryName,
  setNewCategoryName,
  validateCategoryName,
  category,
  domains,
  onClose,
  useCases,
  activeSelectedDomain,
  availableDomains,
  setParentCategories,
  setSelectedDomain,
  setIsSaving,
  inputRef,
  setShowDeleteConfirm,
  t,
}: UseCategoryActionsParams): UseCategoryActionsReturn => {
  const {
    renameParentCategory,
    addDomainToParentCategory,
    removeDomainFromParentCategory,
    deleteParentCategory,
  } = useCases

  // カテゴリのリネーム処理を開始
  const handleStartRenaming = useCallback(() => {
    setNewCategoryName(localCategoryName)
    setIsRenaming(true)
    setCategoryNameError(null) // エラー状態をリセット
    // 入力フィールドにフォーカス
    // 即座にフォーカスと選択を行う
    requestAnimationFrame(() => {
      if (inputRef.current) {
        inputRef.current.focus()
        inputRef.current.select()
      }
    })
  }, [
    localCategoryName,
    setNewCategoryName,
    setIsRenaming,
    setCategoryNameError,
    inputRef,
  ])

  // リネームをキャンセル
  const handleCancelRenaming = useCallback(() => {
    setIsRenaming(false)
    setNewCategoryName(localCategoryName)
    setCategoryNameError(null) // エラー状態をリセット
  }, [
    localCategoryName,
    setNewCategoryName,
    setIsRenaming,
    setCategoryNameError,
  ])

  // 入力変更時の処理
  const handleCategoryNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const { value } = e.target
      setNewCategoryName(value)
      validateCategoryName(value) // リアルタイムバリデーション
    },
    [validateCategoryName, setNewCategoryName],
  )

  // カテゴリ名の変更処理
  const handleSaveRenaming = async () => {
    console.log('Modal - handleSaveRenaming開始', {
      currentCategory: category,
      localState: {
        isProcessing,
        isRenaming,
        localCategoryName,
        newCategoryName,
      },
    })

    // バリデーション
    if (!validateCategoryName(newCategoryName.trim())) {
      // エラーがある場合、処理を中止
      return
    }
    setIsProcessing(true)
    const trimmedName = newCategoryName.trim()
    console.log('Modal - 処理開始:', {
      categoryId: category.id,
      newName: trimmedName,
      oldName: category.name,
    })
    try {
      // カテゴリ名の更新処理を実行（`renameParentCategory` use-case 経由）。
      // 旧 `useCategoryGroupState.handleCategoryUpdate` / `confirmCategorySaved`
      // を統合し、presentation 層から `chrome.storage.local` 直叩きを撤去する
      // （issue #502）。
      console.log('Modal - renameParentCategory呼び出し開始', {
        categoryId: category.id,
        newName: trimmedName,
      })
      setIsSaving(true)
      try {
        const updatedCategories = await renameParentCategory({
          categoryId: category.id,
          newName: trimmedName,
        })
        console.log('Modal - renameParentCategory呼び出し完了')

        // 1 次検証: use-case 戻り値から対象カテゴリの更新を確認する。
        // 戻り値が `trimmedName` と一致しない場合は storage 反映に失敗している
        // 可能性があるため明示的にエラー扱いとする。
        const updatedCategory = updatedCategories.find(
          (cat) => cat.id === category.id,
        )
        if (updatedCategory?.name !== trimmedName) {
          throw new Error('カテゴリ名の更新が確認できません')
        }
      } finally {
        setIsSaving(false)
        console.log('Modal - 保存状態をリセット')
      }

      // すべての更新が確認できたら親コンポーネントに通知
      console.log('Modal - カテゴリ更新が完了しました')
      toast.success(
        t('savedTabs.categoryManagement.renamed', undefined, {
          after: trimmedName,
          before: category.name,
        }),
      )
      setLocalCategoryName(trimmedName)
      setIsRenaming(false)
    } catch (error) {
      console.error('Modal - カテゴリ名の更新に失敗:', {
        categoryId: category.id,
        error,
        isProcessing,
        newName: trimmedName,
        oldName: category.name,
        stack: error instanceof Error ? error.stack : undefined,
      })
      toast.error(t('savedTabs.categoryManagement.renameError'))
    } finally {
      console.log('Modal - 処理完了', {
        isProcessing,
        localCategoryName,
        newCategoryName,
      })
      setIsProcessing(false)
    }
  }

  // 親カテゴリ削除処理
  const handleDeleteCategory = useCallback(async () => {
    if (isProcessing) {
      return
    }
    setIsProcessing(true)
    try {
      // カテゴリ削除は `deleteParentCategory` use-case 経由で行い、
      // presentation 層から `parentCategoryRepository.removeByIds` /
      // `chrome.storage.local` の直叩きを撤去する (issue #518)。
      // use-case は削除後カテゴリ一覧を返すので state へ反映する。
      const { all } = await deleteParentCategory({
        categoryId: category.id,
      })
      // eslint-disable-next-line typescript/no-unsafe-type-assertion -- TODO(#502-followup): branded 差異は mock factory で解消予定
      setParentCategories([...all] as unknown as ParentCategory[])
      toast.success(
        t('savedTabs.categoryModal.deleted', undefined, {
          name: category.name,
        }),
      )
      onClose()
    } catch (error) {
      console.error('親カテゴリの削除に失敗しました:', error)
      toast.error(t('savedTabs.categoryModal.deleteError'))
    } finally {
      setIsProcessing(false)
    }
  }, [
    category.id,
    category.name,
    deleteParentCategory,
    isProcessing,
    setIsProcessing,
    setParentCategories,
    onClose,
    t,
  ])

  // ドメインをカテゴリに追加
  const handleAddDomain = useCallback(async () => {
    if (!activeSelectedDomain || isProcessing) {
      return
    }
    setIsProcessing(true)
    try {
      const selectedDomainInfo = availableDomains.find(
        (d) => d.id === activeSelectedDomain,
      )
      if (!selectedDomainInfo) {
        throw new Error('ドメインが見つかりません')
      }
      const updatedCategories = await addDomainToParentCategory({
        categoryId: category.id,
        domainId: activeSelectedDomain,
        domainName: selectedDomainInfo.domain,
      })
      // eslint-disable-next-line typescript/no-unsafe-type-assertion -- TODO(#502-followup): branded 差異は mock factory で解消予定
      setParentCategories([...updatedCategories] as unknown as ParentCategory[])
      setSelectedDomain('')
      toast.success(
        t('savedTabs.categoryModal.domainAssigned', undefined, {
          categoryName: category.name,
          domain: selectedDomainInfo.domain,
        }),
      )
    } catch (error) {
      console.error('ドメインの追加に失敗しました:', error)
      toast.error(t('savedTabs.categoryModal.toggleError'))
    } finally {
      setIsProcessing(false)
    }
  }, [
    activeSelectedDomain,
    addDomainToParentCategory,
    availableDomains,
    category.id,
    category.name,
    isProcessing,
    setIsProcessing,
    setSelectedDomain,
    setParentCategories,
    t,
  ])

  const handleShowDeleteConfirm = useCallback(() => {
    setShowDeleteConfirm(true)
  }, [setShowDeleteConfirm])

  const handleHideDeleteConfirm = useCallback(() => {
    setShowDeleteConfirm(false)
  }, [setShowDeleteConfirm])

  const handleAddDomainClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      void handleAddDomain()
    },
    [handleAddDomain],
  )

  // ドメインをカテゴリから削除
  const handleRemoveDomain = async (domainId: string) => {
    if (isProcessing) {
      return
    }
    setIsProcessing(true)
    try {
      // 削除するドメインの情報を取得
      const domainInfo = domains.find((d) => d.id === domainId)
      if (!domainInfo) {
        throw new Error('ドメインが見つかりません')
      }

      // カテゴリ更新は `removeDomainFromParentCategory` use-case 経由で行い、
      // `chrome.storage.local.get/set` の直叩きを撤去する（issue #502）。
      const updatedCategories = await removeDomainFromParentCategory({
        categoryId: category.id,
        domainId,
        domainName: domainInfo.domain,
      })
      // eslint-disable-next-line typescript/no-unsafe-type-assertion -- TODO(#502-followup): branded 差異は mock factory で解消予定
      setParentCategories([...updatedCategories] as unknown as ParentCategory[])
      toast.success(
        t('savedTabs.categoryModal.domainRemoved', undefined, {
          categoryName: category.name,
          domain: domainInfo.domain,
        }),
      )
    } catch (error) {
      console.error('ドメインの削除に失敗しました:', error)
      toast.error(t('savedTabs.categoryModal.deleteError'))
    } finally {
      setIsProcessing(false)
    }
  }

  return {
    handleStartRenaming,
    handleCancelRenaming,
    handleCategoryNameChange,
    handleSaveRenaming,
    handleDeleteCategory,
    handleAddDomain,
    handleShowDeleteConfirm,
    handleHideDeleteConfirm,
    handleAddDomainClick,
    handleRemoveDomain,
  }
}
