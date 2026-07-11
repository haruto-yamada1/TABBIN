import { MessageCircleMore } from 'lucide-react'
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react'

import { Button } from '@/components/ui/button'
import { SavedTabsChatPanel } from '@/features/ai-chat/components/SavedTabsChatPanel'
import { SystemPromptManagerDialog } from '@/features/ai-chat/components/SystemPromptManagerDialog'
import type { SystemPromptManagerDialogProps } from '@/features/ai-chat/components/SystemPromptManagerDialog'
import { useChatSidebarResize } from '@/features/ai-chat/hooks/useChatSidebarResize'
import { useConversationClipboard } from '@/features/ai-chat/hooks/useConversationClipboard'
import { useOllamaModelSettings } from '@/features/ai-chat/hooks/useOllamaModelSettings'
import {
  getActiveAiSystemPrompt,
  normalizeAiSystemPromptSettings,
} from '@/features/ai-chat/lib/systemPromptPresets'
import type { AiChatHistoryItem } from '@/features/ai-chat/types'
import { useI18n } from '@/features/i18n/context/I18nProvider'
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

import type { ChatMessage } from './savedTabsChat/messages'
import {
  areMessagesEquivalent,
  EMPTY_CHAT_MESSAGES,
  EMPTY_HISTORY_ITEMS,
  getResolvedSettings,
  isAiChatConfigured,
  loadWidgetSettings,
  syncExternalConversationState,
} from './savedTabsChat/storage'
import { useChatPromptManager } from './savedTabsChat/useChatPromptManager'
import { useChatStreamHandlers } from './savedTabsChat/useChatStreamHandlers'

type SavedTabsChatWidgetProps = {
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
const useSavedTabsChatWidgetView = ({
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
}: SavedTabsChatWidgetProps = {}) => {
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
  const activePortRef = useRef<{
    disconnect: () => void
  } | null>(null)
  const conversationGenerationRef = useRef(0)
  const ignoreNextDisconnectRef = useRef(false)
  const messagesRef = useRef<ChatMessage[]>(initialMessages)
  const syncedConversationIdRef = useRef<string | undefined>(conversationId)
  const isOpen = mode === 'page' || isFloatingOpen
  const releaseChatWidgetResources = useCallback(() => {
    activePortRef.current?.disconnect()
    activePortRef.current = null
  }, [])

  useEffect(() => {
    const shouldSyncExternalConversation =
      typeof conversationId === 'string' || mode === 'page'

    if (!shouldSyncExternalConversation) {
      return
    }

    const isSameConversationId =
      syncedConversationIdRef.current === conversationId

    if (
      isSameConversationId &&
      areMessagesEquivalent(initialMessages, messagesRef.current)
    ) {
      return
    }

    syncExternalConversationState({
      conversationId,
      initialMessages,
      messagesRef,
      setChatOllamaError,
      setErrorMessage,
      setInput,
      setIsSubmitting,
      setMessages,
      syncedConversationIdRef,
    })
  }, [conversationId, initialMessages, mode])

  useEffect(() => {
    let isMounted = true

    const syncWidgetSettings = async () => {
      const nextSettings = await loadWidgetSettings()
      if (!isMounted) {
        return
      }

      setSettings(nextSettings)
    }

    void syncWidgetSettings()

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => releaseChatWidgetResources, [releaseChatWidgetResources])

  useEffect(() => {
    const storageChangeListener = (
      changes: Partial<Record<string, chrome.storage.StorageChange>>,
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
      return
    }

    storageOnChanged.addListener(storageChangeListener)

    // eslint-disable-next-line typescript/consistent-return
    return () => {
      storageOnChanged.removeListener(storageChangeListener)
    }
  }, [])

  const resolvedSettings = getResolvedSettings(settings)
  const activeSystemPrompt = getActiveAiSystemPrompt(resolvedSettings)
  const isConfigured = isAiChatConfigured(resolvedSettings)
  const resolvedTitle = title ?? t('aiChat.chatTitle')

  const setMessagesState = (nextMessages: ChatMessage[]) => {
    messagesRef.current = nextMessages
    setMessages(nextMessages)
  }

  const updateMessageList = (
    update: (currentMessages: ChatMessage[]) => ChatMessage[],
    options?: {
      commit?: boolean
    },
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
    nextMessage: Partial<ChatMessage>,
    options?: {
      commit?: boolean
    },
  ) =>
    updateMessageList(
      (currentMessages) =>
        currentMessages.map((message) =>
          message.id === messageId
            ? {
                ...message,
                ...nextMessage,
              }
            : message,
        ),
      options,
    )

  const removeMessage = (
    messageId: string,
    options?: {
      commit?: boolean
    },
  ) =>
    updateMessageList(
      (currentMessages) =>
        currentMessages.filter((message) => message.id !== messageId),
      options,
    )

  const disconnectActivePort = useCallback(
    (suppressDisconnectError = false) => {
      const activePort = activePortRef.current
      if (!activePort) {
        return
      }

      if (suppressDisconnectError) {
        ignoreNextDisconnectRef.current = true
      }

      activePortRef.current = null
      activePort.disconnect()
    },
    [],
  )

  const handleResetConversation = useCallback(() => {
    conversationGenerationRef.current += 1
    disconnectActivePort(true)
    setMessagesState([])
    setInput('')
    setErrorMessage('')
    setChatOllamaError(undefined)
    setIsSubmitting(false)
  }, [disconnectActivePort])

  const {
    isLoadingModels,
    isSavingModel,
    modelOptions,
    platform,
    requestModels: handleFetchModels,
    selectModel: handleSelectModel,
    setupErrorMessage,
    setupOllamaError,
  } = useOllamaModelSettings({
    onSettingsSaved: (nextSettings) => {
      setSettings(nextSettings)
    },
    settings: resolvedSettings,
    t,
  })

  const handleConversationAction = useCallback(() => {
    if (onCreateConversation) {
      onCreateConversation()
      return
    }

    handleResetConversation()
  }, [handleResetConversation, onCreateConversation])

  const handleSelectSystemPrompt = useCallback(
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
        handleResetConversation()
      } catch {
        setChatOllamaError(undefined)
        setErrorMessage(t('aiChat.systemPrompt.switchSaveError'))
      }
    },
    [handleResetConversation, resolvedSettings, t],
  )
  const {
    isPromptManagerOpen,
    promptDrafts,
    selectedPromptIdInModal,
    setSelectedPromptIdInModal,
    draftActivePromptId,
    setPromptManagerError,
    isSavingPrompts,
    handleOpenSystemPromptManager,
    handleCancelSystemPromptManager,
    handlePromptManagerOpenChange,
    handleChangePromptName,
    handleChangePromptTemplate,
    handleCreatePrompt,
    handleDuplicatePrompt,
    handleDeletePrompt,
    handleSavePromptManager,
    promptManagerDisplayError,
    isPromptManagerSaveDisabled,
  } = useChatPromptManager({
    resolvedSettings,
    activeSystemPrompt,
    language,
    t,
    handleResetConversation,
    onSettingsChange: setSettings,
  })
  const { submitPrompt, handleSubmit } = useChatStreamHandlers({
    messages,
    activePortRef,
    conversationGenerationRef,
    ignoreNextDisconnectRef,
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
  const panelLayout = useMemo(
    () => ({
      cardStyle,
      isCompactLayout,
      isResizing,
      mode,
      showCloseButton: mode === 'floating',
    }),
    [cardStyle, isCompactLayout, isResizing, mode],
  )
  const panelStatus = useMemo(
    () => ({
      isConfigured,
      isConversationCopied,
      isCopyDisabled: messages.every(
        (message) => message.content.trim().length === 0,
      ),
      isLoadingModels,
      isOpen,
      isSavingModel,
      isSubmitting,
    }),
    [
      isConfigured,
      isConversationCopied,
      isLoadingModels,
      isOpen,
      isSavingModel,
      isSubmitting,
      messages,
    ],
  )
  const panelSystemPrompts = useMemo(
    () => resolvedSettings.aiSystemPrompts ?? [],
    [resolvedSettings.aiSystemPrompts],
  )
  const handlePanelClose = useCallback(() => {
    setIsFloatingOpen(false)
    onOpenChange?.(false)
  }, [onOpenChange])
  const handlePanelCopyConversation = useCallback(() => {
    void copyConversation()
  }, [copyConversation])
  const handlePanelFetchModels = useCallback(() => {
    void handleFetchModels()
  }, [handleFetchModels])
  const handlePanelSelectSuggestion = useCallback(
    (value: string) => {
      void submitPrompt(value)
    },
    [submitPrompt],
  )
  const handlePanelSelectSystemPrompt = useCallback(
    (promptId: string) => {
      void handleSelectSystemPrompt(promptId)
    },
    [handleSelectSystemPrompt],
  )
  const chatPanel = (
    <SavedTabsChatPanel
      activeSystemPromptId={resolvedSettings.activeAiSystemPromptId ?? ''}
      chatErrorMessage={errorMessage}
      chatOllamaError={chatOllamaError}
      historyItems={historyItems}
      historyVariant={historyVariant}
      input={input}
      layout={panelLayout}
      messages={messages}
      modelName={resolvedSettings.ollamaModel}
      modelOptions={modelOptions}
      onClose={handlePanelClose}
      onCopyConversation={handlePanelCopyConversation}
      onDeleteHistoryItem={onDeleteHistoryItem}
      onFetchModels={handlePanelFetchModels}
      onInputChange={setInput}
      onOpenSystemPromptManager={handleOpenSystemPromptManager}
      onResetConversation={handleConversationAction}
      onResizeStart={handleResizeStart}
      onSelectHistoryItem={onSelectHistoryItem}
      onSelectModel={handleSelectModel}
      onSelectSuggestion={handlePanelSelectSuggestion}
      onSelectSystemPrompt={handlePanelSelectSystemPrompt}
      onSubmit={handleSubmit}
      onToggleHistory={onToggleHistory}
      platform={platform}
      setupErrorMessage={setupErrorMessage}
      setupOllamaError={setupOllamaError}
      status={panelStatus}
      systemPrompts={panelSystemPrompts}
      title={resolvedTitle}
    />
  )
  const systemPromptManagerDialogProps: SystemPromptManagerDialogProps = {
    activePromptId: draftActivePromptId,
    errorMessage: promptManagerDisplayError,
    isOpen: isPromptManagerOpen,
    isSaveDisabled: isPromptManagerSaveDisabled,
    isSaving: isSavingPrompts,
    onCancel: handleCancelSystemPromptManager,
    onChangePromptName: handleChangePromptName,
    onChangePromptTemplate: handleChangePromptTemplate,
    onCloseChange: handlePromptManagerOpenChange,
    onCreatePrompt: handleCreatePrompt,
    onDeletePrompt: handleDeletePrompt,
    onDuplicatePrompt: handleDuplicatePrompt,
    onSave: handleSavePromptManager,
    onSelectPrompt: (promptId) => {
      setPromptManagerError('')
      setSelectedPromptIdInModal(promptId)
    },
    presets: promptDrafts,
    selectedPromptId: selectedPromptIdInModal,
  }

  const handleFloatingButtonClick = useCallback(() => {
    setIsFloatingOpen(true)
    onOpenChange?.(true)
  }, [onOpenChange])

  return (
    <>
      {mode === 'floating' && !isOpen ? (
        <Button
          type='button'
          aria-label={t('aiChat.open')}
          className='fixed right-4 bottom-4 z-50 size-10 cursor-pointer rounded-full shadow-lg'
          onClick={handleFloatingButtonClick}
        >
          <MessageCircleMore className='size-5' />
        </Button>
      ) : null}

      {chatPanel}
      <SystemPromptManagerDialog {...systemPromptManagerDialogProps} />
    </>
  )
}

const SavedTabsChatWidget = (props: SavedTabsChatWidgetProps = {}) =>
  useSavedTabsChatWidgetView(props)

export { SavedTabsChatWidget }
