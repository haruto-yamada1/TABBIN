import { AlertTriangle, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { useI18n } from '@/features/i18n/context/I18nProvider'
import { formatLocalizedDate } from '@/features/i18n/lib/date-format'
import { LEGACY_BACKUP_POLICY } from '@/features/options/lib/import-export/compatibility/legacyBackupPolicy'

import { getPersistenceMigrationNoticeController } from './persistenceMigrationNoticeController'
import type { PersistenceMigrationNoticeControllerPort } from './persistenceMigrationNoticeController'

export type PersistenceMigrationNoticeProps = {
  readonly controller?: PersistenceMigrationNoticeControllerPort
}

export const PersistenceMigrationNotice = ({
  controller: providedController,
}: PersistenceMigrationNoticeProps) => {
  const { language, t } = useI18n()
  const controller =
    providedController ?? getPersistenceMigrationNoticeController()
  const [isDismissing, setIsDismissing] = useState(false)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    let active = true

    void controller
      .shouldShow()
      .then((shouldShow) => {
        if (active) {
          setIsVisible(shouldShow)
        }
      })
      .catch(() => {
        if (active) {
          setIsVisible(false)
        }
      })

    return () => {
      active = false
    }
  }, [controller])

  const handleDismiss = useCallback(() => {
    setIsVisible(false)
    setIsDismissing(true)
    void controller.dismiss().finally(() => {
      setIsDismissing(false)
    })
  }, [controller])

  if (!isVisible) {
    return null
  }

  const cutoffDate = formatLocalizedDate(
    language,
    LEGACY_BACKUP_POLICY.cutoffDate,
  )
  const lastSupportedDate = formatLocalizedDate(
    language,
    LEGACY_BACKUP_POLICY.lastSupportedDate,
  )

  return (
    <section
      aria-live='polite'
      className='mx-auto mb-4 flex max-w-5xl gap-3 rounded-lg border border-amber-500/60 bg-amber-50 p-4 text-amber-950 shadow-sm dark:bg-amber-950/30 dark:text-amber-50'
      role='alert'
    >
      <AlertTriangle aria-hidden='true' className='mt-0.5 size-5 shrink-0' />
      <div className='min-w-0 flex-1 space-y-1'>
        <h2 className='font-semibold'>
          {t('persistenceMigrationNotice.title')}
        </h2>
        <p className='text-sm'>
          {t('persistenceMigrationNotice.warning', undefined, { cutoffDate })}
        </p>
        <p className='text-sm'>
          {t('persistenceMigrationNotice.message', undefined, {
            lastSupportedDate,
          })}
        </p>
        <a
          className='inline-flex pt-1 text-sm font-medium underline underline-offset-4'
          href='#/options'
        >
          {t('persistenceMigrationNotice.importExportLink')}
        </a>
      </div>
      <Button
        aria-label={t('persistenceMigrationNotice.dismiss')}
        disabled={isDismissing}
        onClick={handleDismiss}
        size='icon'
        type='button'
        variant='ghost'
      >
        <X aria-hidden='true' className='size-4' />
      </Button>
    </section>
  )
}
