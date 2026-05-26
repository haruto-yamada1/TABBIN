import { useEffect, useState } from 'react'
import { z } from 'zod'

import { getMessage, resolveLanguage } from '@/features/i18n/lib/language'
import type { AppLanguage } from '@/features/i18n/messages'
import {
  getChromeStorageOnChanged,
  warnMissingChromeStorage,
} from '@/lib/browser/chrome-storage'
import {
  createParentCategory,
  getParentCategories,
} from '@/lib/storage/categories'
import { getUserSettings } from '@/lib/storage/settings'
import type { ParentCategory } from '@/types/storage'

const getUiLocale = () => chrome.i18n?.getUILanguage?.() ?? 'ja'

export const useCategories = () => {
  const [{ parentCategories, language }, setCategoryState] = useState<{
    language: AppLanguage
    parentCategories: ParentCategory[]
  }>({
    language: 'ja',
    parentCategories: [],
  })
  const [newCategoryName, setNewCategoryName] = useState('')
  const [categoryError, setCategoryError] = useState<string | null>(null) // エラーメッセージ用の状態変数

  const t = (key: string, fallback?: string) =>
    getMessage(language, key, fallback)

  useEffect(() => {
    const loadCategories = async () => {
      try {
        const [categories, settings] = await Promise.all([
          getParentCategories(),
          getUserSettings(),
        ])
        setCategoryState({
          language: resolveLanguage(
            /* v8 ignore next -- coverage-only defensive branch. */
            settings.language ?? 'system',
            getUiLocale(),
          ),
          parentCategories: categories,
        })
      } catch (error) {
        console.error('カテゴリの読み込みエラー:', error)
      }
    }

    loadCategories()
  }, [])

  useEffect(() => {
    const storageChangeListener = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string,
    ) => {
      if (areaName === 'local' && changes.parentCategories) {
        const nextParentCategories = Array.isArray(
          changes.parentCategories.newValue,
        )
          ? (changes.parentCategories.newValue as ParentCategory[])
          : []
        setCategoryState((prev) => ({
          ...prev,
          parentCategories: nextParentCategories,
        }))
      }

      if (areaName === 'local' && changes.userSettings?.newValue) {
        const nextSettings = changes.userSettings.newValue as {
          language?: 'en' | 'ja' | 'system'
        }
        setCategoryState((prev) => ({
          ...prev,
          language: resolveLanguage(
            /* v8 ignore next -- coverage-only defensive branch. */
            nextSettings.language ?? 'system',
            getUiLocale(),
          ),
        }))
      }
    }

    const storageOnChanged = getChromeStorageOnChanged()
    if (!storageOnChanged) {
      warnMissingChromeStorage('カテゴリ変更監視')
      return
    }

    storageOnChanged.addListener(storageChangeListener)

    return () => {
      storageOnChanged.removeListener(storageChangeListener)
    }
  }, [])

  // 新しいカテゴリを追加
  const handleAddCategory = async () => {
    if (newCategoryName.trim()) {
      // バリデーションチェック
      const validationResult = z
        .string()
        .max(25, t('options.categories.validation.maxLength'))
        .safeParse(newCategoryName.trim())
      if (!validationResult.success) {
        const { message } = validationResult.error.issues[0]
        setCategoryError(message)
        setTimeout(() => setCategoryError(null), 3000)
        return false
      }

      // 重複をチェック
      const isDuplicate = parentCategories.some(
        (cat) =>
          cat.name.toLowerCase() === newCategoryName.trim().toLowerCase(),
      )

      if (isDuplicate) {
        setCategoryError(t('options.categories.duplicate'))
        setTimeout(() => setCategoryError(null), 3000) // 3秒後にエラーメッセージを消す
        return false
      }

      try {
        await createParentCategory(newCategoryName.trim())
        setNewCategoryName('')
        setCategoryError(null)
        return true
      } catch (error) {
        console.error('カテゴリ追加エラー:', error)
        setCategoryError(t('options.categories.addError'))
        setTimeout(() => setCategoryError(null), 3000)
        return false
      }
    }
    return false
  }

  // Enterキーを押したときのハンドラ
  const handleCategoryKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      // エラーがなければ追加を実行
      if (!categoryError) {
        handleAddCategory()
      }
    }
  }

  return {
    categoryError,
    handleAddCategory,
    handleCategoryKeyDown,
    newCategoryName,
    parentCategories,
    setCategoryError,
    setNewCategoryName,
  }
}
