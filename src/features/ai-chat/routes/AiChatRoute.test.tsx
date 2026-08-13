// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
// eslint-disable-next-line eslint/no-unused-vars
import { dirname, resolve } from 'node:path'
// eslint-disable-next-line eslint/no-unused-vars
import { fileURLToPath } from 'node:url'

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

const mocked = vi.hoisted(() => ({
  createConversation: vi.fn(),
  deleteConversation: vi.fn(),
  selectConversation: vi.fn(),
  toggleHistory: vi.fn(),
  updateMessages: vi.fn(),
  useSharedAiChatHistory: vi.fn(),
}))

vi.mock('@/features/ai-chat/hooks/useSharedAiChatHistory', () => ({
  useSharedAiChatHistory: mocked.useSharedAiChatHistory,
}))

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='tooltip-content'>{children}</div>
  ),
  TooltipProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}))

vi.mock('@/features/i18n/context/I18nProvider', () => ({
  useI18n: () => ({
    t: (key: string, fallback?: string, values?: Record<string, string>) => {
      const template =
        (
          {
            'aiChat.deleteConversationAria': 'Delete {{title}}',
            'aiChat.deleteDescription': 'This action cannot be undone.',
            'aiChat.deleteTitle': 'Delete this conversation?',
            'aiChat.historyHint': 'Click to continue',
            'aiChat.historyLoadError':
              'Conversation history could not be loaded.',
            'aiChat.historySaveError':
              'Conversation changes could not be saved.',
            'aiChat.historyTitle': 'Recent conversations',
            'common.delete': 'Delete',
            'common.cancel': 'Cancel',
            'common.loadingLabel': 'Loading',
          } satisfies Record<string, string>
        )[key] ??
        fallback ??
        key

      return template.replaceAll(
        /\{\{(\w+)\}\}/g,
        (_, token) => values?.[token] ?? '',
      )
    },
  }),
}))

vi.mock('@/features/ai-chat/components/SavedTabsChatWidget', () => ({
  SavedTabsChatWidget: ({
    historyVariant,
    onToggleHistory,
    title,
  }: {
    historyVariant?: string
    onToggleHistory?: () => void
    title?: string
  }) => (
    <div data-testid='saved-tabs-chat-widget'>
      <div>{`history-variant:${historyVariant ?? 'none'}`}</div>
      <div>{`active-title:${title ?? ''}`}</div>

      <button onClick={() => onToggleHistory?.()} type='button'>
        toggle-history
      </button>
    </div>
  ),
}))

import { AiChatRoute } from './AiChatRoute'
import {
  createPendingDeleteHistoryOpenChangeHandler,
  getNextPendingDeleteHistoryItem,
} from './aiChatRoute.helpers'

describe('AiChatRoute', () => {
  it('delete dialog helper は close 時だけ pending item を消す', () => {
    const item = {
      id: 'history-1',
      title: 'History',
      updatedAt: 1,
    }

    expect(getNextPendingDeleteHistoryItem(item, true)).toBe(item)
    expect(getNextPendingDeleteHistoryItem(item, false)).toBeNull()
    expect(getNextPendingDeleteHistoryItem(null, true)).toBeNull()

    const setPendingItem = vi.fn()
    createPendingDeleteHistoryOpenChangeHandler(setPendingItem)(false)
    const updater = setPendingItem.mock.calls[0]?.[0] as (
      current: typeof item,
    ) => typeof item | null
    expect(updater(item)).toBeNull()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    )
    mocked.useSharedAiChatHistory.mockReturnValue({
      activeConversation: {
        createdAt: 1,
        id: 'conversation-1',
        messages: [
          {
            content: '最初の会話',
            id: 'message-1',
            role: 'user',
          },
        ],
        title: '最初の会話',
        updatedAt: 1,
      },
      createConversation: mocked.createConversation,
      deleteConversation: mocked.deleteConversation,
      historyError: null,
      historyItems: [
        {
          id: 'conversation-1',
          isActive: true,
          preview: '最初の会話',
          title: '最初の会話',
        },
        {
          id: 'conversation-2',
          isActive: false,
          preview: '別の会話',
          title: '別の会話',
        },
      ],
      isLoading: false,
      selectConversation: mocked.selectConversation,
      updateMessages: mocked.updateMessages,
    })
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 1280,
      writable: true,
    })
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('履歴一覧の操作に shared ui button を使い、生の button 要素を残さない', () => {
    const source = readFileSync(
      resolve(import.meta.dirname, './AiChatRoute.tsx'),
      'utf8',
    )

    expect(source).not.toContain('<button')
  })

  it('広い画面では左履歴を表示し、widget に sidebar-toggle を渡す', () => {
    render(createElement(AiChatRoute))

    expect(screen.getByText('Recent conversations')).toBeTruthy()
    expect(screen.getAllByText('最初の会話').length).toBeGreaterThan(0)
    expect(screen.getByText('history-variant:sidebar-toggle')).toBeTruthy()
  })

  it('履歴項目クリックで会話を選択し、breakpoint 跨ぎの resize で履歴表示を切り替える', async () => {
    const user = userEvent.setup()
    render(createElement(AiChatRoute))

    window.innerWidth = 1100
    fireEvent(window, new Event('resize'))
    expect(screen.getByText('Recent conversations')).toBeTruthy()

    await user.click(
      // eslint-disable-next-line typescript/non-nullable-type-assertion-style
      screen
        .getAllByRole('button', { name: /別の会話/ })
        .find((button) => button.className.includes('flex-col')) as HTMLElement,
    )
    expect(mocked.selectConversation).toHaveBeenCalledWith('conversation-2')

    window.innerWidth = 800
    fireEvent(window, new Event('resize'))
    expect(screen.queryByText('Recent conversations')).toBeNull()

    window.innerWidth = 1280
    fireEvent(window, new Event('resize'))
    expect(screen.getByText('Recent conversations')).toBeTruthy()
  })

  // eslint-disable-next-line eslint/complexity
  it('履歴項目の本文ボタンは縦積みレイアウトで削除ボタンを押し出さない', () => {
    render(createElement(AiChatRoute))

    const conversationButton = screen.getByTestId(
      'conversation-button-conversation-1',
    )
    const conversationRow = screen.getByTestId(
      'conversation-row-conversation-1',
    )
    const title = screen.getByTestId('conversation-title-conversation-1')
    const preview = screen.getByTestId('conversation-preview-conversation-1')

    expect(conversationButton).toHaveTextContent('最初の会話')

    expect(conversationButton).toHaveClass('flex-col')
    expect(conversationButton).toHaveClass('items-start')
    expect(conversationButton).toHaveClass('whitespace-normal')
    expect(conversationButton).toHaveClass('w-full')
    expect(conversationButton).toHaveClass('overflow-hidden')
    expect(conversationButton).not.toHaveClass('flex-1')
    expect(conversationRow).toHaveClass('min-w-0')
    expect(conversationRow).toHaveClass('grid')
    expect(conversationRow).toHaveClass('grid-cols-[minmax(0,1fr)_auto]')
    expect(title).toHaveClass('w-full')
    expect(title).toHaveClass('min-w-0')
    expect(preview).toHaveClass('w-full')
    expect(preview).toHaveClass('min-w-0')
    expect(preview).toHaveClass('line-clamp-3')
    expect(preview).toHaveClass('wrap-anywhere')
    expect(preview).not.toHaveClass('block')
  })

  it('履歴説明文は 3 行で省略し、説明文 hover 用 tooltip に全文を載せる', () => {
    render(createElement(AiChatRoute))

    const preview = screen.getByTestId('conversation-preview-conversation-1')
    expect(preview).toHaveClass('line-clamp-3')

    const tooltipContents = screen.getAllByTestId('tooltip-content')
    expect(tooltipContents[0]).toHaveTextContent('最初の会話')
  })

  it('狭い画面では左履歴を完全非表示にしてチャットを残り幅へ広げる', () => {
    window.innerWidth = 800

    render(createElement(AiChatRoute))

    expect(screen.queryByText('Recent conversations')).toBeNull()

    const widgetShell = screen.getByTestId('chat-widget-shell')
    expect(widgetShell).toHaveClass('min-h-0')
    expect(widgetShell).toHaveClass('flex-1')
    expect(widgetShell).toHaveClass('overflow-hidden')
  })

  it('狭い画面でも履歴ボタンで左履歴を再表示できる', async () => {
    const user = userEvent.setup()
    window.innerWidth = 800

    render(createElement(AiChatRoute))

    await user.click(screen.getByText('toggle-history'))

    expect(screen.getByText('Recent conversations')).toBeTruthy()
  })

  it('loading 中は spinner のみを表示する', () => {
    mocked.useSharedAiChatHistory.mockReturnValue({
      activeConversation: null,
      createConversation: mocked.createConversation,
      deleteConversation: mocked.deleteConversation,
      historyItems: [],
      isLoading: true,
      selectConversation: mocked.selectConversation,
      updateMessages: mocked.updateMessages,
    })

    render(createElement(AiChatRoute))

    expect(screen.getByRole('status')).toBeTruthy()
    expect(screen.queryByText('Loading...')).toBeNull()
  })

  it('active conversation がない場合も loading 表示に戻す', () => {
    mocked.useSharedAiChatHistory.mockReturnValue({
      activeConversation: null,
      createConversation: mocked.createConversation,
      deleteConversation: mocked.deleteConversation,
      historyItems: [],
      isLoading: false,
      selectConversation: mocked.selectConversation,
      updateMessages: mocked.updateMessages,
    })

    render(createElement(AiChatRoute))

    expect(screen.getByRole('status')).toBeTruthy()
  })

  it('履歴ロード失敗時はspinnerではなく再試行案内を表示する', () => {
    mocked.useSharedAiChatHistory.mockReturnValue({
      activeConversation: null,
      createConversation: mocked.createConversation,
      deleteConversation: mocked.deleteConversation,
      historyError: 'load',
      historyItems: [],
      isLoading: false,
      selectConversation: mocked.selectConversation,
      updateMessages: mocked.updateMessages,
    })

    render(createElement(AiChatRoute))

    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Conversation history could not be loaded.',
    )
  })

  it('履歴削除ボタンから確認モーダルを開き、削除を実行できる', async () => {
    const user = userEvent.setup()
    render(createElement(AiChatRoute))

    await user.click(
      screen.getByRole('button', {
        name: 'Delete 最初の会話',
      }),
    )

    expect(screen.getByText('Delete this conversation?')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Delete' }))

    expect(mocked.deleteConversation).toHaveBeenCalledWith('conversation-1')
  })

  it('履歴削除確認はキャンセルできる', async () => {
    const user = userEvent.setup()
    render(createElement(AiChatRoute))

    await user.click(
      screen.getByRole('button', {
        name: 'Delete 最初の会話',
      }),
    )

    expect(screen.getByText('Delete this conversation?')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByText('Delete this conversation?')).toBeNull()
    expect(mocked.deleteConversation).not.toHaveBeenCalled()
  })

  it('履歴削除確認はキャンセルで削除されない', async () => {
    const user = userEvent.setup()
    render(createElement(AiChatRoute))

    await user.click(
      screen.getByRole('button', {
        name: 'Delete 最初の会話',
      }),
    )
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(mocked.deleteConversation).not.toHaveBeenCalled()
  })
})
