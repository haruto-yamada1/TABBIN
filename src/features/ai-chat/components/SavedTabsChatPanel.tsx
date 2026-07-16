import { ChevronDown } from 'lucide-react'
import { useCallback, useMemo } from 'react'
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
import type {
  OllamaErrorDetails,
  OllamaErrorPlatform,
} from '@/features/ai-chat/components/OllamaErrorNotice'
import { SavedTabsChatAttachmentItem } from '@/features/ai-chat/components/SavedTabsChatAttachmentItem'
import { SavedTabsChatComposer } from '@/features/ai-chat/components/SavedTabsChatComposer'
import { SavedTabsChatHeader } from '@/features/ai-chat/components/SavedTabsChatHeader'
import type {
  AiChatAttachment,
  AiChatHistoryItem,
} from '@/features/ai-chat/types'
import { useI18n } from '@/features/i18n/context/I18nProvider'
import { cn } from '@/lib/utils'

import { getMessageSources, getSourcesLabel } from './savedTabsChat/messages'
import type { ChatMessage, TranslateFn } from './savedTabsChat/messages'
import { getAttachmentInputErrorMessage } from './savedTabsChat/streaming'
import { getSavedTabsChatAttachmentId } from './savedTabsChatAttachmentItem.helpers'

const EMPTY_PANEL_TOOL_TRACES: NonNullable<ChatMessage['toolTraces']> = []

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
  modelOptions: { label: string; name: string }[]
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
  systemPrompts: { id: string; name: string }[]
}

const AssistantMessageDiagnostics = ({
  isStreaming,
  reasoning,
  toolTraces = EMPTY_PANEL_TOOL_TRACES,
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
}) =>
  isVisible ? (
    <p
      className='text-[11px] leading-4 text-muted-foreground'
      data-testid='ai-chat-data-scope'
    >
      {t('aiChat.dataScope')}
    </p>
  ) : null

const renderChatMessageAttachments = ({
  attachments,
}: {
  attachments: AiChatAttachment[]
}) => (
  <Attachments className='mb-2 w-full' variant='inline'>
    {attachments.map((attachment) => (
      <SavedTabsChatAttachmentItem
        attachment={attachment}
        key={getSavedTabsChatAttachmentId(attachment)}
      />
    ))}
  </Attachments>
)

const renderConversationMessageBody = ({
  message,
  platform,
}: {
  message: ChatMessage
  platform: OllamaErrorPlatform
}) =>
  message.ollamaError ? (
    <OllamaErrorNotice
      className='text-sm'
      error={message.ollamaError}
      platform={platform}
    />
  ) : (
    <MessageResponse>{message.content}</MessageResponse>
  )

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
  const messageBody = renderConversationMessageBody({ message, platform })
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
          ? renderChatMessageAttachments({ attachments: message.attachments })
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

// eslint-disable-next-line eslint/complexity
const SavedTabsChatPanel = ({
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
    }) => toast.error(getAttachmentInputErrorMessage(error, t)),
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
    () => systemPrompts.map(({ id, name }) => ({ id, name })),
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
  if (!isOpen) {
    return null
  }

  const renderedMessages = messages.map((message) => ({
    id: message.id,
    view: renderChatConversationMessage({ message, platform, t }),
  }))
  const introContent =
    messages.length === 0 && isConfigured
      ? renderChatPromptIntro({ isCompactLayout, onSelectSuggestion, t })
      : null
  const chatDataScopeNotice = renderChatDataScopeNotice({
    isVisible: isConfigured,
    t,
  })
  const cardClassName =
    mode === 'page'
      ? 'flex h-full min-h-0 flex-1 flex-col rounded-[1.5rem] border-border shadow-lg'
      : 'flex h-full min-h-0 flex-col rounded-none border-border border-y-0 border-r-0 border-l shadow-2xl'
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

export { SavedTabsChatPanel }
export type { SavedTabsChatPanelProps }
