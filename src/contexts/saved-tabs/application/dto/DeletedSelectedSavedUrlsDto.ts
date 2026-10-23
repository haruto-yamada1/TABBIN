import type { OpenedUrlsRestoreSnapshot } from '@/contexts/saved-tabs/application/commands/RestoreOpenedUrlsSnapshotCommand'

export type DeletedSelectedSavedUrlsDto = {
  /** Number of selected domain memberships removed, with duplicates excluded. */
  readonly removedCount: number
  /** Captured within the same persistence session, before any selected deletion. */
  readonly snapshot: OpenedUrlsRestoreSnapshot | null
}
