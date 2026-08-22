import { MessageCircleMore } from 'lucide-react'
import { Suspense, lazy, useCallback, useState } from 'react'
import type { ComponentType } from 'react'

import { Button } from '@/components/ui/button'
import { ConversationHistoryErrorNotice } from '@/features/ai-chat/components/ConversationHistoryErrorNotice'
import type { AiChatConversationMessage } from '@/features/ai-chat/types'
import { useI18n } from '@/features/i18n/context/I18nProvider'

type LazySavedTabsChatWidgetProps = {
  defaultOpen?: boolean
  historyVariant?: 'dropdown' | 'none' | 'sidebar-toggle'
  mode?: 'floating' | 'page'
  onMessagesChange?: (messages: AiChatConversationMessage[]) => void
  onOpenChange?: (isOpen: boolean) => void
  onToggleHistory?: () => void
}

// The full widget stays as a large lazy chunk because it contains streaming
// chat, chart rendering, Mermaid, and Shiki. Keep this click-to-load boundary
// so saved-tabs/options initial paths do not load AI-only code.
const SavedTabsChatWidgetWithHistory = lazy(async () => {
  const [{ SavedTabsChatWidget }, { useSharedAiChatHistory }] =
    await Promise.all([
      import('./SavedTabsChatWidget'),
      import('@/features/ai-chat/hooks/useSharedAiChatHistory'),
    ])

  const LoadedSavedTabsChatWidget: ComponentType<
    LazySavedTabsChatWidgetProps
  > = ({ onMessagesChange, ...props }) => {
    const {
      activeConversation,
      createConversation,
      deleteConversation,
      historyError,
      historyItems,
      isLoading,
      selectConversation,
      updateMessages,
    } = useSharedAiChatHistory()

    const handleMessagesChange = useCallback(
      (messages: AiChatConversationMessage[]) => {
        updateMessages(messages)
        onMessagesChange?.(messages)
      },
      [updateMessages, onMessagesChange],
    )

    if (isLoading) {
      return null
    }

    const errorClassName =
      props.mode === 'floating'
        ? 'fixed right-4 bottom-16 z-50 max-w-sm bg-background'
        : 'mb-3'

    return (
      <>
        <ConversationHistoryErrorNotice
          className={errorClassName}
          error={historyError}
        />
        {activeConversation ? (
          <SavedTabsChatWidget
            conversationId={activeConversation.id}
            historyItems={historyItems}
            initialMessages={activeConversation.messages}
            onCreateConversation={createConversation}
            onDeleteHistoryItem={deleteConversation}
            onMessagesChange={handleMessagesChange}
            onSelectHistoryItem={selectConversation}
            title={activeConversation.title}
            {...props}
          />
        ) : null}
      </>
    )
  }

  return { default: LoadedSavedTabsChatWidget }
})

export const LazySavedTabsChatWidget = ({
  defaultOpen = false,
  mode = 'floating',
  onOpenChange,
  ...props
}: LazySavedTabsChatWidgetProps) => {
  const { t } = useI18n()
  const shouldLoadImmediately = defaultOpen || mode === 'page'
  const [shouldLoad, setShouldLoad] = useState(shouldLoadImmediately)
  const [openOnLoad, setOpenOnLoad] = useState(defaultOpen)
  const handleFloatingClick = useCallback(() => {
    setOpenOnLoad(true)
    setShouldLoad(true)
    onOpenChange?.(true)
  }, [onOpenChange])

  if (shouldLoad) {
    return (
      <Suspense fallback={null}>
        <SavedTabsChatWidgetWithHistory
          defaultOpen={openOnLoad}
          mode={mode}
          {...(onOpenChange !== undefined ? { onOpenChange } : {})}
          {...props}
        />
      </Suspense>
    )
  }

  return (
    <Button
      aria-label={t('aiChat.open')}
      className='fixed right-4 bottom-4 z-50 size-10 cursor-pointer rounded-full shadow-lg'
      onClick={handleFloatingClick}
      type='button'
    >
      <MessageCircleMore className='size-5' />
    </Button>
  )
}
