import { useCallback, useMemo } from 'react'
import type { ChangeEvent, KeyboardEvent as ReactKeyboardEvent } from 'react'

import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from '@/components/ai-elements/prompt-input'
import type { PromptInputProps } from '@/components/ai-elements/prompt-input'
import { ChatPromptAttachmentButton } from '@/features/ai-chat/components/ChatPromptAttachmentButton'
import { ChatPromptAttachments } from '@/features/ai-chat/components/ChatPromptAttachments'
import type { OllamaErrorPlatform } from '@/features/ai-chat/components/OllamaErrorNotice'
import { OllamaModelSelector } from '@/features/ai-chat/components/OllamaModelSelector'
import {
  insertLineBreakAtCursor,
  requestPromptSubmit,
} from '@/features/ai-chat/components/savedTabsChat/messages'
import {
  AI_CHAT_MAX_ATTACHMENTS,
  AI_CHAT_MAX_ATTACHMENT_SIZE_BYTES,
  getAiChatAttachmentInputAccept,
} from '@/features/ai-chat/lib/attachments'
import { useI18n } from '@/features/i18n/context/I18nProvider'
import { cn } from '@/lib/utils'
import type { OllamaErrorDetails } from '@/types/background'

type SavedTabsChatComposerProps = {
  input: string
  modelName?: string
  modelOptions: {
    label: string
    name: string
  }[]
  onAttachmentError: NonNullable<PromptInputProps['onError']>
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
}

const SavedTabsChatComposer = ({
  input,
  presentation,
  modelName,
  modelOptions,
  onAttachmentError,
  onFetchModels,
  onInputChange,
  onSelectModel,
  onSubmit,
  platform,
  setupErrorMessage,
  setupOllamaError,
  status,
}: SavedTabsChatComposerProps) => {
  const { t } = useI18n()
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

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
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
      data-testid='chat-form'
      maxFiles={AI_CHAT_MAX_ATTACHMENTS}
      maxFileSize={AI_CHAT_MAX_ATTACHMENT_SIZE_BYTES}
      multiple
      onError={onAttachmentError}
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

export type { SavedTabsChatComposerProps }
export { SavedTabsChatComposer }
