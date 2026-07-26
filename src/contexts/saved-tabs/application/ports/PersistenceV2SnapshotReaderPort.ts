import type { PersistenceV2Snapshot } from '@/contexts/saved-tabs/domain/entities/PersistenceModelV2'

import type {
  PersistenceJsonRecord,
  PersistenceMessageRecord,
} from './PersistenceV2UnitOfWorkPort'

export type PersistenceLogicalSnapshot = {
  readonly analyticsViews: readonly PersistenceJsonRecord[]
  readonly conversations: readonly PersistenceJsonRecord[]
  readonly messages: readonly PersistenceMessageRecord[]
  readonly revision: number
  readonly savedTabs: PersistenceV2Snapshot
}

export type PersistenceVersionedSavedTabsSnapshot = {
  readonly revision: number
  readonly savedTabs: PersistenceV2Snapshot
}

export type PersistenceV2SnapshotReaderPort = {
  readonly readConsistentSnapshot: () => Promise<PersistenceLogicalSnapshot>
  readonly readVerifiedSavedTabsSnapshot: () => Promise<PersistenceVersionedSavedTabsSnapshot>
}
