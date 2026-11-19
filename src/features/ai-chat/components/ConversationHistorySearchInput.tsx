import { Search, X } from 'lucide-react'
import { useCallback, useRef } from 'react'
import type { ChangeEvent, KeyboardEvent } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useI18n } from '@/features/i18n/context/I18nProvider'
import { cn } from '@/lib/utils'

type ConversationHistorySearchInputProps = {
  className?: string
  onChange: (value: string) => void
  value: string
}

export const ConversationHistorySearchInput = ({
  className,
  onChange,
  value,
}: ConversationHistorySearchInputProps) => {
  const { t } = useI18n()
  const inputRef = useRef<HTMLInputElement>(null)

  const clearSearch = useCallback(() => {
    onChange('')
    inputRef.current?.focus()
  }, [onChange])

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onChange(event.target.value)
    },
    [onChange],
  )

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key !== 'Escape' || value.length === 0) {
        return
      }

      event.preventDefault()
      onChange('')
    },
    [onChange, value.length],
  )

  return (
    <div className={cn('relative', className)}>
      <Search
        aria-hidden='true'
        className='pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground'
      />
      <Input
        aria-label={t('aiChat.history.searchAria')}
        autoComplete='off'
        className='h-8 pr-8 pl-8 text-sm [&::-webkit-search-cancel-button]:appearance-none'
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={t('aiChat.history.searchPlaceholder')}
        ref={inputRef}
        type='search'
        value={value}
      />
      {value.length > 0 ? (
        <Button
          aria-label={t('aiChat.history.clearSearch')}
          className='absolute top-1/2 right-1 size-6 -translate-y-1/2 text-muted-foreground'
          onClick={clearSearch}
          size='icon-sm'
          type='button'
          variant='ghost'
        >
          <X className='size-3.5' />
        </Button>
      ) : null}
    </div>
  )
}
