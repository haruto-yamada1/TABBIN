// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
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

const createKeywordModalValue = () => ({
  state: {
    subcategory: {
      activeCategory: 'news',
    },
    keywords: {
      keywords: [],
      newKeyword: '',
      setNewKeyword: vi.fn(),
      handleAddKeyword: vi.fn(),
      handleRemoveKeyword: vi.fn(),
    },
    rename: {
      isRenaming: false,
    },
  },
  group: {
    subCategories: ['news'],
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
})
