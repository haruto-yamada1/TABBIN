// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

import type { UserSettings } from '@/types/storage'

const { useSortableMock } = vi.hoisted(() => ({
  useSortableMock: vi.fn(),
}))

const sortableUrlItemI18nState = vi.hoisted(() => ({
  language: 'ja' as 'en' | 'ja',
}))

vi.mock('@dnd-kit/sortable', () => ({
  useSortable: useSortableMock,
}))

vi.mock('@dnd-kit/utilities', () => ({
  CSS: {
    Transform: {
      toString: () => undefined,
    },
  },
}))

vi.mock('@/features/i18n/context/I18nProvider', async () => {
  const { getMessages } = await vi.importActual<
    // eslint-disable-next-line typescript/consistent-type-imports
    typeof import('@/features/i18n/messages')
  >('@/features/i18n/messages')

  return {
    useI18n: () => ({
      language: sortableUrlItemI18nState.language,
      t: (key: string, fallback?: string, values?: Record<string, string>) => {
        const messages = getMessages(sortableUrlItemI18nState.language)
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

vi.mock('@/utils/datetime', () => ({
  TimeRemaining: () => <span data-testid='time-remaining'>残り時間</span>,
}))

vi.mock('@/utils/localDateTime', () => ({
  formatFixedDatetime: () => '2026/06/02 12:34',
}))

import { SortableUrlItem } from './SortableUrlItem'

const defaultSettings: UserSettings = {
  removeTabAfterOpen: true,
  removeTabAfterExternalDrop: true,
  excludePatterns: [],
  enableCategories: true,
  autoDeletePeriod: '1day',
  showSavedTime: true,
  clickBehavior: 'saveSameDomainTabs',
  excludePinnedTabs: false,
  openUrlInBackground: true,
  openAllInNewWindow: false,
  confirmDeleteAll: false,
  confirmDeleteEach: false,
  colors: {},
}

describe('SortableUrlItem', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useSortableMock.mockReturnValue({
      attributes: {},
      listeners: {},
      setNodeRef: vi.fn(),
      transform: null,
      transition: undefined,
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('長いタイトルでも縮小可能なclassを維持し、クリックと削除を処理する', () => {
    const handleOpenTab = vi.fn()
    const handleDeleteUrl = vi.fn()

    render(
      <SortableUrlItem
        url='https://example.com/really/long/path/that/should/not/stretch/the/card'
        title='Very long saved tab title Very long saved tab title Very long saved tab title'
        id='https://example.com/really/long/path/that/should/not/stretch/the/card'
        groupId='group-1'
        savedAt={Date.parse('2026-06-02T12:34:56.000Z')}
        autoDeletePeriod='1day'
        handleDeleteUrl={handleDeleteUrl}
        handleOpenTab={handleOpenTab}
        handleUpdateUrls={vi.fn()}
        categoryContext='category-Work-group-1'
        settings={defaultSettings}
      />,
    )

    const listItem = document.querySelector('li')
    expect(listItem?.className).toContain('min-w-0')

    const openButton = screen.getByRole('button', {
      name: /Very long saved tab title/,
    })
    expect(openButton.className).toContain('w-full')
    expect(openButton.className).toContain('min-w-0')

    const textColumn = openButton.querySelector('div')
    expect(textColumn?.className).toContain('min-w-0')
    expect(textColumn?.className).toContain('overflow-hidden')

    const titleLabel = openButton.querySelector('span')
    expect(titleLabel?.className).toContain('truncate')
    expect(screen.getByText('2026/06/02 12:34')).toBeTruthy()
    expect(screen.getByTestId('time-remaining')).toBeTruthy()

    fireEvent.click(openButton)
    expect(handleOpenTab).toHaveBeenCalledWith(
      'https://example.com/really/long/path/that/should/not/stretch/the/card',
    )

    fireEvent.click(screen.getByRole('button', { name: 'タブを削除' }))
    expect(handleDeleteUrl).toHaveBeenCalledWith(
      'group-1',
      'https://example.com/really/long/path/that/should/not/stretch/the/card',
    )
  })
})
