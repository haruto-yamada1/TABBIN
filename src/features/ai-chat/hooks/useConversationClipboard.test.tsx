// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocked = vi.hoisted(() => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: {
    error: mocked.toastError,
    success: mocked.toastSuccess,
  },
}))

import { COPIED_CONVERSATION_ICON_TIMEOUT } from '@/features/ai-chat/components/savedTabsChat/storage'

import { useConversationClipboard } from './useConversationClipboard'

const originalClipboardDescriptor = Object.getOwnPropertyDescriptor(
  window.navigator,
  'clipboard',
)

const messages = [
  {
    attachments: [
      {
        content: 'Hello',
        filename: 'tabs.txt',
        kind: 'text' as const,
        mediaType: 'text/plain',
      },
    ],
    content: 'Show my tabs',
    id: 'message-1',
    role: 'user' as const,
  },
  {
    content: 'Here are your tabs',
    id: 'message-2',
    role: 'assistant' as const,
  },
]

const t = (key: string) =>
  (
    ({
      'aiChat.copy.assistant': 'AI:',
      'aiChat.copy.attachments': 'Attachments:',
      'aiChat.copy.user': 'User:',
      'aiChat.copyConversationError': 'Could not copy the conversation',
      'aiChat.copyConversationSuccess': 'Copied the conversation',
    }) satisfies Record<string, string>
  )[key] ?? key

const setClipboard = (clipboard: unknown) => {
  Object.defineProperty(window.navigator, 'clipboard', {
    configurable: true,
    value: clipboard,
  })
}

describe('useConversationClipboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
    if (originalClipboardDescriptor) {
      Object.defineProperty(
        window.navigator,
        'clipboard',
        originalClipboardDescriptor,
      )
    } else {
      Reflect.deleteProperty(window.navigator, 'clipboard')
    }
  })

  it('会話テキストを Clipboard API へ書き込み copied 状態を表示する', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    setClipboard({ writeText })
    const { result } = renderHook(() =>
      useConversationClipboard({ messages, t }),
    )

    await act(async () => {
      await result.current.copyConversation()
    })

    expect(writeText).toHaveBeenCalledWith(
      [
        'User:',
        'Attachments: tabs.txt',
        'Show my tabs',
        '',
        'AI:',
        'Here are your tabs',
      ].join('\n'),
    )
    expect(mocked.toastSuccess).toHaveBeenCalledWith('Copied the conversation')
    expect(result.current.isConversationCopied).toBe(true)
  })

  it('Clipboard API がない場合は copy error を表示する', async () => {
    setClipboard(undefined)
    const { result } = renderHook(() =>
      useConversationClipboard({ messages, t }),
    )

    await act(async () => {
      await result.current.copyConversation()
    })

    expect(mocked.toastError).toHaveBeenCalledWith(
      'Could not copy the conversation',
    )
    expect(mocked.toastSuccess).not.toHaveBeenCalled()
    expect(result.current.isConversationCopied).toBe(false)
  })

  it('Clipboard API の書き込み失敗時は copy error を表示する', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'))
    setClipboard({ writeText })
    const { result } = renderHook(() =>
      useConversationClipboard({ messages, t }),
    )

    await act(async () => {
      await result.current.copyConversation()
    })

    expect(mocked.toastError).toHaveBeenCalledWith(
      'Could not copy the conversation',
    )
    expect(result.current.isConversationCopied).toBe(false)
  })

  it('再コピー時は copied timeout を置き換える', async () => {
    vi.useFakeTimers()
    const writeText = vi.fn().mockResolvedValue(undefined)
    setClipboard({ writeText })
    const { result } = renderHook(() =>
      useConversationClipboard({ messages, t }),
    )

    await act(async () => {
      await result.current.copyConversation()
      vi.advanceTimersByTime(COPIED_CONVERSATION_ICON_TIMEOUT - 1)
      await result.current.copyConversation()
      vi.advanceTimersByTime(1)
    })

    expect(result.current.isConversationCopied).toBe(true)

    act(() => {
      vi.advanceTimersByTime(COPIED_CONVERSATION_ICON_TIMEOUT - 1)
    })

    expect(result.current.isConversationCopied).toBe(false)
  })

  it('unmount 時に copied timeout を破棄する', async () => {
    vi.useFakeTimers()
    const writeText = vi.fn().mockResolvedValue(undefined)
    setClipboard({ writeText })
    const { result, unmount } = renderHook(() =>
      useConversationClipboard({ messages, t }),
    )

    await act(async () => {
      await result.current.copyConversation()
    })
    expect(vi.getTimerCount()).toBe(1)

    unmount()

    expect(vi.getTimerCount()).toBe(0)
  })

  it('会話が置き換わると copied 状態と timeout をリセットする', async () => {
    vi.useFakeTimers()
    const writeText = vi.fn().mockResolvedValue(undefined)
    setClipboard({ writeText })
    const { result, rerender } = renderHook(
      ({ currentMessages }) =>
        useConversationClipboard({ messages: currentMessages, t }),
      { initialProps: { currentMessages: messages } },
    )

    await act(async () => {
      await result.current.copyConversation()
    })
    expect(result.current.isConversationCopied).toBe(true)

    rerender({ currentMessages: [] })

    expect(result.current.isConversationCopied).toBe(false)
    expect(vi.getTimerCount()).toBe(0)

    rerender({ currentMessages: messages })

    expect(result.current.isConversationCopied).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })
})
