import { useCallback, useMemo, useState } from 'react'

import { useI18n } from '@/features/i18n/context/I18nProvider'

import {
  categoryNameSchema,
  createCategoryNameSchema,
} from './categoryNameSchema'

interface CategoryManagementFormState {
  categoryNameError: string | null
  isProcessing: boolean
  isRenaming: boolean
  localCategoryName: string
  newCategoryName: string
}

const createCategoryManagementFormState = (
  categoryName: string,
): CategoryManagementFormState => ({
  categoryNameError: null,
  isProcessing: false,
  isRenaming: false,
  localCategoryName: categoryName,
  newCategoryName: categoryName,
})

export interface UseCategoryFormStateReturn {
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
}

export const useCategoryFormState = (
  categoryName: string,
): UseCategoryFormStateReturn => {
  const { t } = useI18n()
  const localizedCategoryNameSchema = useMemo(
    () =>
      createCategoryNameSchema({
        empty: t('savedTabs.categoryModal.validation.empty'),
        maxLength: t('savedTabs.categoryModal.validation.maxLength'),
      }),
    [t],
  )
  const [
    {
      categoryNameError,
      isProcessing,
      isRenaming,
      localCategoryName,
      newCategoryName,
    },
    setFormState,
  ] = useState<CategoryManagementFormState>(() =>
    createCategoryManagementFormState(categoryName),
  )
  const setCategoryNameError = (categoryNameError: string | null) => {
    setFormState((prev) => ({ ...prev, categoryNameError }))
  }
  const setIsProcessing = (isProcessing: boolean) => {
    setFormState((prev) => ({ ...prev, isProcessing }))
  }
  const setIsRenaming = (isRenaming: boolean) => {
    setFormState((prev) => ({ ...prev, isRenaming }))
  }
  const setLocalCategoryName = (localCategoryName: string) => {
    setFormState((prev) => ({ ...prev, localCategoryName }))
  }
  const setNewCategoryName = (newCategoryName: string) => {
    setFormState((prev) => ({ ...prev, newCategoryName }))
  }

  // 入力値バリデーション関数
  const validateCategoryName = useCallback(
    (name: string) => {
      categoryNameSchema.schema = localizedCategoryNameSchema
      const result = categoryNameSchema.safeParse(name)
      if (!result.success) {
        const issue = result.error.issues[0]
        if (issue?.code === 'too_small') {
          setCategoryNameError(t('savedTabs.categoryModal.validation.empty'))
        } else if (issue?.code === 'too_big') {
          setCategoryNameError(
            t('savedTabs.categoryModal.validation.maxLength'),
          )
        } else {
          setCategoryNameError(t('savedTabs.categoryModal.invalid'))
        }
        return false
      }
      setCategoryNameError(null)
      return true
    },
    [localizedCategoryNameSchema, t],
  )

  return {
    categoryNameError,
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
  }
}
