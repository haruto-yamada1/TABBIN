/* eslint-disable max-lines-per-function, typescript/no-misused-promises */
// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

const mocked = vi.hoisted(() => ({
  loadConversationHistory: vi.fn(),
  saveConversationHistory: vi.fn(),
}))

vi.mock('@/features/i18n/context/I18nProvider', () => ({
  useI18n: () => ({
    language: 'ja',
    t: (key: string) =>
      (
        ({
          'aiChat.history.startPrompt': '新しい会話を始めてください',
          'aiChat.newConversation': '新しい会話',
        }) satisfies Record<string, string>
      )[key] ?? key,
  }),
}))

vi.mock('@/features/ai-chat/lib/conversation-history', () => ({
  buildConversationTitle: (
    messages: { content: string; role: 'assistant' | 'user' }[],
  ) => messages[0]?.content || '新しい会話',
  createConversationRecord: ({
    id = 'new-conversation',
    messages = [],
    now = 10,
  }: {
    id?: string
    messages?: {
      content: string
      id: string
      role: 'assistant' | 'user'
    }[]
    now?: number
  } = {}) => ({
    createdAt: now,
    id,
    messages,
    title: messages[0]?.content || '新しい会話',
    updatedAt: now,
  }),
  loadConversationHistory: mocked.loadConversationHistory,
  saveConversationHistory: mocked.saveConversationHistory,
}))

import {
  resolveCurrentConversationId,
  resolveNextActiveConversationId,
  useSharedAiChatHistory,
} from './useSharedAiChatHistory'

describe('useSharedAiChatHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocked.loadConversationHistory.mockResolvedValue({
      activeConversationId: 'conversation-1',
      conversations: [
        {
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
        {
          createdAt: 2,
          id: 'conversation-2',
          messages: [
            {
              content: '別の会話',
              id: 'message-2',
              role: 'user',
            },
          ],
          title: '別の会話',
          updatedAt: 2,
        },
      ],
    })
    mocked.saveConversationHistory.mockResolvedValue(undefined)
  })

  it('resolveNextActiveConversationId は削除対象外なら現在の会話を維持する', () => {
    expect(
      resolveNextActiveConversationId({
        activeConversationId: 'conversation-1',
        currentActiveConversationId: 'conversation-1',
        deletedConversationId: 'conversation-2',
        nextConversations: [
          {
            createdAt: 1,
            id: 'conversation-3',
            messages: [],
            title: 'Third',
            updatedAt: 1,
          },
        ],
        pendingConversationId: 'pending-conversation',
      }),
    ).toBe('conversation-1')
  })

  it('resolveCurrentConversationId は選択状態が未初期化なら履歴側の active id を使う', () => {
    expect(
      resolveCurrentConversationId(null, 'conversation-from-history'),
    ).toBe('conversation-from-history')
    expect(
      resolveCurrentConversationId('conversation-selected', 'conversation-old'),
    ).toBe('conversation-selected')
  })

  it('新しい会話クリックだけでは保存せず、最初のメッセージで履歴化する', async () => {
    const { result } = renderHook(() => useSharedAiChatHistory())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    act(() => {
      result.current.createConversation()
    })

    expect(mocked.saveConversationHistory).not.toHaveBeenCalled()
    expect(result.current.activeConversation?.title).toBe('新しい会話')
    expect(result.current.historyItems).toHaveLength(2)
    expect(result.current.historyItems.map((item) => item.id)).toStrictEqual([
      'conversation-2',
      'conversation-1',
    ])

    act(() => {
      result.current.updateMessages([
        {
          content: '   ',
          id: 'message-blank',
          role: 'user',
        },
      ])
    })
    expect(mocked.saveConversationHistory).not.toHaveBeenCalled()

    act(() => {
      result.current.updateMessages([
        {
          content: '朝確認したいタブを教えて',
          id: 'message-1',
          role: 'user',
        },
      ])
    })

    await waitFor(() => {
      expect(mocked.saveConversationHistory).toHaveBeenCalledWith({
        activeConversationId: 'new-conversation',
        conversations: [
          expect.objectContaining({
            id: 'new-conversation',
            title: '朝確認したいタブを教えて',
          }),
          expect.objectContaining({ id: 'conversation-2' }),
          expect.objectContaining({ id: 'conversation-1' }),
        ],
      })
    })
  })

  it('新規会話の開始と完了が連続しても履歴を重複追加しない', async () => {
    const { result } = renderHook(() => useSharedAiChatHistory())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    act(() => {
      result.current.createConversation()
    })

    await waitFor(() => {
      expect(result.current.activeConversation?.id).toBe('new-conversation')
    })

    act(() => {
      result.current.updateMessages([
        {
          content: '朝確認したいタブを教えて',
          id: 'message-1',
          role: 'user',
        },
        {
          content: '',
          id: 'message-2',
          isStreaming: true,
          role: 'assistant',
        },
      ])
      result.current.updateMessages([
        {
          content: '朝確認したいタブを教えて',
          id: 'message-1',
          role: 'user',
        },
        {
          content: '朝の確認候補は 3 件あります',
          id: 'message-2',
          role: 'assistant',
        },
      ])
    })

    await waitFor(() => {
      expect(mocked.saveConversationHistory).toHaveBeenCalled()
    })

    const lastSavedHistory =
      mocked.saveConversationHistory.mock.calls.at(-1)?.[0]

    expect(
      lastSavedHistory?.conversations.filter(
        (conversation: { id: string }) =>
          conversation.id === 'new-conversation',
      ),
    ).toHaveLength(1)
    expect(lastSavedHistory).toStrictEqual({
      activeConversationId: 'new-conversation',
      conversations: [
        expect.objectContaining({
          id: 'new-conversation',
          messages: [
            {
              content: '朝確認したいタブを教えて',
              id: 'message-1',
              role: 'user',
            },
            {
              content: '朝の確認候補は 3 件あります',
              id: 'message-2',
              role: 'assistant',
            },
          ],
          title: '朝確認したいタブを教えて',
        }),
        expect.objectContaining({ id: 'conversation-2' }),
        expect.objectContaining({ id: 'conversation-1' }),
      ],
    })
  })

  it('履歴選択と既存会話更新を保存する', async () => {
    const { result } = renderHook(() => useSharedAiChatHistory())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    act(() => {
      result.current.selectConversation('conversation-2')
    })

    await waitFor(() => {
      expect(mocked.saveConversationHistory).toHaveBeenCalledWith({
        activeConversationId: 'conversation-2',
        conversations: expect.arrayContaining([
          expect.objectContaining({ id: 'conversation-1' }),
          expect.objectContaining({ id: 'conversation-2' }),
        ]),
      })
    })
    await waitFor(() => {
      expect(result.current.activeConversation?.id).toBe('conversation-2')
    })

    act(() => {
      result.current.updateMessages([
        {
          content: '保存済みタブの傾向を教えて',
          id: 'message-3',
          role: 'user',
        },
      ])
    })

    await waitFor(() => {
      expect(mocked.saveConversationHistory).toHaveBeenLastCalledWith({
        activeConversationId: 'conversation-2',
        conversations: [
          expect.objectContaining({
            id: 'conversation-2',
            messages: [
              {
                content: '保存済みタブの傾向を教えて',
                id: 'message-3',
                role: 'user',
              },
            ],
            title: '保存済みタブの傾向を教えて',
          }),
          expect.objectContaining({
            id: 'conversation-1',
            title: '最初の会話',
          }),
        ],
      })
    })

    await waitFor(() => {
      expect(result.current.historyItems.map((item) => item.id)).toStrictEqual([
        'conversation-2',
        'conversation-1',
      ])
    })
  })

  it('最近の会話を updatedAt の降順で並べる', async () => {
    const { result } = renderHook(() => useSharedAiChatHistory())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.historyItems.map((item) => item.id)).toStrictEqual([
      'conversation-2',
      'conversation-1',
    ])

    act(() => {
      result.current.selectConversation('conversation-1')
    })
    await waitFor(() => {
      expect(result.current.activeConversation?.id).toBe('conversation-1')
    })

    act(() => {
      result.current.updateMessages([
        {
          content: 'あとで読み返したいタブを整理して',
          id: 'message-4',
          role: 'user',
        },
      ])
    })

    await waitFor(() => {
      expect(mocked.saveConversationHistory).toHaveBeenLastCalledWith({
        activeConversationId: 'conversation-1',
        conversations: [
          expect.objectContaining({
            id: 'conversation-1',
            title: 'あとで読み返したいタブを整理して',
          }),
          expect.objectContaining({
            id: 'conversation-2',
            title: '別の会話',
          }),
        ],
      })
    })

    expect(result.current.historyItems.map((item) => item.id)).toStrictEqual([
      'conversation-1',
      'conversation-2',
    ])
  })

  it('同じ更新時刻の会話は作成時刻とIDで安定して並べる', async () => {
    mocked.loadConversationHistory.mockResolvedValue({
      activeConversationId: 'conversation-a',
      conversations: [
        {
          createdAt: 1,
          id: 'conversation-a',
          messages: [],
          title: 'A',
          updatedAt: 10,
        },
        {
          createdAt: 2,
          id: 'conversation-b',
          messages: [],
          title: 'B',
          updatedAt: 10,
        },
        {
          createdAt: 2,
          id: 'conversation-c',
          messages: [],
          title: 'C',
          updatedAt: 10,
        },
      ],
    })

    const { result } = renderHook(() => useSharedAiChatHistory())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.historyItems.map((item) => item.id)).toStrictEqual([
      'conversation-c',
      'conversation-b',
      'conversation-a',
    ])
  })

  it('保存済み active id が履歴に存在しない場合は最新の会話を表示する', async () => {
    mocked.loadConversationHistory.mockResolvedValue({
      activeConversationId: 'missing-conversation',
      conversations: [
        {
          createdAt: 1,
          id: 'conversation-old',
          messages: [],
          title: '古い会話',
          updatedAt: 1,
        },
        {
          createdAt: 2,
          id: 'conversation-new',
          messages: [],
          title: '新しい会話',
          updatedAt: 2,
        },
      ],
    })

    const { result } = renderHook(() => useSharedAiChatHistory())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.activeConversation?.id).toBe('conversation-new')
    expect(
      result.current.historyItems.map((item) => item.isActive),
    ).toStrictEqual([false, false])
  })

  it('ロード完了前に unmount されたら状態更新しない', async () => {
    let resolveHistory:
      | ((
          value: Awaited<ReturnType<typeof mocked.loadConversationHistory>>,
        ) => void)
      | undefined
    mocked.loadConversationHistory.mockReturnValue(
      new Promise((resolve) => {
        resolveHistory = resolve
      }),
    )

    const { result, unmount } = renderHook(() => useSharedAiChatHistory())

    expect(result.current.isLoading).toBe(true)
    unmount()
    // eslint-disable-next-line typescript/require-await
    await act(async () => {
      resolveHistory?.({
        activeConversationId: 'conversation-1',
        conversations: [],
      })
    })

    expect(mocked.saveConversationHistory).not.toHaveBeenCalled()
  })

  it('ロード前の操作と空メッセージ更新は保存しない', () => {
    mocked.loadConversationHistory.mockReturnValue(new Promise(() => undefined))
    const { result } = renderHook(() => useSharedAiChatHistory())

    act(() => {
      result.current.selectConversation('conversation-1')
      result.current.deleteConversation('conversation-1')
      result.current.updateMessages([])
      result.current.createConversation()
      result.current.updateMessages([
        {
          content: '   ',
          id: 'message-blank',
          role: 'user',
        },
      ])
    })

    expect(mocked.saveConversationHistory).not.toHaveBeenCalled()
  })

  it('会話を削除すると履歴から外し、アクティブ会話も切り替える', async () => {
    const { result } = renderHook(() => useSharedAiChatHistory())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    act(() => {
      result.current.selectConversation('conversation-2')
    })
    await waitFor(() => {
      expect(result.current.activeConversation?.id).toBe('conversation-2')
    })

    act(() => {
      result.current.deleteConversation('conversation-2')
    })

    await waitFor(() => {
      expect(mocked.saveConversationHistory).toHaveBeenLastCalledWith({
        activeConversationId: 'conversation-1',
        conversations: [
          expect.objectContaining({
            id: 'conversation-1',
            title: '最初の会話',
          }),
        ],
      })
    })

    await waitFor(() => {
      expect(result.current.historyItems.map((item) => item.id)).toStrictEqual([
        'conversation-1',
      ])
      expect(result.current.activeConversation?.id).toBe('conversation-1')
    })
  })

  it('存在しない会話削除は履歴を保存し直さない', async () => {
    const { result } = renderHook(() => useSharedAiChatHistory())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    act(() => {
      result.current.deleteConversation('missing')
    })

    expect(mocked.saveConversationHistory).not.toHaveBeenCalled()
    expect(result.current.historyItems).toHaveLength(2)
  })

  it('pending 会話中に別の会話を削除しても pending をアクティブに保つ', async () => {
    const { result } = renderHook(() => useSharedAiChatHistory())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    act(() => {
      result.current.createConversation()
    })
    await waitFor(() => {
      expect(result.current.activeConversation?.id).toBe('new-conversation')
    })

    act(() => {
      result.current.deleteConversation('conversation-2')
    })

    await waitFor(() => {
      expect(mocked.saveConversationHistory).toHaveBeenLastCalledWith({
        activeConversationId: 'new-conversation',
        conversations: [
          expect.objectContaining({
            id: 'conversation-1',
          }),
        ],
      })
    })
  })

  it('pending ID の既存会話がある場合は重複追加せず置き換える', async () => {
    mocked.loadConversationHistory.mockResolvedValue({
      activeConversationId: 'new-conversation',
      conversations: [
        {
          createdAt: 1,
          id: 'new-conversation',
          messages: [],
          title: '新しい会話',
          updatedAt: 1,
        },
      ],
    })

    const { result } = renderHook(() => useSharedAiChatHistory())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    act(() => {
      result.current.createConversation()
      result.current.updateMessages([
        {
          content: '既存の pending 会話を更新',
          id: 'message-1',
          role: 'user',
        },
      ])
    })

    await waitFor(() => {
      expect(mocked.saveConversationHistory).toHaveBeenCalledWith({
        activeConversationId: 'new-conversation',
        conversations: [
          expect.objectContaining({
            id: 'new-conversation',
            messages: [
              {
                content: '既存の pending 会話を更新',
                id: 'message-1',
                role: 'user',
              },
            ],
            title: '既存の pending 会話を更新',
          }),
        ],
      })
    })
  })

  it('最後の会話を削除すると履歴を空にして新しい会話へ戻す', async () => {
    mocked.loadConversationHistory.mockResolvedValue({
      activeConversationId: 'conversation-1',
      conversations: [
        {
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
      ],
    })

    const { result } = renderHook(() => useSharedAiChatHistory())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    act(() => {
      result.current.deleteConversation('conversation-1')
    })

    await waitFor(() => {
      expect(mocked.saveConversationHistory).toHaveBeenLastCalledWith({
        activeConversationId: 'new-conversation',
        conversations: [],
      })
    })

    await waitFor(() => {
      expect(result.current.historyItems).toStrictEqual([])
      expect(result.current.activeConversation?.id).toBe('new-conversation')
      expect(result.current.activeConversation?.title).toBe('新しい会話')
    })
  })
})
