import type { PersistenceV2Snapshot } from '@/contexts/saved-tabs/domain/entities/PersistenceModelV2'

import type {
  PersistenceJsonRecord,
  PersistenceMessageRecord,
} from './PersistenceV2UnitOfWorkPort'

export type PersistenceV2ReplacementTarget = {
  readonly analyticsViews: readonly PersistenceJsonRecord[]
  readonly conversations: readonly PersistenceJsonRecord[]
  readonly messages: readonly PersistenceMessageRecord[]
  readonly savedTabs: PersistenceV2Snapshot
}

export type PersistenceV2ReplacementResult = {
  readonly revision: number
}

export type PersistenceV2ReplacementErrorCode =
  | 'DUPLICATE_ANALYTICS_VIEW_ID'
  | 'DUPLICATE_CONVERSATION_ID'
  | 'DUPLICATE_MESSAGE_ID'
  | 'INVALID_STORED_REVISION'
  | 'INVALID_TARGET_RECORD'
  | 'ORPHAN_MESSAGE_CONVERSATION'
  | 'REVISION_NOT_COMMITTED'
  | 'REVISION_OVERFLOW'
  | 'TRANSACTION_FAILED'
  | 'UNHEALTHY_SAVED_TABS'

export type PersistenceV2ReplacementPort = {
  readonly replaceAll: (
    target: PersistenceV2ReplacementTarget,
  ) => Promise<PersistenceV2ReplacementResult>
}
