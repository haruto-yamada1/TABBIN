import { beforeEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

const mocked = vi.hoisted(() => ({ read: vi.fn(), replace: vi.fn() }))

vi.mock('@/app/composition/aiConversationHistoryDataPlane', () => ({
  getAiConversationHistoryDataPlane: () => ({
    read: mocked.read,
    replace: mocked.replace,
  }),
}))

import {
  buildConversationTitle,
  createConversationRecord,
  loadConversationHistory,
  saveConversationHistory,
} from './conversation-history'

describe('conversation-history', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocked.read.mockResolvedValue({
      activeConversationId: undefined,
      conversations: [],
    })
    mocked.replace.mockResolvedValue(undefined)
  })

  it('最初の user メッセージから会話タイトルを生成する', () => {
    expect(
      buildConversationTitle([
        {
          content: '  毎朝読むべき保存タブを要約して  ',
          id: 'message-1',
          role: 'user',
        },
      ]),
    ).toBe('毎朝読むべき保存タブを要約して')

    expect(
      buildConversationTitle([
        {
          content: '',
          id: 'message-1',
          role: 'assistant',
        },
      ]),
    ).toBe('新しい会話')
  })

  it('履歴が空なら新しい会話を 1 件返す', async () => {
    const history = await loadConversationHistory()

    expect(history.activeConversationId).toBe(history.conversations[0]?.id)
    expect(history.conversations).toHaveLength(1)
    expect(history.conversations[0]?.title).toBe('新しい会話')
  })

  it('読み込み時に中断された assistant メッセージを正規化して保存し直す', async () => {
    mocked.read.mockResolvedValue({
      activeConversationId: 'conversation-1',
      conversations: [
        {
          createdAt: 1,
          id: 'conversation-1',
          messages: [
            {
              content: '質問です',
              id: 'message-1',
              role: 'user',
            },
            {
              content: '',
              id: 'message-2',
              isStreaming: true,
              reasoning: 'checking tabs',
              role: 'assistant',
            },
          ],
          title: '質問です',
          updatedAt: 1,
        },
      ],
    })

    const history = await loadConversationHistory()

    expect(history).toStrictEqual({
      activeConversationId: 'conversation-1',
      conversations: [
        {
          createdAt: 1,
          id: 'conversation-1',
          messages: [
            {
              content: '質問です',
              id: 'message-1',
              role: 'user',
            },
            {
              content:
                'The previous response was interrupted. Send your message again if needed.',
              id: 'message-2',
              isStreaming: false,
              reasoning: 'checking tabs',
              role: 'assistant',
            },
          ],
          title: '質問です',
          updatedAt: 1,
        },
      ],
    })

    expect(mocked.replace).toHaveBeenCalledWith({
      activeConversationId: 'conversation-1',
      conversations: history.conversations,
    })
  })

  it('本文がある中断 assistant メッセージは本文を残して中断文言を追記する', async () => {
    mocked.read.mockResolvedValue({
      activeConversationId: 'conversation-1',
      conversations: [
        {
          createdAt: 1,
          id: 'conversation-1',
          messages: [
            {
              content: '途中までの回答',
              id: 'message-2',
              isStreaming: true,
              role: 'assistant',
            },
          ],
          title: '会話',
          updatedAt: 1,
        },
      ],
    })

    const history = await loadConversationHistory()

    expect(history.conversations[0]?.messages[0]).toStrictEqual({
      content:
        '途中までの回答\n\nThe previous response was interrupted. Send your message again if needed.',
      id: 'message-2',
      isStreaming: false,
      role: 'assistant',
    })
    expect(mocked.replace).toHaveBeenCalledTimes(1)
  })

  it('中断文言が既に含まれる assistant メッセージは追記しない', async () => {
    mocked.read.mockResolvedValue({
      activeConversationId: 'conversation-1',
      conversations: [
        {
          createdAt: 1,
          id: 'conversation-1',
          messages: [
            {
              content:
                '途中までの回答\n\nThe previous response was interrupted. Send your message again if needed.',
              id: 'message-2',
              isStreaming: true,
              role: 'assistant',
            },
          ],
          title: '会話',
          updatedAt: 1,
        },
      ],
    })

    const history = await loadConversationHistory()

    expect(history.conversations[0]?.messages[0]).toStrictEqual({
      content:
        '途中までの回答\n\nThe previous response was interrupted. Send your message again if needed.',
      id: 'message-2',
      isStreaming: false,
      role: 'assistant',
    })
  })

  it('通常の履歴は読み込み時に保存し直さない', async () => {
    mocked.read.mockResolvedValue({
      activeConversationId: 'conversation-1',
      conversations: [
        {
          createdAt: 1,
          id: 'conversation-1',
          messages: [
            {
              content: '完了済みの回答',
              id: 'message-1',
              isStreaming: false,
              role: 'assistant',
            },
          ],
          title: '会話',
          updatedAt: 1,
        },
      ],
    })

    await loadConversationHistory()

    expect(mocked.replace).not.toHaveBeenCalled()
  })

  it('active id が存在しない場合は先頭会話を active にする', async () => {
    mocked.read.mockResolvedValue({
      activeConversationId: 'missing-conversation',
      conversations: [
        {
          createdAt: 1,
          id: 'conversation-1',
          messages: [],
          title: '会話',
          updatedAt: 1,
        },
      ],
    })

    const history = await loadConversationHistory()

    expect(history.activeConversationId).toBe('conversation-1')
  })

  it('履歴をdomain data planeに保存する', async () => {
    const conversation = createConversationRecord({
      id: 'conversation-1',
      messages: [
        {
          content: 'いま重要なタブを抽出して',
          id: 'message-1',
          role: 'user',
        },
      ],
    })

    await saveConversationHistory({
      activeConversationId: conversation.id,
      conversations: [conversation],
    })

    expect(mocked.replace).toHaveBeenCalledWith({
      activeConversationId: 'conversation-1',
      conversations: [conversation],
    })
  })

  it('IndexedDB failureを空の履歴や保存成功に置き換えず呼び出し元へ返す', async () => {
    const error = new Error('database unavailable')
    mocked.read.mockRejectedValueOnce(error)
    await expect(loadConversationHistory()).rejects.toBe(error)
    mocked.replace.mockRejectedValueOnce(error)
    await expect(
      saveConversationHistory({
        activeConversationId: 'conversation-1',
        conversations: [],
      }),
    ).rejects.toBe(error)
  })
})
