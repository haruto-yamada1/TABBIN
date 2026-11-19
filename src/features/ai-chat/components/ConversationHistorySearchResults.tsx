import { useCallback } from 'react'

import { Button } from '@/components/ui/button'
import type {
  AiChatHistorySearchExcerpt,
  AiChatHistorySearchResult,
} from '@/features/ai-chat/lib/conversation-search'
import { useI18n } from '@/features/i18n/context/I18nProvider'
import { cn } from '@/lib/utils'
import { formatFixedDatetime } from '@/utils/localDateTime'

type ConversationHistorySearchResultsProps = {
  className?: string
  onSelectResult: (conversationId: string) => void
  results: AiChatHistorySearchResult[]
  variant: 'popover' | 'sidebar'
}

const ConversationHistorySearchExcerpt = ({
  excerpt,
}: {
  excerpt: AiChatHistorySearchExcerpt
}) => {
  const { t } = useI18n()

  return (
    <span className='block w-full min-w-0 text-xs leading-5 wrap-anywhere text-muted-foreground'>
      <span className='font-medium text-foreground/80'>
        {excerpt.role === 'user'
          ? t('aiChat.history.roleUser')
          : t('aiChat.history.roleAssistant')}
        :{' '}
      </span>
      {excerpt.segments.map((segment) =>
        segment.isMatch ? (
          <mark
            className='rounded-sm bg-primary/20 px-0.5 text-foreground'
            key={`${excerpt.messageId}-${segment.offset}`}
          >
            {segment.text}
          </mark>
        ) : (
          <span key={`${excerpt.messageId}-${segment.offset}`}>
            {segment.text}
          </span>
        ),
      )}
    </span>
  )
}

const ConversationHistorySearchResultCard = ({
  onSelectResult,
  result,
  variant,
}: {
  onSelectResult: (conversationId: string) => void
  result: AiChatHistorySearchResult
  variant: 'popover' | 'sidebar'
}) => {
  const { t } = useI18n()
  const handleSelect = useCallback(() => {
    onSelectResult(result.conversationId)
  }, [onSelectResult, result.conversationId])

  return (
    <div
      className={cn(
        'rounded-xl border border-transparent',
        variant === 'popover'
          ? 'bg-muted/30 px-2.5 py-2'
          : 'bg-background/70 px-3 py-2.5',
      )}
    >
      <Button
        aria-label={t('aiChat.history.openSearchResultAria', undefined, {
          title: result.title,
        })}
        className='h-auto w-full min-w-0 flex-col items-start justify-start gap-1 overflow-hidden px-0 text-left whitespace-normal hover:bg-transparent'
        data-testid={`conversation-search-result-${result.conversationId}`}
        onClick={handleSelect}
        type='button'
        variant='ghost'
      >
        <span className='flex w-full min-w-0 items-baseline justify-between gap-2'>
          <span className='min-w-0 truncate text-sm font-medium'>
            {result.title}
          </span>
          <span className='shrink-0 text-[11px] text-muted-foreground'>
            {formatFixedDatetime(result.updatedAt)}
          </span>
        </span>
        {result.titleMatch ? (
          <span className='rounded-full bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary'>
            {t('aiChat.history.titleMatched')}
          </span>
        ) : null}
        {result.matchedMessageCount > 0 ? (
          <span className='text-[11px] text-muted-foreground'>
            {t('aiChat.history.messageMatches', undefined, {
              count: String(result.matchedMessageCount),
            })}
          </span>
        ) : null}
        {result.excerpts.map((excerpt) => (
          <ConversationHistorySearchExcerpt
            excerpt={excerpt}
            key={excerpt.messageId}
          />
        ))}
      </Button>
    </div>
  )
}

export const ConversationHistorySearchResults = ({
  className,
  onSelectResult,
  results,
  variant,
}: ConversationHistorySearchResultsProps) => {
  const { t } = useI18n()

  if (results.length === 0) {
    return (
      <div
        className={cn(
          'rounded-xl px-3 py-4 text-sm text-muted-foreground',
          className,
        )}
        data-testid='conversation-search-empty'
      >
        {t('aiChat.history.searchEmpty')}
      </div>
    )
  }

  return (
    <div
      className={cn('space-y-1.5', className)}
      data-testid='conversation-search-results'
    >
      {results.map((result) => (
        <ConversationHistorySearchResultCard
          key={result.conversationId}
          onSelectResult={onSelectResult}
          result={result}
          variant={variant}
        />
      ))}
    </div>
  )
}
