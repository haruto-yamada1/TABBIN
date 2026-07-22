import { useCallback, useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { useI18n } from '@/features/i18n/context/I18nProvider'

import { getMigrationPreflightController } from './createMigrationPreflightController'
import type { MigrationPreflightNoticeController } from './createMigrationPreflightController'

export type {
  MigrationPreflightNoticeController,
  MigrationPreflightNoticeState,
} from './createMigrationPreflightController'

export type MigrationPreflightNoticeProps = {
  readonly controller?: MigrationPreflightNoticeController
}

export const MigrationPreflightNotice = ({
  controller: providedController,
}: MigrationPreflightNoticeProps) => {
  const controller = providedController ?? getMigrationPreflightController()
  const { t } = useI18n()
  const [state, setState] = useState(() => controller.readStatus())
  const hasStartedInitialRun = useRef(false)

  const refresh = useCallback((): void => {
    setState(controller.readStatus())
  }, [controller])

  const runPreflight = useCallback((): void => {
    void controller.run().then(refresh, refresh)
  }, [controller, refresh])

  const copyDiagnostic = useCallback((): void => {
    void controller.copyDiagnostic().catch(() => {
      // The controller owns local failure handling; raw errors stay out of UI.
    })
  }, [controller])

  const backupCurrentData = useCallback((): void => {
    void controller.backupCurrentData().catch(() => {
      // The controller owns local failure handling; raw errors stay out of UI.
    })
  }, [controller])

  useEffect(() => {
    if (state.status !== 'not-run' || hasStartedInitialRun.current) {
      return
    }

    hasStartedInitialRun.current = true
    runPreflight()
  }, [runPreflight, state.status])

  if (state.status === 'not-run' || state.status === 'healthy') {
    return null
  }

  const description =
    state.status === 'stale'
      ? t(
          'options.migrationPreflight.staleDescription',
          '現在のデータは変更されています。',
        )
      : t(
          'options.migrationPreflight.description',
          '現在のデータは変更されていません。',
        )

  return (
    <section
      aria-live='assertive'
      className='fixed inset-x-4 top-4 z-100 mx-auto flex max-w-3xl flex-col gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-foreground shadow-lg'
      role='alert'
    >
      <div>
        <h2 className='font-semibold'>
          {t('options.migrationPreflight.title', '移行前チェックが必要です')}
        </h2>
        <p className='text-sm'>{description}</p>
      </div>
      <div className='flex flex-wrap gap-2'>
        <Button onClick={copyDiagnostic} type='button' variant='outline'>
          {t('options.migrationPreflight.copyDiagnostic', '診断情報をコピー')}
        </Button>
        <Button onClick={backupCurrentData} type='button' variant='outline'>
          {t(
            'options.migrationPreflight.backupCurrentData',
            '現在のデータをバックアップ',
          )}
        </Button>
        <Button onClick={runPreflight} type='button' variant='outline'>
          {t('options.migrationPreflight.retry', '再試行')}
        </Button>
      </div>
    </section>
  )
}
