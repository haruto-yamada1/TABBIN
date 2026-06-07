// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

const subCategoryI18nState = vi.hoisted(() => ({
  language: 'ja' as 'en' | 'ja',
}))

const { useKeywordModalMock } = vi.hoisted(() => ({
  useKeywordModalMock: vi.fn(),
}))

vi.mock('./KeywordModalContext', () => ({
  useKeywordModal: useKeywordModalMock,
}))

vi.mock('@/features/i18n/context/I18nProvider', async () => {
  const { getMessages } = await vi.importActual<
// eslint-disable-next-line typescript/consistent-type-imports
    typeof import('@/features/i18n/messages')
  >('@/features/i18n/messages')

  return {
    useI18n: () => ({
      language: subCategoryI18nState.language,
      t: (key: string, fallback?: string, values?: Record<string, string>) => {
        const messages = getMessages(subCategoryI18nState.language)
        const template =
          messages[key as keyof typeof messages] ?? fallback ?? key
        return template.replaceAll(
          /\{\{(\w+)\}\}/g,
          (_, token) => values?.[token] ?? '', // eslint-disable-line
        )
      },
    }),
  }
})

vi.mock('@/components/ui/tooltip', () => ({
// eslint-disable-next-line react/jsx-no-useless-fragment
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => (
// eslint-disable-next-line react/jsx-no-useless-fragment
    <>{children}</>
  ),
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}))

vi.mock('@/components/ui/select', () => ({
  Select: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SelectValue: ({ placeholder }: { placeholder?: string }) => (
    <div>{placeholder}</div>
  ),
  SelectContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SelectItem: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}))

vi.mock('./SubCategoryDeleteConfirm', () => ({
  SubCategoryDeleteConfirm: () => <div>delete-confirm</div>,
}))

vi.mock('./SubCategoryRenameForm', () => ({
  SubCategoryRenameForm: () => <div>rename-form</div>,
}))

import { SubCategorySelector } from './SubCategorySelector'

const createKeywordModalState = () => ({
  state: {
    subcategory: {
      activeCategory: 'news',
      setActiveCategory: vi.fn(),
    },
    rename: {
      isRenaming: false,
      handleStartRenaming: vi.fn(),
    },
    deletion: {
      setShowDeleteConfirm: vi.fn(),
    },
  },
  group: {
    subCategories: ['news', 'docs'],
  },
})

describe('SubCategorySelector', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    subCategoryI18nState.language = 'ja'
  })

  it('renders English selector copy when the display language is en', () => {
    subCategoryI18nState.language = 'en'
    useKeywordModalMock.mockReturnValue(createKeywordModalState())

    render(<SubCategorySelector />)

    expect(screen.getByText('Select subcategory')).toBeTruthy()
    expect(screen.getAllByText('Rename subcategory')).toHaveLength(2)
    expect(screen.getAllByText('Delete the selected subcategory')).toHaveLength(
      2,
    )
    expect(screen.getByText('Select a subcategory to manage')).toBeTruthy()
  })
})
