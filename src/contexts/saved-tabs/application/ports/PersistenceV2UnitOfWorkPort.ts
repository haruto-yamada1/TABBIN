import type {
  PersistenceV2Collection,
  PersistenceV2CollectionCategory,
  PersistenceV2CollectionGroup,
  PersistenceV2CollectionMembership,
  PersistenceV2Url,
} from '@/contexts/saved-tabs/domain/entities/PersistenceModelV2'
import type { JsonValue } from '@/lib/persistence/jsonValue'

export type PersistenceV2MembershipKey = readonly [
  collectionId: string,
  urlId: string,
]

export type PersistenceRecordMutation<Value, Key = string> = {
  readonly delete?: readonly Key[]
  readonly put?: readonly Value[]
}

export type PersistenceJsonRecord = {
  readonly id: string
  readonly updatedAt: number
  readonly value: JsonValue
}

export type PersistenceMessageRecord = {
  readonly conversationId: string
  readonly createdAt: number
  readonly id: string
  readonly value: JsonValue
}

export type PersistenceRecoverySnapshotRecord = {
  readonly createdAt: number
  readonly expiresAt: number
  readonly id: string
  readonly value: JsonValue
}

export type PersistenceChangeScope =
  | 'analyticsViews'
  | 'categories'
  | 'collections'
  | 'conversations'
  | 'groups'
  | 'memberships'
  | 'recoverySnapshots'
  | 'urls'

export type PersistenceV2WritePlan = {
  readonly analyticsViews?: PersistenceRecordMutation<PersistenceJsonRecord>
  readonly categories?: PersistenceRecordMutation<PersistenceV2CollectionCategory>
  readonly collections?: PersistenceRecordMutation<PersistenceV2Collection>
  readonly conversations?: PersistenceRecordMutation<PersistenceJsonRecord>
  readonly groups?: PersistenceRecordMutation<PersistenceV2CollectionGroup>
  readonly memberships?: PersistenceRecordMutation<
    PersistenceV2CollectionMembership,
    PersistenceV2MembershipKey
  >
  readonly messages?: PersistenceRecordMutation<PersistenceMessageRecord>
  readonly recoverySnapshots?: PersistenceRecordMutation<PersistenceRecoverySnapshotRecord>
  readonly urls?: PersistenceRecordMutation<PersistenceV2Url>
}

export type PersistenceCommitResult = {
  readonly changedScopes: readonly PersistenceChangeScope[]
  readonly revision: number
}

export type PersistenceDurability = 'default' | 'relaxed' | 'strict'

export type PersistenceCommitOptions = {
  readonly durability?: PersistenceDurability
}

export type PersistenceV2UnitOfWorkPort = {
  readonly commit: (
    plan: PersistenceV2WritePlan,
    options?: PersistenceCommitOptions,
  ) => Promise<PersistenceCommitResult>
  readonly readRevision: () => Promise<number>
}
