import { normalizeAiSystemPromptSettings } from '@/features/ai-chat/lib/systemPromptPresets'
import type { AiChatHistoryItem } from '@/features/ai-chat/types'
import { defaultSettings, getUserSettings } from '@/lib/storage/settings'
import type { AiChatToolTrace, OllamaErrorDetails } from '@/types/background'
import type { UserSettings } from '@/types/storage'

import type { ChatMessage } from './messages'

const CHAT_SIDEBAR_STORAGE_KEY = 'tabbin-ai-chat-sidebar-width'
const DEFAULT_CHAT_SIDEBAR_WIDTH = 420
const MIN_CHAT_SIDEBAR_WIDTH = 320
const MAX_CHAT_SIDEBAR_WIDTH = 720
const CHAT_SIDEBAR_VIEWPORT_GUTTER = 48
const COPIED_CONVERSATION_ICON_TIMEOUT = 2000

const getMaxSidebarWidth = (): number => {
  if (typeof window === 'undefined') {
    return MAX_CHAT_SIDEBAR_WIDTH
  }

  return Math.max(
    MIN_CHAT_SIDEBAR_WIDTH,
    Math.min(
      MAX_CHAT_SIDEBAR_WIDTH,
      window.innerWidth - CHAT_SIDEBAR_VIEWPORT_GUTTER,
    ),
  )
}

const clampSidebarWidth = (width: number): number =>
  Math.min(Math.max(width, MIN_CHAT_SIDEBAR_WIDTH), getMaxSidebarWidth())

const loadSidebarWidth = (): number => {
  if (typeof window === 'undefined') {
    return DEFAULT_CHAT_SIDEBAR_WIDTH
  }

  const storedWidth = window.localStorage.getItem(CHAT_SIDEBAR_STORAGE_KEY)
  if (!storedWidth) {
    return clampSidebarWidth(DEFAULT_CHAT_SIDEBAR_WIDTH)
  }

  const savedWidth = Number(storedWidth)

  return Number.isFinite(savedWidth)
    ? clampSidebarWidth(savedWidth)
    : clampSidebarWidth(DEFAULT_CHAT_SIDEBAR_WIDTH)
}

const persistSidebarWidth = (width: number): void => {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(
      CHAT_SIDEBAR_STORAGE_KEY,
      String(clampSidebarWidth(width)),
    )
  } catch {
    // Skip persistence when localStorage is unavailable.
  }
}

const syncExternalConversationState = ({
  conversationId,
  initialMessages,
  messagesRef,
  setChatOllamaError,
  setErrorMessage,
  setInput,
  setIsSubmitting,
  setMessages,
  syncedConversationIdRef,
}: {
  conversationId?: string
  initialMessages: ChatMessage[]
  messagesRef: { current: ChatMessage[] }
  setChatOllamaError: (error: OllamaErrorDetails | undefined) => void
  setErrorMessage: (message: string) => void
  setInput: (input: string) => void
  setIsSubmitting: (isSubmitting: boolean) => void
  setMessages: (messages: ChatMessage[]) => void
  syncedConversationIdRef: { current: string | undefined }
}) => {
  syncedConversationIdRef.current = conversationId
  messagesRef.current = initialMessages
  setMessages(initialMessages)
  setInput('')
  setErrorMessage('')
  setChatOllamaError(undefined)
  setIsSubmitting(false)
}

const loadWidgetSettings = async (): Promise<UserSettings | null> => {
  try {
    return await getUserSettings()
  } catch {
    return null
  }
}

const getBaseSettings = (settings: UserSettings | null): UserSettings => ({
  ...defaultSettings,
  ...settings,
})

const getResolvedSettings = (settings: UserSettings | null): UserSettings =>
  normalizeAiSystemPromptSettings(getBaseSettings(settings))

const isAiChatConfigured = (settings: UserSettings | null): boolean =>
  Boolean(settings?.ollamaModel)

const areMessagesEquivalent = (
  left: ChatMessage[],
  right: ChatMessage[],
): boolean => JSON.stringify(left) === JSON.stringify(right)

const EMPTY_CHAT_MESSAGES: ChatMessage[] = []
const EMPTY_HISTORY_ITEMS: AiChatHistoryItem[] = []
const EMPTY_TOOL_TRACES: AiChatToolTrace[] = []

export {
  areMessagesEquivalent,
  clampSidebarWidth,
  COPIED_CONVERSATION_ICON_TIMEOUT,
  DEFAULT_CHAT_SIDEBAR_WIDTH,
  EMPTY_CHAT_MESSAGES,
  EMPTY_HISTORY_ITEMS,
  EMPTY_TOOL_TRACES,
  getBaseSettings,
  getMaxSidebarWidth,
  getResolvedSettings,
  isAiChatConfigured,
  loadSidebarWidth,
  loadWidgetSettings,
  MAX_CHAT_SIDEBAR_WIDTH,
  MIN_CHAT_SIDEBAR_WIDTH,
  persistSidebarWidth,
  syncExternalConversationState,
}
