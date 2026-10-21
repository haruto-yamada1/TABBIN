import { useCallback } from 'react'
import { toast } from 'sonner'

import { useCopyState } from '@/components/ai-elements/use-copy-state'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { UrlOpeningOperation } from '@/contexts/saved-tabs/presentation/app/handlers/useTabOpeningHandlers'
import { useI18n } from '@/features/i18n/context/I18nProvider'

const displayUrl = (value: string): string => {
  try {
    const url = new URL(value)
    url.username = ''
    url.password = ''
    return url.href
  } catch {
    return value
  }
}

const FailedUrl = ({
  failure,
}: {
  readonly failure: UrlOpeningOperation['failedUrls'][number]
}) => {
  const { t } = useI18n()
  const { copyText, isCopied } = useCopyState({
    onError: () => toast.error(t('savedTabs.opening.copyError')),
  })
  const handleCopy = useCallback(() => {
    void copyText(failure.url)
  }, [copyText, failure.url])
  return (
    <div className='space-y-2 rounded-md border p-3'>
      <p className='text-sm'>{t(`savedTabs.opening.${failure.reason}`)}</p>
      <div className='flex flex-wrap items-center gap-2'>
        <Input
          className='min-w-0 flex-1'
          aria-label={t('savedTabs.opening.failedUrl')}
          readOnly
          value={displayUrl(failure.url)}
        />
        <Button type='button' variant='outline' size='sm' onClick={handleCopy}>
          {t(isCopied ? 'savedTabs.opening.copied' : 'savedTabs.opening.copy')}
        </Button>
      </div>
    </div>
  )
}

const OpeningProgress = ({
  operation,
  onCancel,
}: {
  readonly operation: UrlOpeningOperation
  readonly onCancel: (() => void) | undefined
}) => {
  const { t } = useI18n()
  const running =
    operation.status === 'running' || operation.status === 'cancelling'
  const cancelling = operation.status === 'cancelling'
  const failed = operation.failed ?? operation.failedUrls.length
  const completed = operation.opened + failed
  return (
    <>
      <output className='block text-sm font-medium'>
        {running
          ? `${t('savedTabs.opening.running', undefined, {
              count: String(operation.total),
            })} ${t('savedTabs.opening.progress', undefined, {
              completed: String(completed),
              total: String(operation.total),
            })}`
          : t('savedTabs.opening.summary', undefined, {
              opened: String(operation.opened),
              total: String(operation.total),
            })}
      </output>
      <p className='text-sm text-muted-foreground'>
        {t('savedTabs.opening.counts', undefined, {
          opened: String(operation.opened),
          failed: String(failed),
        })}
      </p>
      {running && (
        <progress
          className='h-2 w-full accent-primary'
          aria-label={t('savedTabs.opening.result')}
          aria-valuenow={completed}
          max={operation.total}
          value={completed}
        />
      )}
      {cancelling && (
        <p className='text-sm text-muted-foreground'>
          {t('savedTabs.opening.cancelling')}
        </p>
      )}
      {operation.status === 'cancelled' && (
        <p className='text-sm'>{t('savedTabs.opening.cancelled')}</p>
      )}
      {running && operation.canCancel && onCancel && (
        <Button
          type='button'
          variant='outline'
          disabled={cancelling}
          onClick={onCancel}
        >
          {t(
            cancelling
              ? 'savedTabs.opening.cancelPending'
              : 'savedTabs.opening.cancel',
          )}
        </Button>
      )}
    </>
  )
}

const UnstartedUrls = ({
  urls,
  onResume,
}: {
  readonly urls: readonly string[] | undefined
  readonly onResume: (() => Promise<void>) | undefined
}) => {
  const { t } = useI18n()
  const handleResume = useCallback(() => {
    void onResume?.()
  }, [onResume])
  const count = urls?.length ?? 0
  if (count === 0) {
    return null
  }
  return (
    <div className='space-y-2'>
      <p className='text-sm text-muted-foreground'>
        {t('savedTabs.opening.unstarted', undefined, { count: String(count) })}
      </p>
      {onResume && (
        <Button type='button' variant='outline' onClick={handleResume}>
          {t('savedTabs.opening.resume')}
        </Button>
      )}
    </div>
  )
}

const OpeningFailures = ({
  failures,
  running,
  onRetry,
}: {
  readonly failures: UrlOpeningOperation['failedUrls']
  readonly running: boolean
  readonly onRetry: () => Promise<void>
}) => {
  const { t } = useI18n()
  const handleRetry = useCallback(() => {
    void onRetry()
  }, [onRetry])
  return (
    <>
      <p className='text-sm text-muted-foreground'>
        {t('savedTabs.opening.retained')}
      </p>
      <ul className='max-h-72 space-y-2 overflow-y-auto'>
        {[
          ...new Map(
            failures.map((failure) => [failure.url, failure]),
          ).values(),
        ].map((failure) => (
          <li key={failure.url}>
            <FailedUrl failure={failure} />
          </li>
        ))}
      </ul>
      <Button
        type='button'
        variant='outline'
        disabled={running}
        onClick={handleRetry}
      >
        {t('savedTabs.opening.retry')}
      </Button>
    </>
  )
}

export const UrlOpeningResult = ({
  operation,
  onRetry,
  onCancel,
  onResume,
}: {
  readonly operation: UrlOpeningOperation | null
  readonly onRetry: () => Promise<void>
  readonly onCancel?: (() => void) | undefined
  readonly onResume?: (() => Promise<void>) | undefined
}) => {
  const { t } = useI18n()
  if (!operation) {
    return null
  }
  const running =
    operation.status === 'running' || operation.status === 'cancelling'
  return (
    <section
      aria-label={t('savedTabs.opening.result')}
      className='my-3 w-full space-y-3 rounded-lg border p-4'
    >
      <OpeningProgress operation={operation} onCancel={onCancel} />
      {!running && (
        <UnstartedUrls urls={operation.cancelledUrls} onResume={onResume} />
      )}
      {operation.postProcessingFailed && (
        <p role='alert' className='text-sm text-destructive'>
          {t('savedTabs.opening.postProcessingError')}
        </p>
      )}
      {operation.failedUrls.length > 0 && (
        <OpeningFailures
          failures={operation.failedUrls}
          running={running}
          onRetry={onRetry}
        />
      )}
    </section>
  )
}
