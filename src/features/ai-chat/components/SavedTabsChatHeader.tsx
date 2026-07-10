import { Check, Copy, History, Plus, Settings2, X } from 'lucide-react'
import { useCallback, useState } from 'react'

import {
  PromptInputSelect,
  PromptInputSelectContent,
  PromptInputSelectItem,
  PromptInputSelectTrigger,
  PromptInputSelectValue,
} from '@/components/ai-elements/prompt-input'
import { Button } from '@/components/ui/button'
import { CardHeader, CardTitle } from '@/components/ui/card'
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
import {
  getSelectedPrompt,
  SYSTEM_PROMPT_SELECTOR_EMPTY_VALUE,
} from '@/features/ai-chat/components/savedTabsChat/prompts'
import { SavedTabsChatHeaderTooltipButton } from '@/features/ai-chat/components/SavedTabsChatHeaderTooltipButton'
import { SavedTabsChatHistoryItemCard } from '@/features/ai-chat/components/SavedTabsChatHistoryItemCard'
import type { AiChatHistoryItem } from '@/features/ai-chat/types'
import { useI18n } from '@/features/i18n/context/I18nProvider'
import { cn } from '@/lib/utils'
import type { AiSystemPromptPreset } from '@/types/storage'

type SavedTabsChatHeaderProps = {
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
}

const SystemPromptSelector = ({
  isCompactLayout,
  prompts,
  selectedPromptId,
  onValueChange,
}: {
  isCompactLayout: boolean
  prompts: AiSystemPromptPreset[]
  selectedPromptId: string
  onValueChange: (value: string) => void
}) => {
  const { t } = useI18n()
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

const ChatHistoryButton = ({
  label,
  onClick,
}: {
  label: string
  onClick?: () => void
}) => (
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

const ChatHistoryDropdown = ({
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

  const handleConfirmDelete = useCallback(() => {
    if (!pendingDeleteHistoryItem) {
      return
    }

    onDeleteHistoryItem?.(pendingDeleteHistoryItem.id)
    setPendingDeleteHistoryItem(null)
  }, [onDeleteHistoryItem, pendingDeleteHistoryItem])
  const handleCancelDelete = useCallback(() => {
    setPendingDeleteHistoryItem(null)
  }, [])

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

const SavedTabsChatHeader = ({
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
}: SavedTabsChatHeaderProps) => {
  const { t } = useI18n()
  const { isCompactLayout, showCloseButton } = presentation
  const { isConversationCopied, isCopyDisabled } = status

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
          {historyVariant === 'sidebar-toggle' ? (
            <ChatHistoryButton
              label={t('aiChat.historyTitle')}
              onClick={onToggleHistory}
            />
          ) : null}
          {historyVariant === 'dropdown' ? (
            <ChatHistoryDropdown
              historyItems={historyItems}
              onDeleteHistoryItem={onDeleteHistoryItem}
              onSelectHistoryItem={onSelectHistoryItem}
            />
          ) : null}
          <SavedTabsChatHeaderTooltipButton
            ariaLabel={t('aiChat.systemPrompt.openSettings')}
            onClick={onOpenSystemPromptManager}
            tooltipText={t('aiChat.systemPrompt.settingsTooltip')}
          >
            <Settings2 className='size-4' />
          </SavedTabsChatHeaderTooltipButton>
          <SystemPromptSelector
            isCompactLayout={isCompactLayout}
            onValueChange={onSelectSystemPrompt}
            prompts={systemPrompts}
            selectedPromptId={activeSystemPromptId}
          />
        </div>

        <CardTitle
          className='pointer-events-none absolute inset-x-0 flex items-center justify-center px-20 text-base'
          data-testid='chat-header-title'
        >
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

export type { SavedTabsChatHeaderProps }
export { SavedTabsChatHeader }
