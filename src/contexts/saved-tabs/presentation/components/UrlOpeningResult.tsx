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

export const UrlOpeningResult = ({
  operation,
  onRetry,
}: {
  readonly operation: UrlOpeningOperation | null
  readonly onRetry: () => Promise<void>
}) => {
  const { t } = useI18n()
  const handleRetry = useCallback(() => {
    void onRetry()
  }, [onRetry])
  if (!operation) {
    return null
  }
  const running = operation.status === 'running'
  return (
    <section
      aria-label={t('savedTabs.opening.result')}
      aria-busy={running}
      className='my-3 w-full space-y-3 rounded-lg border p-4'
    >
      <output className='block text-sm font-medium'>
        {running
          ? t('savedTabs.opening.running', undefined, {
              count: String(operation.total),
            })
          : t('savedTabs.opening.summary', undefined, {
              opened: String(operation.opened),
              total: String(operation.total),
            })}
      </output>
      {operation.postProcessingFailed && (
        <p role='alert' className='text-sm text-destructive'>
          {t('savedTabs.opening.postProcessingError')}
        </p>
      )}
      {operation.failedUrls.length > 0 && (
        <>
          <p className='text-sm text-muted-foreground'>
            {t('savedTabs.opening.retained')}
          </p>
          <ul className='max-h-72 space-y-2 overflow-y-auto'>
            {[
              ...new Map(
                operation.failedUrls.map((failure) => [failure.url, failure]),
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
      )}
    </section>
  )
}
