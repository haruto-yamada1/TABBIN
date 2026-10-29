import type { ReviewReminderSettings } from './reviewReminderSettings'

const MILLISECONDS_PER_DAY = 86_400_000

export type ReviewCandidateSnapshot = {
  readonly urls: readonly {
    readonly id: string
    readonly url: string
    readonly title: string
    readonly firstSavedAt: number
    readonly firstSavedAtProvenance?: 'exact' | 'legacy-fallback'
  }[]
  readonly memberships: readonly {
    readonly urlId: string
    readonly collectionId: string
    readonly categoryId?: string
  }[]
  readonly categories: readonly {
    readonly id: string
    readonly collectionId: string
  }[]
}

export type ReviewCandidate = {
  readonly id: string
  readonly url: string
  readonly title: string
  readonly firstSavedAt?: number
}

export const selectReviewCandidates = (
  snapshot: ReviewCandidateSnapshot,
  settings: ReviewReminderSettings,
  now: number,
): ReviewCandidate[] => {
  const categories = new Map(
    snapshot.categories.map((category) => [category.id, category.collectionId]),
  )
  const categoryIdsByUrl = new Map<string, Set<string>>()
  for (const membership of snapshot.memberships) {
    if (
      membership.categoryId &&
      categories.get(membership.categoryId) === membership.collectionId
    ) {
      const categoryIds =
        categoryIdsByUrl.get(membership.urlId) ?? new Set<string>()
      categoryIds.add(membership.categoryId)
      categoryIdsByUrl.set(membership.urlId, categoryIds)
    }
  }

  const seenIds = new Set<string>()
  const cutoff = now - settings.olderThanDays * MILLISECONDS_PER_DAY
  return snapshot.urls.flatMap((record): ReviewCandidate[] => {
    if (seenIds.has(record.id)) {
      return []
    }
    seenIds.add(record.id)
    const firstSavedAt =
      record.firstSavedAtProvenance === 'exact' &&
      Number.isSafeInteger(record.firstSavedAt) &&
      record.firstSavedAt >= 0
        ? record.firstSavedAt
        : undefined
    const categoryIds = categoryIdsByUrl.get(record.id)
    if (
      (settings.target === 'uncategorized' && categoryIds?.size) ||
      (settings.target === 'category' &&
        !categoryIds?.has(settings.categoryId)) ||
      (settings.target === 'older' &&
        (firstSavedAt === undefined || firstSavedAt > cutoff))
    ) {
      return []
    }
    return [
      {
        id: record.id,
        url: record.url,
        title: record.title,
        ...(firstSavedAt !== undefined ? { firstSavedAt } : {}),
      },
    ]
  })
}
