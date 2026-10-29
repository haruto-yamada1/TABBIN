import { useCallback, useMemo, useState } from 'react'
import type { ChangeEvent } from 'react'

import { Button } from '@/components/ui/button'
import { useI18n } from '@/features/i18n/context/I18nProvider'

import type { BackupExportSelection } from './lib/import-export/v2/BackupV2ExportSelection'
import type { BackupEnvelopeV2 } from './lib/import-export/v2/BackupV2Schema'

const PAGE_SIZE = 20

export const BackupExportCollections = ({
  backup,
  disabled,
  selection,
  onSelectionChange,
}: {
  readonly backup: BackupEnvelopeV2
  readonly disabled: boolean
  readonly selection: BackupExportSelection
  readonly onSelectionChange: (selection: BackupExportSelection) => void
}) => {
  const { t } = useI18n()
  const [page, setPage] = useState(0)
  const collections = backup.data.savedTabs.collections
  const selectedIds = useMemo(
    () => new Set(selection.collectionIds),
    [selection.collectionIds],
  )
  const uncollectedCount = useMemo(() => {
    const referenced = new Set(
      backup.data.savedTabs.memberships.map(({ urlId }) => urlId),
    )
    return backup.data.savedTabs.urls.filter(({ id }) => !referenced.has(id))
      .length
  }, [backup])
  const changeCollection = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const id = event.target.value
      onSelectionChange({
        ...selection,
        collectionIds: event.target.checked
          ? [...selection.collectionIds, id]
          : selection.collectionIds.filter((selected) => selected !== id),
      })
    },
    [onSelectionChange, selection],
  )
  const changeUncollected = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onSelectionChange({
        ...selection,
        includeUncollectedUrls: event.target.checked,
      })
    },
    [onSelectionChange, selection],
  )
  const previousPage = useCallback(() => {
    setPage((value) => value - 1)
  }, [])
  const nextPage = useCallback(() => {
    setPage((value) => value + 1)
  }, [])
  const pageCount = Math.max(1, Math.ceil(collections.length / PAGE_SIZE))

  return (
    <fieldset disabled={disabled} className='space-y-2 rounded border p-3'>
      <legend className='px-1 text-sm font-medium'>
        {t('options.importExport.exportCollections')}
      </legend>
      <p className='text-xs text-muted-foreground'>
        {t('options.importExport.exportSharedUrls')}
      </p>
      {collections
        .slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
        .map((collection) => (
          <label key={collection.id} className='flex items-start gap-2 text-sm'>
            <input
              type='checkbox'
              value={collection.id}
              checked={selectedIds.has(collection.id)}
              onChange={changeCollection}
              className='mt-1'
            />
            <span className='break-all'>{collection.name}</span>
          </label>
        ))}
      {uncollectedCount > 0 && (
        <label className='flex items-center gap-2 text-sm'>
          <input
            type='checkbox'
            checked={selection.includeUncollectedUrls}
            onChange={changeUncollected}
          />
          {t('options.importExport.exportUncollected', undefined, {
            count: String(uncollectedCount),
          })}
        </label>
      )}
      {pageCount > 1 && (
        <nav
          className='flex items-center justify-between gap-2'
          aria-label={t('options.importExport.exportCollectionPages')}
        >
          <Button
            size='sm'
            variant='outline'
            disabled={page === 0}
            onClick={previousPage}
          >
            {t('options.importExport.previousPage')}
          </Button>
          <span className='text-xs'>
            {page + 1} / {pageCount}
          </span>
          <Button
            size='sm'
            variant='outline'
            disabled={page + 1 >= pageCount}
            onClick={nextPage}
          >
            {t('options.importExport.nextPage')}
          </Button>
        </nav>
      )}
    </fieldset>
  )
}
