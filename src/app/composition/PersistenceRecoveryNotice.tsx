import { useCallback, useState, useSyncExternalStore } from 'react'

import { Button } from '@/components/ui/button'
import type { PersistenceRecoveryControllerPort } from '@/contexts/saved-tabs/application/ports/PersistenceBootstrapPort'
import { useI18n } from '@/features/i18n/context/I18nProvider'

import { getPersistenceRecoveryController } from './createPersistenceRecoveryController'

export type PersistenceRecoveryNoticeProps = {
  readonly recovery?: PersistenceRecoveryControllerPort
}

export const PersistenceRecoveryNotice = ({
  recovery: providedRecovery,
}: PersistenceRecoveryNoticeProps) => {
  const { t } = useI18n()
  const recovery = providedRecovery ?? getPersistenceRecoveryController()
  const state = useSyncExternalStore(
    recovery.subscribe,
    recovery.getSnapshot,
    recovery.getSnapshot,
  )
  const [actionError, setActionError] = useState(false)
  const [isRetrying, setIsRetrying] = useState(false)

  const handleRetry = useCallback((): void => {
    setActionError(false)
    setIsRetrying(true)
    void recovery
      .retry()
      .catch(() => {
        // The recovery controller retains the latest typed error for this notice.
      })
      .finally(() => {
        setIsRetrying(false)
      })
  }, [recovery])

  const diagnosticText = state.status === 'unavailable' ? state.errorCode : ''
  const handleCopyDiagnostic = useCallback((): void => {
    setActionError(false)
    void Promise.resolve()
      .then(async () => navigator.clipboard.writeText(diagnosticText))
      .catch(() => {
        setActionError(true)
      })
  }, [diagnosticText])

  if (state.status === 'available') {
    return null
  }

  return (
    <section
      aria-live='assertive'
      className='fixed inset-x-4 top-4 z-100 mx-auto flex max-w-3xl flex-col gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-foreground shadow-lg'
      role='alert'
    >
      <div>
        <h2 className='font-semibold'>
          {t('options.persistenceRecovery.title', 'Storage recovery required')}
        </h2>
        <p className='text-sm text-foreground/80'>
          {t(
            'options.persistenceRecovery.description',
            'Database could not be opened. Existing data has not been deleted.',
          )}
        </p>
      </div>
      <details className='rounded-md border border-border/60 bg-background/60 p-2 text-xs'>
        <summary className='cursor-pointer'>
          {t('options.persistenceRecovery.diagnostic', 'Error code')}
        </summary>
        <pre className='mt-2 overflow-auto whitespace-pre-wrap'>
          {diagnosticText}
        </pre>
        <Button
          className='mt-2'
          onClick={handleCopyDiagnostic}
          size='sm'
          type='button'
          variant='ghost'
        >
          {t('options.persistenceRecovery.copyDiagnostic', 'Copy error code')}
        </Button>
      </details>
      {actionError ? (
        <p className='text-sm text-destructive'>
          {t(
            'options.persistenceRecovery.actionFailed',
            'The action could not be completed. Try again.',
          )}
        </p>
      ) : null}
      <div className='flex flex-wrap justify-end gap-2'>
        <Button
          disabled={isRetrying}
          onClick={handleRetry}
          type='button'
          variant='outline'
        >
          {t('options.persistenceRecovery.retry', 'Retry')}
        </Button>
      </div>
    </section>
  )
}
