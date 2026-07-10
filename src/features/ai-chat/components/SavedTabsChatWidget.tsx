import { ChevronDown, MessageCircleMore } from 'lucide-react'
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { toast } from 'sonner'

import { Attachments } from '@/components/ai-elements/attachments'
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation'
import {
  Message,
  MessageContent,
  MessageResponse,
} from '@/components/ai-elements/message'
import type { PromptInputProps } from '@/components/ai-elements/prompt-input'
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from '@/components/ai-elements/reasoning'
import { Shimmer } from '@/components/ai-elements/shimmer'
import {
  Source,
  Sources,
  SourcesContent,
  SourcesTrigger,
} from '@/components/ai-elements/sources'
import { Suggestion, Suggestions } from '@/components/ai-elements/suggestion'
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from '@/components/ai-elements/tool'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { AiChartRenderer } from '@/features/ai-chat/components/AiChartRenderer'
import { OllamaErrorNotice } from '@/features/ai-chat/components/OllamaErrorNotice'
import type { OllamaErrorPlatform } from '@/features/ai-chat/components/OllamaErrorNotice'
import { SavedTabsChatAttachmentItem } from '@/features/ai-chat/components/SavedTabsChatAttachmentItem'
import { SavedTabsChatComposer } from '@/features/ai-chat/components/SavedTabsChatComposer'
import { SavedTabsChatHeader } from '@/features/ai-chat/components/SavedTabsChatHeader'
import { SystemPromptManagerDialog } from '@/features/ai-chat/components/SystemPromptManagerDialog'
import type { SystemPromptManagerDialogProps } from '@/features/ai-chat/components/SystemPromptManagerDialog'
import { useChatSidebarResize } from '@/features/ai-chat/hooks/useChatSidebarResize'
import { useConversationClipboard } from '@/features/ai-chat/hooks/useConversationClipboard'
import { useOllamaModelSettings } from '@/features/ai-chat/hooks/useOllamaModelSettings'
import {
  getActiveAiSystemPrompt,
  normalizeAiSystemPromptSettings,
} from '@/features/ai-chat/lib/systemPromptPresets'
import type {
  AiChatAttachment,
  AiChatHistoryItem,
} from '@/features/ai-chat/types'
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
import { cn } from '@/lib/utils'
import type { OllamaErrorDetails } from '@/types/background'
import type { AiSystemPromptPreset, UserSettings } from '@/types/storage'

import { getMessageSources, getSourcesLabel } from './savedTabsChat/messages'
import type { ChatMessage, TranslateFn } from './savedTabsChat/messages'
import {
  areMessagesEquivalent,
  EMPTY_CHAT_MESSAGES,
  EMPTY_HISTORY_ITEMS,
  EMPTY_TOOL_TRACES,
  getResolvedSettings,
  isAiChatConfigured,
  loadWidgetSettings,
  syncExternalConversationState,
} from './savedTabsChat/storage'
import { getAttachmentInputErrorMessage } from './savedTabsChat/streaming'
import { useChatPromptManager } from './savedTabsChat/useChatPromptManager'
import { useChatStreamHandlers } from './savedTabsChat/useChatStreamHandlers'
import { getSavedTabsChatAttachmentId } from './savedTabsChatAttachmentItem.helpers'

type SavedTabsChatPanelProps = {
  activeSystemPromptId: string
  chatErrorMessage: string
  chatOllamaError?: OllamaErrorDetails
  historyItems: AiChatHistoryItem[]
  historyVariant: 'dropdown' | 'none' | 'sidebar-toggle'
  input: string
  layout: {
    cardStyle?: CSSProperties
    isCompactLayout: boolean
    isResizing: boolean
    mode: 'floating' | 'page'
    showCloseButton: boolean
  }
  status: {
    isConfigured: boolean
    isConversationCopied: boolean
    isCopyDisabled: boolean
    isLoadingModels: boolean
    isOpen: boolean
    isSavingModel: boolean
    isSubmitting: boolean
  }
  messages: ChatMessage[]
  modelName?: string
  modelOptions: {
    label: string
    name: string
  }[]
  onClose: () => void
  onCopyConversation: () => void
  onDeleteHistoryItem?: (conversationId: string) => void
  onFetchModels: () => void
  onInputChange: (value: string) => void
  onOpenSystemPromptManager: () => void
  onResetConversation: () => void
  onResizeStart: (event: React.PointerEvent<HTMLButtonElement>) => void
  onSelectHistoryItem?: (conversationId: string) => void
  onSelectModel: (modelName: string) => Promise<boolean>
  onSelectSuggestion: (value: string) => void
  onSelectSystemPrompt: (promptId: string) => void
  onSubmit: PromptInputProps['onSubmit']
  onToggleHistory?: () => void
  platform: OllamaErrorPlatform
  title: string
  setupErrorMessage: string
  setupOllamaError?: OllamaErrorDetails
  systemPrompts: AiSystemPromptPreset[]
}

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

const AssistantMessageDiagnostics = ({
  isStreaming,
  reasoning,
  toolTraces = EMPTY_TOOL_TRACES,
}: Pick<ChatMessage, 'isStreaming' | 'reasoning' | 'toolTraces'>) => {
  const { t } = useI18n()
  const getThinkingMessage = useCallback(
    () =>
      `${t('aiChat.reasoning')}${
        toolTraces.length > 0 ? ` / ${toolTraces.length}` : ''
      }`,
    [t, toolTraces.length],
  )

  if (!reasoning && toolTraces.length === 0) {
    return null
  }

  return (
    <div className='gap-y-2 pl-1 wrap-break-word'>
      {reasoning ? (
        <Reasoning
          className='mb-0 rounded-md border border-border/70 bg-background/70 px-3 py-2'
          isStreaming={isStreaming}
        >
          <ReasoningTrigger getThinkingMessage={getThinkingMessage} />
          <ReasoningContent>{reasoning}</ReasoningContent>
        </Reasoning>
      ) : null}

      {toolTraces.length > 0 ? (
        <div className='gap-y-2'>
          <p className='pl-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase'>
            {t('aiChat.toolsRun')}
          </p>
          {toolTraces.map((toolTrace) => (
            <Tool
              className='mb-0 border-border/70 bg-background/70'
              key={toolTrace.toolCallId}
            >
              <ToolHeader
                state={toolTrace.state}
                title={toolTrace.title}
                toolName={toolTrace.toolName}
                type='dynamic-tool'
              />
              <ToolContent>
                <ToolInput input={toolTrace.input} />
                <ToolOutput
                  errorText={toolTrace.errorText}
                  output={toolTrace.output}
                />
              </ToolContent>
            </Tool>
          ))}
        </div>
      ) : null}
    </div>
  )
}

const renderChatPromptIntro = ({
  isCompactLayout,
  onSelectSuggestion,
  t,
}: {
  isCompactLayout: boolean
  onSelectSuggestion: (value: string) => void
  t: TranslateFn
}) => {
  const suggestions = [
    t('aiChat.suggestion.recentTabs'),
    t('aiChat.suggestion.favoriteContent'),
    t('aiChat.suggestion.recommendation'),
  ]
  const suggestionItems = suggestions.map((suggestion) => (
    <Suggestion
      className={
        isCompactLayout
          ? 'w-full justify-start text-left whitespace-normal'
          : undefined
      }
      key={suggestion}
      suggestion={suggestion}
      onClick={onSelectSuggestion}
    />
  ))

  return (
    <div className='shrink-0 gap-y-3' data-testid='ai-chat-intro'>
      <p className='text-sm text-muted-foreground'>{t('aiChat.intro')}</p>
      {isCompactLayout ? (
        <div className='grid gap-2'>{suggestionItems}</div>
      ) : (
        <Suggestions>{suggestionItems}</Suggestions>
      )}
    </div>
  )
}

const renderChatDataScopeNotice = ({
  isVisible,
  t,
}: {
  isVisible: boolean
  t: TranslateFn
}) => {
  if (!isVisible) {
    return null
  }

  return (
    <p
      className='text-[11px] leading-4 text-muted-foreground'
      data-testid='ai-chat-data-scope'
    >
      {t('aiChat.dataScope')}
    </p>
  )
}

const renderChatMessageAttachments = ({
  attachments,
}: {
  attachments: AiChatAttachment[]
}) => {
  return (
    <Attachments className='mb-2 w-full' variant='inline'>
      {attachments.map((attachment) => (
        <SavedTabsChatAttachmentItem
          attachment={attachment}
          key={getSavedTabsChatAttachmentId(attachment)}
        />
      ))}
    </Attachments>
  )
}

const renderConversationMessageBody = ({
  message,
  platform,
}: {
  message: ChatMessage
  platform: OllamaErrorPlatform
}) => {
  if (message.ollamaError) {
    return (
      <OllamaErrorNotice
        className='text-sm'
        error={message.ollamaError}
        platform={platform}
      />
    )
  }

  return <MessageResponse>{message.content}</MessageResponse>
}

const renderChatConversationMessage = ({
  // eslint-disable-line eslint/complexity
  message,
  platform,
  t,
}: {
  message: ChatMessage
  platform: OllamaErrorPlatform
  t: TranslateFn
}) => {
  const messageSources =
    message.role === 'assistant' ? getMessageSources(message.toolTraces) : []
  const messageBody = renderConversationMessageBody({
    message,
    platform,
  })
  const shouldShowStreamingShimmer =
    message.role === 'assistant' &&
    message.isStreaming &&
    message.content.length === 0
  const hasCharts =
    message.role === 'assistant' &&
    Boolean(message.charts && message.charts.length > 0)

  return (
    <Message
      className={cn(hasCharts && 'max-w-full')}
      data-testid='chat-message'
      from={message.role}
    >
      {messageSources.length > 0 ? (
        <Sources
          className='mb-0 rounded-md border border-border/70 bg-background/70 px-3 py-2 text-foreground'
          data-slot='sources'
          data-testid='message-sources'
        >
          <SourcesTrigger
            className='w-full justify-between text-muted-foreground'
            count={messageSources.length}
          >
            <span className='text-[11px] font-medium tracking-wide uppercase'>
              {getSourcesLabel({ count: messageSources.length, t })}
            </span>
            <ChevronDown className='size-4' />
          </SourcesTrigger>
          <SourcesContent className='w-full'>
            {messageSources.map((source) => (
              <Source href={source.url} key={source.url} title={source.title} />
            ))}
          </SourcesContent>
        </Sources>
      ) : null}

      {message.role === 'assistant' ? (
        <AssistantMessageDiagnostics
          isStreaming={message.isStreaming}
          reasoning={message.reasoning}
          toolTraces={message.toolTraces}
        />
      ) : null}

      <MessageContent
        className={cn(
          message.role === 'user'
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-foreground',
          hasCharts && 'w-full overflow-visible',
          'wrap-break-word whitespace-pre-wrap',
        )}
        data-testid='message-content'
      >
        {message.attachments && message.attachments.length > 0
          ? renderChatMessageAttachments({
              attachments: message.attachments,
            })
          : null}
        {messageBody}
        {message.role === 'assistant' ? (
          <AiChartRenderer charts={message.charts} />
        ) : null}
        {shouldShowStreamingShimmer ? (
          <Shimmer className='text-sm'>{t('aiChat.shimmer')}</Shimmer>
        ) : null}
      </MessageContent>
    </Message>
  )
}

// TODO(#557): この関数の複雑度が高い。useMemo/useCallback の分割や早期 return で削減する。
// eslint-disable-next-line eslint/complexity
const useSavedTabsChatPanelView = ({
  activeSystemPromptId,
  chatErrorMessage,
  chatOllamaError,
  historyItems,
  historyVariant,
  input,
  layout,
  messages,
  modelName,
  modelOptions,
  onClose,
  onCopyConversation,
  onDeleteHistoryItem,
  onFetchModels,
  onInputChange,
  onOpenSystemPromptManager,
  onResetConversation,
  onResizeStart,
  onSelectHistoryItem,
  onSelectModel,
  onSelectSuggestion,
  onSelectSystemPrompt,
  onSubmit,
  onToggleHistory,
  platform,
  status,
  title,
  setupErrorMessage,
  setupOllamaError,
  systemPrompts,
}: SavedTabsChatPanelProps) => {
  const { t } = useI18n()
  const handleAttachmentError = useCallback(
    (error: {
      code: 'accept' | 'max_files' | 'max_file_size'
      message: string
    }) => {
      toast.error(getAttachmentInputErrorMessage(error, t))
    },
    [t],
  )
  const headerPresentation = useMemo(
    () => ({
      isCompactLayout: layout.isCompactLayout,
      showCloseButton: layout.showCloseButton,
    }),
    [layout.isCompactLayout, layout.showCloseButton],
  )
  const headerStatus = useMemo(
    () => ({
      isConversationCopied: status.isConversationCopied,
      isCopyDisabled: status.isCopyDisabled,
    }),
    [status.isConversationCopied, status.isCopyDisabled],
  )
  const headerSystemPrompts = useMemo(
    () =>
      systemPrompts.map(({ id, name }) => ({
        id,
        name,
      })),
    [systemPrompts],
  )
  const composerPresentation = useMemo(
    () => ({ isCompactLayout: layout.isCompactLayout }),
    [layout.isCompactLayout],
  )
  const composerStatus = useMemo(
    () => ({
      isConfigured: status.isConfigured,
      isLoadingModels: status.isLoadingModels,
      isSavingModel: status.isSavingModel,
      isSubmitting: status.isSubmitting,
    }),
    [
      status.isConfigured,
      status.isLoadingModels,
      status.isSavingModel,
      status.isSubmitting,
    ],
  )
  const { cardStyle, isCompactLayout, isResizing, mode } = layout
  const { isConfigured, isOpen } = status
  const renderedMessages = messages.map((message) => ({
    id: message.id,
    view: renderChatConversationMessage({
      message,
      platform,
      t,
    }),
  }))
  const introContent =
    messages.length === 0 && isConfigured
      ? renderChatPromptIntro({
          isCompactLayout,
          onSelectSuggestion,
          t,
        })
      : null
  const chatDataScopeNotice = renderChatDataScopeNotice({
    isVisible: isConfigured,
    t,
  })
  const cardClassName =
    mode === 'page'
      ? 'flex h-full min-h-0 flex-1 flex-col rounded-[1.5rem] border-border shadow-lg'
      : 'flex h-full min-h-0 flex-col rounded-none border-border border-y-0 border-r-0 border-l shadow-2xl'
  if (!isOpen) {
    return null
  }

  let chatErrorContent: ReactNode = null

  if (chatOllamaError) {
    chatErrorContent = (
      <OllamaErrorNotice
        className='shrink-0 text-sm text-destructive'
        error={chatOllamaError}
        platform={platform}
      />
    )
  } else if (chatErrorMessage) {
    chatErrorContent = (
      <p className='shrink-0 text-sm wrap-break-word whitespace-pre-line text-destructive'>
        {chatErrorMessage}
      </p>
    )
  }

  const card = (
    <Card
      aria-label={
        mode === 'page' ? t('aiChat.pageAria') : t('aiChat.sidebarAria')
      }
      data-sidebar-layout={isCompactLayout ? 'compact' : 'default'}
      className={cardClassName}
      style={cardStyle}
    >
      <SavedTabsChatHeader
        activeSystemPromptId={activeSystemPromptId}
        historyItems={historyItems}
        historyVariant={historyVariant}
        onClose={onClose}
        onCopyConversation={onCopyConversation}
        onDeleteHistoryItem={onDeleteHistoryItem}
        onOpenSystemPromptManager={onOpenSystemPromptManager}
        onResetConversation={onResetConversation}
        onSelectHistoryItem={onSelectHistoryItem}
        onSelectSystemPrompt={onSelectSystemPrompt}
        onToggleHistory={onToggleHistory}
        presentation={headerPresentation}
        status={headerStatus}
        systemPrompts={headerSystemPrompts}
        title={title}
      />

      <CardContent
        className={cn(
          'flex min-h-0 flex-1 flex-col overflow-hidden',
          isCompactLayout ? 'gap-2 p-2' : 'gap-3 p-3',
        )}
      >
        <Conversation className='min-h-0 flex-1'>
          {messages.length === 0 && !isConfigured ? (
            <ConversationEmptyState
              data-testid='empty-state-root'
              description=''
              title={t('aiChat.emptySelectModel')}
            />
          ) : (
            <>
              <ConversationContent
                className={cn(isCompactLayout && 'gap-5 p-3')}
                scrollClassName='overscroll-contain overflow-y-auto'
              >
                {renderedMessages.map((message) => (
                  <div key={message.id}>{message.view}</div>
                ))}
              </ConversationContent>
              <ConversationScrollButton
                aria-label={t('aiChat.scrollLatest')}
                className='bottom-3'
              />
            </>
          )}
        </Conversation>

        <div
          className='mt-auto shrink-0 gap-y-3'
          data-testid='ai-chat-bottom-dock'
        >
          {introContent}

          {chatErrorContent}

          {chatDataScopeNotice}

          <SavedTabsChatComposer
            input={input}
            modelName={modelName}
            modelOptions={modelOptions}
            onAttachmentError={handleAttachmentError}
            onFetchModels={onFetchModels}
            onInputChange={onInputChange}
            onSelectModel={onSelectModel}
            onSubmit={onSubmit}
            platform={platform}
            presentation={composerPresentation}
            setupErrorMessage={setupErrorMessage}
            setupOllamaError={setupOllamaError}
            status={composerStatus}
          />
        </div>
      </CardContent>
    </Card>
  )

  if (mode === 'page') {
    return <div className='flex h-full min-h-0 flex-1'>{card}</div>
  }

  return (
    <div
      className='sticky top-0 z-50 flex h-screen max-w-[calc(100vw-24px)] shrink-0 self-start overflow-hidden overscroll-none'
      data-testid='chat-shell'
    >
      <Button
        aria-label={t('aiChat.resizeAria')}
        className={`relative min-h-0 w-4 shrink-0 cursor-col-resize touch-none self-stretch rounded-none border-0 bg-transparent ${
          isResizing ? 'bg-primary/10' : 'bg-transparent'
        }`}
        onPointerDown={onResizeStart}
        size='unstyled'
        type='button'
        variant='ghost'
      >
        <span
          aria-hidden='true'
          className='absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border/80'
        />
      </Button>

      {card}
    </div>
  )
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

  const disconnectActivePort = (suppressDisconnectError = false) => {
    const activePort = activePortRef.current
    if (!activePort) {
      return
    }

    if (suppressDisconnectError) {
      ignoreNextDisconnectRef.current = true
    }

    activePortRef.current = null
    activePort.disconnect()
  }

  const handleResetConversation = () => {
    conversationGenerationRef.current += 1
    disconnectActivePort(true)
    setMessagesState([])
    setInput('')
    setErrorMessage('')
    setChatOllamaError(undefined)
    setIsSubmitting(false)
  }

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

  const handleConversationAction = () => {
    if (onCreateConversation) {
      onCreateConversation()
      return
    }

    handleResetConversation()
  }

  const handleSelectSystemPrompt = async (promptId: string) => {
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
  }
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
  const chatPanel = useSavedTabsChatPanelView({
    activeSystemPromptId: resolvedSettings.activeAiSystemPromptId ?? '',
    chatErrorMessage: errorMessage,
    chatOllamaError,
    historyItems,
    historyVariant,
    input,
    layout: {
      cardStyle,
      isCompactLayout,
      isResizing,
      mode,
      showCloseButton: mode === 'floating',
    },
    messages,
    modelName: resolvedSettings.ollamaModel,
    modelOptions,
    onClose: () => {
      setIsFloatingOpen(false)
      onOpenChange?.(false)
    },
    onCopyConversation: () => {
      void copyConversation()
    },
    onDeleteHistoryItem,
    // eslint-disable-next-line typescript/no-misused-promises
    onFetchModels: handleFetchModels,
    onInputChange: setInput,
    onOpenSystemPromptManager: handleOpenSystemPromptManager,
    onResetConversation: handleConversationAction,
    onResizeStart: handleResizeStart,
    onSelectHistoryItem,
    onSelectModel: handleSelectModel,
    onSelectSuggestion: (value) => {
      void submitPrompt(value)
    },
    onSelectSystemPrompt: (promptId) => {
      void handleSelectSystemPrompt(promptId)
    },
    onSubmit: handleSubmit,
    onToggleHistory,
    platform,
    setupErrorMessage,
    setupOllamaError,
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
    systemPrompts: resolvedSettings.aiSystemPrompts ?? [],
    title: resolvedTitle,
  })
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
