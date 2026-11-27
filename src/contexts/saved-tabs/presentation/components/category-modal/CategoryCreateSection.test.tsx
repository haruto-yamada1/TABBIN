// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CategoryCreateSection } from './CategoryCreateSection'

const { useCategoryModalContextMock } = vi.hoisted(() => ({
  useCategoryModalContextMock: vi.fn(),
}))

vi.mock('./CategoryModalContext', () => ({
  useCategoryModalContext: useCategoryModalContextMock,
}))

vi.mock('@/features/i18n/context/I18nProvider', async () => {
  const { getMessages } = await vi.importActual<
    // eslint-disable-next-line typescript/consistent-type-imports
    typeof import('@/features/i18n/messages')
  >('@/features/i18n/messages')

  return {
    useI18n: () => ({
      language: 'ja',
      t: (key: string, fallback?: string, values?: Record<string, string>) => {
        const messages = getMessages('ja')
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

const setContext = ({
  newCategoryName = '',
  nameError = null,
  isLoading = false,
  handleCreateCategory = vi.fn(),
}: {
  newCategoryName?: string
  nameError?: string | null
  isLoading?: boolean
  handleCreateCategory?: () => void
} = {}) => {
  const handleBlur = vi.fn()
  useCategoryModalContextMock.mockReturnValue({
    state: {
      create: {
        handleBlur,
        handleCategoryNameChange: vi.fn(),
        handleCreateCategory,
        handleKeyDown: vi.fn(),
        nameError,
        newCategoryName,
      },
      isLoading,
    },
    tabGroups: [],
  })
  return { handleBlur, handleCreateCategory }
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('CategoryCreateSection', () => {
  it('作成後にドメイン割当へ進む説明を表示する', () => {
    setContext()

    render(<CategoryCreateSection />)

    expect(
      screen.getByText(/続けて下のドメイン一覧でドメインを割り当てられます/),
    ).toBeTruthy()
  })

  it('名前が空の間は作成ボタンを無効化する', () => {
    setContext({ newCategoryName: '' })

    render(<CategoryCreateSection />)

    const button = screen.getByRole('button', { name: 'カテゴリを作成' })
    expect((button as HTMLButtonElement).disabled).toBe(true)
  })

  it('作成ボタンのクリックでカテゴリ作成を呼び出す', async () => {
    const user = userEvent.setup()
    const handleCreateCategory = vi.fn()
    setContext({ newCategoryName: '仕事', handleCreateCategory })

    render(<CategoryCreateSection />)
    await user.click(screen.getByRole('button', { name: 'カテゴリを作成' }))

    expect(handleCreateCategory).toHaveBeenCalledTimes(1)
  })

  it('入力欄にフォーカスした状態で作成ボタンをクリックしても二重作成しない', async () => {
    const user = userEvent.setup()
    const handleCreateCategory = vi.fn()
    const { handleBlur } = setContext({
      newCategoryName: '仕事',
      handleCreateCategory,
    })

    render(<CategoryCreateSection />)
    await user.click(screen.getByRole('textbox'))
    await user.click(screen.getByRole('button', { name: 'カテゴリを作成' }))

    expect(handleBlur).not.toHaveBeenCalled()
    expect(handleCreateCategory).toHaveBeenCalledTimes(1)
  })
})
