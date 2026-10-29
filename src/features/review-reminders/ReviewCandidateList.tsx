import { Search, Trash2 } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import type { ChangeEvent } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useI18n } from '@/features/i18n/context/I18nProvider'
import { toSafeSavedUrlHref } from '@/lib/url-filter'

import type { ReviewCandidate } from './lib/reviewCandidates'

// The organization service accepts at most 100 URL IDs per transaction.
const SELECTION_LIMIT = 100
type SortOrder = 'oldest' | 'newest' | 'title'
const EMPTY_SELECTION = new Set<string>()

const getDisplayableDate = (savedAt: number | undefined) => {
  if (savedAt === undefined) {
    return undefined
  }
  const date = new Date(savedAt)
  return Number.isFinite(date.getTime()) ? date : undefined
}

const ReviewCandidateRow = ({
  candidate,
  checked,
  disabled,
  dateFormat,
  onDelete,
  onSelect,
}: {
  readonly candidate: ReviewCandidate
  readonly checked: boolean
  readonly disabled: boolean
  readonly dateFormat: Intl.DateTimeFormat
  readonly onDelete: (ids: string[]) => void
  readonly onSelect: (id: string, checked: boolean) => void
}) => {
  const { t } = useI18n()
  const href = toSafeSavedUrlHref(candidate.url)
  const title = candidate.title || candidate.url
  const savedDate = getDisplayableDate(candidate.firstSavedAt)
  const handleSelect = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onSelect(candidate.id, event.target.checked)
    },
    [candidate.id, onSelect],
  )
  const handleDelete = useCallback(() => {
    onDelete([candidate.id])
  }, [candidate.id, onDelete])
  return (
    <div className='flex items-start gap-3 rounded-xl border border-border bg-card p-4'>
      <input
        type='checkbox'
        className='mt-1 h-4 w-4 shrink-0 accent-primary'
        aria-label={`${t('reviewReminder.select')} ${title}`}
        checked={checked}
        disabled={disabled}
        onChange={handleSelect}
      />
      <div className='min-w-0 flex-1 space-y-2'>
        <h2 className='font-medium wrap-anywhere'>{title}</h2>
        <p className='text-sm break-all text-muted-foreground'>
          {candidate.url}
        </p>
        <p className='text-xs text-muted-foreground'>
          {savedDate === undefined
            ? t('reviewReminder.unknownDate')
            : t('reviewReminder.savedDate', undefined, {
                date: dateFormat.format(savedDate),
              })}
        </p>
        <div className='flex flex-wrap items-center gap-3'>
          {href && (
            <a
              href={href}
              target='_blank'
              rel='noopener noreferrer'
              className='text-sm text-primary underline underline-offset-4'
              aria-label={`${t('reviewReminder.open')} ${title}`}
            >
              {t('reviewReminder.open')}
            </a>
          )}
          <Button
            variant='ghost'
            size='sm'
            disabled={disabled}
            className='text-destructive'
            aria-label={`${t('reviewReminder.delete')} ${title}`}
            onClick={handleDelete}
          >
            <Trash2 aria-hidden='true' className='mr-2 h-4 w-4' />
            {t('reviewReminder.delete')}
          </Button>
        </div>
      </div>
    </div>
  )
}

export const ReviewCandidateList = ({
  candidates,
  disabled,
  onDelete,
}: {
  readonly candidates: readonly ReviewCandidate[]
  readonly disabled: boolean
  readonly onDelete: (ids: string[]) => void
}) => {
  const { t, language } = useI18n()
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortOrder>('oldest')
  const [selection, setSelection] = useState({
    candidates,
    query,
    ids: EMPTY_SELECTION,
  })
  const selected =
    selection.candidates === candidates && selection.query === query
      ? selection.ids
      : EMPTY_SELECTION
  const visible = useMemo(() => {
    const term = query.trim().toLocaleLowerCase(language)
    return candidates
      .filter((candidate) =>
        `${candidate.title}\n${candidate.url}`
          .toLocaleLowerCase(language)
          .includes(term),
      )
      .toSorted((a, b) => {
        if (sort === 'title') {
          return (a.title || a.url).localeCompare(b.title || b.url, language)
        }
        const aTime = getDisplayableDate(a.firstSavedAt)?.getTime()
        const bTime = getDisplayableDate(b.firstSavedAt)?.getTime()
        if (aTime === undefined) {
          return bTime === undefined ? 0 : 1
        }
        if (bTime === undefined) {
          return -1
        }
        return sort === 'oldest' ? aTime - bTime : bTime - aTime
      })
  }, [candidates, language, query, sort])
  const dateFormat = useMemo(
    () => new Intl.DateTimeFormat(language, { dateStyle: 'medium' }),
    [language],
  )
  const updateSelection = useCallback(
    (ids: Set<string>) => {
      setSelection({ candidates, query, ids })
    },
    [candidates, query],
  )
  const updateQuery = useCallback(
    (value: string) => {
      setQuery(value)
      setSelection({ candidates, query: value, ids: EMPTY_SELECTION })
    },
    [candidates],
  )
  const handleQueryChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      updateQuery(event.target.value)
    },
    [updateQuery],
  )
  const handleClearSearch = useCallback(() => {
    updateQuery('')
  }, [updateQuery])
  const handleSortChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      const value = event.target.value
      if (value === 'oldest' || value === 'newest' || value === 'title') {
        setSort(value)
      }
    },
    [],
  )
  const handleSelectVisible = useCallback(() => {
    updateSelection(
      new Set(visible.slice(0, SELECTION_LIMIT).map(({ id }) => id)),
    )
  }, [updateSelection, visible])
  const handleClearSelection = useCallback(() => {
    updateSelection(EMPTY_SELECTION)
  }, [updateSelection])
  const handleDeleteSelected = useCallback(() => {
    onDelete(visible.filter(({ id }) => selected.has(id)).map(({ id }) => id))
  }, [onDelete, selected, visible])
  const handleSelect = useCallback(
    (id: string, checked: boolean) => {
      const next = new Set(selected)
      if (checked && next.size < SELECTION_LIMIT) {
        next.add(id)
      } else {
        next.delete(id)
      }
      updateSelection(next)
    },
    [selected, updateSelection],
  )
  return (
    <div className='space-y-4' aria-busy={disabled}>
      <div className='space-y-4 rounded-xl border border-border bg-card p-4'>
        <div className='flex flex-col gap-4 sm:flex-row'>
          <div className='min-w-0 flex-1 space-y-2'>
            <label htmlFor='review-search' className='text-sm font-medium'>
              {t('reviewReminder.search')}
            </label>
            <div className='relative'>
              <Search
                aria-hidden='true'
                className='absolute top-3 left-3 h-4 w-4 text-muted-foreground'
              />
              <Input
                id='review-search'
                type='search'
                value={query}
                disabled={disabled}
                placeholder={t('reviewReminder.searchPlaceholder')}
                className='pl-9'
                onChange={handleQueryChange}
              />
            </div>
          </div>
          <div className='space-y-2'>
            <label htmlFor='review-sort' className='text-sm font-medium'>
              {t('reviewReminder.sort')}
            </label>
            <select
              id='review-sort'
              value={sort}
              disabled={disabled}
              className='flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm'
              onChange={handleSortChange}
            >
              <option value='oldest'>{t('reviewReminder.sortOldest')}</option>
              <option value='newest'>{t('reviewReminder.sortNewest')}</option>
              <option value='title'>{t('reviewReminder.sortTitle')}</option>
            </select>
          </div>
        </div>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <output>
            {query.trim()
              ? t('reviewReminder.filteredCount', undefined, {
                  count: String(visible.length),
                  total: String(candidates.length),
                })
              : t('reviewReminder.listCount', undefined, {
                  count: String(candidates.length),
                })}
          </output>
          {query && (
            <Button
              variant='ghost'
              size='sm'
              disabled={disabled}
              onClick={handleClearSearch}
            >
              {t('reviewReminder.clearSearch')}
            </Button>
          )}
        </div>
        <div className='flex flex-wrap items-center gap-2 border-t pt-3'>
          <Button
            variant='outline'
            size='sm'
            disabled={disabled || visible.length === 0}
            onClick={handleSelectVisible}
          >
            {t('reviewReminder.selectVisible')}
          </Button>
          <Button
            variant='ghost'
            size='sm'
            disabled={disabled || selected.size === 0}
            onClick={handleClearSelection}
          >
            {t('reviewReminder.clearSelection')}
          </Button>
          <Button
            variant='destructive'
            size='sm'
            className='text-white'
            disabled={disabled || selected.size === 0}
            onClick={handleDeleteSelected}
          >
            <Trash2 aria-hidden='true' className='mr-2 h-4 w-4' />
            {t('reviewReminder.deleteSelected', undefined, {
              count: String(selected.size),
            })}
          </Button>
        </div>
        <p className='text-xs text-muted-foreground'>
          {t('reviewReminder.selectionHelp')}
        </p>
      </div>
      {candidates.length === 0 && <p>{t('reviewReminder.listEmpty')}</p>}
      {candidates.length > 0 && visible.length === 0 && (
        <p>{t('reviewReminder.searchEmpty')}</p>
      )}
      <ul className='space-y-3' aria-label={t('reviewReminder.results')}>
        {visible.map((candidate) => (
          <li key={candidate.id}>
            <ReviewCandidateRow
              candidate={candidate}
              checked={selected.has(candidate.id)}
              disabled={
                disabled ||
                (!selected.has(candidate.id) &&
                  selected.size >= SELECTION_LIMIT)
              }
              dateFormat={dateFormat}
              onDelete={onDelete}
              onSelect={handleSelect}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}
