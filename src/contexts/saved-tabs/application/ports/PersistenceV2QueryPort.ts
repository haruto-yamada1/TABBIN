import type {
  PersistenceV2Collection,
  PersistenceV2CollectionCategory,
  PersistenceV2CollectionGroup,
  PersistenceV2CollectionMembership,
  PersistenceV2Url,
} from '@/contexts/saved-tabs/domain/entities/PersistenceModelV2'

export type PersistenceV2CollectionItemProjection = {
  readonly category: PersistenceV2CollectionCategory | undefined
  readonly membership: PersistenceV2CollectionMembership
  readonly url: PersistenceV2Url
}

export type PersistenceV2CollectionProjection = {
  readonly collection: PersistenceV2Collection
  readonly items: readonly PersistenceV2CollectionItemProjection[]
}

export type PersistenceV2InitialProjection = {
  readonly collections: readonly PersistenceV2CollectionProjection[]
  readonly groups: readonly PersistenceV2CollectionGroup[]
}

export type PersistenceV2UrlCollectionProjection = {
  readonly collection: PersistenceV2Collection
  readonly membership: PersistenceV2CollectionMembership
}

export type PersistenceV2AnalyticsRecord = {
  readonly collectionCount: number
  readonly membershipCount: number
  readonly url: PersistenceV2Url
}

export type PersistenceV2QueryPort = {
  readonly findCollection: (
    collectionId: string,
  ) => Promise<PersistenceV2CollectionProjection | undefined>
  readonly findCollectionsForUrl: (
    urlId: string,
  ) => Promise<readonly PersistenceV2UrlCollectionProjection[]>
  readonly findCollectionsInGroup: (
    groupId: string,
  ) => Promise<readonly PersistenceV2Collection[]>
  readonly readAnalyticsRecords: () => Promise<
    readonly PersistenceV2AnalyticsRecord[]
  >
  readonly readInitialLoad: () => Promise<PersistenceV2InitialProjection>
}
