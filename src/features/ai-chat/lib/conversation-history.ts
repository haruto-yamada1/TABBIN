import type {
  AiChatConversation,
  AiChatConversationMessage,
} from '@/features/ai-chat/types'
import { getMessage } from '@/features/i18n/lib/language'
import {
  getChromeStorageLocal,
  warnMissingChromeStorage,
} from '@/lib/browser/chrome-storage'

const AI_CHAT_CONVERSATIONS_KEY = 'aiChatConversations'
const ACTIVE_AI_CHAT_CONVERSATION_ID_KEY = 'activeAiChatConversationId'

interface ConversationHistoryState {
  activeConversationId: string
  conversations: AiChatConversation[]
}

const DEFAULT_CONVERSATION_TITLE = getMessage('ja', 'aiChat.newConversation')
const DEFAULT_INTERRUPTED_RESPONSE_MESSAGE = getMessage(
  'en',
  'aiChat.interruptedResponse',
)

const createConversationId = (): string =>
  // eslint-disable-next-line eslint/no-magic-numbers
  `conversation-${Date.now()}-${Math.random().toString(16).slice(2)}`

const buildConversationTitle = (
  messages: AiChatConversationMessage[],
  defaultTitle = DEFAULT_CONVERSATION_TITLE,
): string => {
  const firstUserMessage = messages.find(
    (message) => message.role === 'user' && message.content.trim().length > 0,
  )

  if (!firstUserMessage) {
    return defaultTitle
  }

  // eslint-disable-next-line eslint/no-magic-numbers
  return firstUserMessage.content.trim().slice(0, 40)
}

const createConversationRecord = ({
  defaultTitle = DEFAULT_CONVERSATION_TITLE,
  id = createConversationId(),
  messages = [],
  now = Date.now(),
}: {
  defaultTitle?: string
  id?: string
  messages?: AiChatConversationMessage[]
  now?: number
} = {}): AiChatConversation => ({
  createdAt: now,
  id,
  messages,
  title: buildConversationTitle(messages, defaultTitle),
  updatedAt: now,
})

const createDefaultConversationHistory = (
  defaultTitle = DEFAULT_CONVERSATION_TITLE,
): ConversationHistoryState => {
  const conversation = createConversationRecord({ defaultTitle })

  return {
    activeConversationId: conversation.id,
    conversations: [conversation],
  }
}

const normalizeInterruptedMessageContent = (
  content: string,
  interruptedMessage: string,
): string => {
  const trimmedContent = content.trim()

  if (trimmedContent.length === 0) {
    return interruptedMessage
  }

  if (trimmedContent.includes(interruptedMessage)) {
    return content
  }

  return `${trimmedContent}\n\n${interruptedMessage}`
}

const normalizeConversationHistory = ({
  conversations,
  interruptedMessage,
}: {
  conversations: AiChatConversation[]
  interruptedMessage: string
}): {
  conversations: AiChatConversation[]
  hasChanges: boolean
} => {
  let hasChanges = false

  const normalizedConversations = conversations.map((conversation) => {
    let conversationChanged = false

    const messages = conversation.messages.map((message) => {
      if (message.role !== 'assistant' || message.isStreaming !== true) {
        return message
      }

      conversationChanged = true
      hasChanges = true

      return {
        ...message,
        content: normalizeInterruptedMessageContent(
          message.content,
          interruptedMessage,
        ),
        isStreaming: false,
      }
    })

    if (!conversationChanged) {
      return conversation
    }

    return {
      ...conversation,
      messages,
    }
  })

  return {
    conversations: normalizedConversations,
    hasChanges,
  }
}

const loadConversationHistory = async (
  defaultTitle = DEFAULT_CONVERSATION_TITLE,
  interruptedMessage = DEFAULT_INTERRUPTED_RESPONSE_MESSAGE,
): Promise<ConversationHistoryState> => {
  const storageLocal = getChromeStorageLocal()
  if (!storageLocal) {
    warnMissingChromeStorage('AIチャット履歴の読み込み')
    return createDefaultConversationHistory(defaultTitle)
  }

  const stored = await storageLocal.get([
    ACTIVE_AI_CHAT_CONVERSATION_ID_KEY,
    AI_CHAT_CONVERSATIONS_KEY,
  ])

  const conversations = Array.isArray(stored[AI_CHAT_CONVERSATIONS_KEY])
    ? // eslint-disable-next-line typescript/no-unsafe-type-assertion
      (stored[AI_CHAT_CONVERSATIONS_KEY] as AiChatConversation[])
    : []

  if (conversations.length === 0) {
    return createDefaultConversationHistory(defaultTitle)
  }

  const normalizedHistory = normalizeConversationHistory({
    conversations,
    interruptedMessage,
  })

  const activeConversationId =
    typeof stored[ACTIVE_AI_CHAT_CONVERSATION_ID_KEY] === 'string' &&
    normalizedHistory.conversations.some(
      (conversation) =>
        conversation.id === stored[ACTIVE_AI_CHAT_CONVERSATION_ID_KEY],
    )
      ? stored[ACTIVE_AI_CHAT_CONVERSATION_ID_KEY]
      : normalizedHistory.conversations[0].id
  if (normalizedHistory.hasChanges) {
    await storageLocal.set({
      [ACTIVE_AI_CHAT_CONVERSATION_ID_KEY]: activeConversationId,
      [AI_CHAT_CONVERSATIONS_KEY]: normalizedHistory.conversations,
    })
  }

  return {
    activeConversationId,
    conversations: normalizedHistory.conversations,
  }
}

const saveConversationHistory = async ({
  activeConversationId,
  conversations,
}: ConversationHistoryState): Promise<void> => {
  const storageLocal = getChromeStorageLocal()
  if (!storageLocal) {
    warnMissingChromeStorage('AIチャット履歴の保存')
    return
  }

  await storageLocal.set({
    [ACTIVE_AI_CHAT_CONVERSATION_ID_KEY]: activeConversationId,
    [AI_CHAT_CONVERSATIONS_KEY]: conversations,
  })
}

export {
  ACTIVE_AI_CHAT_CONVERSATION_ID_KEY,
  AI_CHAT_CONVERSATIONS_KEY,
  buildConversationTitle,
  createConversationRecord,
  loadConversationHistory,
  saveConversationHistory,
}
