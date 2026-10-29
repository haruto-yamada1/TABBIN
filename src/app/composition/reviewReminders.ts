import { getBackgroundSavedTabsDataPlane } from '@/app/composition/backgroundSavedTabsDataPlane'
import { getPersistenceBootstrapRuntime } from '@/app/composition/persistenceBootstrap'
import { selectReviewCandidates } from '@/features/review-reminders/lib/reviewCandidates'
import type { ReviewReminderSettings } from '@/features/review-reminders/lib/reviewReminderSettings'
import { getExtensionUrl } from '@/lib/browser/runtime'

export const getReviewCandidates = async (
  settings: ReviewReminderSettings,
  now: number,
) => {
  await getPersistenceBootstrapRuntime().bootstrap.ready()
  const { savedTabs } =
    await getBackgroundSavedTabsDataPlane().readUndoSnapshot()
  return selectReviewCandidates(savedTabs, settings, now)
}

export const getReviewCategories = async (): Promise<
  { id: string; name: string }[]
> => {
  await getPersistenceBootstrapRuntime().bootstrap.ready()
  const { savedTabs } =
    await getBackgroundSavedTabsDataPlane().readUndoSnapshot()
  const collections = new Map(
    savedTabs.collections.map(({ id, name }) => [id, name]),
  )
  return savedTabs.categories.map(({ id, name, collectionId }) => ({
    id,
    name: `${collections.get(collectionId) ?? ''} / ${name}`,
  }))
}

export const buildReviewReminderUrl = (
  settings: ReviewReminderSettings,
  now: number,
): string => {
  const params = new URLSearchParams({
    review: '1',
    target: settings.target,
    categoryId: settings.categoryId,
    olderThanDays: String(settings.olderThanDays),
    reviewAt: String(now),
  })
  return `${getExtensionUrl('app.html') ?? 'app.html'}#/saved-tabs?${params}`
}
