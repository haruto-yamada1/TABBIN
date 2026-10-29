import { useCallback, useEffect, useState } from 'react'

import { getReviewCandidates } from '@/app/composition/reviewReminders'
import { readReviewReminderSettings } from '@/lib/storage/review-reminders'

import type { ReviewCandidate } from './lib/reviewCandidates'
import { ReviewReminderSettingsSchema } from './lib/reviewReminderSettings'
import type { ReviewReminderSettings } from './lib/reviewReminderSettings'

type ReviewState =
  | { status: 'loading' }
  | { status: 'error' }
  | {
      status: 'ready'
      candidates: readonly ReviewCandidate[]
      refreshError?: boolean
    }

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

export const useReviewCandidates = (search: string) => {
  const [result, setResult] = useState<{
    search: string
    reload: number
    state: ReviewState
  } | null>(null)
  const [reload, setReload] = useState(0)
  const state: ReviewState =
    result?.search === search ? result.state : { status: 'loading' }
  const handleRefresh = useCallback(() => {
    setReload((value) => value + 1)
  }, [])
  const refreshing = state.status === 'loading' || result?.reload !== reload
  useEffect(() => {
    let cancelled = false
    const loadCandidates = async () => {
      try {
        const stored = await readReviewReminderSettings()
        const criteria = resolveReviewCriteria(stored, search)
        const candidates = await getReviewCandidates(
          criteria.settings,
          criteria.reviewAt,
        )
        if (!cancelled) {
          setResult({ search, reload, state: { status: 'ready', candidates } })
        }
      } catch {
        if (!cancelled) {
          setResult((current) => ({
            search,
            reload,
            state:
              current?.search === search && current.state.status === 'ready'
                ? { ...current.state, refreshError: true }
                : { status: 'error' },
          }))
        }
      }
    }
    void loadCandidates()
    return () => {
      cancelled = true
    }
  }, [search, reload])
  return { state, refreshing, handleRefresh }
}
