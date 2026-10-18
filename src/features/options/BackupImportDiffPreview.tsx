import { useCallback, useState } from 'react'
import type { ChangeEvent } from 'react'

import { Button } from '@/components/ui/button'
import { useI18n } from '@/features/i18n/context/I18nProvider'

import { BACKUP_IMPORT_SECTIONS } from './lib/import-export/v2/BackupV2ImportDiff'
import type {
  BackupImportChange,
  BackupImportSelection,
} from './lib/import-export/v2/BackupV2ImportDiff'

const PAGE_SIZE = 20
export const BackupImportDiffPreview = ({
  changes,
  selection,
  onSelectionChange,
  disabled,
}: {
  readonly changes: readonly BackupImportChange[]
  readonly selection: BackupImportSelection
  readonly onSelectionChange: (selection: BackupImportSelection) => void
  readonly disabled: boolean
}) => {
  const { t } = useI18n()
  const [page, setPage] = useState(0)
  const selectedChanges = changes.filter(({ section }) => selection[section])
  const pageCount = Math.max(1, Math.ceil(selectedChanges.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount - 1)
  const handleSectionChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const section = BACKUP_IMPORT_SECTIONS.find(
        (key) => key === event.target.name,
      )
      if (section) {
        setPage(0)
        onSelectionChange({ ...selection, [section]: event.target.checked })
      }
    },
    [onSelectionChange, selection],
  )
  const previousPage = useCallback(() => {
    setPage(currentPage - 1)
  }, [currentPage])
  const nextPage = useCallback(() => {
    setPage(currentPage + 1)
  }, [currentPage])
  return (
    <section
      className='space-y-3'
      aria-label={t('options.importExport.diffTitle')}
    >
      <fieldset disabled={disabled} className='space-y-2'>
        <legend className='mb-2 font-medium'>
          {t('options.importExport.restoreSections')}
        </legend>
        <p className='mb-2 text-xs text-muted-foreground'>
          {t('options.importExport.selectionHelp')}
        </p>
        {BACKUP_IMPORT_SECTIONS.map((section) => (
          <label key={section} className='flex items-center gap-2 text-sm'>
            <input
              type='checkbox'
              checked={selection[section]}
              name={section}
              onChange={handleSectionChange}
            />
            {t(`options.importExport.section.${section}`)}
          </label>
        ))}
      </fieldset>
      <output className='block text-sm font-medium'>
        {t('options.importExport.diffCounts', undefined, {
          added: String(
            selectedChanges.filter(({ kind }) => kind === 'added').length,
          ),
          updated: String(
            selectedChanges.filter(({ kind }) => kind === 'updated').length,
          ),
          deleted: String(
            selectedChanges.filter(({ kind }) => kind === 'deleted').length,
          ),
        })}
      </output>
      {selectedChanges.length === 0 ? (
        <p className='text-sm text-muted-foreground'>
          {t('options.importExport.noChanges')}
        </p>
      ) : (
        <ul
          className='max-h-56 divide-y overflow-y-auto rounded border px-2'
          aria-label={t('options.importExport.diffTitle')}
        >
          {selectedChanges
            .slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)
            .map((change) => (
              <li
                key={JSON.stringify([change.entity, change.id])}
                className='py-2 text-xs break-words'
              >
                <span className='font-semibold'>
                  {t(`options.importExport.change.${change.kind}`)}
                </span>
                {' · '}
                {t(`options.importExport.entity.${change.entity}`)}
                <p className='whitespace-pre-wrap'>
                  {change.before &&
                  change.after &&
                  change.before !== change.after
                    ? `${change.before} → ${change.after}`
                    : change.after || change.before || change.id}
                </p>
                {(change.before || change.after) && (
                  <p className='text-muted-foreground'>{change.id}</p>
                )}
              </li>
            ))}
        </ul>
      )}
      {pageCount > 1 && (
        <nav
          className='flex items-center justify-between gap-2'
          aria-label={t('options.importExport.diffPages')}
        >
          <Button
            size='sm'
            variant='outline'
            disabled={currentPage === 0}
            onClick={previousPage}
          >
            {t('options.importExport.previousPage')}
          </Button>
          <span className='text-xs'>
            {currentPage + 1} / {pageCount}
          </span>
          <Button
            size='sm'
            variant='outline'
            disabled={currentPage + 1 >= pageCount}
            onClick={nextPage}
          >
            {t('options.importExport.nextPage')}
          </Button>
        </nav>
      )}
    </section>
  )
}
