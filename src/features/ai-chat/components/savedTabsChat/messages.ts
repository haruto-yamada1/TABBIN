import type { AiChatConversationMessage } from '@/features/ai-chat/types'
import type { AiChatToolTrace } from '@/types/background'

type ChatMessage = AiChatConversationMessage

type TranslateFn = (
  key: string,
  fallback?: string,
  values?: Record<string, string>,
) => string

interface ChatMessageSource {
  title: string
  url: string
}

const HEX_RADIX = 16

const createMessageId = (): string =>
  `${Date.now()}-${Math.random().toString(HEX_RADIX).slice(2)}`

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

function tryGetItemsArray(value: object): unknown[] | undefined {
  const desc = Object.getOwnPropertyDescriptor(value, 'items')
  if (!desc) {
    return undefined
  }
  return Array.isArray(desc.value) ? desc.value : undefined
}

const getSourceItems = (output: unknown): ChatMessageSource[] => {
  let items: unknown[] = []

  if (Array.isArray(output)) {
    items = output
  } else if (typeof output === 'object' && output !== null) {
    const extracted = tryGetItemsArray(output)
    if (extracted) {
      items = extracted
    }
  }

  return items.flatMap((item) => {
    if (!item || typeof item !== 'object') {
      return []
    }

    const url: unknown = Reflect.get(item, 'url')
    if (typeof url !== 'string' || url.length === 0) {
      return []
    }

    const title: unknown = Reflect.get(item, 'title')

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
  const submitButton = form?.querySelector('button[type="submit"]')

  if (!(submitButton instanceof HTMLButtonElement) || submitButton.disabled) {
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

export {
  createChatMessage,
  createMessageId,
  getConversationCopyText,
  getMessageSources,
  getSourcesLabel,
  getSourceItems,
  insertLineBreakAtCursor,
  requestPromptSubmit,
  tryGetItemsArray,
}
export type { ChatMessage, ChatMessageSource, TranslateFn }
