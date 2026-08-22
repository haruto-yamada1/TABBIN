import { useCallback, useEffect, useReducer, useRef, useState } from 'react'

import { mergeChatMessage } from '@/features/ai-chat/components/savedTabsChat/messages'
import type {
  ChatMessage,
  ChatMessageUpdate,
} from '@/features/ai-chat/components/savedTabsChat/messages'
import {
  areMessagesEquivalent,
  EMPTY_CHAT_MESSAGES,
  EMPTY_HISTORY_ITEMS,
  getResolvedSettings,
  isAiChatConfigured,
  loadWidgetSettings,
  syncExternalConversationState,
} from '@/features/ai-chat/components/savedTabsChat/storage'
import { useChatPromptManager } from '@/features/ai-chat/components/savedTabsChat/useChatPromptManager'
import { useChatStreamHandlers } from '@/features/ai-chat/components/savedTabsChat/useChatStreamHandlers'
import {
  getActiveAiSystemPrompt,
  normalizeAiSystemPromptSettings,
} from '@/features/ai-chat/lib/systemPromptPresets'
import type { AiChatHistoryItem } from '@/features/ai-chat/types'
import { useI18n } from '@/features/i18n/context/I18nProvider'
import type { StorageChange } from '@/lib/browser/chrome-storage'
import {
  getChromeStorageOnChanged,
  warnMissingChromeStorage,
} from '@/lib/browser/chrome-storage'
import { saveUserSettings } from '@/lib/storage/settings'
import {
  UserSettingsSchema,
  fromStorageChange,
} from '@/lib/storage/zod-storage'
import type { OllamaErrorDetails } from '@/types/background'
import type { UserSettings } from '@/types/storage'

import { useChatSidebarResize } from './useChatSidebarResize'
import { useConversationClipboard } from './useConversationClipboard'
import { useOllamaModelSettings } from './useOllamaModelSettings'

type SavedTabsChatControllerOptions = {
  conversationId?: string
  defaultOpen?: boolean
  historyItems?: AiChatHistoryItem[]
  historyVariant?: 'dropdown' | 'none' | 'sidebar-toggle'
  initialMessages?: ChatMessage[]
  mode?: 'floating' | 'page'
  title?: string
  onCreateConversation?: () => void
  onDeleteHistoryItem?: (conversationId: string) => void
  onMessagesChange?: (messages: ChatMessage[]) => void
  onOpenChange?: (isOpen: boolean) => void
  onSelectHistoryItem?: (conversationId: string) => void
  onToggleHistory?: () => void
}

// eslint-disable-next-line eslint/max-statements
const useSavedTabsChatController = ({
  conversationId,
  defaultOpen = false,
  historyItems = EMPTY_HISTORY_ITEMS,
  historyVariant = 'none',
  initialMessages = EMPTY_CHAT_MESSAGES,
  mode = 'floating',
  title,
  onCreateConversation,
  onDeleteHistoryItem,
  onMessagesChange,
  onOpenChange,
  onSelectHistoryItem,
  onToggleHistory,
}: SavedTabsChatControllerOptions = {}) => {
  const { language, t } = useI18n()
  const [settings, setSettings] = useState<UserSettings | null>(null)
  const [isFloatingOpen, setIsFloatingOpen] = useState(
    defaultOpen || mode === 'page',
  )
  const { cardStyle, handleResizeStart, isCompactLayout, isResizing } =
    useChatSidebarResize({ mode })
  const [input, setInput] = useState('')
  const [messages, setMessages] = useReducer(
    (_state: ChatMessage[], nextMessages: ChatMessage[]) => nextMessages,
    initialMessages,
  )
  const { copyConversation, isConversationCopied } = useConversationClipboard({
    messages,
    t,
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [chatOllamaError, setChatOllamaError] = useState<
    OllamaErrorDetails | undefined
  >(undefined)
  const activePortRef = useRef<{ disconnect: () => void } | null>(null)
  const conversationGenerationRef = useRef(0)
  const messagesRef = useRef<ChatMessage[]>(initialMessages)
  const syncedConversationIdRef = useRef<string | undefined>(conversationId)
  const isOpen = mode === 'page' || isFloatingOpen

  const disconnectActivePort = useCallback(() => {
    const activePort = activePortRef.current
    if (!activePort) {
      return
    }
    activePortRef.current = null
    activePort.disconnect()
  }, [])

  const invalidateConversation = useCallback(() => {
    conversationGenerationRef.current += 1
    disconnectActivePort()
  }, [disconnectActivePort])

  useEffect(() => {
    const shouldSyncExternalConversation =
      typeof conversationId === 'string' || mode === 'page'

    if (!shouldSyncExternalConversation) {
      return
    }

    if (
      syncedConversationIdRef.current === conversationId &&
      areMessagesEquivalent(initialMessages, messagesRef.current)
    ) {
      return
    }

    invalidateConversation()
    syncExternalConversationState({
      initialMessages,
      messagesRef,
      setChatOllamaError,
      setErrorMessage,
      setInput,
      setIsSubmitting,
      setMessages,
      syncedConversationIdRef,
      ...(conversationId !== undefined ? { conversationId } : {}),
    })
  }, [conversationId, initialMessages, invalidateConversation, mode])

  useEffect(() => {
    let isMounted = true

    void loadWidgetSettings().then((nextSettings) => {
      if (isMounted) {
        setSettings(nextSettings)
      }
    })

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(
    () => () => {
      invalidateConversation()
    },
    [invalidateConversation],
  )

  useEffect(() => {
    const storageChangeListener = (
      changes: Partial<Record<string, StorageChange>>,
      areaName: string,
    ) => {
      if (areaName !== 'local' || !changes.userSettings) {
        return
      }

      setSettings(
        fromStorageChange(UserSettingsSchema, changes.userSettings.newValue),
      )
    }

    const storageOnChanged = getChromeStorageOnChanged()
    if (!storageOnChanged) {
      warnMissingChromeStorage('AI chat settings change watcher')
      return undefined
    }

    storageOnChanged.addListener(storageChangeListener)
    return () => {
      storageOnChanged.removeListener(storageChangeListener)
    }
  }, [])

  const resolvedSettings = getResolvedSettings(settings)
  const activeSystemPrompt = getActiveAiSystemPrompt(resolvedSettings)
  const isConfigured = isAiChatConfigured(resolvedSettings)

  const setMessagesState = (nextMessages: ChatMessage[]) => {
    messagesRef.current = nextMessages
    setMessages(nextMessages)
  }

  const updateMessageList = (
    update: (currentMessages: ChatMessage[]) => ChatMessage[],
    options?: { commit?: boolean },
  ): ChatMessage[] => {
    const nextMessages = update(messagesRef.current)
    setMessagesState(nextMessages)
    if (options?.commit) {
      onMessagesChange?.(nextMessages)
    }
    return nextMessages
  }

  const replaceMessage = (
    messageId: string,
    nextMessage: ChatMessageUpdate,
    options?: { commit?: boolean },
  ) =>
    updateMessageList(
      (currentMessages) =>
        currentMessages.map((message) =>
          message.id === messageId
            ? mergeChatMessage(message, nextMessage)
            : message,
        ),
      options,
    )

  const removeMessage = (messageId: string, options?: { commit?: boolean }) =>
    updateMessageList(
      (currentMessages) =>
        currentMessages.filter((message) => message.id !== messageId),
      options,
    )

  const resetConversation = useCallback(() => {
    invalidateConversation()
    setMessagesState([])
    setInput('')
    setErrorMessage('')
    setChatOllamaError(undefined)
    setIsSubmitting(false)
  }, [invalidateConversation])

  const {
    isLoadingModels,
    isSavingModel,
    modelOptions,
    platform,
    requestModels,
    selectModel,
    setupErrorMessage,
    setupOllamaError,
  } = useOllamaModelSettings({
    onSettingsSaved: setSettings,
    settings: resolvedSettings,
    t,
  })

  const createConversation = useCallback(() => {
    if (onCreateConversation) {
      onCreateConversation()
      return
    }
    resetConversation()
  }, [onCreateConversation, resetConversation])

  const selectSystemPrompt = useCallback(
    async (promptId: string) => {
      if (!promptId || promptId === resolvedSettings.activeAiSystemPromptId) {
        return
      }
      const nextSettings = normalizeAiSystemPromptSettings({
        ...resolvedSettings,
        activeAiSystemPromptId: promptId,
      })
      try {
        await saveUserSettings(nextSettings)
        setSettings(nextSettings)
        resetConversation()
      } catch {
        setChatOllamaError(undefined)
        setErrorMessage(t('aiChat.systemPrompt.switchSaveError'))
      }
    },
    [resetConversation, resolvedSettings, t],
  )

  const promptManager = useChatPromptManager({
    resolvedSettings,
    activeSystemPrompt,
    language,
    t,
    handleResetConversation: resetConversation,
    onSettingsChange: setSettings,
  })
  const { submitPrompt, handleSubmit } = useChatStreamHandlers({
    messages,
    activePortRef,
    conversationGenerationRef,
    disconnectActivePort,
    replaceMessage,
    removeMessage,
    updateMessageList,
    setInput,
    setErrorMessage,
    setChatOllamaError,
    setIsSubmitting,
    isConfigured,
    isSubmitting,
    t,
    language,
  })

  const close = useCallback(() => {
    setIsFloatingOpen(false)
    onOpenChange?.(false)
  }, [onOpenChange])
  const open = useCallback(() => {
    setIsFloatingOpen(true)
    onOpenChange?.(true)
  }, [onOpenChange])

  return {
    actions: {
      handleClose: close,
      handleCopyConversation: () => void copyConversation(),
      handleCreateConversation: createConversation,
      handleFetchModels: () => void requestModels(),
      handleInputChange: setInput,
      handleOpen: open,
      handleOpenSystemPromptManager:
        promptManager.handleOpenSystemPromptManager,
      handleResizeStart,
      handleSelectModel: selectModel,
      handleSelectSuggestion: (value: string) => void submitPrompt(value),
      handleSelectSystemPrompt: (promptId: string) =>
        void selectSystemPrompt(promptId),
      handleSubmit,
    },
    dialog: {
      activePromptId: promptManager.draftActivePromptId,
      errorMessage: promptManager.promptManagerDisplayError,
      isOpen: promptManager.isPromptManagerOpen,
      isSaveDisabled: promptManager.isPromptManagerSaveDisabled,
      isSaving: promptManager.isSavingPrompts,
      onCancel: promptManager.handleCancelSystemPromptManager,
      onChangePromptName: promptManager.handleChangePromptName,
      onChangePromptTemplate: promptManager.handleChangePromptTemplate,
      onCloseChange: promptManager.handlePromptManagerOpenChange,
      onCreatePrompt: promptManager.handleCreatePrompt,
      onDeletePrompt: promptManager.handleDeletePrompt,
      onDuplicatePrompt: promptManager.handleDuplicatePrompt,
      onSave: promptManager.handleSavePromptManager,
      onSelectPrompt: (promptId: string) => {
        promptManager.setPromptManagerError('')
        promptManager.setSelectedPromptIdInModal(promptId)
      },
      presets: promptManager.promptDrafts,
      selectedPromptId: promptManager.selectedPromptIdInModal,
    },
    errors: {
      chatMessage: errorMessage,
      chatOllama: chatOllamaError,
      setupMessage: setupErrorMessage,
      setupOllama: setupOllamaError,
    },
    history: {
      items: historyItems,
      handleDeleteItem: onDeleteHistoryItem,
      handleSelectItem: onSelectHistoryItem,
      handleToggle: onToggleHistory,
      variant: historyVariant,
    },
    launcher: {
      isVisible: mode === 'floating' && !isOpen,
      label: t('aiChat.open'),
      handleOpen: open,
    },
    layout: {
      isCompactLayout,
      isOpen,
      isResizing,
      mode,
      showCloseButton: mode === 'floating',
      ...(cardStyle !== undefined ? { cardStyle } : {}),
    },
    messages: {
      input,
      items: messages,
    },
    settings: {
      activeSystemPromptId: resolvedSettings.activeAiSystemPromptId ?? '',
      modelName: resolvedSettings.ollamaModel,
      modelOptions,
      platform,
      systemPrompts: resolvedSettings.aiSystemPrompts ?? [],
    },
    status: {
      isConfigured,
      isConversationCopied,
      isCopyDisabled: messages.every(
        (message) => message.content.trim().length === 0,
      ),
      isLoadingModels,
      isOpen,
      isSavingModel,
      isSubmitting,
    },
    title: title ?? t('aiChat.chatTitle'),
  }
}

export { useSavedTabsChatController }
export type { SavedTabsChatControllerOptions }
