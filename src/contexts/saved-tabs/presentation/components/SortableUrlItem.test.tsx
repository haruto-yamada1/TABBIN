// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

import type { SavedTabsUserSettingsDto as UserSettings } from '@/contexts/saved-tabs/presentation/types/SavedTabsCompatibilityViewModel'

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

  it('長いタイトルでも縮小可能なclassを維持し、クリックと削除を処理する', async () => {
    const user = userEvent.setup()
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

    const listItem = screen.getByTestId('sortable-url-item')
    expect(listItem).toHaveClass('min-w-0')

    const openLink = screen.getByRole('link', {
      name: /Very long saved tab title/,
    })
    expect(openLink).toHaveClass('w-full')
    expect(openLink).toHaveClass('min-w-0')
    expect(openLink).toHaveAttribute(
      'href',
      'https://example.com/really/long/path/that/should/not/stretch/the/card',
    )
    expect(openLink).toHaveAttribute('target', '_blank')
    expect(openLink).toHaveAttribute('rel', 'noopener noreferrer')
    expect(screen.getAllByRole('button')).toHaveLength(1)

    const textColumn = screen.getByTestId('url-text-column')
    expect(textColumn).toHaveClass('min-w-0')
    expect(textColumn).toHaveClass('overflow-hidden')

    const titleLabel = screen.getByTestId('url-title-label')
    expect(titleLabel).toHaveClass('truncate')
    expect(screen.getByText('2026/06/02 12:34')).toBeTruthy()
    expect(screen.getByTestId('time-remaining')).toBeTruthy()

    await user.click(openLink)
    expect(handleOpenTab).toHaveBeenCalledWith(
      'https://example.com/really/long/path/that/should/not/stretch/the/card',
    )

    await user.click(screen.getByRole('button', { name: 'タブを削除' }))
    expect(handleDeleteUrl).toHaveBeenCalledWith(
      'group-1',
      'https://example.com/really/long/path/that/should/not/stretch/the/card',
    )
  })

  it('通常クリックとEnterだけをTABBIN処理し標準リンク操作へ委譲する', async () => {
    const user = userEvent.setup()
    const handleOpenTab = vi.fn()
    const url = 'https://example.com/path'

    render(
      <SortableUrlItem
        {...{
          url,
          title: 'Example Tab',
          id: url,
          groupId: 'group-1',
          handleDeleteUrl: vi.fn(),
          handleOpenTab,
          handleUpdateUrls: vi.fn(),
          settings: defaultSettings,
        }}
      />,
    )

    const link = screen.getByRole('link', { name: 'Example Tab' })
    const managedClick = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      button: 0,
    })
    link.dispatchEvent(managedClick)

    expect(managedClick.defaultPrevented).toBe(true)
    expect(handleOpenTab).toHaveBeenCalledTimes(1)

    for (const init of [
      { button: 1 },
      { button: 0, ctrlKey: true },
      { button: 0, metaKey: true },
      { button: 0, shiftKey: true },
      { button: 0, altKey: true },
    ]) {
      const delegatedClick = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        ...init,
      })
      link.dispatchEvent(delegatedClick)
      expect(delegatedClick.defaultPrevented).toBe(false)
    }
    expect(handleOpenTab).toHaveBeenCalledTimes(1)

    const contextMenu = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      button: 2,
    })
    link.dispatchEvent(contextMenu)
    expect(contextMenu.defaultPrevented).toBe(false)

    link.focus()
    await user.keyboard('{Enter}')
    expect(handleOpenTab).toHaveBeenCalledTimes(2)
  })

  it('許可されないprotocolのURLはリンクとして描画しない', () => {
    const unsafeUrl = ['java', 'script:alert(1)'].join('')

    render(
      <SortableUrlItem
        url={unsafeUrl}
        title='Unsafe URL'
        id={unsafeUrl}
        groupId='group-1'
        handleDeleteUrl={vi.fn()}
        handleOpenTab={vi.fn()}
        handleUpdateUrls={vi.fn()}
        settings={defaultSettings}
      />,
    )

    expect(screen.queryByRole('link', { name: 'Unsafe URL' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Unsafe URL' })).toBeNull()
  })
})
