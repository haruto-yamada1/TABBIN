import { describe, expect, it } from 'vitest'

import type { AiChatConversationMessage } from '@/features/ai-chat/types'

import { createChatMessage, mergeChatMessage } from './messages'

describe('chat message optional properties', () => {
  it('omits absent optional metadata from a newly created message', () => {
    const message = createChatMessage('assistant', 'answer')

    expect(Object.hasOwn(message, 'attachments')).toBe(false)
    expect(Object.hasOwn(message, 'charts')).toBe(false)
    expect(Object.hasOwn(message, 'isStreaming')).toBe(false)
    expect(Object.hasOwn(message, 'reasoning')).toBe(false)
    expect(Object.hasOwn(message, 'toolTraces')).toBe(false)
  })

  it('removes explicitly cleared optional metadata from an updated message', () => {
    const message: AiChatConversationMessage = {
      charts: [],
      content: 'answer',
      id: 'assistant-message',
      isStreaming: true,
      ollamaError: {
        baseUrl: 'http://localhost:11434',
        downloadUrl: 'https://ollama.com/download',
        faqUrl: 'https://docs.ollama.com/faq',
        kind: 'forbidden',
        tagsUrl: 'http://localhost:11434/api/tags',
      },
      reasoning: '',
      role: 'assistant',
      toolTraces: [],
    }

    const updated = mergeChatMessage(message, {
      charts: undefined,
      isStreaming: false,
      ollamaError: undefined,
      reasoning: undefined,
      toolTraces: undefined,
    })

    expect(updated.isStreaming).toBe(false)
    expect(Object.hasOwn(updated, 'charts')).toBe(false)
    expect(Object.hasOwn(updated, 'ollamaError')).toBe(false)
    expect(Object.hasOwn(updated, 'reasoning')).toBe(false)
    expect(Object.hasOwn(updated, 'toolTraces')).toBe(false)
  })
})
