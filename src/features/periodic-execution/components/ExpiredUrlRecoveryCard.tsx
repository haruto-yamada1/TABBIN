import { useCallback, useEffect, useId, useRef, useState } from 'react'

import {
  EXPIRED_URL_RECOVERY_DAYS,
  getExpiredUrlRecovery,
} from '@/app/composition/expiredUrlRecovery'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { showUndoToast } from '@/components/ui/undo-toast'
import type { ExpiredUrlRecoveryDto } from '@/contexts/saved-tabs/public-api'
import { useI18n } from '@/features/i18n/context/I18nProvider'
import { formatLocaleDateTime } from '@/utils/localDateTime'

const PAGE_SIZE = 20
const MAX_TIMEOUT_MS = 2_147_483_647
const NUMBER_FORMATTERS = {
  en: new Intl.NumberFormat('en'),
  ja: new Intl.NumberFormat('ja'),
}

type RecoveryLoad =
  | { kind: 'loading' | 'error' }
  | { kind: 'ready'; entries: readonly ExpiredUrlRecoveryDto[] }

type RecoveryFeedback =
  | { kind: 'idle' | 'pending' | 'error' | 'unavailable' }
  | { kind: 'restored' | 'discarded'; count: number }

type RecoveryAction = 'restore' | 'restoreAll' | 'discard'
type RunRecoveryAction = (
  action: RecoveryAction,
  ids: readonly string[],
) => void

const useExpiredUrlRecovery = () => {
  const { t } = useI18n()
  const recovery = getExpiredUrlRecovery()
  const [load, setLoad] = useState<RecoveryLoad>({ kind: 'loading' })
  const [feedback, setFeedback] = useState<RecoveryFeedback>({ kind: 'idle' })
  const active = useRef(false)
  const requestGeneration = useRef(0)
  const mutating = useRef(false)

  const refresh = useCallback(async () => {
    if (!active.current) {
      return
    }
    const generation = ++requestGeneration.current
    await Promise.resolve()
      .then(recovery.list)
      .then((entries) => {
        if (generation === requestGeneration.current) {
          setLoad({ kind: 'ready', entries })
        }
      })
      .catch(() => {
        if (generation === requestGeneration.current) {
          setLoad({ kind: 'error' })
        }
      })
  }, [recovery])

  const reload = useCallback(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    active.current = true
    const refreshOnVisible = () => {
      if (document.visibilityState === 'visible') {
        reload()
      }
    }
    document.addEventListener('visibilitychange', refreshOnVisible)
    reload()
    return () => {
      active.current = false
      requestGeneration.current += 1
      document.removeEventListener('visibilitychange', refreshOnVisible)
    }
  }, [reload])

  useEffect(() => {
    try {
      const unsubscribe = recovery.subscribe(reload)
      return unsubscribe
    } catch {
      // Refresh on return to the page when change notifications are unavailable.
      return undefined
    }
  }, [recovery, reload])

  useEffect(() => {
    if (load.kind !== 'ready' || load.entries.length === 0) {
      return undefined
    }
    const nextDeadline = load.entries.reduce(
      (earliest, entry) => Math.min(earliest, entry.recoverUntil),
      Number.POSITIVE_INFINITY,
    )
    const delay = Math.min(
      MAX_TIMEOUT_MS,
      Math.max(1, nextDeadline - Date.now()),
    )
    const timer = setTimeout(reload, delay)
    return () => {
      clearTimeout(timer)
    }
  }, [load, reload])

  const mutate = useCallback(
    async (action: RecoveryAction, ids: readonly string[]) => {
      if (mutating.current) {
        return false
      }
      mutating.current = true
      setFeedback({ kind: 'pending' })
      try {
        const { result: count, undo } =
          action === 'restoreAll'
            ? await recovery.restoreWithUndo(ids)
            : { result: await recovery[action](ids), undo: undefined }
        await refresh()
        if (!active.current) {
          return false
        }
        if (count === 0) {
          setFeedback({ kind: 'unavailable' })
        } else {
          setFeedback({
            kind: action === 'discard' ? 'discarded' : 'restored',
            count,
          })
        }
        if (count > 0 && undo) {
          showUndoToast({
            message: t('periodicExecution.recovery.restoreCompleted'),
            onUndone: async () => {
              setFeedback({ kind: 'idle' })
              await refresh()
            },
            t,
            undo,
          })
        }
        return true
      } catch {
        if (active.current) {
          setFeedback({ kind: 'error' })
        }
        return false
      } finally {
        mutating.current = false
      }
    },
    [recovery, refresh, t],
  )

  return { feedback, load, mutate, reload }
}

const RecoveryRow = ({
  disabled,
  entry,
  name,
  onAction,
}: {
  readonly disabled: boolean
  readonly entry: ExpiredUrlRecoveryDto
  readonly name: string
  readonly onAction: RunRecoveryAction
}) => {
  const { language, t } = useI18n()
  const collectionNames = new Set(
    entry.memberships.map(({ categoryName, collectionName }) =>
      categoryName
        ? t('periodicExecution.recovery.categoryPath', undefined, {
            categoryName,
            collectionName,
          })
        : collectionName,
    ),
  )
  const restore = useCallback(() => {
    onAction('restore', [entry.id])
  }, [entry.id, onAction])
  const discard = useCallback(() => {
    onAction('discard', [entry.id])
  }, [entry.id, onAction])

  return (
    <div className='space-y-3 p-3 sm:p-4'>
      <div className='min-w-0 [overflow-wrap:anywhere]'>
        <h3 className='font-medium'>{name}</h3>
        {name !== entry.url && (
          <p className='text-sm text-muted-foreground'>{entry.url}</p>
        )}
      </div>
      <dl className='grid gap-2 text-sm sm:grid-cols-2'>
        <div>
          <dt className='text-muted-foreground'>
            {t('periodicExecution.recovery.removedOn')}
          </dt>
          <dd>
            <time dateTime={new Date(entry.expiredAt).toISOString()}>
              {formatLocaleDateTime(entry.expiredAt, language)}
            </time>
          </dd>
        </div>
        <div>
          <dt className='text-muted-foreground'>
            {t('periodicExecution.recovery.restoreBy')}
          </dt>
          <dd>
            <time dateTime={new Date(entry.recoverUntil).toISOString()}>
              {formatLocaleDateTime(entry.recoverUntil, language)}
            </time>
          </dd>
        </div>
        <div className='sm:col-span-2'>
          <dt className='text-muted-foreground'>
            {t('periodicExecution.recovery.originalLocations')}
          </dt>
          <dd className='flex flex-wrap gap-1 [overflow-wrap:anywhere]'>
            {Array.from(collectionNames, (label) => (
              <span key={label} className='rounded bg-muted px-2 py-0.5'>
                {label}
              </span>
            ))}
            {collectionNames.size === 0 &&
              t('periodicExecution.recovery.noLocation')}
          </dd>
        </div>
      </dl>
      <div className='flex flex-wrap gap-2'>
        <Button
          aria-label={t('periodicExecution.recovery.restoreTab', undefined, {
            name,
          })}
          disabled={disabled}
          onClick={restore}
          size='sm'
          type='button'
          variant='outline'
        >
          {t('periodicExecution.recovery.restore')}
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              aria-label={t(
                'periodicExecution.recovery.discardTab',
                undefined,
                { name },
              )}
              disabled={disabled}
              size='sm'
              type='button'
              variant='ghost'
              className='text-destructive'
            >
              {t('periodicExecution.recovery.discard')}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent className='[overflow-wrap:anywhere]'>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t('periodicExecution.recovery.discardTitle')}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t('periodicExecution.recovery.discardDescription', undefined, {
                  name,
                })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
              <AlertDialogAction onClick={discard} variant='destructive'>
                {t('periodicExecution.recovery.discard')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}

const RecoveryList = ({
  disabled,
  entries,
  onAction,
}: {
  readonly disabled: boolean
  readonly entries: readonly ExpiredUrlRecoveryDto[]
  readonly onAction: RunRecoveryAction
}) => {
  const { language, t } = useI18n()
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const showMore = useCallback(() => {
    setVisibleCount((current) => current + PAGE_SIZE)
  }, [])
  const restoreAll = useCallback(() => {
    onAction(
      'restoreAll',
      entries.map(({ id }) => id),
    )
  }, [entries, onAction])

  if (entries.length === 0) {
    return (
      <p className='text-sm text-muted-foreground'>
        {t('periodicExecution.recovery.empty')}
      </p>
    )
  }

  const countLabel = entries.length === 1 ? 'single' : 'count'
  return (
    <>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <p className='text-sm text-muted-foreground'>
          {t(`periodicExecution.recovery.${countLabel}`, undefined, {
            count: NUMBER_FORMATTERS[language].format(entries.length),
          })}
        </p>
        <Button
          disabled={disabled}
          onClick={restoreAll}
          size='sm'
          type='button'
        >
          {t('periodicExecution.recovery.restoreAll')}
        </Button>
      </div>
      <ul className='divide-y divide-border rounded-lg border border-border'>
        {entries.slice(0, visibleCount).map((entry) => {
          const name = entry.title.trim() || entry.url
          return (
            <li aria-label={name} key={entry.id}>
              <RecoveryRow
                disabled={disabled}
                entry={entry}
                name={name}
                onAction={onAction}
              />
            </li>
          )
        })}
      </ul>
      {entries.length > visibleCount && (
        <Button onClick={showMore} size='sm' type='button' variant='outline'>
          {t('periodicExecution.recovery.showMore')}
        </Button>
      )}
    </>
  )
}

const RecoveryStatus = ({
  feedback,
}: {
  readonly feedback: RecoveryFeedback
}) => {
  const { language, t } = useI18n()
  if (feedback.kind === 'idle') {
    return null
  }
  const values =
    'count' in feedback
      ? { count: NUMBER_FORMATTERS[language].format(feedback.count) }
      : undefined
  const message = t(
    `periodicExecution.recovery.${feedback.kind}`,
    undefined,
    values,
  )
  return feedback.kind === 'error' ? (
    <p role='alert' className='text-sm text-destructive'>
      {message}
    </p>
  ) : (
    <output className='block text-sm text-muted-foreground'>{message}</output>
  )
}

export const ExpiredUrlRecoveryCard = () => {
  const { t } = useI18n()
  const titleId = useId()
  const heading = useRef<HTMLHeadingElement>(null)
  const { feedback, load, mutate, reload } = useExpiredUrlRecovery()
  const runAction = useCallback<RunRecoveryAction>(
    (action, ids) => {
      void mutate(action, ids).then((changed) => {
        if (changed) {
          heading.current?.focus()
        }
      })
    },
    [mutate],
  )

  return (
    <section
      aria-labelledby={titleId}
      className='space-y-4 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6'
    >
      <div>
        <h2
          id={titleId}
          ref={heading}
          tabIndex={-1}
          className='text-xl font-semibold'
        >
          {t('periodicExecution.recovery.title')}
        </h2>
        <p className='mt-2 text-sm leading-6 text-muted-foreground'>
          {t('periodicExecution.recovery.description', undefined, {
            days: String(EXPIRED_URL_RECOVERY_DAYS),
          })}
        </p>
      </div>
      {load.kind === 'loading' && (
        <output className='block text-sm text-muted-foreground'>
          {t('common.loading')}
        </output>
      )}
      {load.kind === 'error' && (
        <div className='flex flex-wrap items-center gap-2'>
          <p role='alert' className='text-sm text-destructive'>
            {t('periodicExecution.recovery.loadError')}
          </p>
          <Button onClick={reload} size='sm' type='button' variant='outline'>
            {t('periodicExecution.recovery.retry')}
          </Button>
        </div>
      )}
      <RecoveryStatus feedback={feedback} />
      {load.kind === 'ready' && (
        <RecoveryList
          disabled={feedback.kind === 'pending'}
          entries={load.entries}
          onAction={runAction}
        />
      )}
    </section>
  )
}
