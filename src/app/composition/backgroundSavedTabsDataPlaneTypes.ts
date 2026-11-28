import type { ExpiredUrlRecoveryDto } from '@/contexts/saved-tabs/application/dto/ExpiredUrlRecoveryDto'
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
  readonly discardExpiredUrls: (ids: readonly string[]) => Promise<number>
  readonly listExpiredUrls: () => Promise<readonly ExpiredUrlRecoveryDto[]>
  readonly purgeExpiredUrls: () => Promise<void>
  readonly restoreExpiredUrls: (ids: readonly string[]) => Promise<number>
  readonly restoreExpiredUrlsWithUndo: (ids: readonly string[]) => Promise<{
    readonly result: number
    readonly undo?: () => Promise<void>
  }>
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
    | {
        readonly savedUrls: readonly string[]
        /** 既存 URL の再保存で保存先が変わらなかった件数 (issue #923)。 */
        readonly resavedRefreshedCount: number
        /** 既存 URL の再保存で保存先プロジェクトが変わった件数 (issue #923)。 */
        readonly resavedMovedCount: number
      }
    | {
        readonly savedCount: number
        readonly existingCount: number
      }
  >
  readonly updateTabTimestamps: (
    timestamp: number,
  ) => Promise<{ readonly success: boolean }>
}
