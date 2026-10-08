import { useCallback, useEffect, useState } from 'react'

import { getReviewCandidates } from '@/app/composition/reviewReminders'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/features/i18n/context/I18nProvider'
import type { ReviewCandidate } from '@/features/review-reminders/lib/reviewCandidates'
import { ReviewReminderSettingsSchema } from '@/features/review-reminders/lib/reviewReminderSettings'
import type { ReviewReminderSettings } from '@/features/review-reminders/lib/reviewReminderSettings'
import { readReviewReminderSettings } from '@/lib/storage/review-reminders'
import { toSafeSavedUrlHref } from '@/lib/url-filter'

type ReviewState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; candidates: readonly ReviewCandidate[] }

const resolveReviewCriteria = (
  settings: ReviewReminderSettings,
  search: string,
) => {
  const params = new URLSearchParams(search)
  if (!params.has('target')) {
    return { settings, reviewAt: Date.now() }
  }
  const parsed = ReviewReminderSettingsSchema.parse({
    ...settings,
    target: params.get('target'),
    categoryId: params.get('categoryId') ?? '',
    olderThanDays: Number(params.get('olderThanDays')),
  })
  const reviewAt = Number(params.get('reviewAt'))
  if (
    !Number.isSafeInteger(reviewAt) ||
    reviewAt <= 0 ||
    reviewAt > Date.now()
  ) {
    throw new TypeError('Invalid review reference time')
  }
  return { settings: parsed, reviewAt }
}

export const ReviewReminderPage = ({ search }: { readonly search: string }) => {
  const { t } = useI18n()
  const [result, setResult] = useState<{
    search: string
    reload: number
    state: ReviewState
  } | null>(null)
  const [reload, setReload] = useState(0)
  const state: ReviewState =
    result?.search === search && result.reload === reload
      ? result.state
      : { status: 'loading' }
  const handleRefresh = useCallback(() => {
    setReload((value) => value + 1)
  }, [])
  useEffect(() => {
    const cancellation = new AbortController()
    void (async () => {
      try {
        const stored = await readReviewReminderSettings()
        const criteria = resolveReviewCriteria(stored, search)
        const candidates = await getReviewCandidates(
          criteria.settings,
          criteria.reviewAt,
        )
        if (!cancellation.signal.aborted) {
          setResult({ search, reload, state: { status: 'ready', candidates } })
        }
      } catch {
        if (!cancellation.signal.aborted) {
          setResult({ search, reload, state: { status: 'error' } })
        }
      }
    })()
    return () => {
      cancellation.abort()
    }
  }, [search, reload])

  return (
    <section
      className='h-full overflow-y-auto p-6'
      aria-labelledby='review-title'
    >
      <div className='mx-auto max-w-3xl space-y-4'>
        <h1 id='review-title' className='text-2xl font-semibold'>
          {t('reviewReminder.listTitle')}
        </h1>
        <p className='text-sm text-muted-foreground'>
          {t('options.review.description')}
        </p>
        <nav className='flex flex-wrap items-center gap-4'>
          <a href='#/saved-tabs?mode=domain' className='text-primary underline'>
            {t('reviewReminder.backToSavedTabs')}
          </a>
          <a href='#/periodic-execution' className='text-primary underline'>
            {t('reviewReminder.configure')}
          </a>
          <Button variant='outline' onClick={handleRefresh}>
            {t('reviewReminder.refresh')}
          </Button>
        </nav>
        {state.status === 'loading' && (
          <output>{t('reviewReminder.loading')}</output>
        )}
        {state.status === 'error' && (
          <p role='alert'>{t('reviewReminder.listError')}</p>
        )}
        {state.status === 'ready' && (
          <>
            <output>
              {t('reviewReminder.listCount', undefined, {
                count: String(state.candidates.length),
              })}
            </output>
            {state.candidates.length === 0 && (
              <p>{t('reviewReminder.listEmpty')}</p>
            )}
            <ul className='space-y-3'>
              {state.candidates.map((candidate) => {
                const href = toSafeSavedUrlHref(candidate.url)
                return (
                  <li
                    key={candidate.id}
                    className='rounded-lg border border-border bg-card p-4'
                  >
                    <p className='font-medium break-words'>
                      {candidate.title || candidate.url}
                    </p>
                    <p className='mt-1 text-sm break-all text-muted-foreground'>
                      {candidate.url}
                    </p>
                    {href && (
                      <a
                        href={href}
                        target='_blank'
                        rel='noopener noreferrer'
                        className='mt-2 inline-block text-primary underline'
                        aria-label={`${t('reviewReminder.open')} ${candidate.title || candidate.url}`}
                      >
                        {t('reviewReminder.open')}
                      </a>
                    )}
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </div>
    </section>
  )
}
