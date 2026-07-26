import { Trash2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { LoadingState } from '@/components/ui/loading-state'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ConversationPreviewTooltip } from '@/features/ai-chat/components/ConversationPreviewTooltip'
import { SavedTabsChatWidget } from '@/features/ai-chat/components/SavedTabsChatWidget'
import { useSharedAiChatHistory } from '@/features/ai-chat/hooks/useSharedAiChatHistory'
import type { AiChatHistoryItem } from '@/features/ai-chat/types'
import type { TranslateFn } from '@/features/i18n/context/I18nProvider'
import { useI18n } from '@/features/i18n/context/I18nProvider'

import { createPendingDeleteHistoryOpenChangeHandler } from './aiChatRoute.helpers'

const AI_CHAT_HISTORY_BREAKPOINT = 1024

const HistoryItemCard = ({
  historyItem,
  onDelete,
  onSelect,
  t,
}: {
  historyItem: AiChatHistoryItem
  onDelete: (historyItem: AiChatHistoryItem) => void
  onSelect: (id: string) => void
  t: TranslateFn
}) => {
  const handleClick = useCallback(() => {
    onSelect(historyItem.id)
  }, [onSelect, historyItem.id])

  const handleDeleteClick = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation()
      onDelete(historyItem)
    },
    [onDelete, historyItem],
  )

  return (
    <div
      className={`w-full rounded-2xl border px-3.5 py-3 text-left transition ${
        historyItem.isActive
          ? 'border-border bg-background shadow-sm'
          : 'border-transparent bg-transparent hover:bg-background/80'
      }`}
    >
      <div
        className='grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-2'
        data-testid={`conversation-row-${historyItem.id}`}
      >
        <Button
          className='h-auto w-full min-w-0 flex-col items-start justify-start overflow-hidden px-0 text-left whitespace-normal hover:bg-transparent'
          data-testid={`conversation-button-${historyItem.id}`}
          onClick={handleClick}
          type='button'
          variant='ghost'
        >
          <span
            className='block w-full min-w-0 truncate text-sm font-medium text-foreground'
            data-testid={`conversation-title-${historyItem.id}`}
          >
            {historyItem.title}
          </span>
          <ConversationPreviewTooltip
            id={historyItem.id}
            preview={historyItem.preview}
          />
        </Button>
        <Button
          type='button'
          variant='ghost'
          size='icon-sm'
          aria-label={t('aiChat.deleteConversationAria', undefined, {
            title: historyItem.title,
          })}
          className='shrink-0 justify-self-end text-muted-foreground hover:text-destructive'
          onClick={handleDeleteClick}
        >
          <Trash2 className='size-4' />
        </Button>
      </div>
    </div>
  )
}

export const AiChatRoute = () => {
  const { t } = useI18n()
  const {
    activeConversation,
    createConversation,
    deleteConversation,
    historyItems,
    isLoading,
    selectConversation,
    updateMessages,
  } = useSharedAiChatHistory()
  const [isHistoryVisible, setIsHistoryVisible] = useState(
    () => window.innerWidth >= AI_CHAT_HISTORY_BREAKPOINT,
  )
  const isCompactViewportRef = useRef(
    window.innerWidth < AI_CHAT_HISTORY_BREAKPOINT,
  )
  const [pendingDeleteHistoryItem, setPendingDeleteHistoryItem] =
    useState<AiChatHistoryItem | null>(null)

  useEffect(() => {
    const handleResize = () => {
      const isCompactViewport = window.innerWidth < AI_CHAT_HISTORY_BREAKPOINT

      if (isCompactViewportRef.current !== isCompactViewport) {
        isCompactViewportRef.current = isCompactViewport
        setIsHistoryVisible(!isCompactViewport)
      }
    }

    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  const handleToggleHistory = useCallback(() => {
    setIsHistoryVisible((current) => !current)
  }, [])

  const handleSelectHistoryItem = useCallback(
    (id: string) => {
      selectConversation(id)
    },
    [selectConversation],
  )

  const handleDeleteHistoryItem = useCallback(
    (historyItem: AiChatHistoryItem) => {
      setPendingDeleteHistoryItem(historyItem)
    },
    [],
  )

  const handleCancelDelete = useCallback(() => {
    setPendingDeleteHistoryItem(null)
  }, [])

  const handleConfirmDelete = useCallback(() => {
    if (!pendingDeleteHistoryItem) {
      return
    }

    deleteConversation(pendingDeleteHistoryItem.id)
    setPendingDeleteHistoryItem(null)
  }, [deleteConversation, pendingDeleteHistoryItem])

  if (isLoading || !activeConversation) {
    return <LoadingState minHeightClassName='min-h-[300px]' />
  }

  return (
    <div className='flex h-full min-h-0 min-w-0 overflow-hidden bg-background'>
      {isHistoryVisible ? (
        <aside className='h-full min-h-0 w-[296px] shrink-0 border-r border-border bg-muted/20'>
          <div className='flex h-full flex-col'>
            <div className='flex items-center justify-between px-4 pt-4 pb-3'>
              <div>
                <p className='text-sm font-medium text-foreground'>
                  {t('aiChat.historyTitle')}
                </p>
                <p className='text-xs text-muted-foreground'>
                  {t('aiChat.historyHint')}
                </p>
              </div>
              <div className='rounded-full border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground'>
                {historyItems.length}
              </div>
            </div>

            <ScrollArea className='min-h-0 flex-1'>
              <div className='space-y-1.5 px-3 pb-3'>
                {historyItems.map((historyItem) => (
                  <HistoryItemCard
                    historyItem={historyItem}
                    key={historyItem.id}
                    onDelete={handleDeleteHistoryItem}
                    onSelect={handleSelectHistoryItem}
                    t={t}
                  />
                ))}
              </div>
            </ScrollArea>
          </div>
        </aside>
      ) : null}

      <div className='flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden'>
        <main className='min-h-0 flex-1 overflow-hidden bg-muted/10 px-3 py-3 sm:px-4 sm:py-4 lg:px-6 lg:py-5'>
          <div className='mx-auto flex h-full min-h-0 max-w-7xl overflow-hidden'>
            <div
              className='flex min-h-0 flex-1 overflow-hidden'
              data-testid='chat-widget-shell'
            >
              <SavedTabsChatWidget
                conversationId={activeConversation.id}
                defaultOpen
                historyVariant='sidebar-toggle'
                initialMessages={activeConversation.messages}
                onCreateConversation={createConversation}
                title={activeConversation.title}
                mode='page'
                onMessagesChange={updateMessages}
                onToggleHistory={handleToggleHistory}
              />
            </div>
          </div>
        </main>
      </div>

      <Dialog
        open={pendingDeleteHistoryItem !== null}
        onOpenChange={createPendingDeleteHistoryOpenChangeHandler(
          setPendingDeleteHistoryItem,
        )}
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
    </div>
  )
}
