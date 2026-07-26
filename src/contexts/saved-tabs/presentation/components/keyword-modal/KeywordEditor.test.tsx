// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

const keywordEditorI18nState = vi.hoisted(() => ({
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
      language: keywordEditorI18nState.language,
      t: (key: string, fallback?: string, values?: Record<string, string>) => {
        const messages = getMessages(keywordEditorI18nState.language)
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

import { KeywordEditor } from './KeywordEditor'

const createKeywordModalValue = (
  options: {
    isRenaming?: boolean
    keywords?: string[]
    newKeyword?: string
    subCategories?: string[]
    handleAddKeyword?: ReturnType<typeof vi.fn>
    handleRemoveKeyword?: ReturnType<typeof vi.fn>
    setNewKeyword?: ReturnType<typeof vi.fn>
  } = {},
) => ({
  state: {
    subcategory: {
      activeCategory: 'news',
    },
    keywords: {
      keywords: options.keywords ?? [],
      newKeyword: options.newKeyword ?? '',
      setNewKeyword: options.setNewKeyword ?? vi.fn(),
      handleAddKeyword: options.handleAddKeyword ?? vi.fn(),
      handleRemoveKeyword: options.handleRemoveKeyword ?? vi.fn(),
    },
    rename: {
      isRenaming: options.isRenaming ?? false,
    },
  },
  group: {
    subCategories: options.subCategories ?? ['news'],
  },
})

describe('KeywordEditor', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    keywordEditorI18nState.language = 'ja'
  })

  it('renders English empty keyword copy when the display language is en', () => {
    keywordEditorI18nState.language = 'en'
    useKeywordModalMock.mockReturnValue(createKeywordModalValue())

    render(<KeywordEditor />)

    expect(screen.getByText('Keywords for the "news" subcategory')).toBeTruthy()
    expect(screen.getByText('No keywords')).toBeTruthy()
    expect(
      screen.getByPlaceholderText('e.g. Tech, New features, Tutorial'),
    ).toBeTruthy()
  })

  it('subcategory が無ければ editor を描画しない', () => {
    useKeywordModalMock.mockReturnValue(
      createKeywordModalValue({ subCategories: [] }),
    )

    const { container } = render(<KeywordEditor />)

    expect(container).toBeEmptyDOMElement()
  })

  it('入力変更を state setter へ渡す', async () => {
    const user = userEvent.setup()
    const setNewKeyword = vi.fn()

    function Harness() {
      const [keywordValue, setKeywordValue] = useState('')
      useKeywordModalMock.mockImplementation(() =>
        createKeywordModalValue({
          setNewKeyword: vi.fn((value: string) => {
            setNewKeyword(value)
            setKeywordValue(value)
          }),
          newKeyword: keywordValue,
        }),
      )
      return <KeywordEditor />
    }

    render(<Harness />)
    await user.type(screen.getByRole('textbox'), 'guide')

    expect(setNewKeyword).toHaveBeenCalledWith('guide')
  })

  it('Enter で追加し、それ以外の key では追加しない', async () => {
    const user = userEvent.setup()
    const handleAddKeyword = vi.fn()
    useKeywordModalMock.mockReturnValue(
      createKeywordModalValue({ handleAddKeyword }),
    )
    render(<KeywordEditor />)
    const input = screen.getByRole('textbox')

    await user.type(input, '{Escape}')
    expect(handleAddKeyword).not.toHaveBeenCalled()
    await user.type(input, '{Enter}')
    expect(handleAddKeyword).toHaveBeenCalledOnce()
  })

  it('blur 時は空白を無視し、入力済みなら追加する', () => {
    const emptyAdd = vi.fn()
    useKeywordModalMock.mockReturnValue(
      createKeywordModalValue({ handleAddKeyword: emptyAdd, newKeyword: '  ' }),
    )
    const { rerender } = render(<KeywordEditor />)
    fireEvent.blur(screen.getByRole('textbox'))
    expect(emptyAdd).not.toHaveBeenCalled()

    const filledAdd = vi.fn()
    useKeywordModalMock.mockReturnValue(
      createKeywordModalValue({
        handleAddKeyword: filledAdd,
        newKeyword: 'guide',
      }),
    )
    rerender(<KeywordEditor />)
    fireEvent.blur(screen.getByRole('textbox'))
    expect(filledAdd).toHaveBeenCalledOnce()
  })

  it('keyword badge の削除を委譲し、rename 中は操作を無効化する', async () => {
    const user = userEvent.setup()
    const handleRemoveKeyword = vi.fn()
    useKeywordModalMock.mockReturnValue(
      createKeywordModalValue({
        handleRemoveKeyword,
        keywords: ['guide'],
      }),
    )
    const { rerender } = render(<KeywordEditor />)

    await user.click(screen.getByRole('button'))
    expect(handleRemoveKeyword).toHaveBeenCalledWith('guide')

    useKeywordModalMock.mockReturnValue(
      createKeywordModalValue({ isRenaming: true, keywords: ['guide'] }),
    )
    rerender(<KeywordEditor />)
    expect(screen.getByRole('textbox').hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('button').hasAttribute('disabled')).toBe(true)
  })
})
