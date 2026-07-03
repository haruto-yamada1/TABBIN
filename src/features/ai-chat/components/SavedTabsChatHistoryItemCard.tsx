import { Trash2 } from 'lucide-react'
import { useCallback } from 'react'

import { Button } from '@/components/ui/button'
import type { AiChatHistoryItem } from '@/features/ai-chat/types'
import { cn } from '@/lib/utils'

import type { TranslateFn } from './savedTabsChat/messages'

interface SavedTabsChatHistoryItemCardProps {
  historyItem: AiChatHistoryItem
  isActive: boolean
  onDeleteHistoryItem?: (conversationId: string) => void
  onSelectHistoryItem?: (conversationId: string) => void
  setIsOpen: (open: boolean) => void
  setPendingDeleteHistoryItem: (item: AiChatHistoryItem | null) => void
  t: TranslateFn
}

export const SavedTabsChatHistoryItemCard = ({
  historyItem,
  isActive,
  onDeleteHistoryItem,
  onSelectHistoryItem,
  setIsOpen,
  setPendingDeleteHistoryItem,
  t,
}: SavedTabsChatHistoryItemCardProps) => {
  const handleSelect = useCallback(() => {
    onSelectHistoryItem?.(historyItem.id)
    setIsOpen(false)
  }, [historyItem, onSelectHistoryItem, setIsOpen])

  const handleDelete = useCallback(
    (event: { stopPropagation: () => void }) => {
      event.stopPropagation()
      setIsOpen(false)
      setPendingDeleteHistoryItem(historyItem)
    },
    [historyItem, setIsOpen, setPendingDeleteHistoryItem],
  )

  return (
    <div
      className={cn(
        'rounded-xl border px-3 py-2.5 transition',
        isActive
          ? 'border-border bg-muted/50'
          : 'border-transparent hover:bg-muted/40',
      )}
    >
      <div
        className='grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-2'
        data-testid={`conversation-row-${historyItem.id}`}
      >
        <Button
          className='h-auto w-full min-w-0 flex-col items-start justify-start overflow-hidden px-0 text-left whitespace-normal hover:bg-transparent'
          onClick={handleSelect}
          type='button'
          variant='ghost'
        >
          <span
            className='block w-full min-w-0 truncate text-sm font-medium'
            data-testid={`conversation-title-${historyItem.id}`}
          >
            {historyItem.title}
          </span>
          <span
            className='mt-1 line-clamp-2 block w-full min-w-0 overflow-hidden text-xs leading-5 wrap-anywhere text-muted-foreground'
            data-testid={`conversation-preview-${historyItem.id}`}
          >
            {historyItem.preview}
          </span>
        </Button>
        {onDeleteHistoryItem ? (
          <Button
            type='button'
            variant='ghost'
            size='icon-sm'
            aria-label={t('aiChat.deleteConversationAria', undefined, {
              title: historyItem.title,
            })}
            className='shrink-0 justify-self-end text-muted-foreground hover:text-destructive'
            onClick={handleDelete}
          >
            <Trash2 className='size-4' />
          </Button>
        ) : null}
      </div>
    </div>
  )
}
