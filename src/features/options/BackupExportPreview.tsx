import { useCallback, useMemo, useState } from 'react'
import type { ChangeEvent } from 'react'

import { Button } from '@/components/ui/button'
import { DialogFooter } from '@/components/ui/dialog'
import { useI18n } from '@/features/i18n/context/I18nProvider'
import { BACKUP_MAX_SERIALIZED_SIZE_LABEL } from '@/lib/persistence/backupResourcePolicy'

import { BackupExportCollections } from './BackupExportCollections'
import {
  createBackupExportSelection,
  prepareBackupExport,
} from './lib/import-export/v2/BackupV2ExportSelection'
import { BACKUP_IMPORT_SECTIONS } from './lib/import-export/v2/BackupV2ImportDiff'
import type { BackupEnvelopeV2 } from './lib/import-export/v2/BackupV2Schema'

export const BackupExportPreview = ({
  backup,
  disabled,
  onCancel,
  onConfirm,
}: {
  readonly backup: BackupEnvelopeV2
  readonly disabled: boolean
  readonly onCancel: () => void
  readonly onConfirm: (backup: BackupEnvelopeV2) => void
}) => {
  const { t } = useI18n()
  const [selection, setSelection] = useState(() =>
    createBackupExportSelection(backup),
  )
  const { envelope, counts } = useMemo(
    () => prepareBackupExport(backup, selection),
    [backup, selection],
  )
  const handleSectionChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const section = BACKUP_IMPORT_SECTIONS.find(
        (key) => key === event.target.name,
      )
      if (section) {
        const { checked } = event.target
        setSelection((current) => ({
          ...current,
          sections: { ...current.sections, [section]: checked },
        }))
      }
    },
    [],
  )
  const confirm = useCallback(() => {
    onConfirm(envelope)
  }, [envelope, onConfirm])

  return (
    <>
      <div className='min-h-0 space-y-4 overflow-y-auto pr-2'>
        <fieldset disabled={disabled} className='space-y-2'>
          <legend className='mb-2 font-medium'>
            {t('options.importExport.exportSections')}
          </legend>
          {BACKUP_IMPORT_SECTIONS.map((section) => (
            <label key={section} className='flex items-center gap-2 text-sm'>
              <input
                type='checkbox'
                checked={selection.sections[section]}
                name={section}
                onChange={handleSectionChange}
              />
              {t(`options.importExport.section.${section}`)}
            </label>
          ))}
        </fieldset>
        {selection.sections.savedTabs && (
          <BackupExportCollections
            backup={backup}
            disabled={disabled}
            selection={selection}
            onSelectionChange={setSelection}
          />
        )}
        <section aria-label={t('options.importExport.exportCounts')}>
          <h3 className='mb-2 text-sm font-medium'>
            {t('options.importExport.exportCounts')}
          </h3>
          <dl className='grid grid-cols-2 gap-x-4 gap-y-1 text-sm'>
            {Object.entries(counts).map(([entity, count]) => (
              <div key={entity} className='flex justify-between gap-2'>
                <dt>{t(`options.importExport.entity.${entity}`)}</dt>
                <dd>{count.toLocaleString()}</dd>
              </div>
            ))}
          </dl>
        </section>
        <p className='text-sm text-muted-foreground'>
          {t('options.importExport.exportPrivacy')}
        </p>
        <p className='text-sm text-muted-foreground'>
          {t('options.importExport.exportPartialWarning')}
        </p>
        <p className='text-xs text-muted-foreground'>
          {t('options.importExport.exportSizeLimit', undefined, {
            maxSize: BACKUP_MAX_SERIALIZED_SIZE_LABEL,
          })}
        </p>
      </div>
      <DialogFooter className='shrink-0 gap-2'>
        <Button variant='outline' disabled={disabled} onClick={onCancel}>
          {t('options.importExport.cancel')}
        </Button>
        <Button
          disabled={
            disabled || !Object.values(selection.sections).some(Boolean)
          }
          onClick={confirm}
        >
          {disabled
            ? t('options.importExport.exporting')
            : t('options.importExport.confirmExport')}
        </Button>
      </DialogFooter>
    </>
  )
}
