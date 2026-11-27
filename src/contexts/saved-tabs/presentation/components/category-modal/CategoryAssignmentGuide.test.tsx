// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CategoryAssignmentGuide } from './CategoryAssignmentGuide'
import { DOMAIN_ASSIGNMENT_SECTION_ID } from './domainAssignmentSectionId'

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
  justCreatedCategory,
  selectedCategoryId,
}: {
  justCreatedCategory: { id: string; name: string } | null
  selectedCategoryId: string | null
}) => {
  useCategoryModalContextMock.mockReturnValue({
    state: {
      create: { justCreatedCategory },
      selection: { selectedCategoryId },
    },
    tabGroups: [],
  })
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  document.body.innerHTML = ''
})

describe('CategoryAssignmentGuide', () => {
  it('作成直後でなければ何も描画しない', () => {
    setContext({ justCreatedCategory: null, selectedCategoryId: 'cat-1' })

    const { container } = render(<CategoryAssignmentGuide />)

    expect(container.textContent).toBe('')
  })

  it('作成したカテゴリと選択中カテゴリが異なる場合は何も描画しない', () => {
    setContext({
      justCreatedCategory: { id: 'cat-1', name: '仕事' },
      selectedCategoryId: 'cat-2',
    })

    const { container } = render(<CategoryAssignmentGuide />)

    expect(container.textContent).toBe('')
  })

  it('作成直後は作成完了と割当手順の案内を表示する', () => {
    setContext({
      justCreatedCategory: { id: 'cat-1', name: '仕事' },
      selectedCategoryId: 'cat-1',
    })

    render(<CategoryAssignmentGuide />)

    expect(screen.getByText('「仕事」を作成しました')).toBeTruthy()
    expect(
      screen.getByText(/下のドメイン一覧で割り当てるドメインにチェック/),
    ).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'ドメインを割り当てる' }),
    ).toBeTruthy()
  })

  it('「ドメインを割り当てる」で割当セクションへスクロールし最初のチェックボックスへフォーカスする', async () => {
    const user = userEvent.setup()
    setContext({
      justCreatedCategory: { id: 'cat-1', name: '仕事' },
      selectedCategoryId: 'cat-1',
    })

    const section = document.createElement('div')
    section.id = DOMAIN_ASSIGNMENT_SECTION_ID
    const scrollIntoView = vi.fn()
    section.scrollIntoView = scrollIntoView
    const checkbox = document.createElement('button')
    checkbox.setAttribute('role', 'checkbox')
    section.append(checkbox)
    document.body.append(section)

    render(<CategoryAssignmentGuide />)
    await user.click(
      screen.getByRole('button', { name: 'ドメインを割り当てる' }),
    )

    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'start',
    })
    expect(checkbox).toHaveFocus()
  })
})
