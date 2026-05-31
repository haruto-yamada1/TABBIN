// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import type { ChangeEvent } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ParentCategory, TabGroup } from '@/types/storage'

import { useCategoryKeywordModal } from './useCategoryKeywordModal'

const categoryKeywordModalI18nState = vi.hoisted(() => ({
  language: 'ja' as 'en' | 'ja',
}))

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

vi.mock('@/features/i18n/context/I18nProvider', async () => {
  const { getMessages } = await vi.importActual<
    typeof import('@/features/i18n/messages')
  >('@/features/i18n/messages')

  return {
    useI18n: () => ({
      language: categoryKeywordModalI18nState.language,
      t: (key: string, fallback?: string, values?: Record<string, string>) => {
        const messages = getMessages(categoryKeywordModalI18nState.language)
        const template =
          messages[key as keyof typeof messages] ?? fallback ?? key
        return template.replaceAll(
          /\{\{(\w+)\}\}/g,
          (_, token) => values?.[token] ?? '',
        )
      },
    }),
  }
})

const createGroup = (): TabGroup => ({
  domain: 'example.com',
  id: 'group-1',
  urls: [],
  subCategories: ['Existing subcategory'],
  categoryKeywords: [],
})

const createParentCategories = (): ParentCategory[] => [
  {
    domainNames: ['example.com'],
    domains: ['group-1'],
    id: 'parent-1',
    name: 'Parent category',
  },
]

const createChangeEvent = (value: string) =>
  ({
    target: { value },
  }) as ChangeEvent<HTMLInputElement>

describe('useCategoryKeywordModal', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    categoryKeywordModalI18nState.language = 'ja'
  })

  it('uses English validation copy when the new subcategory name is blank', () => {
    categoryKeywordModalI18nState.language = 'en'

    const { result } = renderHook(() =>
      useCategoryKeywordModal({
        group: createGroup(),
        initialParentCategories: createParentCategories(),
        isOpen: false,
        onDeleteCategory: vi.fn(),
        onSave: vi.fn(),
      }),
    )

    act(() => {
      result.current.subcategory.handleSubCategoryNameChange(
        createChangeEvent(' '),
      )
    })

    expect(result.current.subcategory.subCategoryNameError).toBe(
      'Enter a new parent category name',
    )
  })

  it('uses English validation copy when the rename exceeds 25 characters', () => {
    categoryKeywordModalI18nState.language = 'en'

    const { result } = renderHook(() =>
      useCategoryKeywordModal({
        group: createGroup(),
        initialParentCategories: createParentCategories(),
        isOpen: false,
        onDeleteCategory: vi.fn(),
        onSave: vi.fn(),
      }),
    )

    act(() => {
      result.current.rename.handleRenameCategoryNameChange(
        createChangeEvent('a'.repeat(26)),
      )
    })

    expect(result.current.rename.categoryRenameError).toBe(
      'Parent category names must be within 25 characters.',
    )
  })
})
