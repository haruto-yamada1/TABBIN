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

export type BackgroundSavedTabInput = {
  readonly title?: string
  readonly url?: string
}

export type BackgroundSavedTabsDataPlane = {
  readonly readInsightRecords: () => Promise<readonly SavedTabsInsightRecord[]>
  readonly readUndoSnapshot: () => Promise<PersistenceVersionedSavedTabsSnapshot>
  readonly removeExpiredUrls: (
    cutoffTime: number,
    currentTime: number,
  ) => Promise<{ readonly removedCount: number; readonly sourceCount: number }>
  readonly removeUrl: (url: string) => Promise<number>
  readonly removeUrlIds: (urlIds: readonly string[]) => Promise<number>
  readonly restoreUndoSnapshot: (
    snapshot: PersistenceVersionedSavedTabsSnapshot,
  ) => Promise<void>
  readonly saveTabs: (tabs: readonly BackgroundSavedTabInput[]) => Promise<void>
  readonly updateTabTimestamps: (
    timestamp: number,
  ) => Promise<{ readonly success: boolean }>
}
