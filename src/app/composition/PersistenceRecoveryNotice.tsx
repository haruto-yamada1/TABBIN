import { useCallback, useState, useSyncExternalStore } from 'react'

import { Button } from '@/components/ui/button'
import type { PersistenceRecoveryControllerPort } from '@/contexts/saved-tabs/application/ports/PersistenceBootstrapPort'
import { getPersistenceBootstrapRuntime } from '@/contexts/saved-tabs/infrastructure/composition/persistenceBootstrapRuntime'
import { useI18n } from '@/features/i18n/context/I18nProvider'

export type PersistenceRecoveryNoticeProps = {
  readonly recovery?: PersistenceRecoveryControllerPort
}

export const PersistenceRecoveryNotice = ({
  recovery: providedRecovery,
}: PersistenceRecoveryNoticeProps) => {
  const { t } = useI18n()
  const recovery = providedRecovery ?? getPersistenceBootstrapRuntime().recovery
  const state = useSyncExternalStore(
    recovery.subscribe,
    recovery.getSnapshot,
    recovery.getSnapshot,
  )
  const [isRetrying, setIsRetrying] = useState(false)

  const handleRetry = useCallback((): void => {
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

  if (state.status === 'available') {
    return null
  }

  return (
    <section
      aria-live='assertive'
      className='fixed inset-x-4 top-4 z-100 mx-auto flex max-w-3xl flex-col gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-foreground shadow-lg sm:flex-row sm:items-center sm:justify-between'
      role='alert'
    >
      <div>
        <h2 className='font-semibold'>
          {t('options.persistenceRecovery.title', 'Storage recovery required')}
        </h2>
        <p className='text-sm text-muted-foreground'>
          {t(
            'options.persistenceRecovery.description',
            'The update could not be completed. Your previous data has not been deleted.',
          )}
        </p>
      </div>
      <Button
        disabled={isRetrying}
        onClick={handleRetry}
        type='button'
        variant='outline'
      >
        {t('options.persistenceRecovery.retry', 'Retry')}
      </Button>
    </section>
  )
}
