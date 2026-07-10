import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { getConversationCopyText } from '@/features/ai-chat/components/savedTabsChat/messages'
import type {
  ChatMessage,
  TranslateFn,
} from '@/features/ai-chat/components/savedTabsChat/messages'
import { COPIED_CONVERSATION_ICON_TIMEOUT } from '@/features/ai-chat/components/savedTabsChat/storage'

type ClipboardWriter = {
  writeText: (text: string) => Promise<void>
}

const getClipboardWriter = (): ClipboardWriter | null => {
  if (typeof window === 'undefined') {
    return null
  }

  try {
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
  } catch {
    return null
  }
}

const useConversationClipboard = ({
  messages,
  t,
}: {
  messages: ChatMessage[]
  t: TranslateFn
}) => {
  const [copiedMessages, setCopiedMessages] = useState<ChatMessage[] | null>(
    null,
  )
  const copiedTimeoutRef = useRef<number | null>(null)
  const isConversationCopied = copiedMessages === messages

  const clearCopiedTimeout = useCallback(() => {
    if (copiedTimeoutRef.current === null) {
      return
    }
    window.clearTimeout(copiedTimeoutRef.current)
    copiedTimeoutRef.current = null
  }, [])

  useEffect(() => clearCopiedTimeout, [clearCopiedTimeout, messages])

  const copyConversation = useCallback(async () => {
    const conversationCopyText = getConversationCopyText(messages, t)
    if (!conversationCopyText) {
      return
    }

    const clipboard = getClipboardWriter()
    if (!clipboard) {
      toast.error(t('aiChat.copyConversationError'))
      return
    }

    try {
      await clipboard.writeText(conversationCopyText)
      clearCopiedTimeout()
      setCopiedMessages(messages)
      toast.success(t('aiChat.copyConversationSuccess'))
      copiedTimeoutRef.current = window.setTimeout(() => {
        setCopiedMessages(null)
        copiedTimeoutRef.current = null
      }, COPIED_CONVERSATION_ICON_TIMEOUT)
    } catch {
      toast.error(t('aiChat.copyConversationError'))
    }
  }, [clearCopiedTimeout, messages, t])

  return {
    copyConversation,
    isConversationCopied,
  }
}

export { useConversationClipboard }
