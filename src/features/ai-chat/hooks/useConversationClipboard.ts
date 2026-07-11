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
  const [copiedState, setCopiedState] = useState<{
    isCopied: boolean
    messages: ChatMessage[]
  }>({ isCopied: false, messages })
  const copiedTimeoutRef = useRef<number | null>(null)
  const isMountedRef = useRef(true)
  const copyRequestGenerationRef = useRef(0)

  if (copiedState.messages !== messages) {
    setCopiedState({ isCopied: false, messages })
  }

  const isConversationCopied =
    copiedState.messages === messages && copiedState.isCopied

  const clearCopiedTimeout = useCallback(() => {
    if (copiedTimeoutRef.current === null) {
      return
    }
    window.clearTimeout(copiedTimeoutRef.current)
    copiedTimeoutRef.current = null
  }, [])

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      copyRequestGenerationRef.current += 1
    }
  }, [])

  useEffect(
    () => () => {
      copyRequestGenerationRef.current += 1
      clearCopiedTimeout()
    },
    [clearCopiedTimeout, messages],
  )

  const copyConversation = useCallback(async () => {
    const requestGeneration = copyRequestGenerationRef.current + 1
    copyRequestGenerationRef.current = requestGeneration
    const isCurrentRequest = () =>
      isMountedRef.current &&
      copyRequestGenerationRef.current === requestGeneration

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
      if (!isCurrentRequest()) {
        return
      }
      clearCopiedTimeout()
      setCopiedState({ isCopied: true, messages })
      toast.success(t('aiChat.copyConversationSuccess'))
      copiedTimeoutRef.current = window.setTimeout(() => {
        setCopiedState({ isCopied: false, messages })
        copiedTimeoutRef.current = null
      }, COPIED_CONVERSATION_ICON_TIMEOUT)
    } catch {
      if (!isCurrentRequest()) {
        return
      }
      toast.error(t('aiChat.copyConversationError'))
    }
  }, [clearCopiedTimeout, messages, t])

  return {
    copyConversation,
    isConversationCopied,
  }
}

export { useConversationClipboard }
