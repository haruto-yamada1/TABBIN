import {
  Check,
  ChevronDown,
  Copy,
  History,
  MessageCircleMore,
  Plus,
  Settings2,
  Trash2,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'
import { toast } from 'sonner'

import {
  Attachment,
  AttachmentInfo,
  AttachmentPreview,
  Attachments,
} from '@/components/ai-elements/attachments'
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
import type {
  PromptInputMessage,
  PromptInputProps,
} from '@/components/ai-elements/prompt-input'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Textarea } from '@/components/ui/textarea'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { AI_CHAT_TOOL_DEFINITIONS } from '@/constants/aiChatTools'
import { AiChartRenderer } from '@/features/ai-chat/components/AiChartRenderer'
import { ChatPromptAttachmentButton } from '@/features/ai-chat/components/ChatPromptAttachmentButton'
import { ChatPromptAttachments } from '@/features/ai-chat/components/ChatPromptAttachments'
import { OllamaErrorNotice } from '@/features/ai-chat/components/OllamaErrorNotice'
import type { OllamaErrorPlatform } from '@/features/ai-chat/components/OllamaErrorNotice'
import { OllamaModelSelector } from '@/features/ai-chat/components/OllamaModelSelector'
import {
  AI_CHAT_MAX_ATTACHMENTS,
  AI_CHAT_MAX_ATTACHMENT_SIZE_BYTES,
  convertPromptInputFilesToAiChatAttachments,
  getAiChatAttachmentInputAccept,
} from '@/features/ai-chat/lib/attachments'
import {
  MAX_AI_SYSTEM_PROMPT_NAME_LENGTH,
  MAX_AI_SYSTEM_PROMPT_PRESETS,
  createAiSystemPromptPreset,
  getActiveAiSystemPrompt,
  normalizeAiSystemPromptSettings,
} from '@/features/ai-chat/lib/systemPromptPresets'
import type {
  AiChatAttachment,
  AiChatConversationMessage,
  AiChatHistoryItem,
} from '@/features/ai-chat/types'
import { useI18n } from '@/features/i18n/context/I18nProvider'
import {
  getChromeStorageOnChanged,
  warnMissingChromeStorage,
} from '@/lib/browser/chrome-storage'
import { connectRuntimePort, sendRuntimeMessage } from '@/lib/browser/runtime'
import {
  defaultSettings,
  getUserSettings,
  saveUserSettings,
} from '@/lib/storage/settings'
import { cn } from '@/lib/utils'
import type {
  AiChatResponse,
  AiChatStreamServerMessage,
  AiChatToolTrace,
  OllamaErrorDetails,
  OllamaModelListResponse,
} from '@/types/background'
import { AI_CHAT_STREAM_PORT_NAME } from '@/types/background'
import type { AiSystemPromptPreset, UserSettings } from '@/types/storage'

type ChatMessage = AiChatConversationMessage

interface ChatMessageSource {
  title: string
  url: string
}

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

interface SystemPromptManagerDialogProps {
  activePromptId: string
  errorMessage: string
  isOpen: boolean
  isSaveDisabled: boolean
  isSaving: boolean
  presets: AiSystemPromptPreset[]
  selectedPromptId: string
  onCancel: () => void
  onChangePromptName: (value: string) => void
  onChangePromptTemplate: (value: string) => void
  onCloseChange: (isOpen: boolean) => void
  onCreatePrompt: () => void
  onDeletePrompt: () => void
  onDuplicatePrompt: () => void
  onSave: () => Promise<void>
  onSelectPrompt: (promptId: string) => void
}

type TranslateFn = (
  key: string,
  fallback?: string,
  values?: Record<string, string>,
) => string

const CHAT_SIDEBAR_STORAGE_KEY = 'tabbin-ai-chat-sidebar-width'
const DEFAULT_CHAT_SIDEBAR_WIDTH = 420
const MIN_CHAT_SIDEBAR_WIDTH = 320
const MAX_CHAT_SIDEBAR_WIDTH = 720
const CHAT_SIDEBAR_VIEWPORT_GUTTER = 48
const COPIED_CONVERSATION_ICON_TIMEOUT = 2000
const SYSTEM_PROMPT_SELECTOR_EMPTY_VALUE = '__no-system-prompt__'
const EMPTY_CHAT_MESSAGES: ChatMessage[] = []
const EMPTY_HISTORY_ITEMS: AiChatHistoryItem[] = []
const EMPTY_TOOL_TRACES: AiChatToolTrace[] = []

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

const createMessageId = (): string =>
  `${Date.now()}-${Math.random().toString(16).slice(2)}`

const createSystemPromptId = (): string =>
  `system-prompt-${Date.now()}-${Math.random().toString(16).slice(2)}`

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

const createChatMessage = (
  role: ChatMessage['role'],
  content: string,
  metadata?: Pick<
    ChatMessage,
    'attachments' | 'charts' | 'isStreaming' | 'reasoning' | 'toolTraces'
  >,
): ChatMessage => ({
  attachments: metadata?.attachments,
  charts: metadata?.charts,
  content,
  id: createMessageId(),
  isStreaming: metadata?.isStreaming,
  reasoning: metadata?.reasoning,
  role,
  toolTraces: metadata?.toolTraces,
})

const getBaseSettings = (settings: UserSettings | null): UserSettings => ({
  ...defaultSettings,
  ...settings,
})

const getResolvedSettings = (settings: UserSettings | null): UserSettings =>
  normalizeAiSystemPromptSettings(getBaseSettings(settings))

const clampPromptName = (value: string): string =>
  value.trim().slice(0, MAX_AI_SYSTEM_PROMPT_NAME_LENGTH)

const buildPromptNameCandidate = (
  baseName: string,
  t: TranslateFn,
  suffix = '',
): string => {
  const normalizedBaseName =
    clampPromptName(baseName) || t('aiChat.systemPrompt.new')
  if (!suffix) {
    return normalizedBaseName
  }

  const truncatedBaseName = normalizedBaseName
    .slice(0, Math.max(0, MAX_AI_SYSTEM_PROMPT_NAME_LENGTH - suffix.length))
    .trimEnd()

  return `${truncatedBaseName}${suffix}`.trim()
}

const getUniquePromptName = (
  presets: AiSystemPromptPreset[],
  baseName: string,
  t: TranslateFn,
  initialSuffix = '',
): string => {
  const normalizedBaseName =
    clampPromptName(baseName) || t('aiChat.systemPrompt.new')
  const existingNames = new Set(presets.map((preset) => preset.name.trim()))
  const initialCandidateName = buildPromptNameCandidate(
    normalizedBaseName,
    t,
    initialSuffix,
  )

  if (!existingNames.has(initialCandidateName)) {
    return initialCandidateName
  }

  for (let index = 2; index <= MAX_AI_SYSTEM_PROMPT_PRESETS + 1; index += 1) {
    const candidateName = buildPromptNameCandidate(
      normalizedBaseName,
      t,
      initialSuffix ? `${initialSuffix} ${index}` : ` ${index}`,
    )
    if (!existingNames.has(candidateName)) {
      return candidateName
    }
  }

  return buildPromptNameCandidate(normalizedBaseName, t, ` ${Date.now()}`)
}

const getSelectedPrompt = (
  presets: AiSystemPromptPreset[],
  selectedPromptId: string,
): AiSystemPromptPreset | undefined =>
  presets.find((prompt) => prompt.id === selectedPromptId)

const getPromptManagerValidationError = (
  presets: AiSystemPromptPreset[],
  t: TranslateFn,
): string => {
  const trimmedPresets = presets.map((prompt) => ({
    name: prompt.name.trim(),
    template: prompt.template.trim(),
  }))

  if (
    trimmedPresets.some(
      (prompt) => prompt.name.length === 0 || prompt.template.length === 0,
    )
  ) {
    return t('aiChat.systemPrompt.validation.empty')
  }

  if (
    trimmedPresets.some(
      (prompt) => prompt.name.length > MAX_AI_SYSTEM_PROMPT_NAME_LENGTH,
    )
  ) {
    return t('aiChat.systemPrompt.validation.maxLength', undefined, {
      count: String(MAX_AI_SYSTEM_PROMPT_NAME_LENGTH),
    })
  }

  const duplicateNames = new Set<string>()
  const seenNames = new Set<string>()

  for (const prompt of trimmedPresets) {
    if (seenNames.has(prompt.name)) {
      duplicateNames.add(prompt.name)
      continue
    }

    seenNames.add(prompt.name)
  }

  if (duplicateNames.size > 0) {
    return t('aiChat.systemPrompt.validation.duplicate')
  }

  return ''
}

const loadWidgetSettings = async (): Promise<UserSettings | null> => {
  try {
    return await getUserSettings()
  } catch {
    return null
  }
}

const isAiChatConfigured = (settings: UserSettings | null): boolean =>
  Boolean(settings?.ollamaModel)

const getAiChatErrorMessage = (
  response: AiChatResponse | undefined,
  t: TranslateFn,
): string => response?.error || t('aiChat.responseError')

const getAiChatOllamaError = (
  response: AiChatResponse | undefined,
): OllamaErrorDetails | undefined => response?.ollamaError

const getRuntimePlatform = async (): Promise<OllamaErrorPlatform> => {
  if (!chrome?.runtime?.getPlatformInfo) {
    return 'unknown'
  }

  try {
    const platformInfo = await new Promise<chrome.runtime.PlatformInfo | null>(
      (resolve) => {
        chrome.runtime.getPlatformInfo((info) => {
          resolve(info ?? null)
        })
      },
    )

    return platformInfo?.os === 'mac' || platformInfo?.os === 'win'
      ? platformInfo.os
      : 'unknown'
  } catch {
    return 'unknown'
  }
}

const getAttachmentInputErrorMessage = (
  error: {
    code: 'accept' | 'max_file_size' | 'max_files'
    message: string
  },
  t: TranslateFn,
) => {
  switch (error.code) {
    case 'accept': {
      return t('aiChat.attachments.unsupportedType')
    }
    case 'max_file_size': {
      return t('aiChat.attachments.maxFileSize')
    }
    case 'max_files': {
      return t('aiChat.attachments.maxFiles', undefined, {
        count: String(AI_CHAT_MAX_ATTACHMENTS),
      })
    }
    default: {
      return error.message
    }
  }
}

const requestAssistantAnswer = async (
  history: Pick<ChatMessage, 'attachments' | 'content' | 'role'>[],
  prompt: string,
  attachments: AiChatAttachment[] = [],
): Promise<AiChatResponse | undefined> =>
  (await sendRuntimeMessage({
    action: 'runAiChat',
    history,
    prompt,
    ...(attachments.length > 0 ? { attachments } : {}),
  })) as AiChatResponse | undefined

const requestOllamaModels = async (): Promise<
  OllamaModelListResponse | undefined
> =>
  (await sendRuntimeMessage({
    action: 'listOllamaModels',
  })) as OllamaModelListResponse | undefined

const createInitialStreamingReasoning = (
  prompt: string,
  t: TranslateFn,
): string =>
  [
    t('aiChat.streaming.receivedQuestion', undefined, { prompt }),
    t('aiChat.streaming.checkingTabs'),
    t('aiChat.streaming.toolsFollow'),
  ].join('\n')

const getConversationCopyText = (
  messages: ChatMessage[],
  t: TranslateFn,
): string =>
  messages
    .reduce<string[]>((items, message) => {
      if (message.content.trim().length === 0) {
        return items
      }
      items.push(
        [
          message.role === 'user'
            ? t('aiChat.copy.user')
            : t('aiChat.copy.assistant'),
          message.attachments?.length
            ? `${t('aiChat.copy.attachments')} ${message.attachments
                .map((attachment) => attachment.filename)
                .join(', ')}`
            : '',
          message.content.trim(),
        ]
          .filter(Boolean)
          .join('\n'),
      )
      return items
    }, [])
    .join('\n\n')

const areMessagesEquivalent = (
  left: ChatMessage[],
  right: ChatMessage[],
): boolean => JSON.stringify(left) === JSON.stringify(right)

const getSourceItems = (output: unknown): ChatMessageSource[] => {
  let items: unknown[] = []

  if (Array.isArray(output)) {
    items = output
  } else if (
    output &&
    typeof output === 'object' &&
    Array.isArray((output as { items?: unknown[] }).items)
  ) {
    ;({ items } = output as { items: unknown[] })
  }

  return items.flatMap((item) => {
    if (!item || typeof item !== 'object') {
      return []
    }

    const { url } = item as { url?: unknown }
    if (typeof url !== 'string' || url.length === 0) {
      return []
    }

    const { title } = item as { title?: unknown }

    return [
      {
        title:
          typeof title === 'string' && title.trim().length > 0
            ? title.trim()
            : url,
        url,
      },
    ]
  })
}

const getMessageSources = (
  toolTraces: AiChatToolTrace[] = [],
): ChatMessageSource[] => {
  const seenUrls = new Set<string>()

  return toolTraces.flatMap((toolTrace) =>
    getSourceItems(toolTrace.output).filter((source) => {
      if (seenUrls.has(source.url)) {
        return false
      }

      seenUrls.add(source.url)
      return true
    }),
  )
}

const requestPromptSubmit = (textarea: HTMLTextAreaElement) => {
  const { form } = textarea
  const submitButton = form?.querySelector(
    'button[type="submit"]',
  ) as HTMLButtonElement | null

  if (submitButton?.disabled) {
    return
  }

  form?.requestSubmit()
}

const insertLineBreakAtCursor = ({
  selectionEnd,
  selectionStart,
  value,
}: {
  selectionEnd: number
  selectionStart: number
  value: string
}) => ({
  cursorPosition: selectionStart + 1,
  nextValue: `${value.slice(0, selectionStart)}\n${value.slice(selectionEnd)}`,
})

const AssistantMessageDiagnostics = ({
  isStreaming,
  reasoning,
  toolTraces = EMPTY_TOOL_TRACES,
}: Pick<ChatMessage, 'isStreaming' | 'reasoning' | 'toolTraces'>) => {
  const { t } = useI18n()

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
          <ReasoningTrigger
            getThinkingMessage={() =>
              `${t('aiChat.reasoning')}${
                toolTraces.length > 0 ? ` / ${toolTraces.length}` : ''
              }`
            }
          />
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
  const activePrompt =
    getSelectedPrompt(prompts, selectedPromptId) ?? prompts[0] ?? null

  return (
    <PromptInputSelect
      key={selectedPromptId}
      value={activePrompt?.id}
      onValueChange={onValueChange}
    >
      <PromptInputSelectTrigger
        aria-label={activePrompt?.name || t('aiChat.systemPrompt.select')}
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

const useSystemPromptManagerDialogView = ({
  activePromptId,
  errorMessage,
  isOpen,
  isSaveDisabled,
  isSaving,
  presets,
  selectedPromptId,
  onCancel,
  onChangePromptName,
  onChangePromptTemplate,
  onCloseChange,
  onCreatePrompt,
  onDeletePrompt,
  onDuplicatePrompt,
  onSave,
  onSelectPrompt,
}: SystemPromptManagerDialogProps) => {
  const { t } = useI18n()
  const selectedPrompt = getSelectedPrompt(presets, selectedPromptId)
  const isLimitReached = presets.length >= MAX_AI_SYSTEM_PROMPT_PRESETS
  const isDeleteDisabled = presets.length <= 1

  return (
    <Dialog open={isOpen} onOpenChange={onCloseChange}>
      <DialogContent
        aria-describedby={undefined}
        className='flex h-[calc(100vh-48px)] max-h-none w-[calc(100vw-48px)] max-w-none flex-col gap-0 overflow-hidden p-0'
      >
        <DialogHeader className='border-b border-border px-6 py-4 text-left'>
          <DialogTitle>{t('aiChat.systemPrompt.managerTitle')}</DialogTitle>
        </DialogHeader>

        <div className='grid min-h-0 flex-1 grid-cols-[280px_minmax(0,1fr)] overflow-hidden'>
          <div className='flex min-h-0 flex-col border-r border-border'>
            <div className='border-b border-border p-4'>
              <div className='mb-3 flex items-center justify-between gap-2'>
                <p className='text-sm font-medium'>
                  {t('aiChat.systemPrompt.listTitle')}
                </p>
                <span className='text-xs text-muted-foreground'>
                  {presets.length} / {MAX_AI_SYSTEM_PROMPT_PRESETS}
                </span>
              </div>
              <div className='grid gap-2'>
                <Button
                  type='button'
                  variant='secondary'
                  size='sm'
                  disabled={isLimitReached}
                  onClick={onCreatePrompt}
                >
                  <Plus className='size-4' />
                  {t('aiChat.systemPrompt.new')}
                </Button>
              </div>
            </div>

            <div className='min-h-0 flex-1 overflow-y-auto p-3'>
              <div className='grid gap-2'>
                {presets.map((prompt) => (
                  <Button
                    className={cn(
                      'cursor-pointer overflow-hidden rounded-md border p-3 text-left transition-colors',
                      prompt.id === selectedPromptId
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-border/80 hover:bg-muted/30',
                    )}
                    onClick={() => {
                      onSelectPrompt(prompt.id)
                    }}
                    key={prompt.id}
                    type='button'
                    variant='ghost'
                  >
                    <div className='flex min-w-0 items-center justify-between gap-2'>
                      <p className='min-w-0 flex-1 truncate text-sm font-medium'>
                        {prompt.name}
                      </p>
                      {prompt.id === activePromptId ? (
                        <span className='shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground'>
                          {t('aiChat.systemPrompt.inUse')}
                        </span>
                      ) : null}
                    </div>
                  </Button>
                ))}
              </div>
            </div>
          </div>

          <div className='flex min-h-0 flex-col'>
            <div className='min-h-0 flex-1 overflow-y-auto px-6 py-5'>
              {selectedPrompt ? (
                <div className='gap-y-5'>
                  <div className='gap-y-2'>
                    <Label htmlFor='system-prompt-name'>
                      {t('aiChat.systemPrompt.nameLabel')}
                    </Label>
                    <div
                      className='flex items-start gap-2'
                      data-testid='system-prompt-name-row'
                    >
                      <Input
                        id='system-prompt-name'
                        aria-label={t('aiChat.systemPrompt.nameLabel')}
                        className='flex-1'
                        maxLength={MAX_AI_SYSTEM_PROMPT_NAME_LENGTH}
                        value={selectedPrompt.name}
                        onChange={(event) => {
                          onChangePromptName(event.target.value)
                        }}
                      />
                      <Button
                        type='button'
                        variant='outline'
                        size='sm'
                        disabled={isLimitReached}
                        onClick={onDuplicatePrompt}
                      >
                        <Copy className='size-4' />
                        {t('aiChat.systemPrompt.duplicate')}
                      </Button>
                      <Button
                        type='button'
                        variant='secondary'
                        size='sm'
                        disabled={isDeleteDisabled}
                        onClick={onDeletePrompt}
                      >
                        <Trash2 className='size-4' />
                        {t('common.delete')}
                      </Button>
                    </div>
                  </div>

                  <div className='gap-y-2'>
                    <Label htmlFor='system-prompt-template'>
                      {t('aiChat.systemPrompt.bodyLabel')}
                    </Label>
                    <Textarea
                      id='system-prompt-template'
                      aria-label={t('aiChat.systemPrompt.bodyLabel')}
                      className='min-h-[420px] resize-y'
                      value={selectedPrompt.template}
                      onChange={(event) => {
                        onChangePromptTemplate(event.target.value)
                      }}
                    />
                  </div>

                  <div className='gap-y-3'>
                    <div className='gap-y-1'>
                      <p className='text-sm font-medium'>
                        {t('aiChat.systemPrompt.availableTools')}
                      </p>
                      <p className='text-xs text-muted-foreground'>
                        {t('aiChat.systemPrompt.availableToolsDescription')}
                      </p>
                    </div>
                    <div className='grid gap-2 xl:grid-cols-2'>
                      {AI_CHAT_TOOL_DEFINITIONS.map((toolDefinition) => (
                        <div
                          className='rounded-md border border-border/70 bg-muted/20 p-3'
                          key={toolDefinition.name}
                        >
                          <p className='font-mono text-xs'>
                            {toolDefinition.name}
                          </p>
                          <p className='mt-2 text-sm text-muted-foreground'>
                            {toolDefinition.description}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {errorMessage ? (
                    <p className='text-sm whitespace-pre-line text-destructive'>
                      {errorMessage}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>

            <DialogFooter className='border-t border-border px-6 py-4'>
              <Button
                type='button'
                variant='outline'
                disabled={isSaving}
                onClick={onCancel}
              >
                {t('common.cancel')}
              </Button>
              <Button
                type='button'
                disabled={isSaveDisabled}
                onClick={() => void onSave()}
              >
                {isSaving
                  ? t('aiChat.systemPrompt.saving')
                  : t('aiChat.systemPrompt.save')}
              </Button>
            </DialogFooter>
          </div>
        </div>
      </DialogContent>
    </Dialog>
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
                <div
                  key={historyItem.id}
                  className={cn(
                    'rounded-xl border px-3 py-2.5 transition',
                    historyItem.isActive
                      ? 'border-border bg-muted/50'
                      : 'border-transparent hover:bg-muted/40',
                  )}
                >
                  <div className='grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-2'>
                    <Button
                      className='h-auto w-full min-w-0 flex-col items-start justify-start overflow-hidden px-0 text-left whitespace-normal hover:bg-transparent'
                      onClick={() => {
                        onSelectHistoryItem?.(historyItem.id)
                        setIsOpen(false)
                      }}
                      type='button'
                      variant='ghost'
                    >
                      <p className='w-full min-w-0 truncate text-sm font-medium'>
                        {historyItem.title}
                      </p>
                      <p className='mt-1 line-clamp-2 w-full min-w-0 overflow-hidden text-xs leading-5 wrap-anywhere text-muted-foreground'>
                        {historyItem.preview}
                      </p>
                    </Button>
                    {onDeleteHistoryItem ? (
                      <Button
                        type='button'
                        variant='ghost'
                        size='icon-sm'
                        aria-label={t(
                          'aiChat.deleteConversationAria',
                          undefined,
                          { title: historyItem.title },
                        )}
                        className='shrink-0 justify-self-end text-muted-foreground hover:text-destructive'
                        onClick={(event) => {
                          event.stopPropagation()
                          setIsOpen(false)
                          setPendingDeleteHistoryItem(historyItem)
                        }}
                      >
                        <Trash2 className='size-4' />
                      </Button>
                    ) : null}
                  </div>
                </div>
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
        onOpenChange={(open) => {
          if (!open) {
            setPendingDeleteHistoryItem(null)
          }
        }}
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
              onClick={() => {
                setPendingDeleteHistoryItem(null)
              }}
            >
              {t('common.cancel')}
            </Button>
            <Button
              type='button'
              variant='destructive'
              onClick={() => {
                if (!pendingDeleteHistoryItem) {
                  return
                }

                onDeleteHistoryItem?.(pendingDeleteHistoryItem.id)
                setPendingDeleteHistoryItem(null)
              }}
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
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type='button'
                  variant='ghost'
                  size='icon'
                  aria-label={t('aiChat.systemPrompt.openSettings')}
                  onClick={onOpenSystemPromptManager}
                >
                  <Settings2 className='size-4' />
                </Button>
              </TooltipTrigger>
              <TooltipContent side='bottom'>
                {t('aiChat.systemPrompt.settingsTooltip')}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          {systemPromptSelector}
        </div>

        <CardTitle className='pointer-events-none absolute inset-x-0 flex items-center justify-center px-20 text-base'>
          <span className='truncate'>{title}</span>
        </CardTitle>

        <div className='z-10 flex items-center justify-end gap-1'>
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type='button'
                  variant='ghost'
                  size='icon'
                  aria-label={t('aiChat.copyConversation')}
                  data-state={isConversationCopied ? 'copied' : 'idle'}
                  disabled={isCopyDisabled}
                  onClick={onCopyConversation}
                >
                  {isConversationCopied ? (
                    <Check className='size-4' />
                  ) : (
                    <Copy className='size-4' />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side='bottom'>
                {isConversationCopied
                  ? t('aiChat.ollama.copied')
                  : t('aiChat.copyConversation')}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type='button'
                  variant='ghost'
                  size='icon'
                  aria-label={t('aiChat.newConversation')}
                  onClick={onResetConversation}
                >
                  <Plus className='size-4' />
                </Button>
              </TooltipTrigger>
              <TooltipContent side='bottom'>
                {t('aiChat.newConversation')}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
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

const getAttachmentId = (attachment: AiChatAttachment) =>
  [
    attachment.filename,
    attachment.mediaType,
    attachment.kind,
    attachment.content.length,
    attachment.content.slice(0, 32),
  ].join('-')

const renderChatMessageAttachments = ({
  attachments,
}: {
  attachments: AiChatAttachment[]
}) => {
  return (
    <Attachments className='mb-2 w-full' variant='inline'>
      {attachments.map((attachment) => (
        <Attachment
          data={{
            filename: attachment.filename,
            id: getAttachmentId(attachment),
            mediaType: attachment.mediaType,
            type: 'file',
            url: attachment.kind === 'image' ? attachment.content : '',
          }}
          key={getAttachmentId(attachment)}
        >
          <AttachmentPreview />
          <AttachmentInfo />
        </Attachment>
      ))}
    </Attachments>
  )
}

const getSourcesLabel = ({
  count,
  t,
}: {
  count: number
  t: (key: string, fallback?: string, values?: Record<string, string>) => string
}) =>
  t(count === 1 ? 'aiChat.sources.one' : 'aiChat.sources.other', undefined, {
    count: String(count),
  })

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
  const handleTextareaKeyDown = (
    event: ReactKeyboardEvent<HTMLTextAreaElement>,
  ) => {
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
    const selectionStart = textarea.selectionStart ?? input.length
    const selectionEnd = textarea.selectionEnd ?? selectionStart
    const { cursorPosition, nextValue } = insertLineBreakAtCursor({
      selectionEnd,
      selectionStart,
      value: input,
    })

    onInputChange(nextValue)

    window.requestAnimationFrame(() => {
      textarea.setSelectionRange(cursorPosition, cursorPosition)
    })
  }

  return (
    <PromptInput
      accept={getAiChatAttachmentInputAccept()}
      className='shrink-0'
      maxFiles={AI_CHAT_MAX_ATTACHMENTS}
      maxFileSize={AI_CHAT_MAX_ATTACHMENT_SIZE_BYTES}
      multiple
      onError={(error) => {
        toast.error(getAttachmentInputErrorMessage(error, t))
      }}
      onSubmit={onSubmit}
    >
      <PromptInputTextarea
        aria-label={t('aiChat.inputLabel')}
        className={cn('min-h-16', isCompactLayout && 'min-h-24 text-sm')}
        value={input}
        onChange={(event) => {
          onInputChange(event.target.value)
        }}
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
            behavior={{
              fetchOnOpen: true,
              hideFetchButton: true,
            }}
            errorMessage={setupErrorMessage}
            layout={isCompactLayout ? 'compact' : 'default'}
            models={modelOptions}
            onFetchModels={onFetchModels}
            onSelectModel={onSelectModel}
            ollamaError={setupOllamaError}
            platform={platform}
            selectedModel={modelName}
            status={{
              isLoading: isLoadingModels,
              isSaving: isSavingModel,
            }}
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

  const cardClassName =
    mode === 'page'
      ? 'flex h-full min-h-0 flex-1 flex-col rounded-[1.5rem] border-border shadow-lg'
      : 'flex h-full min-h-0 flex-col rounded-none border-border border-y-0 border-r-0 border-l shadow-2xl'

  const cardStyle = mode === 'page' ? undefined : { width: `${sidebarWidth}px` }

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
        <div className='absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border/80' />
      </Button>

      {card}
    </div>
  )
}

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
  const [isPromptManagerOpen, setIsPromptManagerOpen] = useState(false)
  const [promptDrafts, setPromptDrafts] = useState<AiSystemPromptPreset[]>([])
  const [selectedPromptIdInModal, setSelectedPromptIdInModal] = useState('')
  const [draftActivePromptId, setDraftActivePromptId] = useState('')
  const [promptManagerError, setPromptManagerError] = useState('')
  const [isSavingPrompts, setIsSavingPrompts] = useState(false)
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
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string,
    ) => {
      if (areaName !== 'local' || !changes.userSettings) {
        return
      }

      setSettings(
        (changes.userSettings.newValue as UserSettings) ?? defaultSettings,
      )
    }

    const storageOnChanged = getChromeStorageOnChanged()
    if (!storageOnChanged) {
      warnMissingChromeStorage('AI chat settings change watcher')
      return
    }

    storageOnChanged.addListener(storageChangeListener)

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
  const isCompactLayout =
    mode === 'page' ? viewportWidth < 768 : sidebarWidth <= 360
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
      setSetupErrorMessage(response?.error || t('aiChat.modelListLoadError'))
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

    if (typeof window === 'undefined' || !navigator?.clipboard?.writeText) {
      toast.error(t('aiChat.copyConversationError'))
      return
    }

    try {
      await navigator.clipboard.writeText(conversationCopyText)
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

  const handleOpenSystemPromptManager = () => {
    setPromptDrafts(resolvedSettings.aiSystemPrompts ?? [])
    setSelectedPromptIdInModal(activeSystemPrompt.id)
    setDraftActivePromptId(resolvedSettings.activeAiSystemPromptId ?? '')
    setPromptManagerError('')
    setIsPromptManagerOpen(true)
  }

  const handleCancelSystemPromptManager = () => {
    setIsPromptManagerOpen(false)
    setPromptManagerError('')
    setPromptDrafts([])
    setSelectedPromptIdInModal('')
    setDraftActivePromptId('')
  }

  const handlePromptManagerOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      handleOpenSystemPromptManager()
      return
    }

    handleCancelSystemPromptManager()
  }

  const updateSelectedPromptDraft = (
    update: (prompt: AiSystemPromptPreset) => AiSystemPromptPreset,
  ) => {
    setPromptManagerError('')
    setPromptDrafts((currentPrompts) =>
      currentPrompts.map((prompt) =>
        prompt.id === selectedPromptIdInModal ? update(prompt) : prompt,
      ),
    )
  }

  const handleChangePromptName = (value: string) => {
    updateSelectedPromptDraft((prompt) => ({
      ...prompt,
      name: value,
      updatedAt: Date.now(),
    }))
  }

  const handleChangePromptTemplate = (value: string) => {
    updateSelectedPromptDraft((prompt) => ({
      ...prompt,
      template: value,
      updatedAt: Date.now(),
    }))
  }

  const handleCreatePrompt = () => {
    setPromptManagerError('')
    setPromptDrafts((currentPrompts) => {
      if (currentPrompts.length >= MAX_AI_SYSTEM_PROMPT_PRESETS) {
        return currentPrompts
      }

      const nextPrompt = createAiSystemPromptPreset({
        id: createSystemPromptId(),
        language,
        name: getUniquePromptName(
          currentPrompts,
          t('aiChat.systemPrompt.new'),
          t,
        ),
      })

      setSelectedPromptIdInModal(nextPrompt.id)

      return [...currentPrompts, nextPrompt]
    })
  }

  const handleDuplicatePrompt = () => {
    setPromptManagerError('')
    setPromptDrafts((currentPrompts) => {
      const selectedPrompt = getSelectedPrompt(
        currentPrompts,
        selectedPromptIdInModal,
      )
      if (
        !selectedPrompt ||
        currentPrompts.length >= MAX_AI_SYSTEM_PROMPT_PRESETS
      ) {
        return currentPrompts
      }

      const nextPrompt = createAiSystemPromptPreset({
        id: createSystemPromptId(),
        language,
        name: getUniquePromptName(
          currentPrompts,
          selectedPrompt.name,
          t,
          t('aiChat.systemPrompt.copySuffix'),
        ),
        template: selectedPrompt.template,
      })

      setSelectedPromptIdInModal(nextPrompt.id)

      return [...currentPrompts, nextPrompt]
    })
  }

  const handleDeletePrompt = () => {
    setPromptManagerError('')
    setPromptDrafts((currentPrompts) => {
      if (currentPrompts.length <= 1) {
        return currentPrompts
      }

      const selectedIndex = currentPrompts.findIndex(
        (prompt) => prompt.id === selectedPromptIdInModal,
      )
      if (selectedIndex === -1) {
        return currentPrompts
      }

      const nextPrompts = currentPrompts.filter(
        (prompt) => prompt.id !== selectedPromptIdInModal,
      )
      const fallbackPrompt =
        nextPrompts[selectedIndex] ??
        nextPrompts[selectedIndex - 1] ??
        nextPrompts[0]

      setSelectedPromptIdInModal(fallbackPrompt?.id ?? '')

      if (draftActivePromptId === selectedPromptIdInModal) {
        setDraftActivePromptId(fallbackPrompt?.id ?? '')
      }

      return nextPrompts
    })
  }

  const handleSavePromptManager = async () => {
    const validationError = getPromptManagerValidationError(promptDrafts, t)
    if (validationError) {
      return
    }

    const normalizedPrompts = promptDrafts.map((prompt) => ({
      ...prompt,
      name: prompt.name.trim(),
      template: prompt.template.trim(),
    }))

    const nextSettings = normalizeAiSystemPromptSettings({
      ...resolvedSettings,
      activeAiSystemPromptId:
        draftActivePromptId || normalizedPrompts[0]?.id || '',
      aiSystemPrompts: normalizedPrompts,
    })

    setIsSavingPrompts(true)
    setPromptManagerError('')

    try {
      await saveUserSettings(nextSettings)

      const nextActivePrompt = getActiveAiSystemPrompt(nextSettings)
      const shouldResetConversation =
        nextActivePrompt.id !== activeSystemPrompt.id ||
        nextActivePrompt.template !== activeSystemPrompt.template

      setSettings(nextSettings)
      handleCancelSystemPromptManager()

      if (shouldResetConversation) {
        handleResetConversation()
      }
    } catch {
      setPromptManagerError(t('aiChat.systemPrompt.saveError'))
    } finally {
      setIsSavingPrompts(false)
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

  const promptManagerValidationError = getPromptManagerValidationError(
    promptDrafts,
    t,
  )
  const promptManagerDisplayError =
    promptManagerValidationError || promptManagerError
  const isPromptManagerSaveDisabled =
    isSavingPrompts ||
    promptDrafts.length === 0 ||
    promptManagerValidationError.length > 0

  const isCurrentRequest = (requestGeneration: number) =>
    conversationGenerationRef.current === requestGeneration

  const setAssistantErrorState = (
    assistantMessageId: string,
    nextError: string,
    ollamaError?: OllamaErrorDetails,
  ) => {
    setErrorMessage(nextError)
    setChatOllamaError(ollamaError)

    if (ollamaError?.kind === 'forbidden') {
      removeMessage(assistantMessageId, { commit: true })
    } else {
      replaceMessage(
        assistantMessageId,
        {
          content: nextError,
          isStreaming: false,
          ollamaError,
        },
        { commit: true },
      )
    }

    setIsSubmitting(false)
  }

  const disconnectStreamPort = (streamPort: { disconnect: () => void }) => {
    if (activePortRef.current === streamPort) {
      activePortRef.current = null
    }

    streamPort.disconnect()
  }

  const handleStreamStep = (
    assistantMessageId: string,
    streamMessage: Extract<AiChatStreamServerMessage, { type: 'step' }>,
  ) => {
    replaceMessage(assistantMessageId, {
      isStreaming: true,
      reasoning: streamMessage.reasoning,
      toolTraces: streamMessage.toolTraces,
    })
  }

  const handleStreamCompletion = (
    assistantMessageId: string,
    streamPort: { disconnect: () => void },
    streamMessage: Extract<AiChatStreamServerMessage, { type: 'complete' }>,
  ) => {
    replaceMessage(
      assistantMessageId,
      {
        charts: streamMessage.charts,
        content: streamMessage.answer,
        isStreaming: false,
        ollamaError: undefined,
        reasoning: streamMessage.reasoning,
        toolTraces: streamMessage.toolTraces,
      },
      { commit: true },
    )
    setChatOllamaError(undefined)
    setIsSubmitting(false)
    disconnectStreamPort(streamPort)
  }

  const handleStreamFailure = (
    assistantMessageId: string,
    streamPort: { disconnect: () => void },
    streamMessage: Extract<AiChatStreamServerMessage, { type: 'error' }>,
  ) => {
    setAssistantErrorState(
      assistantMessageId,
      streamMessage.error,
      streamMessage.ollamaError,
    )
    disconnectStreamPort(streamPort)
  }

  const handleIncomingStreamMessage = ({
    assistantMessageId,
    message,
    requestGeneration,
    streamPort,
  }: {
    assistantMessageId: string
    message: unknown
    requestGeneration: number
    streamPort: { disconnect: () => void }
  }): boolean => {
    if (!isCurrentRequest(requestGeneration)) {
      return false
    }

    const streamMessage = message as AiChatStreamServerMessage

    if (streamMessage.type === 'step') {
      handleStreamStep(assistantMessageId, streamMessage)
      return false
    }

    if (streamMessage.type === 'complete') {
      handleStreamCompletion(assistantMessageId, streamPort, streamMessage)
      return true
    }

    if (streamMessage.type === 'error') {
      handleStreamFailure(assistantMessageId, streamPort, streamMessage)
      return true
    }

    return false
  }

  const handleStreamDisconnect = (
    assistantMessageId: string,
    requestGeneration: number,
    streamPort: { disconnect: () => void },
    isFinished: boolean,
  ) => {
    if (activePortRef.current === streamPort) {
      activePortRef.current = null
    }

    if (ignoreNextDisconnectRef.current) {
      ignoreNextDisconnectRef.current = false
      return
    }

    if (!isCurrentRequest(requestGeneration) || isFinished) {
      return
    }

    setAssistantErrorState(assistantMessageId, t('aiChat.responseError'))
  }

  const startStreamingResponse = async ({
    assistantMessageId,
    attachments,
    history,
    nextPrompt,
    requestGeneration,
  }: {
    assistantMessageId: string
    attachments: AiChatAttachment[]
    history: Pick<ChatMessage, 'attachments' | 'content' | 'role'>[]
    nextPrompt: string
    requestGeneration: number
  }) => {
    try {
      const streamPort = await connectRuntimePort(AI_CHAT_STREAM_PORT_NAME)
      if (!streamPort) {
        return false
      }

      activePortRef.current = streamPort
      let isFinished = false

      streamPort.onMessage.addListener((message: unknown) => {
        isFinished =
          handleIncomingStreamMessage({
            assistantMessageId,
            message,
            requestGeneration,
            streamPort,
          }) || isFinished
      })

      streamPort.onDisconnect.addListener(() => {
        handleStreamDisconnect(
          assistantMessageId,
          requestGeneration,
          streamPort,
          isFinished,
        )
      })

      streamPort.postMessage({
        history,
        prompt: nextPrompt,
        type: 'run',
        ...(attachments.length > 0 ? { attachments } : {}),
      })
      return true
    } catch {
      return false
    }
  }

  const submitPrompt = async (
    rawPrompt: string,
    attachments: AiChatAttachment[] = [],
  ) => {
    const nextPrompt = rawPrompt.trim()
    if (!nextPrompt || !isConfigured || isSubmitting) {
      return
    }

    const history = messages.map((message) => ({
      ...(message.role === 'user' && message.attachments?.length
        ? { attachments: message.attachments }
        : {}),
      content: message.content,
      role: message.role,
    }))

    const assistantMessageId = createMessageId()
    const requestGeneration = conversationGenerationRef.current
    updateMessageList(
      (currentMessages) => [
        ...currentMessages,
        createChatMessage('user', nextPrompt, {
          attachments,
        }),
        {
          charts: [],
          content: '',
          id: assistantMessageId,
          isStreaming: true,
          reasoning: createInitialStreamingReasoning(nextPrompt, t),
          role: 'assistant',
          toolTraces: [],
        },
      ],
      { commit: true },
    )
    setInput('')
    setErrorMessage('')
    setChatOllamaError(undefined)
    setIsSubmitting(true)

    disconnectActivePort()

    const didStartStreaming = await startStreamingResponse({
      assistantMessageId,
      attachments,
      history,
      nextPrompt,
      requestGeneration,
    })

    if (didStartStreaming) {
      return
    }

    if (!isCurrentRequest(requestGeneration)) {
      return
    }

    const response = await requestAssistantAnswer(
      history,
      nextPrompt,
      attachments,
    )
    const shouldHandleResponse = isCurrentRequest(requestGeneration)

    if (shouldHandleResponse && response?.status === 'ok' && response.answer) {
      replaceMessage(
        assistantMessageId,
        {
          charts: response.charts,
          content: response.answer,
          isStreaming: false,
          ollamaError: undefined,
          reasoning: response.reasoning,
          toolTraces: response.toolTraces,
        },
        { commit: true },
      )
      setChatOllamaError(undefined)
      setIsSubmitting(false)
      return
    }

    if (shouldHandleResponse) {
      const nextError = getAiChatErrorMessage(response, t)
      setAssistantErrorState(
        assistantMessageId,
        nextError,
        getAiChatOllamaError(response),
      )
    }
  }

  const handleSubmit: PromptInputProps['onSubmit'] = async ({
    files,
    text,
  }: PromptInputMessage) => {
    try {
      const attachments = await convertPromptInputFilesToAiChatAttachments(
        files,
        language,
      )
      await submitPrompt(text, attachments)
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : t('aiChat.attachments.readError')
      toast.error(errorMessage)
      throw error
    }
  }
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
  const systemPromptManagerDialog = useSystemPromptManagerDialogView({
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
  })

  return (
    <>
      {mode === 'floating' && !isOpen ? (
        <Button
          type='button'
          aria-label={t('aiChat.open')}
          className='fixed right-4 bottom-4 z-50 size-10 cursor-pointer rounded-full shadow-lg'
          onClick={() => {
            setIsFloatingOpen(true)
            onOpenChange?.(true)
          }}
        >
          <MessageCircleMore className='size-5' />
        </Button>
      ) : null}

      {chatPanel}
      {systemPromptManagerDialog}
    </>
  )
}

const SavedTabsChatWidget = (props: SavedTabsChatWidgetProps = {}) =>
  useSavedTabsChatWidgetView(props)

export { SavedTabsChatWidget }
