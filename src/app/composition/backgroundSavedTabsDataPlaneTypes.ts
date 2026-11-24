import type { PersistenceVersionedSavedTabsSnapshot } from '@/contexts/saved-tabs/application/ports/PersistenceV2SnapshotReaderPort'

export type SavedTabsInsightRecord = {
  readonly domain: string
  readonly id: string
  readonly parentCategories: string[]
  readonly projectCategories: string[]
  readonly savedAt: number
  readonly savedInProjects: string[]
  readonly savedInTabGroups: string[]
  readonly subCategories: string[]
  readonly title: string
  readonly url: string
}

export type SavedTabsAnalyticsMetric =
  | 'first-saved'
  | 'last-saved'
  | 'membership-added'

export type SavedTabsAnalyticsRecord = SavedTabsInsightRecord & {
  readonly collectionType?: 'custom' | 'domain'
  readonly eventId: string
  readonly metric: SavedTabsAnalyticsMetric
  readonly timestampAccuracy: 'exact' | 'legacy-fallback'
}

export type BackgroundSavedTabInput = {
  readonly title?: string
  readonly url?: string
}

export type BackgroundSavedTabsRemoveExpiredUrlsOptions = {
  readonly protectFavoriteFromAutoRemoval: boolean
}

export type BackgroundSavedTabsRemoveUrlOptions = {
  readonly protectFavorite?: boolean
}

export type BackgroundSavedTabsDataPlane = {
  readonly readAnalyticsRecords: () => Promise<
    readonly SavedTabsAnalyticsRecord[]
  >
  readonly readInsightRecords: () => Promise<readonly SavedTabsInsightRecord[]>
  readonly readUndoSnapshot: () => Promise<PersistenceVersionedSavedTabsSnapshot>
  readonly removeExpiredUrls: (
    cutoffTime: number,
    currentTime: number,
    options?: BackgroundSavedTabsRemoveExpiredUrlsOptions,
  ) => Promise<{ readonly removedCount: number; readonly sourceCount: number }>
  readonly removeUrl: (
    url: string,
    urlRecordId?: string,
    options?: BackgroundSavedTabsRemoveUrlOptions,
  ) => Promise<number>
  readonly removeUrlIds: (urlIds: readonly string[]) => Promise<number>
  readonly restoreUndoSnapshot: (
    snapshot: PersistenceVersionedSavedTabsSnapshot,
  ) => Promise<void>
  readonly saveTabs: (
    tabs: readonly BackgroundSavedTabInput[],
    options?: {
      readonly preserveExisting?: boolean
      readonly preserveExistingTitle?: boolean
    },
  ) => Promise<
    | undefined
    | { readonly savedUrls: readonly string[] }
    | {
        readonly savedCount: number
        readonly existingCount: number
      }
  >
  readonly updateTabTimestamps: (
    timestamp: number,
  ) => Promise<{ readonly success: boolean }>
}
