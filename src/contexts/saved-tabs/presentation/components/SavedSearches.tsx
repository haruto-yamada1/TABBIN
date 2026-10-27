import { Bookmark, Pencil, Trash2 } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  SAVED_SEARCH_NAME_MAX_LENGTH,
  SAVED_SEARCH_QUERY_MAX_LENGTH,
  SAVED_SEARCHES_MAX_COUNT,
} from '@/contexts/saved-tabs/application/ports/SavedSearchesPort'
import type { SavedSearch } from '@/contexts/saved-tabs/application/ports/SavedSearchesPort'
import { useI18n } from '@/features/i18n/context/I18nProvider'

type SavedSearchesProps = {
  readonly searchQuery: string
  readonly searches: readonly SavedSearch[]
  readonly loading: boolean
  readonly loadError: boolean
  readonly onSave: (name: string, query: string) => Promise<void>
  readonly onRename: (id: string, name: string) => Promise<void>
  readonly onRemove: (id: string) => Promise<void>
  readonly onApply: (query: string) => void
}

type RowProps = {
  readonly search: SavedSearch
  readonly pending: boolean
  readonly apply: (search: SavedSearch) => void
  readonly edit: (search: SavedSearch) => void
  readonly remove: (id: string) => void
}

const SavedSearchRow = ({ search, pending, apply, edit, remove }: RowProps) => {
  const { t } = useI18n()
  const handleApply = useCallback(() => {
    apply(search)
  }, [apply, search])
  const handleEdit = useCallback(() => {
    edit(search)
  }, [edit, search])
  const handleRemove = useCallback(() => {
    remove(search.id)
  }, [remove, search.id])
  return (
    <div className='flex items-center gap-1'>
      <Button
        type='button'
        variant='ghost'
        className='h-auto min-w-0 flex-1 justify-start text-left whitespace-normal'
        aria-label={t('savedTabs.applySearch', undefined, {
          name: search.name,
        })}
        disabled={pending}
        onClick={handleApply}
      >
        <span className='min-w-0 truncate'>
          {search.name}{' '}
          <span className='text-xs text-muted-foreground'>{search.query}</span>
        </span>
      </Button>
      <Button
        type='button'
        variant='ghost'
        size='icon-sm'
        disabled={pending}
        aria-label={t('savedTabs.renameSearch', undefined, {
          name: search.name,
        })}
        onClick={handleEdit}
      >
        <Pencil />
      </Button>
      <Button
        type='button'
        variant='ghost'
        size='icon-sm'
        disabled={pending}
        aria-label={t('savedTabs.removeSearch', undefined, {
          name: search.name,
        })}
        onClick={handleRemove}
      >
        <Trash2 />
      </Button>
    </div>
  )
}

type SearchFormProps = {
  readonly inputRef: React.RefObject<HTMLInputElement | null>
  readonly name: string
  readonly onChange: (event: React.ChangeEvent<HTMLInputElement>) => void
  readonly onSubmit: (event: React.SubmitEvent<HTMLFormElement>) => void
  readonly disabled: boolean
  readonly editingId: string | null
  readonly cancel: () => void
  readonly searchQuery: string
  readonly nameTooLong: boolean
  readonly queryTooLong: boolean
  readonly listFull: boolean
  readonly cannotSave: boolean
}

const SavedSearchForm = ({
  inputRef,
  name,
  onChange: handleChange,
  onSubmit: handleSubmit,
  disabled,
  editingId,
  cancel,
  searchQuery,
  nameTooLong,
  queryTooLong,
  listFull,
  cannotSave,
}: SearchFormProps) => {
  const { t } = useI18n()
  return (
    <>
      <form onSubmit={handleSubmit} className='flex items-center gap-2'>
        <Input
          ref={inputRef}
          aria-label={t('savedTabs.savedSearchName')}
          placeholder={t('savedTabs.savedSearchName')}
          value={name}
          onChange={handleChange}
          disabled={disabled}
        />
        <Button
          type='submit'
          disabled={
            disabled ||
            !name.trim() ||
            nameTooLong ||
            cannotSave ||
            (!editingId && !searchQuery.trim())
          }
        >
          {t(
            editingId
              ? 'savedTabs.confirmSearchRename'
              : 'savedTabs.saveSearch',
          )}
        </Button>
        {editingId && (
          <Button
            type='button'
            variant='ghost'
            disabled={disabled}
            onClick={cancel}
          >
            {t('common.cancel')}
          </Button>
        )}
      </form>
      {nameTooLong && (
        <p className='text-sm text-destructive'>
          {t('savedTabs.savedSearchNameLimit')}
        </p>
      )}
      {!editingId && queryTooLong && (
        <p className='text-sm text-destructive'>
          {t('savedTabs.savedSearchQueryLimit')}
        </p>
      )}
      {!editingId && listFull && (
        <p className='text-sm text-destructive'>
          {t('savedTabs.savedSearchCountLimit')}
        </p>
      )}
    </>
  )
}

export const SavedSearches = ({
  searchQuery,
  searches,
  loading,
  loadError,
  onSave,
  onRename,
  onRemove,
  onApply,
}: SavedSearchesProps) => {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const disabled = pending || loading || loadError
  const nameTooLong = name.trim().length > SAVED_SEARCH_NAME_MAX_LENGTH
  const queryTooLong = searchQuery.length > SAVED_SEARCH_QUERY_MAX_LENGTH
  const listFull = searches.length >= SAVED_SEARCHES_MAX_COUNT
  const cannotSave = !editingId && (queryTooLong || listFull)

  const submit = useCallback(
    async (event: React.SubmitEvent<HTMLFormElement>) => {
      event.preventDefault()
      const trimmed = name.trim()
      if (
        disabled ||
        !trimmed ||
        nameTooLong ||
        cannotSave ||
        (!editingId && !searchQuery.trim())
      ) {
        return
      }
      setError(false)
      setPending(true)
      try {
        if (editingId) {
          await onRename(editingId, trimmed)
        } else {
          await onSave(trimmed, searchQuery)
        }
        setName('')
        setEditingId(null)
      } catch {
        setError(true)
      } finally {
        setPending(false)
      }
    },
    [
      cannotSave,
      disabled,
      editingId,
      name,
      nameTooLong,
      onRename,
      onSave,
      searchQuery,
    ],
  )

  const remove = useCallback(
    (id: string) => {
      if (disabled) {
        return
      }
      setError(false)
      setPending(true)
      void onRemove(id)
        .then(() => {
          if (editingId === id) {
            setEditingId(null)
            setName('')
          }
        })
        .catch(() => {
          setError(true)
        })
        .finally(() => {
          setPending(false)
        })
    },
    [disabled, editingId, onRemove],
  )
  const apply = useCallback(
    (search: SavedSearch) => {
      onApply(search.query)
      setOpen(false)
    },
    [onApply],
  )
  const edit = useCallback((search: SavedSearch) => {
    setEditingId(search.id)
    setName(search.name)
    setError(false)
    inputRef.current?.focus()
  }, [])
  const cancel = useCallback(() => {
    setEditingId(null)
    setName('')
    setError(false)
  }, [])
  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setName(event.target.value)
    },
    [],
  )
  const handleSubmit = useCallback(
    (event: React.SubmitEvent<HTMLFormElement>) => {
      void submit(event)
    },
    [submit],
  )

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type='button'
          variant='outline'
          size='icon'
          title={t('savedTabs.savedSearches')}
          aria-label={t('savedTabs.savedSearches')}
        >
          <Bookmark size={16} />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('savedTabs.savedSearches')}</DialogTitle>
          <DialogDescription>
            {t('savedTabs.savedSearchDescription')}
          </DialogDescription>
        </DialogHeader>
        {loading && <output>{t('savedTabs.savedSearchLoading')}</output>}
        {loadError && (
          <p role='alert' className='text-sm text-destructive'>
            {t('savedTabs.savedSearchLoadError')}
          </p>
        )}
        {!loading && !loadError && (
          <>
            <SavedSearchForm
              inputRef={inputRef}
              name={name}
              onChange={handleChange}
              onSubmit={handleSubmit}
              disabled={disabled}
              editingId={editingId}
              cancel={cancel}
              searchQuery={searchQuery}
              nameTooLong={nameTooLong}
              queryTooLong={queryTooLong}
              listFull={listFull}
              cannotSave={cannotSave}
            />
            {error && (
              <p role='alert' className='text-sm text-destructive'>
                {t('savedTabs.savedSearchError')}
              </p>
            )}
            {searches.length === 0 ? (
              <p className='text-sm text-muted-foreground'>
                {t('savedTabs.noSavedSearches')}
              </p>
            ) : (
              <ul className='max-h-64 space-y-1 overflow-y-auto'>
                {searches.map((search) => (
                  <li key={search.id}>
                    <SavedSearchRow
                      search={search}
                      pending={disabled}
                      apply={apply}
                      edit={edit}
                      remove={remove}
                    />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
