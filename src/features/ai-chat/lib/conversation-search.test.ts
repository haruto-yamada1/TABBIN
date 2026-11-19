import { describe, expect, it } from 'vitest' // eslint-disable-line

import type { AiChatConversationMessage } from '@/features/ai-chat/types'

import {
  isConversationSearchActive,
  searchConversations,
} from './conversation-search'

const createMessage = ({
  content,
  id,
  role = 'user',
}: {
  content: string
  id: string
  role?: AiChatConversationMessage['role']
}): AiChatConversationMessage => ({
  content,
  id,
  role,
})

const createConversation = ({
  id,
  messages = [],
  title = id,
  updatedAt = 1,
}: {
  id: string
  messages?: AiChatConversationMessage[]
  title?: string
  updatedAt?: number
}) => ({
  id,
  messages,
  title,
  updatedAt,
})

const getExcerptText = (excerpt: {
  segments: { isMatch: boolean; text: string }[]
}): string => excerpt.segments.map((segment) => segment.text).join('')

const getMatchText = (excerpt: {
  segments: { isMatch: boolean; text: string }[]
}): string =>
  excerpt.segments
    .filter((segment) => segment.isMatch)
    .map((segment) => segment.text)
    .join('')

describe('conversation-search', () => {
  it('空欄・空白のみのクエリでは検索結果を返さない', () => {
    const conversations = [
      createConversation({
        id: 'conversation-1',
        messages: [createMessage({ content: '保存済みタブ', id: 'message-1' })],
      }),
    ]

    expect(searchConversations(conversations, '')).toStrictEqual([])
    expect(searchConversations(conversations, '   ')).toStrictEqual([])
    expect(searchConversations(conversations, '\n\t')).toStrictEqual([])
    expect(isConversationSearchActive('')).toBe(false)
    expect(isConversationSearchActive('   ')).toBe(false)
    expect(isConversationSearchActive(' tab ')).toBe(true)
  })

  it('タイトル一致を優先し、同じ種別では更新日時の降順に並べる', () => {
    const conversations = [
      createConversation({
        id: 'title-old',
        title: 'Alpha archive',
        updatedAt: 1,
      }),
      createConversation({
        id: 'body-new',
        messages: [
          createMessage({
            content: 'alpha の本文だけに一致します',
            id: 'message-1',
          }),
        ],
        title: '本文一致',
        updatedAt: 10,
      }),
      createConversation({
        id: 'title-new',
        title: 'Alpha notes',
        updatedAt: 5,
      }),
    ]

    const results = searchConversations(conversations, 'alpha')

    expect(results.map((result) => result.conversationId)).toStrictEqual([
      'title-new',
      'title-old',
      'body-new',
    ])
    expect(results.map((result) => result.titleMatch)).toStrictEqual([
      true,
      true,
      false,
    ])
  })

  it('タイトルではなくユーザー・アシスタント双方の全メッセージ本文を検索する', () => {
    const conversations = [
      createConversation({
        id: 'conversation-1',
        messages: [
          createMessage({
            content: '保存したタブを整理したい',
            id: 'message-user',
          }),
          createMessage({
            content: '参照URLは https://example.com/path です',
            id: 'message-assistant',
            role: 'assistant',
          }),
        ],
        title: 'タブ整理',
      }),
    ]

    const userResults = searchConversations(conversations, '整理')
    expect(userResults).toHaveLength(1)
    expect(userResults[0]?.matchedMessageCount).toBe(1)
    expect(userResults[0]?.excerpts[0]?.role).toBe('user')
    expect(userResults[0]?.excerpts[0]?.messageId).toBe('message-user')
    expect(getMatchText(userResults[0]?.excerpts[0] ?? { segments: [] })).toBe(
      '整理',
    )

    const assistantResults = searchConversations(
      conversations,
      'https://example.com/path',
    )
    expect(assistantResults).toHaveLength(1)
    expect(assistantResults[0]?.excerpts[0]?.role).toBe('assistant')
    expect(assistantResults[0]?.excerpts[0]?.messageId).toBe(
      'message-assistant',
    )
  })

  it('日本語・全角半角・大文字小文字を区別せず部分一致する', () => {
    const conversations = [
      createConversation({
        id: 'conversation-1',
        messages: [
          createMessage({
            content: 'ＯＬＬＡＭＡ と Ollama の設定を確認する',
            id: 'message-1',
          }),
        ],
      }),
    ]

    for (const query of ['ollama', 'OLLAMA', 'ｏｌｌａｍａ', 'Ollama']) {
      const results = searchConversations(conversations, query)
      expect(results).toHaveLength(1)
      expect(results[0]?.matchedMessageCount).toBe(1)
      expect(getMatchText(results[0]?.excerpts[0] ?? { segments: [] })).toBe(
        'ＯＬＬＡＭＡ',
      )
    }
  })

  it('日本語の部分一致とひらがな・カタカナの区別を維持する', () => {
    const conversations = [
      createConversation({
        id: 'conversation-1',
        messages: [
          createMessage({
            content: '保存済みの会話を全文検索する',
            id: 'message-1',
          }),
        ],
      }),
    ]

    expect(searchConversations(conversations, '会話')).toHaveLength(1)
    expect(searchConversations(conversations, 'かいわ')).toStrictEqual([])
  })

  it('絵文字（サロゲートペア）の後ろの一致でも原文の範囲を正しく抜粋する', () => {
    const conversations = [
      createConversation({
        id: 'conversation-1',
        messages: [
          createMessage({
            content: '😀🙂needle の後ろにある検索語',
            id: 'message-1',
          }),
        ],
      }),
    ]

    const excerpt = searchConversations(conversations, 'needle')[0]?.excerpts[0]

    expect(excerpt).toBeDefined()
    expect(getMatchText(excerpt ?? { segments: [] })).toBe('needle')
    expect(getExcerptText(excerpt ?? { segments: [] })).toContain('😀🙂needle')
  })

  it('一致箇所の前後を抜粋し、長文は省略記号で切り詰める', () => {
    const conversations = [
      createConversation({
        id: 'conversation-1',
        messages: [
          createMessage({
            content: `${'あ'.repeat(100)}検索キーワード${'い'.repeat(100)}`,
            id: 'message-1',
          }),
        ],
      }),
    ]

    const result = searchConversations(conversations, '検索キーワード')[0]
    const excerpt = result?.excerpts[0]
    expect(excerpt).toBeDefined()

    const segments = excerpt?.segments ?? []
    expect(segments[0]).toMatchObject({ isMatch: false, text: '…' })
    expect(segments.at(-1)).toMatchObject({ isMatch: false, text: '…' })
    expect(getMatchText(excerpt ?? { segments: [] })).toBe('検索キーワード')
    expect(getExcerptText(excerpt ?? { segments: [] }).length).toBeLessThan(100)
  })

  it('会話あたりの抜粋は最大3件にし、一致メッセージ数はすべて数える', () => {
    const conversations = [
      createConversation({
        id: 'conversation-1',
        messages: Array.from({ length: 5 }, (_, index) =>
          createMessage({
            content: `needle ${index}`,
            id: `message-${index}`,
          }),
        ),
      }),
    ]

    const result = searchConversations(conversations, 'needle')[0]

    expect(result?.matchedMessageCount).toBe(5)
    expect(result?.excerpts).toHaveLength(3)
  })

  it('タイトルだけに一致した会話は抜粋なしで返す', () => {
    const conversations = [
      createConversation({
        id: 'conversation-1',
        messages: [
          createMessage({
            content: '本文には一致しません',
            id: 'message-1',
          }),
        ],
        title: '保存タブの検索メモ',
      }),
    ]

    const result = searchConversations(conversations, '検索メモ')[0]

    expect(result?.titleMatch).toBe(true)
    expect(result?.matchedMessageCount).toBe(0)
    expect(result?.excerpts).toStrictEqual([])
  })

  it('Markdown や URL も文字列として検索し、正規表現文字をそのまま扱う', () => {
    const conversations = [
      createConversation({
        id: 'conversation-1',
        messages: [
          createMessage({
            content:
              '## [Example](https://example.com/path?q=1)\n- item a+b(c)',
            id: 'message-1',
          }),
        ],
      }),
    ]

    expect(
      searchConversations(conversations, 'https://example.com/path?q=1'),
    ).toHaveLength(1)
    expect(searchConversations(conversations, '## [Example]')).toHaveLength(1)
    expect(searchConversations(conversations, 'a+b(c)')).toHaveLength(1)
  })

  it('連続する空白や改行は1つの空白として検索する', () => {
    const conversations = [
      createConversation({
        id: 'conversation-1',
        messages: [
          createMessage({
            content: 'hello\nworld\tfrom   TABBIN',
            id: 'message-1',
          }),
        ],
      }),
    ]

    expect(
      searchConversations(conversations, 'hello world from TABBIN'),
    ).toHaveLength(1)
    expect(searchConversations(conversations, 'hello   world')).toHaveLength(1)
  })

  it('1000件以上のメッセージでも実用的な時間で検索できる', () => {
    const conversations = Array.from({ length: 50 }, (_, conversationIndex) =>
      createConversation({
        id: `conversation-${conversationIndex}`,
        messages: Array.from({ length: 25 }, (_, messageIndex) =>
          createMessage({
            content: `保存済みタブの説明 ${conversationIndex}-${messageIndex} ${
              messageIndex === 24 ? 'target-keyword' : 'no match'
            }`,
            id: `message-${conversationIndex}-${messageIndex}`,
            role: messageIndex % 2 === 0 ? 'user' : 'assistant',
          }),
        ),
        updatedAt: conversationIndex,
      }),
    )

    const startedAt = performance.now()
    const results = searchConversations(conversations, 'target-keyword')
    const elapsed = performance.now() - startedAt

    expect(results).toHaveLength(50)
    expect(results[0]?.matchedMessageCount).toBe(1)
    expect(elapsed).toBeLessThan(300)
  })
})
