// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

describe('AiChatRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
  })

  it('履歴一覧の操作に shared ui button を使い、生の button 要素を残さない', () => {
    const source = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), './AiChatRoute.tsx'),
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

  it('履歴項目クリックで会話を選択し、breakpoint 跨ぎの resize で履歴表示を切り替える', () => {
    render(createElement(AiChatRoute))

    fireEvent.click(
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

  it('履歴項目の本文ボタンは縦積みレイアウトで削除ボタンを押し出さない', () => {
    render(createElement(AiChatRoute))

    const conversationButton = screen
      .getAllByRole('button', { name: /最初の会話/ })
      .find((button) => button.className.includes('flex-col'))
    const conversationRow = conversationButton?.parentElement
    const textRows = conversationButton?.querySelectorAll('p')
    const title = textRows?.[0]
    const preview = textRows?.[1]

    expect(conversationButton).toBeTruthy()

    expect(conversationButton?.className).toContain('flex-col')
    expect(conversationButton?.className).toContain('items-start')
    expect(conversationButton?.className).toContain('whitespace-normal')
    expect(conversationButton?.className).toContain('w-full')
    expect(conversationButton?.className).toContain('overflow-hidden')
    expect(conversationButton?.className).not.toContain('flex-1')
    expect(conversationRow?.className).toContain('min-w-0')
    expect(conversationRow?.className).toContain('grid')
    expect(conversationRow?.className).toContain(
      'grid-cols-[minmax(0,1fr)_auto]',
    )
    expect(title?.className).toContain('w-full')
    expect(title?.className).toContain('min-w-0')
    expect(preview?.className).toContain('w-full')
    expect(preview?.className).toContain('min-w-0')
    expect(preview?.className).toContain('wrap-anywhere')
    expect(preview?.className).toContain('overflow-hidden')
  })

  it('狭い画面では左履歴を完全非表示にしてチャットを残り幅へ広げる', () => {
    window.innerWidth = 800

    render(createElement(AiChatRoute))

    expect(screen.queryByText('Recent conversations')).toBeNull()

    const widgetShell = screen.getByTestId(
      'saved-tabs-chat-widget',
    ).parentElement
    expect(widgetShell?.className.includes('min-h-0')).toBe(true)
    expect(widgetShell?.className.includes('flex-1')).toBe(true)
    expect(widgetShell?.className.includes('overflow-hidden')).toBe(true)
  })

  it('狭い画面でも履歴ボタンで左履歴を再表示できる', () => {
    window.innerWidth = 800

    render(createElement(AiChatRoute))

    fireEvent.click(screen.getByText('toggle-history'))

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

  it('履歴削除ボタンから確認モーダルを開き、削除を実行できる', () => {
    render(createElement(AiChatRoute))

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Delete 最初の会話',
      }),
    )

    expect(screen.getByText('Delete this conversation?')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    expect(mocked.deleteConversation).toHaveBeenCalledWith('conversation-1')
  })

  it('履歴削除確認はキャンセルできる', () => {
    render(createElement(AiChatRoute))

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Delete 最初の会話',
      }),
    )

    expect(screen.getByText('Delete this conversation?')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByText('Delete this conversation?')).toBeNull()
    expect(mocked.deleteConversation).not.toHaveBeenCalled()
  })

  it('履歴削除確認はキャンセルできる', () => {
    render(createElement(AiChatRoute))

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Delete 最初の会話',
      }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(mocked.deleteConversation).not.toHaveBeenCalled()
  })
})
