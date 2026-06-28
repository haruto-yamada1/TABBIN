import {
  Check,
  ChevronDown,
  Copy,
  History,
  MessageCircleMore,
  Plus,
  Settings2,
  X,
} from 'lucide-react'
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'
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
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSelect,
  PromptInputSelectContent,
  PromptInputSelectItem,
  PromptInputSelectTrigger,
  PromptInputSelectValue,
  PromptInputSubmit,
  PromptInputTextarea,
} from '@/components/ai-elements/prompt-input'
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { AiChartRenderer } from '@/features/ai-chat/components/AiChartRenderer'
import { ChatPromptAttachmentButton } from '@/features/ai-chat/components/ChatPromptAttachmentButton'
import { ChatPromptAttachments } from '@/features/ai-chat/components/ChatPromptAttachments'
import { OllamaErrorNotice } from '@/features/ai-chat/components/OllamaErrorNotice'
import type { OllamaErrorPlatform } from '@/features/ai-chat/components/OllamaErrorNotice'
import { OllamaModelSelector } from '@/features/ai-chat/components/OllamaModelSelector'
import { SavedTabsChatAttachmentItem } from '@/features/ai-chat/components/SavedTabsChatAttachmentItem'
import { SavedTabsChatHeaderTooltipButton } from '@/features/ai-chat/components/SavedTabsChatHeaderTooltipButton'
import { SavedTabsChatHistoryItemCard } from '@/features/ai-chat/components/SavedTabsChatHistoryItemCard'
import { SystemPromptManagerDialog } from '@/features/ai-chat/components/SystemPromptManagerDialog'
import type { SystemPromptManagerDialogProps } from '@/features/ai-chat/components/SystemPromptManagerDialog'
import {
  AI_CHAT_MAX_ATTACHMENTS,
  AI_CHAT_MAX_ATTACHMENT_SIZE_BYTES,
  getAiChatAttachmentInputAccept,
} from '@/features/ai-chat/lib/attachments'
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

import {
  getConversationCopyText,
  getMessageSources,
  getSourcesLabel,
  insertLineBreakAtCursor,
  requestPromptSubmit,
} from './savedTabsChat/messages'
import type { ChatMessage, TranslateFn } from './savedTabsChat/messages'
import {
  getSelectedPrompt,
  SYSTEM_PROMPT_SELECTOR_EMPTY_VALUE,
} from './savedTabsChat/prompts'
import {
  areMessagesEquivalent,
  clampSidebarWidth,
  COPIED_CONVERSATION_ICON_TIMEOUT,
  DEFAULT_CHAT_SIDEBAR_WIDTH,
  EMPTY_CHAT_MESSAGES,
  EMPTY_HISTORY_ITEMS,
  EMPTY_TOOL_TRACES,
  getResolvedSettings,
  isAiChatConfigured,
  loadSidebarWidth,
  loadWidgetSettings,
  persistSidebarWidth,
  syncExternalConversationState,
} from './savedTabsChat/storage'
import {
  getAttachmentInputErrorMessage,
  getRuntimePlatform,
  requestOllamaModels,
} from './savedTabsChat/streaming'
import { useChatPromptManager } from './savedTabsChat/useChatPromptManager'
import { useChatStreamHandlers } from './savedTabsChat/useChatStreamHandlers'
import { getSavedTabsChatAttachmentId } from './savedTabsChatAttachmentItem.helpers'

interface ClipboardWriter {
  writeText: (text: string) => Promise<void>
}

const getClipboardWriter = (): ClipboardWriter | null => {
  const navigatorValue: unknown = Reflect.get(globalThis, 'navigator')
  if (typeof navigatorValue !== 'object' || navigatorValue === null) {
    return null
  }
  const clipboardValue: unknown = Reflect.get(navigatorValue, 'clipboard')
  if (typeof clipboardValue !== 'object' || clipboardValue === null) {
    return null
  }
  const writeTextValue: unknown = Reflect.get(clipboardValue, 'writeText')
  if (typeof writeTextValue !== 'function') {
    return null
  }
  return {
    writeText: async (text) => {
      await Reflect.apply(writeTextValue, clipboardValue, [text])
    },
  }
}

const getConversationClipboard = (): ClipboardWriter | null =>
  typeof window === 'undefined' ? null : getClipboardWriter()

interface SavedTabsChatPanelProps {
  activeSystemPromptId: string
  chatErrorMessage: string
  chatOllamaError?: OllamaErrorDetails
  historyItems: AiChatHistoryItem[]
  historyVariant: 'dropdown' | 'none' | 'sidebar-toggle'
  input: string
  layout: {
    isCompactLayout: boolean
    isResizing: boolean
    mode: 'floating' | 'page'
    showCloseButton: boolean
    sidebarWidth: number
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

interface SavedTabsChatWidgetProps {
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

const renderSystemPromptSelector = ({
  isCompactLayout,
  prompts,
  selectedPromptId,
  t,
  onValueChange,
}: {
  isCompactLayout: boolean
  prompts: AiSystemPromptPreset[]
  selectedPromptId: string
  t: TranslateFn
  onValueChange: (value: string) => void
}) => {
  const activePrompt = getSelectedPrompt(prompts, selectedPromptId)
  if (!activePrompt) {
    return null
  }

  return (
    <PromptInputSelect
      key={selectedPromptId}
      value={activePrompt.id}
      onValueChange={onValueChange}
    >
      <PromptInputSelectTrigger
        aria-label={activePrompt.name || t('aiChat.systemPrompt.select')}
        className={cn(
          'h-8 w-[140px] shrink-0 justify-between rounded-md border border-border/70 bg-background px-2 text-xs shadow-none',
          isCompactLayout && 'w-[112px]',
        )}
      >
        <PromptInputSelectValue
          placeholder={t('aiChat.systemPrompt.placeholder')}
        />
      </PromptInputSelectTrigger>
      <PromptInputSelectContent>
        {prompts.length > 0 ? (
          prompts.map((prompt) => (
            <PromptInputSelectItem key={prompt.id} value={prompt.id}>
              {prompt.name}
            </PromptInputSelectItem>
          ))
        ) : (
          <PromptInputSelectItem
            disabled
            value={SYSTEM_PROMPT_SELECTOR_EMPTY_VALUE}
          >
            {t('aiChat.systemPrompt.empty')}
          </PromptInputSelectItem>
        )}
      </PromptInputSelectContent>
    </PromptInputSelect>
  )
}

const renderChatHistoryButton = ({
  label,
  onClick,
}: {
  label: string
  onClick?: () => void
}) => {
  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type='button'
            variant='ghost'
            size='icon'
            aria-label={label}
            onClick={onClick}
          >
            <History className='size-4' />
          </Button>
        </TooltipTrigger>
        <TooltipContent side='bottom'>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

const useChatHistoryDropdownView = ({
  historyItems,
  onDeleteHistoryItem,
  onSelectHistoryItem,
}: {
  historyItems: AiChatHistoryItem[]
  onDeleteHistoryItem?: (conversationId: string) => void
  onSelectHistoryItem?: (conversationId: string) => void
}) => {
  const { t } = useI18n()
  const [isOpen, setIsOpen] = useState(false)
  const [pendingDeleteHistoryItem, setPendingDeleteHistoryItem] =
    useState<AiChatHistoryItem | null>(null)

  const handleDialogOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setPendingDeleteHistoryItem(null)
    }
  }, [])

  const handleCancelDelete = useCallback(() => {
    setPendingDeleteHistoryItem(null)
  }, [])

  const handleConfirmDelete = useCallback(() => {
    if (!pendingDeleteHistoryItem) {
      return
    }

    onDeleteHistoryItem?.(pendingDeleteHistoryItem.id)
    setPendingDeleteHistoryItem(null)
  }, [onDeleteHistoryItem, pendingDeleteHistoryItem])

  return (
    <>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            type='button'
            variant='ghost'
            size='icon'
            aria-label={t('aiChat.historyTitle')}
          >
            <History className='size-4' />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align='start'
          className='w-72 gap-y-2 p-2'
          side='bottom'
        >
          <div className='px-2 py-1'>
            <p className='text-sm font-medium'>{t('aiChat.historyTitle')}</p>
            <p className='text-xs text-muted-foreground'>
              {t('aiChat.history.resumeHint')}
            </p>
          </div>

          <div className='max-h-80 gap-y-1 overflow-y-auto'>
            {historyItems.length > 0 ? (
              historyItems.map((historyItem) => (
                <SavedTabsChatHistoryItemCard
                  historyItem={historyItem}
                  isActive={historyItem.isActive}
                  key={historyItem.id}
                  onDeleteHistoryItem={onDeleteHistoryItem}
                  onSelectHistoryItem={onSelectHistoryItem}
                  setIsOpen={setIsOpen}
                  setPendingDeleteHistoryItem={setPendingDeleteHistoryItem}
                  t={t}
                />
              ))
            ) : (
              <div className='rounded-xl px-3 py-4 text-sm text-muted-foreground'>
                {t('aiChat.history.empty')}
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>

      <Dialog
        open={pendingDeleteHistoryItem !== null}
        onOpenChange={handleDialogOpenChange}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('aiChat.deleteTitle')}</DialogTitle>
            <DialogDescription>
              {t('aiChat.deleteDescription')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              onClick={handleCancelDelete}
            >
              {t('common.cancel')}
            </Button>
            <Button
              type='button'
              variant='destructive'
              onClick={handleConfirmDelete}
            >
              {t('common.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

const useChatSidebarHeaderView = ({
  activeSystemPromptId,
  historyItems,
  historyVariant,
  presentation,
  onClose,
  onCopyConversation,
  onDeleteHistoryItem,
  onOpenSystemPromptManager,
  onResetConversation,
  onSelectHistoryItem,
  onSelectSystemPrompt,
  onToggleHistory,
  systemPrompts,
  title,
  status,
}: {
  activeSystemPromptId: string
  historyItems: AiChatHistoryItem[]
  historyVariant: 'dropdown' | 'none' | 'sidebar-toggle'
  presentation: {
    isCompactLayout: boolean
    showCloseButton: boolean
  }
  onClose: () => void
  onCopyConversation: () => void
  onDeleteHistoryItem?: (conversationId: string) => void
  onOpenSystemPromptManager: () => void
  onResetConversation: () => void
  onSelectHistoryItem?: (conversationId: string) => void
  onSelectSystemPrompt: (promptId: string) => void
  onToggleHistory?: () => void
  status: {
    isConversationCopied: boolean
    isCopyDisabled: boolean
  }
  systemPrompts: AiSystemPromptPreset[]
  title: string
}) => {
  const { t } = useI18n()
  const { isCompactLayout, showCloseButton } = presentation
  const { isConversationCopied, isCopyDisabled } = status
  const chatHistoryDropdown = useChatHistoryDropdownView({
    historyItems,
    onDeleteHistoryItem,
    onSelectHistoryItem,
  })
  const historyButton = renderChatHistoryButton({
    label: t('aiChat.historyTitle'),
    onClick: onToggleHistory,
  })
  const systemPromptSelector = renderSystemPromptSelector({
    isCompactLayout,
    onValueChange: onSelectSystemPrompt,
    prompts: systemPrompts,
    selectedPromptId: activeSystemPromptId,
    t,
  })

  return (
    <CardHeader className='items-center border-b border-border p-4 text-center'>
      <div
        className={cn(
          'relative flex w-full items-center justify-between gap-2',
          isCompactLayout && 'min-h-10',
        )}
      >
        <div
          className='z-10 flex min-w-0 items-center gap-1'
          data-testid='ai-chat-header-left-controls'
        >
          {historyVariant === 'sidebar-toggle' ? historyButton : null}
          {historyVariant === 'dropdown' ? chatHistoryDropdown : null}
          <SavedTabsChatHeaderTooltipButton
            ariaLabel={t('aiChat.systemPrompt.openSettings')}
            onClick={onOpenSystemPromptManager}
            tooltipText={t('aiChat.systemPrompt.settingsTooltip')}
          >
            <Settings2 className='size-4' />
          </SavedTabsChatHeaderTooltipButton>
          {systemPromptSelector}
        </div>

        <CardTitle className='pointer-events-none absolute inset-x-0 flex items-center justify-center px-20 text-base'>
          <span className='truncate'>{title}</span>
        </CardTitle>

        <div className='z-10 flex items-center justify-end gap-1'>
          <SavedTabsChatHeaderTooltipButton
            ariaLabel={t('aiChat.copyConversation')}
            dataState={isConversationCopied ? 'copied' : 'idle'}
            disabled={isCopyDisabled}
            onClick={onCopyConversation}
            tooltipText={
              isConversationCopied
                ? t('aiChat.ollama.copied')
                : t('aiChat.copyConversation')
            }
          >
            {isConversationCopied ? (
              <Check className='size-4' />
            ) : (
              <Copy className='size-4' />
            )}
          </SavedTabsChatHeaderTooltipButton>
          <SavedTabsChatHeaderTooltipButton
            ariaLabel={t('aiChat.newConversation')}
            onClick={onResetConversation}
            tooltipText={t('aiChat.newConversation')}
          >
            <Plus className='size-4' />
          </SavedTabsChatHeaderTooltipButton>
          {showCloseButton ? (
            <Button
              type='button'
              variant='ghost'
              size='icon'
              aria-label={t('aiChat.close')}
              onClick={onClose}
            >
              <X className='size-4' />
            </Button>
          ) : null}
        </div>
      </div>
    </CardHeader>
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
    <Message className={cn(hasCharts && 'max-w-full')} from={message.role}>
      {messageSources.length > 0 ? (
        <Sources
          className='mb-0 rounded-md border border-border/70 bg-background/70 px-3 py-2 text-foreground'
          data-slot='sources'
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

const useChatPromptComposerView = ({
  // eslint-disable-line eslint/complexity
  input,
  presentation,
  modelName,
  modelOptions,
  onFetchModels,
  onInputChange,
  onSelectModel,
  onSubmit,
  platform,
  setupErrorMessage,
  setupOllamaError,
  status,
  t,
}: {
  input: string
  modelName?: string
  modelOptions: SavedTabsChatPanelProps['modelOptions']
  onFetchModels: () => void
  onInputChange: (value: string) => void
  onSelectModel: (modelName: string) => Promise<boolean>
  onSubmit: PromptInputProps['onSubmit']
  platform: OllamaErrorPlatform
  presentation: {
    isCompactLayout: boolean
  }
  setupErrorMessage: string
  setupOllamaError?: OllamaErrorDetails
  status: {
    isConfigured: boolean
    isLoadingModels: boolean
    isSavingModel: boolean
    isSubmitting: boolean
  }
  t: TranslateFn
}) => {
  const { isCompactLayout } = presentation
  const { isConfigured, isLoadingModels, isSavingModel, isSubmitting } = status
  const compactSubmitLabel = isSubmitting
    ? t('aiChat.sending')
    : t('aiChat.send')
  const isSubmitDisabled =
    !isConfigured || isSubmitting || isSavingModel || input.trim().length === 0
  const handleTextareaKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key !== 'Enter' || event.nativeEvent.isComposing) {
        return
      }

      if (event.ctrlKey || event.metaKey) {
        event.preventDefault()
        requestPromptSubmit(event.currentTarget)
        return
      }

      event.preventDefault()

      const textarea = event.currentTarget
      const selectionStart = textarea.selectionStart
      const selectionEnd = textarea.selectionEnd
      const { cursorPosition, nextValue } = insertLineBreakAtCursor({
        selectionEnd,
        selectionStart,
        value: input,
      })

      onInputChange(nextValue)

      window.requestAnimationFrame(() => {
        textarea.setSelectionRange(cursorPosition, cursorPosition)
      })
    },
    [input, onInputChange],
  )

  const handleError = useCallback(
    (error: {
      code: 'accept' | 'max_files' | 'max_file_size'
      message: string
    }) => {
      toast.error(getAttachmentInputErrorMessage(error, t))
    },
    [t],
  )

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      onInputChange(event.target.value)
    },
    [onInputChange],
  )

  const behavior = useMemo(
    () => ({ fetchOnOpen: true, hideFetchButton: true }),
    [],
  )

  const selectorStatus = useMemo(
    () => ({ isLoading: isLoadingModels, isSaving: isSavingModel }),
    [isLoadingModels, isSavingModel],
  )

  return (
    <PromptInput
      accept={getAiChatAttachmentInputAccept()}
      className='shrink-0'
      maxFiles={AI_CHAT_MAX_ATTACHMENTS}
      maxFileSize={AI_CHAT_MAX_ATTACHMENT_SIZE_BYTES}
      multiple
      onError={handleError}
      onSubmit={onSubmit}
    >
      <PromptInputTextarea
        aria-label={t('aiChat.inputLabel')}
        className={cn('min-h-16', isCompactLayout && 'min-h-24 text-sm')}
        value={input}
        onChange={handleChange}
        onKeyDown={handleTextareaKeyDown}
        disabled={!isConfigured || isSavingModel}
        placeholder={
          isConfigured
            ? t('aiChat.inputPlaceholder')
            : t('aiChat.inputPlaceholderSelectModel')
        }
      />
      <ChatPromptAttachments />
      <PromptInputFooter
        className={cn(
          'items-center justify-between gap-2 border-t border-border',
          isCompactLayout && 'flex-wrap',
        )}
      >
        <div
          className={cn(
            'flex min-w-0 flex-1 items-center gap-2',
            isCompactLayout && 'w-full flex-wrap',
          )}
        >
          <ChatPromptAttachmentButton />
          <OllamaModelSelector
            behavior={behavior}
            errorMessage={setupErrorMessage}
            layout={isCompactLayout ? 'compact' : 'default'}
            models={modelOptions}
            onFetchModels={onFetchModels}
            onSelectModel={onSelectModel}
            ollamaError={setupOllamaError}
            platform={platform}
            selectedModel={modelName}
            status={selectorStatus}
          />
        </div>
        <PromptInputSubmit
          className={cn(isCompactLayout && 'w-full')}
          disabled={isSubmitDisabled}
          size={isCompactLayout ? 'sm' : 'icon-sm'}
          {...(isCompactLayout
            ? {
                'aria-label': compactSubmitLabel,
              }
            : {})}
        >
          {isCompactLayout ? compactSubmitLabel : undefined}
        </PromptInputSubmit>
      </PromptInputFooter>
    </PromptInput>
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
  const chatSidebarHeader = useChatSidebarHeaderView({
    activeSystemPromptId,
    historyItems,
    historyVariant,
    onClose,
    onCopyConversation,
    onDeleteHistoryItem,
    onOpenSystemPromptManager,
    onResetConversation,
    onSelectHistoryItem,
    onSelectSystemPrompt,
    onToggleHistory,
    presentation: {
      isCompactLayout: layout.isCompactLayout,
      showCloseButton: layout.showCloseButton,
    },
    status: {
      isConversationCopied: status.isConversationCopied,
      isCopyDisabled: status.isCopyDisabled,
    },
    systemPrompts,
    title,
  })
  const chatPromptComposer = useChatPromptComposerView({
    input,
    modelName,
    modelOptions,
    onFetchModels,
    onInputChange,
    onSelectModel,
    onSubmit,
    platform,
    presentation: { isCompactLayout: layout.isCompactLayout },
    setupErrorMessage,
    setupOllamaError,
    status: {
      isConfigured: status.isConfigured,
      isLoadingModels: status.isLoadingModels,
      isSavingModel: status.isSavingModel,
      isSubmitting: status.isSubmitting,
    },
    t,
  })
  const { isCompactLayout, isResizing, mode, sidebarWidth } = layout
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
  const cardStyle = useMemo(
    () => (mode === 'page' ? undefined : { width: `${sidebarWidth}px` }),
    [mode, sidebarWidth],
  )

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
      {chatSidebarHeader}

      <CardContent
        className={cn(
          'flex min-h-0 flex-1 flex-col overflow-hidden',
          isCompactLayout ? 'gap-2 p-2' : 'gap-3 p-3',
        )}
      >
        <Conversation className='min-h-0 flex-1'>
          {messages.length === 0 && !isConfigured ? (
            <ConversationEmptyState
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

          {chatPromptComposer}
        </div>
      </CardContent>
    </Card>
  )

  if (mode === 'page') {
    return <div className='flex h-full min-h-0 flex-1'>{card}</div>
  }

  return (
    <div className='sticky top-0 z-50 flex h-screen max-w-[calc(100vw-24px)] shrink-0 self-start overflow-hidden overscroll-none'>
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
  const [isResizing, setIsResizing] = useState(false)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useReducer(
    (_state: ChatMessage[], nextMessages: ChatMessage[]) => nextMessages,
    initialMessages,
  )
  const [isConversationCopied, setIsConversationCopied] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [chatOllamaError, setChatOllamaError] = useState<
    OllamaErrorDetails | undefined
  >(undefined)
  const [modelOptions, setModelOptions] = useState<
    {
      label: string
      name: string
    }[]
  >([])
  const [isLoadingModels, setIsLoadingModels] = useState(false)
  const [isSavingModel, setIsSavingModel] = useState(false)
  const [setupErrorMessage, setSetupErrorMessage] = useState('')
  const [setupOllamaError, setSetupOllamaError] = useState<
    OllamaErrorDetails | undefined
  >(undefined)
  const [platform, setPlatform] = useState<OllamaErrorPlatform>('unknown')
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_CHAT_SIDEBAR_WIDTH)
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth)
  const activePortRef = useRef<{
    disconnect: () => void
  } | null>(null)
  const conversationGenerationRef = useRef(0)
  const ignoreNextDisconnectRef = useRef(false)
  const resizeCleanupRef = useRef<(() => void) | null>(null)
  const sidebarWidthRef = useRef(DEFAULT_CHAT_SIDEBAR_WIDTH)
  const conversationCopiedTimeoutRef = useRef<number | null>(null)
  const messagesRef = useRef<ChatMessage[]>(initialMessages)
  const syncedConversationIdRef = useRef<string | undefined>(conversationId)
  const isOpen = mode === 'page' || isFloatingOpen
  const releaseChatWidgetResources = useCallback(() => {
    resizeCleanupRef.current?.()
    resizeCleanupRef.current = null
    if (conversationCopiedTimeoutRef.current) {
      window.clearTimeout(conversationCopiedTimeoutRef.current)
      conversationCopiedTimeoutRef.current = null
    }
    activePortRef.current?.disconnect()
    activePortRef.current = null
  }, [])

  useEffect(() => {
    sidebarWidthRef.current = sidebarWidth
  }, [sidebarWidth])

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

    void getRuntimePlatform().then((nextPlatform) => {
      if (isMounted) {
        setPlatform(nextPlatform)
      }
    })

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    let isMounted = true

    const syncWidgetSettings = async () => {
      const nextSettings = await loadWidgetSettings()
      if (!isMounted) {
        return
      }

      setSettings(nextSettings)
      setSidebarWidth(loadSidebarWidth())
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

  useEffect(() => {
    const handleWindowResize = () => {
      setViewportWidth(window.innerWidth)
      setSidebarWidth((currentWidth) => clampSidebarWidth(currentWidth))
    }

    window.addEventListener('resize', handleWindowResize)

    return () => {
      window.removeEventListener('resize', handleWindowResize)
    }
  }, [])

  const resolvedSettings = getResolvedSettings(settings)
  const activeSystemPrompt = getActiveAiSystemPrompt(resolvedSettings)
  const isConfigured = isAiChatConfigured(resolvedSettings)
  const TABLET_BREAKPOINT = 768
  const SIDEBAR_COMPACT_BREAKPOINT = 360

  const isCompactLayout =
    mode === 'page'
      ? viewportWidth < TABLET_BREAKPOINT
      : sidebarWidth <= SIDEBAR_COMPACT_BREAKPOINT
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

  const stopResize = () => {
    resizeCleanupRef.current?.()
    resizeCleanupRef.current = null
  }
  const handleResizeStart = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    stopResize()
    setIsResizing(true)

    const previousBodyStyle = document.body.style.cssText
    const handlePointerMove = (moveEvent: PointerEvent) => {
      const nextWidth = clampSidebarWidth(window.innerWidth - moveEvent.clientX)
      sidebarWidthRef.current = nextWidth
      setSidebarWidth(nextWidth)
    }
    const handlePointerUp = () => {
      persistSidebarWidth(sidebarWidthRef.current)
      setIsResizing(false)
      stopResize()
    }

    document.body.style.cssText = `${previousBodyStyle}; cursor: col-resize; user-select: none;`
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)

    resizeCleanupRef.current = () => {
      document.body.style.cssText = previousBodyStyle
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }

  const handleFetchModels = async () => {
    setIsLoadingModels(true)
    setSetupErrorMessage('')
    setSetupOllamaError(undefined)

    const response = await requestOllamaModels()

    if (response?.status !== 'ok' || !response.models) {
      setModelOptions([])
      setSetupErrorMessage(response?.error || t('aiChat.modelListLoadError')) // eslint-disable-line typescript/prefer-nullish-coalescing -- empty error should show default message
      setSetupOllamaError(response?.ollamaError)
      setIsLoadingModels(false)
      return
    }

    setModelOptions(
      response.models.map((model) => ({
        label: model.label,
        name: model.name,
      })),
    )
    setSetupOllamaError(undefined)
    setIsLoadingModels(false)
  }

  const handleSelectModel = async (modelName: string): Promise<boolean> => {
    const nextSettings = normalizeAiSystemPromptSettings({
      ...resolvedSettings,
      ollamaModel: modelName,
    })

    setIsSavingModel(true)
    setSetupErrorMessage('')
    setSetupOllamaError(undefined)

    try {
      await saveUserSettings(nextSettings)
      setSettings(nextSettings)
      return true
    } catch {
      setSetupErrorMessage(t('aiChat.modelSettingsSaveError'))
      return false
    } finally {
      setIsSavingModel(false)
    }
  }

  const handleResetConversation = () => {
    if (conversationCopiedTimeoutRef.current) {
      window.clearTimeout(conversationCopiedTimeoutRef.current)
      conversationCopiedTimeoutRef.current = null
    }
    conversationGenerationRef.current += 1
    disconnectActivePort(true)
    setMessagesState([])
    setIsConversationCopied(false)
    setInput('')
    setErrorMessage('')
    setChatOllamaError(undefined)
    setIsSubmitting(false)
  }

  const handleConversationAction = () => {
    if (onCreateConversation) {
      onCreateConversation()
      return
    }

    handleResetConversation()
  }

  const handleCopyConversation = async () => {
    const conversationCopyText = getConversationCopyText(messages, t)
    if (!conversationCopyText) {
      return
    }

    const clipboard = getConversationClipboard()
    if (!clipboard) {
      toast.error(t('aiChat.copyConversationError'))
      return
    }

    try {
      await clipboard.writeText(conversationCopyText)
      if (conversationCopiedTimeoutRef.current) {
        window.clearTimeout(conversationCopiedTimeoutRef.current)
      }
      setIsConversationCopied(true)
      toast.success(t('aiChat.copyConversationSuccess'))
      conversationCopiedTimeoutRef.current = window.setTimeout(() => {
        setIsConversationCopied(false)
        conversationCopiedTimeoutRef.current = null
      }, COPIED_CONVERSATION_ICON_TIMEOUT)
    } catch {
      toast.error(t('aiChat.copyConversationError'))
    }
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
      isCompactLayout,
      isResizing,
      mode,
      showCloseButton: mode === 'floating',
      sidebarWidth,
    },
    messages,
    modelName: resolvedSettings.ollamaModel,
    modelOptions,
    onClose: () => {
      setIsFloatingOpen(false)
      onOpenChange?.(false)
    },
    onCopyConversation: () => {
      void handleCopyConversation()
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
