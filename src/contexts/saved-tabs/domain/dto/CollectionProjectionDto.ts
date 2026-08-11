import type {
  PersistenceV2Collection,
  PersistenceV2CollectionCategory,
  PersistenceV2CollectionMembership,
} from '@/contexts/saved-tabs/domain/entities/PersistenceModelV2'

/** Current normalized aggregate used by saved-tabs domain/application code. */
export type CollectionProjectionDto = {
  readonly collection: PersistenceV2Collection
  readonly collectionCategories: readonly PersistenceV2CollectionCategory[]
  readonly memberships: readonly PersistenceV2CollectionMembership[]
}

export type CollectionReferenceDto = {
  readonly domain: string
  readonly id: string
}
