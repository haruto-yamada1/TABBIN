import type {
  PersistenceV2Collection,
  PersistenceV2CollectionCategory,
  PersistenceV2CollectionMembership,
  PersistenceV2Url,
} from './PersistenceModelV2'

export type ExpiredUrlRecoveryMembership = {
  readonly category?: PersistenceV2CollectionCategory
  readonly collection: PersistenceV2Collection
  readonly membership: PersistenceV2CollectionMembership
}

export type ExpiredUrlRecoveryRecord = {
  readonly expiredAt: number
  readonly id: string
  readonly memberships: readonly ExpiredUrlRecoveryMembership[]
  readonly recoverUntil: number
  readonly url: PersistenceV2Url
}
