import { History, X } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useI18n } from '@/features/i18n/context/I18nProvider'

type Props = {
  readonly query: string
  readonly entries: readonly string[]
  readonly onQueryChange: (query: string) => void
  readonly onRemove: (query: string) => Promise<void>
  readonly onCompositionChange?: (composing: boolean) => void
  readonly historyError?: boolean
}

type RowProps = {
  readonly entry: string
  readonly firstRef?: React.Ref<HTMLButtonElement> | undefined
  readonly removing: boolean
  readonly onSelect: (entry: string) => void
  readonly onDelete: (entry: string) => void
  readonly onEscape: (event: React.KeyboardEvent<HTMLButtonElement>) => void
}

const preventFocusLoss = (event: React.MouseEvent) => {
  event.preventDefault()
}

const HistoryRow = ({
  entry,
  firstRef,
  removing,
  onSelect,
  onDelete,
  onEscape,
}: RowProps) => {
  const { t } = useI18n()
  const handleSelect = useCallback(() => {
    onSelect(entry)
  }, [entry, onSelect])
  const handleDelete = useCallback(() => {
    onDelete(entry)
  }, [entry, onDelete])
  return (
    <div className='flex items-center gap-1'>
      <button
        ref={firstRef}
        type='button'
        className='flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-sm px-2 py-2 text-left hover:bg-accent focus-visible:bg-accent'
        onMouseDown={preventFocusLoss}
        onKeyDown={onEscape}
        onClick={handleSelect}
      >
        <History size={16} className='shrink-0 text-muted-foreground' />
        <span className='truncate'>{entry}</span>
      </button>
      <Button
        type='button'
        variant='ghost'
        size='icon-sm'
        disabled={removing}
        aria-label={t('savedTabs.removeSearchHistory', undefined, {
          query: entry,
        })}
        onMouseDown={preventFocusLoss}
        onKeyDown={onEscape}
        onClick={handleDelete}
      >
        <X size={16} />
      </Button>
    </div>
  )
}

export const SearchHistoryInput = ({
  query,
  entries,
  onQueryChange,
  onRemove,
  onCompositionChange,
  historyError = false,
}: Props) => {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [hiddenCurrent, setHiddenCurrent] = useState<string | null>(null)
  const [error, setError] = useState(false)
  const [removing, setRemoving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const firstEntryRef = useRef<HTMLButtonElement>(null)
  const matches = entries.filter(
    (entry) =>
      entry !== hiddenCurrent &&
      entry.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  )

  const handleDelete = useCallback(
    (entry: string) => {
      inputRef.current?.focus()
      setRemoving(true)
      setError(false)
      void onRemove(entry)
        .catch(() => {
          setError(true)
        })
        .finally(() => {
          setRemoving(false)
        })
    },
    [onRemove],
  )
  const handleSelect = useCallback(
    (entry: string) => {
      onQueryChange(entry)
      setHiddenCurrent(null)
      inputRef.current?.focus()
      setOpen(false)
    },
    [onQueryChange],
  )
  const handleBlur = useCallback((event: React.FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      setOpen(false)
    }
  }, [])
  const handleFocus = useCallback(() => {
    setHiddenCurrent(null)
    setOpen(true)
  }, [])
  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const next = event.target.value
      setHiddenCurrent(entries.includes(next.trim()) ? null : next.trim())
      onQueryChange(next)
      setOpen(true)
    },
    [entries, onQueryChange],
  )
  const handleCompositionStart = useCallback(() => {
    onCompositionChange?.(true)
  }, [onCompositionChange])
  const handleCompositionEnd = useCallback(() => {
    onCompositionChange?.(false)
  }, [onCompositionChange])
  const handleEscape = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        inputRef.current?.focus()
        setOpen(false)
      }
    },
    [],
  )
  const handleInputKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.nativeEvent.isComposing) {
        return
      }
      if (event.key === 'Escape' && open) {
        event.stopPropagation()
        setOpen(false)
      } else if (event.key === 'ArrowDown' && open && matches.length > 0) {
        event.preventDefault()
        firstEntryRef.current?.focus()
      }
    },
    [open, matches.length],
  )
  const handleClear = useCallback(() => {
    onQueryChange('')
    inputRef.current?.focus()
  }, [onQueryChange])

  return (
    <div className='relative w-full min-w-24' onBlur={handleBlur}>
      <Input
        ref={inputRef}
        type='text'
        aria-label={t('savedTabs.searchPlaceholder')}
        placeholder={t('savedTabs.searchPlaceholder')}
        value={query}
        onFocus={handleFocus}
        onClick={handleFocus}
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
        onChange={handleChange}
        onKeyDown={handleInputKeyDown}
        className='h-9 w-full pr-9'
      />
      {query && (
        <Button
          type='button'
          variant='ghost'
          aria-label={t('savedTabs.searchClear')}
          title={t('savedTabs.searchClear')}
          onClick={handleClear}
          className='absolute top-0 right-0 mr-0.5 flex size-8 cursor-pointer items-center justify-center'
        >
          <X size={16} />
        </Button>
      )}
      {open && (matches.length > 0 || historyError) && (
        <div className='absolute top-full z-50 mt-1 w-full rounded-md border bg-popover p-1 text-popover-foreground shadow-md'>
          <ul
            aria-label={t('savedTabs.searchHistory')}
            className='max-h-72 overflow-y-auto'
          >
            {matches.map((entry, index) => (
              <li key={entry}>
                <HistoryRow
                  entry={entry}
                  firstRef={index === 0 ? firstEntryRef : undefined}
                  removing={removing}
                  onSelect={handleSelect}
                  onDelete={handleDelete}
                  onEscape={handleEscape}
                />
              </li>
            ))}
          </ul>
          {(error || historyError) && (
            <p role='alert' className='px-2 text-sm text-destructive'>
              {t('savedTabs.searchHistoryError')}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
