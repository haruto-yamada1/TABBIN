export type PersistenceV2ProjectKeywordSettings = {
  readonly domainKeywords: readonly string[]
  readonly titleKeywords: readonly string[]
  readonly urlKeywords: readonly string[]
}

export type PersistenceTimestampProvenance = 'exact' | 'legacy-fallback'

export type PersistenceTimestampQualityCount = {
  readonly exactCount: number
  readonly legacyFallbackCount: number
}

export type PersistenceTimestampMigrationSummary = {
  readonly membershipAddedAt: PersistenceTimestampQualityCount
  readonly urlFirstSavedAt: PersistenceTimestampQualityCount
  readonly urlLastSavedAt: PersistenceTimestampQualityCount
}

export type PersistenceV2CollectionDefinition =
  | {
      readonly domain: string
      readonly type: 'domain'
    }
  | {
      readonly projectKeywords: PersistenceV2ProjectKeywordSettings
      readonly type: 'custom'
    }

export type PersistenceV2Url = {
  readonly favIconUrl?: string
  readonly firstSavedAt: number
  readonly firstSavedAtProvenance?: PersistenceTimestampProvenance
  readonly id: string
  readonly lastSavedAt: number
  readonly lastSavedAtProvenance?: PersistenceTimestampProvenance
  readonly normalizedUrl: string
  readonly title: string
  readonly updatedAt: number
  readonly url: string
}

export type PersistenceV2Collection = {
  readonly createdAt: number
  readonly definition: PersistenceV2CollectionDefinition
  readonly groupId?: string
  readonly id: string
  readonly name: string
  readonly sortOrder: number
  readonly updatedAt: number
}

/**
 * The logical identity is the tuple `[collectionId, urlId]`.
 * IndexedDB key-path details remain owned by Issue #726.
 */
export type PersistenceV2CollectionMembership = {
  readonly addedAt: number
  readonly addedAtProvenance?: PersistenceTimestampProvenance
  readonly categoryId?: string
  readonly collectionId: string
  readonly notes?: string
  readonly sortOrder: number
  readonly updatedAt: number
  readonly urlId: string
}

export type PersistenceV2CollectionCategory = {
  readonly collectionId: string
  readonly createdAt: number
  readonly id: string
  readonly keywords: readonly string[]
  readonly name: string
  readonly sortOrder: number
  readonly updatedAt: number
}

export type PersistenceV2CollectionGroup = {
  readonly createdAt: number
  readonly id: string
  readonly name: string
  readonly sortOrder: number
  readonly updatedAt: number
}

export type PersistenceV2Snapshot = {
  readonly categories: readonly PersistenceV2CollectionCategory[]
  readonly collections: readonly PersistenceV2Collection[]
  readonly groups: readonly PersistenceV2CollectionGroup[]
  readonly memberships: readonly PersistenceV2CollectionMembership[]
  readonly urls: readonly PersistenceV2Url[]
}

export const PERSISTENCE_V2_ORDERING_POLICY = {
  initialGap: 1024,
  ranksMustBeContiguous: false,
  rebalanceScope: 'local-window',
  tieBreak: {
    category: 'id',
    collection: 'id',
    group: 'id',
    membership: ['collectionId', 'urlId'],
  },
} as const

/** Machine-readable input for the pure checker implemented by Issue #712. */
export const PERSISTENCE_V2_INVARIANT_CODES = [
  'DUPLICATE_URL_ID',
  'DUPLICATE_NORMALIZED_URL',
  'URL_IDENTITY_COLLISION',
  'URL_TITLE_CONFLICT',
  'COLLECTION_MISSING',
  'URL_MISSING',
  'CATEGORY_MISSING',
  'CATEGORY_COLLECTION_MISMATCH',
  'GROUP_MISSING',
  'DUPLICATE_MEMBERSHIP',
  'ORPHAN_URL',
  'ORPHAN_CATEGORY',
  'INVALID_MEMBERSHIP_ORDER',
  'INVALID_CATEGORY_ORDER',
  'INVALID_COLLECTION_ORDER',
  'INVALID_GROUP_ORDER',
  'DUPLICATE_DOMAIN_COLLECTION',
  'INVALID_TIMESTAMP_RELATION',
  'MISSING_TIMESTAMP_PROVENANCE',
  'NON_JSON_SAFE_VALUE',
  'INVALID_ACTIVE_CHAT_REFERENCE',
] as const

export type PersistenceV2InvariantCode =
  (typeof PERSISTENCE_V2_INVARIANT_CODES)[number]
