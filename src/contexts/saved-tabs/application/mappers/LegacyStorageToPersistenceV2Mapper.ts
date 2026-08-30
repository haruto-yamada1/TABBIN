import { parseLegacyChromeStorage } from '@/contexts/saved-tabs/application/dto/LegacyChromeStorageDto'
import type {
  PersistenceJsonRecord,
  PersistenceMessageRecord,
} from '@/contexts/saved-tabs/application/ports/PersistenceV2UnitOfWorkPort'
import type { RawLegacyStorageSnapshot } from '@/contexts/saved-tabs/application/ports/RawLegacyStorageReaderPort'
import type {
  PersistenceV2Collection,
  PersistenceV2CollectionCategory,
  PersistenceV2CollectionGroup,
  PersistenceV2CollectionMembership,
  PersistenceV2InvariantCode,
  PersistenceV2Snapshot,
  PersistenceV2Url,
  PersistenceTimestampMigrationSummary,
  PersistenceTimestampProvenance,
} from '@/contexts/saved-tabs/domain/entities/PersistenceModelV2'
import { checkPersistenceIntegrity } from '@/contexts/saved-tabs/domain/services/PersistenceIntegrityChecker'
import { createUrlIdentityKey } from '@/contexts/saved-tabs/domain/services/UrlIdentityPolicy'
import { normalizeDomainString } from '@/contexts/saved-tabs/domain/value-objects/DomainName'
import type { PersistenceSourceEntityCounts } from '@/lib/persistence/capacity'
import { measureSerializedBytes } from '@/lib/persistence/capacity'
import { isJsonValue } from '@/lib/persistence/jsonValue'
import type { JsonObject } from '@/lib/persistence/jsonValue'

export type LegacyMigrationIssueCode =
  | 'MIGRATION_SOURCE_MISSING_KEY'
  | 'MIGRATION_SOURCE_INVALID_TYPE'
  | 'LEGACY_URL_REFERENCE_CONFLICT'
  | 'LEGACY_PARENT_CATEGORY_CONFLICT'
  | 'LEGACY_DOMAIN_CATEGORY_MAPPING_CONFLICT'
  | 'LEGACY_CUSTOM_PROJECT_ORDER_CONFLICT'
  | 'LEGACY_AI_ENTITY_ID_COLLISION'
  | PersistenceV2InvariantCode

export type MigrationPreflightIssue = {
  readonly code: LegacyMigrationIssueCode
  readonly occurrenceCount: number
  readonly severity: 'error' | 'warning'
}

export type UrlIdentityCollisionKind =
  | 'duplicate-id'
  | 'duplicate-exact-url'
  | 'normalized-url'

export type MigrationPreflightAnalysis = {
  readonly approximateSourceBytes: number
  readonly collisionCount: number
  readonly collisionKinds: readonly UrlIdentityCollisionKind[]
  readonly entityCounts: PersistenceSourceEntityCounts
  readonly issueCodes: readonly LegacyMigrationIssueCode[]
  readonly issues: readonly MigrationPreflightIssue[]
  readonly snapshot: PersistenceV2Snapshot
  readonly target: PersistenceV2MigrationTarget
  readonly targetSerializedBytes: number
  readonly timestampMigrationSummary: PersistenceTimestampMigrationSummary
}

export type PersistenceV2MigrationTarget = {
  readonly analyticsViews: readonly PersistenceJsonRecord[]
  readonly conversations: readonly PersistenceJsonRecord[]
  readonly messages: readonly PersistenceMessageRecord[]
  readonly savedTabs: PersistenceV2Snapshot
}

type MutableIssue = {
  code: LegacyMigrationIssueCode
  occurrenceCount: number
  severity: 'error' | 'warning'
}

type RecordLike = Record<string, unknown>

type AnalyzerState = {
  readonly categories: PersistenceV2CollectionCategory[]
  readonly collections: PersistenceV2Collection[]
  readonly collisions: UrlIdentityCollisionKind[]
  readonly groups: PersistenceV2CollectionGroup[]
  readonly issues: Map<string, MutableIssue>
  readonly membershipIndex: Map<string, Map<string, number>>
  readonly memberships: PersistenceV2CollectionMembership[]
  readonly urls: PersistenceV2Url[]
  readonly collisionKinds: Set<UrlIdentityCollisionKind>
  readonly urlIdentityTitles: Map<string, Set<string>>
  readonly urlsById: Map<string, PersistenceV2Url[]>
  readonly urlsByIdentity: Map<string, number>
}

const ORDER_GAP = 1024

const isRecord = (value: unknown): value is RecordLike =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isStringValueRecord = (
  value: unknown,
): value is Readonly<Record<string, string>> =>
  isRecord(value) &&
  Object.values(value).every((item) => typeof item === 'string')

const isFiniteTimestamp = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0

const addIssue = (
  state: AnalyzerState,
  code: LegacyMigrationIssueCode,
  severity: 'error' | 'warning',
  occurrenceCount = 1,
): void => {
  const key = `${severity}:${code}`
  const current = state.issues.get(key)
  if (current) {
    current.occurrenceCount += occurrenceCount
    return
  }
  state.issues.set(key, { code, occurrenceCount, severity })
}

const hasIssue = (
  state: AnalyzerState,
  code: LegacyMigrationIssueCode,
  severity: 'error' | 'warning',
): boolean => state.issues.has(`${severity}:${code}`)

const readStringArray = (value: unknown): readonly string[] | undefined =>
  Array.isArray(value) && value.every((item) => typeof item === 'string')
    ? value
    : undefined

const hasDuplicateStrings = (values: readonly string[]): boolean =>
  new Set(values).size !== values.length

const hasDuplicateCategoryKeywordDefinitions = (value: unknown): boolean => {
  if (!Array.isArray(value)) {
    return false
  }
  const names = value.flatMap((item) =>
    isRecord(item) && typeof item.categoryName === 'string'
      ? [item.categoryName]
      : [],
  )
  return new Set(names).size !== names.length
}

const readOptionalStringArray = (
  record: RecordLike,
  key: string,
): readonly string[] | undefined | null => {
  if (!(key in record)) {
    return undefined
  }
  return readStringArray(record[key]) ?? null
}

const readOptionalTimestamp = (
  record: RecordLike,
  key: string,
): number | undefined | null => {
  if (!(key in record)) {
    return undefined
  }
  return isFiniteTimestamp(record[key]) ? record[key] : null
}

const safeDomain = (value: string): string | undefined => {
  try {
    return normalizeDomainString(value)
  } catch {
    return undefined
  }
}

const addUrl = (
  state: AnalyzerState,
  input: {
    readonly favIconUrl?: string
    readonly id: string
    readonly savedAt?: number
    readonly source: 'canonical' | 'nested'
    readonly title: string
    readonly url: string
  },
): PersistenceV2Url | undefined => {
  let identity: string
  try {
    identity = createUrlIdentityKey(input.url)
  } catch {
    addIssue(state, 'MIGRATION_SOURCE_INVALID_TYPE', 'error')
    return undefined
  }

  const urlsWithId = state.urlsById.get(input.id) ?? []
  if (urlsWithId.length > 0) {
    addIssue(state, 'DUPLICATE_URL_ID', 'error')
    state.collisions.push('duplicate-id')
    state.collisionKinds.add('duplicate-id')
  }

  const identityCount = state.urlsByIdentity.get(identity) ?? 0
  if (identityCount > 0) {
    addIssue(state, 'URL_IDENTITY_COLLISION', 'error')
    state.collisions.push('duplicate-exact-url')
    state.collisionKinds.add('duplicate-exact-url')
    state.collisionKinds.add('normalized-url')
  }
  state.urlsByIdentity.set(identity, identityCount + 1)

  const titles = state.urlIdentityTitles.get(identity) ?? new Set<string>()
  titles.add(input.title)
  state.urlIdentityTitles.set(identity, titles)
  if (titles.size > 1) {
    addIssue(state, 'URL_TITLE_CONFLICT', 'warning')
  }

  const timestamp = input.savedAt ?? 0
  if (input.savedAt === undefined) {
    addIssue(state, 'MISSING_TIMESTAMP_PROVENANCE', 'warning')
  }
  const url: PersistenceV2Url = {
    ...(input.favIconUrl ? { favIconUrl: input.favIconUrl } : {}),
    firstSavedAt: timestamp,
    firstSavedAtProvenance: 'legacy-fallback',
    id: input.id,
    lastSavedAt: timestamp,
    lastSavedAtProvenance:
      input.source === 'canonical' && input.savedAt !== undefined
        ? 'exact'
        : 'legacy-fallback',
    normalizedUrl: identity,
    title: input.title,
    updatedAt: timestamp,
    url: input.url,
  }
  state.urls.push(url)
  urlsWithId.push(url)
  state.urlsById.set(input.id, urlsWithId)
  return url
}

const parseCanonicalUrls = (
  values: readonly unknown[],
  state: AnalyzerState,
): void => {
  for (const value of values) {
    if (
      !isRecord(value) ||
      typeof value.id !== 'string' ||
      typeof value.url !== 'string' ||
      typeof value.title !== 'string' ||
      !isFiniteTimestamp(value.savedAt) ||
      (value.favIconUrl !== undefined && typeof value.favIconUrl !== 'string')
    ) {
      addIssue(state, 'MIGRATION_SOURCE_INVALID_TYPE', 'error')
      continue
    }
    addUrl(state, {
      ...(typeof value.favIconUrl === 'string'
        ? { favIconUrl: value.favIconUrl }
        : {}),
      id: value.id,
      savedAt: value.savedAt,
      source: 'canonical',
      title: value.title,
      url: value.url,
    })
  }
}

const parseParentCategories = (
  values: readonly unknown[],
  state: AnalyzerState,
): {
  readonly ids: ReadonlySet<string>
  readonly parentsByCollectionId: ReadonlyMap<string, ReadonlySet<string>>
  readonly parentsByDomain: ReadonlyMap<string, ReadonlySet<string>>
} => {
  const ids = new Set<string>()
  const parentsByCollectionId = new Map<string, Set<string>>()
  const parentsByDomain = new Map<string, Set<string>>()

  values.forEach((value, index) => {
    if (
      !isRecord(value) ||
      typeof value.id !== 'string' ||
      typeof value.name !== 'string' ||
      !readStringArray(value.domains) ||
      !readStringArray(value.domainNames)
    ) {
      addIssue(state, 'MIGRATION_SOURCE_INVALID_TYPE', 'error')
      return
    }
    const id = value.id
    const domains = readStringArray(value.domains)
    const domainNames = readStringArray(value.domainNames)
    if (!domains || !domainNames) {
      addIssue(state, 'MIGRATION_SOURCE_INVALID_TYPE', 'error')
      return
    }
    ids.add(id)
    for (const collectionId of domains) {
      const parentIds =
        parentsByCollectionId.get(collectionId) ?? new Set<string>()
      parentIds.add(id)
      parentsByCollectionId.set(collectionId, parentIds)
      if (parentIds.size > 1) {
        addIssue(state, 'LEGACY_PARENT_CATEGORY_CONFLICT', 'error')
      }
    }
    for (const domain of domainNames) {
      const normalized = safeDomain(domain)
      if (!normalized) {
        addIssue(state, 'MIGRATION_SOURCE_INVALID_TYPE', 'error')
        continue
      }
      const parentIds = parentsByDomain.get(normalized) ?? new Set<string>()
      parentIds.add(id)
      parentsByDomain.set(normalized, parentIds)
      if (parentIds.size > 1) {
        addIssue(state, 'LEGACY_PARENT_CATEGORY_CONFLICT', 'error')
      }
    }
    addIssue(state, 'MISSING_TIMESTAMP_PROVENANCE', 'warning')
    state.groups.push({
      createdAt: 0,
      id,
      name: value.name,
      sortOrder: index * ORDER_GAP,
      updatedAt: 0,
    })
  })

  return { ids, parentsByCollectionId, parentsByDomain }
}

const createCategories = (
  state: AnalyzerState,
  input: {
    readonly collectionId: string
    readonly createdAt: number
    readonly keywords: ReadonlyMap<string, readonly string[]>
    readonly names: readonly string[]
    readonly updatedAt: number
  },
): ReadonlyMap<string, string> => {
  const idsByName = new Map<string, string>()
  input.names.forEach((name, index) => {
    const id = `${input.collectionId}:category:${index}`
    idsByName.set(name, id)
    state.categories.push({
      collectionId: input.collectionId,
      createdAt: input.createdAt,
      id,
      keywords: input.keywords.get(name) ?? [],
      name,
      sortOrder: index * ORDER_GAP,
      updatedAt: input.updatedAt,
    })
  })
  return idsByName
}

const decodeKeywordMap = (
  value: unknown,
): ReadonlyMap<string, readonly string[]> | undefined => {
  if (!Array.isArray(value)) {
    return undefined
  }
  const result = new Map<string, readonly string[]>()
  for (const item of value) {
    if (
      !isRecord(item) ||
      typeof item.categoryName !== 'string' ||
      !readStringArray(item.keywords)
    ) {
      return undefined
    }
    result.set(item.categoryName, readStringArray(item.keywords) ?? [])
  }
  return result
}

const readKeywordMap = (
  value: unknown,
  state: AnalyzerState,
): ReadonlyMap<string, readonly string[]> => {
  if (value === undefined) {
    return new Map()
  }
  const result = decodeKeywordMap(value)
  if (!result) {
    addIssue(state, 'MIGRATION_SOURCE_INVALID_TYPE', 'error')
    return new Map()
  }
  return result
}

type DecodedDomainCategorySetting = {
  readonly keywords: ReadonlyMap<string, readonly string[]>
  readonly names: readonly string[]
}

const parseDomainCategorySettings = (
  values: readonly unknown[],
  state: AnalyzerState,
): ReadonlyMap<string, DecodedDomainCategorySetting> => {
  const result = new Map<string, DecodedDomainCategorySetting>()
  for (const value of values) {
    if (!isRecord(value) || typeof value.domain !== 'string') {
      addIssue(state, 'MIGRATION_SOURCE_INVALID_TYPE', 'error')
      continue
    }
    const domain = safeDomain(value.domain)
    const names = readStringArray(value.subCategories)
    const keywords = decodeKeywordMap(value.categoryKeywords)
    if (!domain || !names || !keywords) {
      addIssue(state, 'MIGRATION_SOURCE_INVALID_TYPE', 'error')
      continue
    }
    if (
      hasDuplicateStrings(names) ||
      hasDuplicateCategoryKeywordDefinitions(value.categoryKeywords)
    ) {
      addIssue(state, 'LEGACY_DOMAIN_CATEGORY_MAPPING_CONFLICT', 'error')
    }
    const nameSet = new Set(names)
    if ([...keywords.keys()].some((name) => !nameSet.has(name))) {
      addIssue(state, 'LEGACY_DOMAIN_CATEGORY_MAPPING_CONFLICT', 'error')
    }
    if (result.has(domain)) {
      addIssue(state, 'LEGACY_DOMAIN_CATEGORY_MAPPING_CONFLICT', 'error')
      continue
    }
    result.set(domain, { keywords, names })
  }
  return result
}

const addMembership = (
  state: AnalyzerState,
  input: {
    readonly categoryId?: string
    readonly collectionId: string
    readonly index: number
    readonly notes?: string
    readonly timestamp: number
    readonly timestampProvenance: PersistenceTimestampProvenance
    readonly urlId: string
  },
): void => {
  const membership: PersistenceV2CollectionMembership = {
    addedAt: input.timestamp,
    addedAtProvenance: input.timestampProvenance,
    ...(input.categoryId ? { categoryId: input.categoryId } : {}),
    collectionId: input.collectionId,
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
    sortOrder: input.index * ORDER_GAP,
    updatedAt: input.timestamp,
    urlId: input.urlId,
  }
  state.memberships.push(membership)
  const collectionMemberships =
    state.membershipIndex.get(input.collectionId) ?? new Map<string, number>()
  if (!collectionMemberships.has(input.urlId)) {
    collectionMemberships.set(input.urlId, state.memberships.length - 1)
  }
  state.membershipIndex.set(input.collectionId, collectionMemberships)
}

type DecodedNestedUrl = {
  readonly category?: string
  readonly id: string
  readonly notes?: string
  readonly savedAt?: number
  readonly subCategory?: string
  readonly title: string
  readonly url: string
}

const hasInvalidNestedUrlFields = (value: RecordLike): boolean =>
  (value.category !== undefined && typeof value.category !== 'string') ||
  (value.id !== undefined && typeof value.id !== 'string') ||
  (value.notes !== undefined && typeof value.notes !== 'string') ||
  (value.subCategory !== undefined && typeof value.subCategory !== 'string') ||
  (value.savedAt !== undefined && !isFiniteTimestamp(value.savedAt))

const decodeNestedUrl = (
  value: unknown,
  fallbackId: string,
  state: AnalyzerState,
): DecodedNestedUrl | undefined => {
  if (
    !isRecord(value) ||
    typeof value.url !== 'string' ||
    typeof value.title !== 'string' ||
    hasInvalidNestedUrlFields(value)
  ) {
    addIssue(state, 'MIGRATION_SOURCE_INVALID_TYPE', 'error')
    return undefined
  }
  return {
    ...(typeof value.category === 'string' ? { category: value.category } : {}),
    id: typeof value.id === 'string' ? value.id : fallbackId,
    ...(typeof value.notes === 'string' ? { notes: value.notes } : {}),
    ...(isFiniteTimestamp(value.savedAt) ? { savedAt: value.savedAt } : {}),
    ...(typeof value.subCategory === 'string'
      ? { subCategory: value.subCategory }
      : {}),
    title: value.title,
    url: value.url,
  }
}

const resolveCategoryId = (
  categoryName: string | undefined,
  categoryIds: ReadonlyMap<string, string>,
  state: AnalyzerState,
): string | undefined => {
  if (categoryName === undefined) {
    return undefined
  }
  const categoryId = categoryIds.get(categoryName)
  if (!categoryId) {
    addIssue(state, 'LEGACY_URL_REFERENCE_CONFLICT', 'error')
  }
  return categoryId
}

const mergeMembershipMetadata = (
  state: AnalyzerState,
  input: {
    readonly categoryId?: string
    readonly collectionId: string
    readonly notes?: string
    readonly timestamp?: number
    readonly urlId: string
  },
): boolean => {
  const index = state.membershipIndex.get(input.collectionId)?.get(input.urlId)
  if (index === undefined) {
    return false
  }
  const membership = state.memberships[index]
  if (
    (membership.categoryId &&
      input.categoryId &&
      membership.categoryId !== input.categoryId) ||
    (membership.notes !== undefined &&
      input.notes !== undefined &&
      membership.notes !== input.notes)
  ) {
    addIssue(state, 'LEGACY_URL_REFERENCE_CONFLICT', 'error')
    return true
  }
  const categoryId = membership.categoryId ?? input.categoryId
  const notes = membership.notes ?? input.notes
  state.memberships.splice(index, 1, {
    ...membership,
    ...(input.timestamp === undefined
      ? {}
      : {
          addedAt: input.timestamp,
          addedAtProvenance: 'exact' as const,
          updatedAt: input.timestamp,
        }),
    ...(categoryId ? { categoryId } : {}),
    ...(notes !== undefined ? { notes } : {}),
  })
  return true
}

const matchesCanonicalUrl = (
  decoded: DecodedNestedUrl,
  state: AnalyzerState,
): boolean =>
  (state.urlsById.get(decoded.id) ?? []).some(
    (url) =>
      url.id === decoded.id &&
      url.url === decoded.url &&
      url.title === decoded.title,
  )

const checkNestedCanonicalUrl = (
  decoded: DecodedNestedUrl,
  canonicalId: string,
  state: AnalyzerState,
): void => {
  if (decoded.id !== canonicalId || !matchesCanonicalUrl(decoded, state)) {
    addIssue(state, 'LEGACY_URL_REFERENCE_CONFLICT', 'error')
  }
}

type ParentRelationContext = {
  readonly mappingParentsByDomain: ReadonlyMap<string, ReadonlySet<string>>
  readonly parentIds: ReadonlySet<string>
  readonly parentsByCollectionId: ReadonlyMap<string, ReadonlySet<string>>
  readonly parentsByDomain: ReadonlyMap<string, ReadonlySet<string>>
}

type DecodedSavedTab = {
  readonly collectionId: string
  readonly domain: string
  readonly nestedUrls?: readonly unknown[]
  readonly parentCategoryId?: string
  readonly record: RecordLike
  readonly subCategories: readonly string[]
  readonly subCategoryOrder?: readonly string[]
  readonly timestamp: number
  readonly urlIds?: readonly string[]
  readonly urlSubCategories: Readonly<Record<string, string>>
}

type DecodedSavedTabFields = Omit<
  DecodedSavedTab,
  'collectionId' | 'domain' | 'record'
>

const hasInvalidSavedTabReferences = (input: {
  readonly nestedUrls: unknown
  readonly subCategories: readonly string[] | undefined | null
  readonly urlIds: readonly string[] | undefined | null
}): boolean =>
  input.urlIds === null ||
  input.subCategories === null ||
  (input.nestedUrls !== undefined && !Array.isArray(input.nestedUrls))

const hasInvalidSavedTabMetadata = (input: {
  readonly parentCategoryId: unknown
  readonly savedAt: number | undefined | null
  readonly urlSubCategories: unknown
}): boolean =>
  input.savedAt === null ||
  (input.parentCategoryId !== undefined &&
    typeof input.parentCategoryId !== 'string') ||
  (input.urlSubCategories !== undefined &&
    !isStringValueRecord(input.urlSubCategories))

const readSavedTabCategoryOrder = (
  value: RecordLike,
  state: AnalyzerState,
): readonly string[] | null | undefined => {
  const order = readOptionalStringArray(value, 'subCategoryOrder')
  const orderWithUncategorized = readOptionalStringArray(
    value,
    'subCategoryOrderWithUncategorized',
  )
  if (order === null || orderWithUncategorized === null) {
    return null
  }
  const uncategorizedMarkerCount =
    orderWithUncategorized?.filter((category) => category === '__uncategorized')
      .length ?? 0
  const filteredOrder = orderWithUncategorized?.filter(
    (category) => category !== '__uncategorized',
  )
  if (
    uncategorizedMarkerCount > 1 ||
    (order &&
      filteredOrder &&
      (order.length !== filteredOrder.length ||
        order.some((category, index) => category !== filteredOrder[index])))
  ) {
    addIssue(state, 'LEGACY_DOMAIN_CATEGORY_MAPPING_CONFLICT', 'error')
  }
  return order ?? filteredOrder
}

const decodeSavedTabFields = (
  value: RecordLike,
  state: AnalyzerState,
): DecodedSavedTabFields | undefined => {
  const urlIds = readOptionalStringArray(value, 'urlIds')
  const subCategories = readOptionalStringArray(value, 'subCategories')
  const subCategoryOrder = readSavedTabCategoryOrder(value, state)
  const savedAt = readOptionalTimestamp(value, 'savedAt')
  const nestedUrls = value.urls
  const parentCategoryId = value.parentCategoryId
  if (
    hasInvalidSavedTabReferences({
      nestedUrls,
      subCategories,
      urlIds,
    }) ||
    subCategoryOrder === null ||
    hasInvalidSavedTabMetadata({
      parentCategoryId,
      savedAt,
      urlSubCategories: value.urlSubCategories,
    })
  ) {
    addIssue(state, 'MIGRATION_SOURCE_INVALID_TYPE', 'error')
    return undefined
  }
  if (savedAt === undefined) {
    addIssue(state, 'MISSING_TIMESTAMP_PROVENANCE', 'warning')
  }
  return {
    ...(Array.isArray(nestedUrls) ? { nestedUrls } : {}),
    ...(typeof parentCategoryId === 'string' ? { parentCategoryId } : {}),
    subCategories: subCategories ?? [],
    ...(subCategoryOrder ? { subCategoryOrder } : {}),
    timestamp: savedAt ?? 0,
    ...(urlIds ? { urlIds } : {}),
    urlSubCategories: isStringValueRecord(value.urlSubCategories)
      ? value.urlSubCategories
      : {},
  }
}

const decodeSavedTab = (
  value: unknown,
  state: AnalyzerState,
): DecodedSavedTab | undefined => {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.domain !== 'string'
  ) {
    addIssue(state, 'MIGRATION_SOURCE_INVALID_TYPE', 'error')
    return undefined
  }
  const fields = decodeSavedTabFields(value, state)
  if (!fields) {
    return undefined
  }
  const domain = safeDomain(value.domain)
  if (!domain) {
    addIssue(state, 'MIGRATION_SOURCE_INVALID_TYPE', 'error')
    return undefined
  }
  return {
    collectionId: value.id,
    domain,
    ...fields,
    record: value,
  }
}

const hasParentRelationConflict = (
  input: DecodedSavedTab,
  relations: ParentRelationContext,
): boolean => {
  const relatedParentIds = new Set([
    ...(relations.parentsByCollectionId.get(input.collectionId) ?? []),
    ...(relations.parentsByDomain.get(input.domain) ?? []),
    ...(relations.mappingParentsByDomain.get(input.domain) ?? []),
  ])
  if (relatedParentIds.size > 1) {
    return true
  }
  if (input.parentCategoryId === undefined) {
    return relatedParentIds.size > 0
  }
  return (
    !relations.parentIds.has(input.parentCategoryId) ||
    !relatedParentIds.has(input.parentCategoryId)
  )
}

const checkParallelUrlRepresentations = (
  input: DecodedSavedTab,
  state: AnalyzerState,
): void => {
  if (!input.urlIds || !input.nestedUrls) {
    return
  }
  const nestedIds: string[] = []
  for (const item of input.nestedUrls) {
    if (isRecord(item) && typeof item.id === 'string') {
      nestedIds.push(item.id)
    }
  }
  const nestedIdSet = new Set(nestedIds)
  if (
    nestedIds.length !== input.nestedUrls.length ||
    input.urlIds.length !== nestedIds.length ||
    input.urlIds.some((id) => !nestedIdSet.has(id))
  ) {
    addIssue(state, 'LEGACY_URL_REFERENCE_CONFLICT', 'error')
  }
}

type SavedTabAppendOptions = {
  readonly indexOffset?: number
  readonly targetCollectionId?: string
}

const appendSavedTabMemberships = (
  input: DecodedSavedTab,
  categoryIds: ReadonlyMap<string, string>,
  state: AnalyzerState,
  options: SavedTabAppendOptions = {},
): void => {
  const targetCollectionId = options.targetCollectionId ?? input.collectionId
  const indexOffset = options.indexOffset ?? 0
  const ids = input.urlIds ?? []
  const idSet = new Set(ids)
  ids.forEach((urlId, index) => {
    if (!state.urlsById.has(urlId)) {
      addIssue(state, 'LEGACY_URL_REFERENCE_CONFLICT', 'error')
    }
    const hasCategoryMetadata = Object.hasOwn(input.urlSubCategories, urlId)
    const categoryName = input.urlSubCategories[urlId]
    const categoryId =
      typeof categoryName === 'string'
        ? categoryIds.get(categoryName)
        : undefined
    if (hasCategoryMetadata && !categoryId) {
      addIssue(state, 'LEGACY_URL_REFERENCE_CONFLICT', 'error')
    }
    addMembership(state, {
      ...(categoryId ? { categoryId } : {}),
      collectionId: targetCollectionId,
      index: indexOffset + index,
      timestamp: input.timestamp,
      timestampProvenance: 'legacy-fallback',
      urlId,
    })
  })
  for (const metadataUrlId of Object.keys(input.urlSubCategories)) {
    if (!idSet.has(metadataUrlId)) {
      addIssue(state, 'LEGACY_URL_REFERENCE_CONFLICT', 'error')
    }
  }
}

const resolveNestedSavedTabCategoryId = (
  state: AnalyzerState,
  input: {
    readonly categoryIds: ReadonlyMap<string, string>
    readonly decoded: DecodedNestedUrl
    readonly savedTab: DecodedSavedTab
  },
): string | undefined => {
  const topLevelCategory = Object.hasOwn(
    input.savedTab.urlSubCategories,
    input.decoded.id,
  )
    ? input.savedTab.urlSubCategories[input.decoded.id]
    : undefined
  if (
    topLevelCategory !== undefined &&
    input.decoded.subCategory !== undefined &&
    topLevelCategory !== input.decoded.subCategory
  ) {
    addIssue(state, 'LEGACY_URL_REFERENCE_CONFLICT', 'error')
  }
  return resolveCategoryId(
    topLevelCategory ?? input.decoded.subCategory,
    input.categoryIds,
    state,
  )
}

const appendExistingNestedSavedTabUrl = (
  decoded: DecodedNestedUrl,
  input: {
    readonly categoryId?: string
    readonly collectionId: string
    readonly idSet: ReadonlySet<string>
    readonly index: number
  },
  state: AnalyzerState,
): void => {
  checkNestedCanonicalUrl(decoded, decoded.id, state)
  if (
    mergeMembershipMetadata(state, {
      ...(input.categoryId ? { categoryId: input.categoryId } : {}),
      collectionId: input.collectionId,
      ...(decoded.savedAt === undefined ? {} : { timestamp: decoded.savedAt }),
      urlId: decoded.id,
    }) ||
    input.idSet.has(decoded.id)
  ) {
    return
  }
  const canonical = state.urlsById.get(decoded.id)?.[0]
  if (!canonical) {
    return
  }
  addMembership(state, {
    ...(input.categoryId ? { categoryId: input.categoryId } : {}),
    collectionId: input.collectionId,
    index: input.index,
    timestamp: decoded.savedAt ?? canonical.firstSavedAt,
    timestampProvenance:
      decoded.savedAt === undefined ? 'legacy-fallback' : 'exact',
    urlId: decoded.id,
  })
}

const appendNestedSavedTabUrl = (
  item: unknown,
  index: number,
  input: {
    readonly categoryIds: ReadonlyMap<string, string>
    readonly idSet: ReadonlySet<string>
    readonly indexOffset: number
    readonly savedTab: DecodedSavedTab
    readonly targetCollectionId: string
  },
  state: AnalyzerState,
): void => {
  const decoded = decodeNestedUrl(
    item,
    `legacy:domain:${input.savedTab.collectionId}:${index}`,
    state,
  )
  if (!decoded) {
    return
  }
  const categoryId = resolveNestedSavedTabCategoryId(state, {
    categoryIds: input.categoryIds,
    decoded,
    savedTab: input.savedTab,
  })
  const membershipIndex =
    input.indexOffset + (input.savedTab.urlIds?.length ?? 0) + index
  if (state.urlsById.has(decoded.id)) {
    appendExistingNestedSavedTabUrl(
      decoded,
      {
        ...(categoryId ? { categoryId } : {}),
        collectionId: input.targetCollectionId,
        idSet: input.idSet,
        index: membershipIndex,
      },
      state,
    )
    return
  }
  const url = addUrl(state, { ...decoded, source: 'nested' })
  if (!url || input.idSet.has(url.id)) {
    return
  }
  addMembership(state, {
    ...(categoryId ? { categoryId } : {}),
    collectionId: input.targetCollectionId,
    index: membershipIndex,
    timestamp: decoded.savedAt ?? url.firstSavedAt,
    timestampProvenance:
      decoded.savedAt === undefined ? 'legacy-fallback' : 'exact',
    urlId: url.id,
  })
}

const appendNestedSavedTabUrls = (
  input: DecodedSavedTab,
  categoryIds: ReadonlyMap<string, string>,
  state: AnalyzerState,
  options: SavedTabAppendOptions = {},
): void => {
  const targetCollectionId = options.targetCollectionId ?? input.collectionId
  const indexOffset = options.indexOffset ?? 0
  const idSet = new Set(input.urlIds)
  ;(input.nestedUrls ?? []).forEach((item, index) => {
    appendNestedSavedTabUrl(
      item,
      index,
      {
        categoryIds,
        idSet,
        indexOffset,
        savedTab: input,
        targetCollectionId,
      },
      state,
    )
  })
}

const haveSameOrderedStrings = (
  left: readonly string[],
  right: readonly string[],
): boolean =>
  left.length === right.length &&
  left.every((value, index) => value === right[index])

const orderDomainCategoryNames = (
  names: readonly string[],
  order: readonly string[] | undefined,
  state: AnalyzerState,
): readonly string[] => {
  if (!order) {
    return names
  }
  const nameSet = new Set(names)
  if (
    hasDuplicateStrings(order) ||
    order.length !== names.length ||
    order.some((name) => !nameSet.has(name))
  ) {
    addIssue(state, 'LEGACY_DOMAIN_CATEGORY_MAPPING_CONFLICT', 'error')
    return names
  }
  return order
}

const resolveDomainCategories = (
  input: DecodedSavedTab,
  setting: DecodedDomainCategorySetting | undefined,
  state: AnalyzerState,
): {
  readonly keywords: ReadonlyMap<string, readonly string[]>
  readonly names: readonly string[]
} => {
  const embeddedKeywords = readKeywordMap(input.record.categoryKeywords, state)
  if (
    hasDuplicateStrings(input.subCategories) ||
    hasDuplicateCategoryKeywordDefinitions(input.record.categoryKeywords)
  ) {
    addIssue(state, 'LEGACY_DOMAIN_CATEGORY_MAPPING_CONFLICT', 'error')
  }
  if (
    setting &&
    input.subCategories.length > 0 &&
    !haveSameOrderedStrings(input.subCategories, setting.names)
  ) {
    addIssue(state, 'LEGACY_DOMAIN_CATEGORY_MAPPING_CONFLICT', 'error')
  }
  const unorderedNames = [
    ...new Set([...(setting?.names ?? []), ...input.subCategories]),
  ]
  const names = orderDomainCategoryNames(
    unorderedNames,
    input.subCategoryOrder,
    state,
  )
  const nameSet = new Set(names)
  const keywords = new Map(setting?.keywords)
  for (const [name, values] of embeddedKeywords) {
    const existing = keywords.get(name)
    if (existing && !haveSameOrderedStrings(existing, values)) {
      addIssue(state, 'LEGACY_DOMAIN_CATEGORY_MAPPING_CONFLICT', 'error')
    }
    keywords.set(name, values)
  }
  if ([...keywords.keys()].some((name) => !nameSet.has(name))) {
    addIssue(state, 'LEGACY_DOMAIN_CATEGORY_MAPPING_CONFLICT', 'error')
  }
  return { keywords, names }
}

type DecodedSavedTabEntry = {
  readonly collectionIndex: number
  readonly input: DecodedSavedTab
}

type DuplicateDomainMergePlan = {
  readonly collectionId: string
  readonly collectionIndex: number
  readonly createdAt: number
  nextMembershipIndex: number
  readonly updatedAt: number
}

const hasDuplicateDomainParentMetadata = (
  input: DecodedSavedTab,
  relations: ParentRelationContext,
): boolean =>
  input.parentCategoryId !== undefined ||
  (relations.parentsByCollectionId.get(input.collectionId)?.size ?? 0) > 0 ||
  (relations.parentsByDomain.get(input.domain)?.size ?? 0) > 0 ||
  (relations.mappingParentsByDomain.get(input.domain)?.size ?? 0) > 0

const hasDuplicateDomainCategoryMetadata = (input: DecodedSavedTab): boolean =>
  input.subCategories.length > 0 ||
  input.subCategoryOrder !== undefined ||
  Object.keys(input.urlSubCategories).length > 0 ||
  (input.record.categoryKeywords !== undefined &&
    (!Array.isArray(input.record.categoryKeywords) ||
      input.record.categoryKeywords.length > 0)) ||
  (input.nestedUrls?.length ?? 0) > 0

const hasDuplicateDomainMetadata = (
  input: DecodedSavedTab,
  relations: ParentRelationContext,
): boolean =>
  hasDuplicateDomainParentMetadata(input, relations) ||
  hasDuplicateDomainCategoryMetadata(input)

const hasOverlappingSavedTabUrlIds = (
  entries: readonly DecodedSavedTabEntry[],
): boolean => {
  const seenUrlIds = new Set<string>()
  for (const { input } of entries) {
    for (const urlId of input.urlIds ?? []) {
      if (seenUrlIds.has(urlId)) {
        return true
      }
      seenUrlIds.add(urlId)
    }
  }
  return false
}

const canMergeDuplicateDomainEntries = (
  entries: readonly DecodedSavedTabEntry[],
  relations: ParentRelationContext,
): boolean =>
  !entries.some(({ input }) => hasDuplicateDomainMetadata(input, relations)) &&
  !hasOverlappingSavedTabUrlIds(entries)

const createDuplicateDomainMergePlans = (
  entries: readonly DecodedSavedTabEntry[],
  relations: ParentRelationContext,
  state: AnalyzerState,
): ReadonlyMap<string, DuplicateDomainMergePlan> => {
  const entriesByDomain = new Map<string, DecodedSavedTabEntry[]>()
  for (const entry of entries) {
    const matches = entriesByDomain.get(entry.input.domain) ?? []
    matches.push(entry)
    entriesByDomain.set(entry.input.domain, matches)
  }
  const plans = new Map<string, DuplicateDomainMergePlan>()
  for (const [domain, matches] of entriesByDomain) {
    if (
      matches.length < 2 ||
      !canMergeDuplicateDomainEntries(matches, relations)
    ) {
      continue
    }
    const canonical = matches[0]
    plans.set(domain, {
      collectionId: canonical.input.collectionId,
      collectionIndex: canonical.collectionIndex,
      createdAt: Math.min(...matches.map(({ input }) => input.timestamp)),
      nextMembershipIndex: 0,
      updatedAt: Math.max(...matches.map(({ input }) => input.timestamp)),
    })
    addIssue(state, 'DUPLICATE_DOMAIN_COLLECTION', 'warning')
  }
  return plans
}

const getSavedTabMembershipSpan = (input: DecodedSavedTab): number =>
  (input.urlIds?.length ?? 0) + (input.nestedUrls?.length ?? 0)

type SavedTabsParseContext = {
  readonly categoryIdsByDomain: Map<string, ReadonlyMap<string, string>>
  readonly matchedSettingDomains: Set<string>
  readonly mergePlans: ReadonlyMap<string, DuplicateDomainMergePlan>
  readonly relations: ParentRelationContext
  readonly settingsByDomain: ReadonlyMap<string, DecodedDomainCategorySetting>
  readonly state: AnalyzerState
}

const createSavedTabCategoryIds = (
  entry: DecodedSavedTabEntry,
  targetCollectionId: string,
  mergePlan: DuplicateDomainMergePlan | undefined,
  context: SavedTabsParseContext,
): ReadonlyMap<string, string> => {
  if (mergePlan && mergePlan.collectionIndex !== entry.collectionIndex) {
    return context.categoryIdsByDomain.get(entry.input.domain) ?? new Map()
  }
  const { input } = entry
  context.state.collections.push({
    createdAt: mergePlan?.createdAt ?? input.timestamp,
    definition: { domain: input.domain, type: 'domain' },
    ...(input.parentCategoryId ? { groupId: input.parentCategoryId } : {}),
    id: targetCollectionId,
    name: input.domain,
    sortOrder: entry.collectionIndex * ORDER_GAP,
    updatedAt: mergePlan?.updatedAt ?? input.timestamp,
  })
  const setting = context.settingsByDomain.get(input.domain)
  if (setting) {
    context.matchedSettingDomains.add(input.domain)
  }
  const categories = resolveDomainCategories(input, setting, context.state)
  const categoryIds = createCategories(context.state, {
    collectionId: targetCollectionId,
    createdAt: input.timestamp,
    keywords: categories.keywords,
    names: categories.names,
    updatedAt: input.timestamp,
  })
  if (mergePlan) {
    context.categoryIdsByDomain.set(input.domain, categoryIds)
  }
  return categoryIds
}

const appendSavedTabEntry = (
  entry: DecodedSavedTabEntry,
  context: SavedTabsParseContext,
): void => {
  const { input } = entry
  const mergePlan = context.mergePlans.get(input.domain)
  const targetCollectionId = mergePlan?.collectionId ?? input.collectionId
  if (hasParentRelationConflict(input, context.relations)) {
    addIssue(context.state, 'LEGACY_PARENT_CATEGORY_CONFLICT', 'error')
  }
  const categoryIds = createSavedTabCategoryIds(
    entry,
    targetCollectionId,
    mergePlan,
    context,
  )
  const indexOffset = mergePlan?.nextMembershipIndex ?? 0
  const appendOptions = { indexOffset, targetCollectionId }
  checkParallelUrlRepresentations(input, context.state)
  appendSavedTabMemberships(input, categoryIds, context.state, appendOptions)
  appendNestedSavedTabUrls(input, categoryIds, context.state, appendOptions)
  if (mergePlan) {
    mergePlan.nextMembershipIndex += getSavedTabMembershipSpan(input)
  }
}

const parseSavedTabs = (
  values: readonly unknown[],
  relations: ParentRelationContext,
  settingsByDomain: ReadonlyMap<string, DecodedDomainCategorySetting>,
  state: AnalyzerState,
): void => {
  const matchedSettingDomains = new Set<string>()
  const entries: DecodedSavedTabEntry[] = []
  values.forEach((value, collectionIndex) => {
    const input = decodeSavedTab(value, state)
    if (input) {
      entries.push({ collectionIndex, input })
    }
  })
  const mergePlans = createDuplicateDomainMergePlans(entries, relations, state)
  const context: SavedTabsParseContext = {
    categoryIdsByDomain: new Map(),
    matchedSettingDomains,
    mergePlans,
    relations,
    settingsByDomain,
    state,
  }
  for (const entry of entries) {
    appendSavedTabEntry(entry, context)
  }
  for (const domain of settingsByDomain.keys()) {
    if (!matchedSettingDomains.has(domain)) {
      addIssue(state, 'LEGACY_DOMAIN_CATEGORY_MAPPING_CONFLICT', 'error')
    }
  }
}

const parseCustomProjectOrder = (
  values: readonly unknown[],
  projectIds: ReadonlySet<string>,
  state: AnalyzerState,
): ReadonlyMap<string, number> => {
  if (!values.every((value) => typeof value === 'string')) {
    addIssue(state, 'MIGRATION_SOURCE_INVALID_TYPE', 'error')
    return new Map()
  }
  const ids = values.filter(
    (value): value is string => typeof value === 'string',
  )
  const seen = new Set<string>()
  ids.forEach((id) => {
    if (seen.has(id) || !projectIds.has(id)) {
      addIssue(state, 'LEGACY_CUSTOM_PROJECT_ORDER_CONFLICT', 'error')
    }
    seen.add(id)
  })
  for (const projectId of projectIds) {
    if (!seen.has(projectId)) {
      addIssue(state, 'LEGACY_CUSTOM_PROJECT_ORDER_CONFLICT', 'error')
    }
  }
  return new Map(ids.map((id, index) => [id, index * ORDER_GAP]))
}

type DecodedCustomProject = {
  readonly categoryNames: readonly string[]
  readonly collectionId: string
  readonly createdAt: number
  readonly metadata: RecordLike
  readonly name: string
  readonly nestedUrls: readonly unknown[]
  readonly projectKeywords: {
    readonly domainKeywords: readonly string[]
    readonly titleKeywords: readonly string[]
    readonly urlKeywords: readonly string[]
  }
  readonly updatedAt: number
  readonly urlIds?: readonly string[]
}

type DecodedCustomProjectFields = Pick<
  DecodedCustomProject,
  | 'categoryNames'
  | 'createdAt'
  | 'metadata'
  | 'nestedUrls'
  | 'updatedAt'
  | 'urlIds'
>

const hasInvalidCustomProjectCollections = (input: {
  readonly categories: readonly string[] | undefined | null
  readonly categoryOrder: readonly string[] | undefined | null
  readonly urls: unknown
  readonly urlIds: readonly string[] | undefined | null
}): boolean =>
  input.urlIds === null ||
  input.categories === null ||
  input.categoryOrder === null ||
  (input.urls !== undefined && !Array.isArray(input.urls))

const hasInvalidCustomProjectMetadata = (input: {
  readonly createdAt: number | undefined | null
  readonly updatedAt: number | undefined | null
  readonly urlMetadata: unknown
}): boolean =>
  input.createdAt === null ||
  input.updatedAt === null ||
  (input.urlMetadata !== undefined &&
    (!isRecord(input.urlMetadata) ||
      Object.values(input.urlMetadata).some(
        (metadata) =>
          !isRecord(metadata) ||
          (metadata.notes !== undefined &&
            typeof metadata.notes !== 'string') ||
          (metadata.category !== undefined &&
            typeof metadata.category !== 'string'),
      )))

const readProjectKeywords = (
  value: unknown,
  state: AnalyzerState,
): DecodedCustomProject['projectKeywords'] | undefined => {
  if (value === undefined) {
    return { domainKeywords: [], titleKeywords: [], urlKeywords: [] }
  }
  if (!isRecord(value)) {
    addIssue(state, 'MIGRATION_SOURCE_INVALID_TYPE', 'error')
    return undefined
  }
  const domainKeywords = readStringArray(value.domainKeywords)
  const titleKeywords = readStringArray(value.titleKeywords)
  const urlKeywords = readStringArray(value.urlKeywords)
  if (!domainKeywords || !titleKeywords || !urlKeywords) {
    addIssue(state, 'MIGRATION_SOURCE_INVALID_TYPE', 'error')
    return undefined
  }
  return { domainKeywords, titleKeywords, urlKeywords }
}

const resolveCustomCategoryNames = (
  categories: readonly string[] | undefined,
  categoryOrder: readonly string[] | undefined,
  state: AnalyzerState,
): readonly string[] => {
  const names = categories ?? categoryOrder ?? []
  if (hasDuplicateStrings(names)) {
    addIssue(state, 'LEGACY_CUSTOM_PROJECT_ORDER_CONFLICT', 'error')
  }
  const uniqueNames = [...new Set(names)]
  if (!categoryOrder || categories === undefined) {
    return uniqueNames
  }
  const nameSet = new Set(uniqueNames)
  if (
    hasDuplicateStrings(categoryOrder) ||
    categoryOrder.length !== uniqueNames.length ||
    categoryOrder.some((name) => !nameSet.has(name))
  ) {
    addIssue(state, 'LEGACY_CUSTOM_PROJECT_ORDER_CONFLICT', 'error')
    return uniqueNames
  }
  return categoryOrder
}

const decodeCustomProjectFields = (
  value: RecordLike,
  state: AnalyzerState,
): DecodedCustomProjectFields | undefined => {
  const urlIds = readOptionalStringArray(value, 'urlIds')
  const categories = readOptionalStringArray(value, 'categories')
  const categoryOrder = readOptionalStringArray(value, 'categoryOrder')
  const createdAt = readOptionalTimestamp(value, 'createdAt')
  const updatedAt = readOptionalTimestamp(value, 'updatedAt')
  if (
    hasInvalidCustomProjectCollections({
      categories,
      categoryOrder,
      urlIds,
      urls: value.urls,
    }) ||
    hasInvalidCustomProjectMetadata({
      createdAt,
      updatedAt,
      urlMetadata: value.urlMetadata,
    })
  ) {
    addIssue(state, 'MIGRATION_SOURCE_INVALID_TYPE', 'error')
    return undefined
  }
  if (createdAt === undefined || updatedAt === undefined) {
    addIssue(state, 'MISSING_TIMESTAMP_PROVENANCE', 'warning')
  }
  const created = createdAt ?? 0
  return {
    categoryNames: resolveCustomCategoryNames(
      categories ?? undefined,
      categoryOrder ?? undefined,
      state,
    ),
    createdAt: created,
    metadata: isRecord(value.urlMetadata) ? value.urlMetadata : {},
    nestedUrls: Array.isArray(value.urls) ? value.urls : [],
    updatedAt: updatedAt ?? created,
    ...(urlIds ? { urlIds } : {}),
  }
}

const decodeCustomProject = (
  value: unknown,
  state: AnalyzerState,
): DecodedCustomProject | undefined => {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.name !== 'string'
  ) {
    addIssue(state, 'MIGRATION_SOURCE_INVALID_TYPE', 'error')
    return undefined
  }
  const fields = decodeCustomProjectFields(value, state)
  if (!fields) {
    return undefined
  }
  const projectKeywords = readProjectKeywords(value.projectKeywords, state)
  if (!projectKeywords) {
    return undefined
  }
  return {
    collectionId: value.id,
    ...fields,
    name: value.name,
    projectKeywords,
  }
}

const appendCustomProjectMemberships = (
  input: DecodedCustomProject,
  categoryIds: ReadonlyMap<string, string>,
  state: AnalyzerState,
): void => {
  const ids = input.urlIds ?? []
  const idSet = new Set(ids)
  ids.forEach((urlId, index) => {
    if (!state.urlsById.has(urlId)) {
      addIssue(state, 'LEGACY_URL_REFERENCE_CONFLICT', 'error')
    }
    const metadata = isRecord(input.metadata[urlId])
      ? input.metadata[urlId]
      : {}
    const categoryId =
      typeof metadata.category === 'string'
        ? categoryIds.get(metadata.category)
        : undefined
    if (metadata.category !== undefined && !categoryId) {
      addIssue(state, 'LEGACY_URL_REFERENCE_CONFLICT', 'error')
    }
    addMembership(state, {
      ...(categoryId ? { categoryId } : {}),
      collectionId: input.collectionId,
      index,
      ...(typeof metadata.notes === 'string' ? { notes: metadata.notes } : {}),
      timestamp: input.createdAt,
      timestampProvenance: 'legacy-fallback',
      urlId,
    })
  })
  for (const metadataUrlId of Object.keys(input.metadata)) {
    if (!idSet.has(metadataUrlId)) {
      addIssue(state, 'LEGACY_URL_REFERENCE_CONFLICT', 'error')
    }
  }
}

const resolveNestedCustomMetadata = (
  state: AnalyzerState,
  input: {
    readonly categoryIds: ReadonlyMap<string, string>
    readonly decoded: DecodedNestedUrl
    readonly metadataKey: string
    readonly project: DecodedCustomProject
  },
): { readonly categoryId?: string; readonly notes?: string } => {
  const rawTopLevelMetadata = input.project.metadata[input.metadataKey]
  const topLevelMetadata: RecordLike = isRecord(rawTopLevelMetadata)
    ? rawTopLevelMetadata
    : {}
  const topLevelCategory =
    typeof topLevelMetadata.category === 'string'
      ? topLevelMetadata.category
      : undefined
  const topLevelNotes =
    typeof topLevelMetadata.notes === 'string'
      ? topLevelMetadata.notes
      : undefined
  if (
    (topLevelCategory !== undefined &&
      input.decoded.category !== undefined &&
      topLevelCategory !== input.decoded.category) ||
    (topLevelNotes !== undefined &&
      input.decoded.notes !== undefined &&
      topLevelNotes !== input.decoded.notes)
  ) {
    addIssue(state, 'LEGACY_URL_REFERENCE_CONFLICT', 'error')
  }
  const categoryId = resolveCategoryId(
    topLevelCategory ?? input.decoded.category,
    input.categoryIds,
    state,
  )
  const notes = topLevelNotes ?? input.decoded.notes
  return {
    ...(categoryId ? { categoryId } : {}),
    ...(notes !== undefined ? { notes } : {}),
  }
}

const appendNestedCustomProjectUrl = (
  state: AnalyzerState,
  input: {
    readonly categoryIds: ReadonlyMap<string, string>
    readonly index: number
    readonly item: unknown
    readonly project: DecodedCustomProject
  },
): void => {
  const ids = input.project.urlIds ?? []
  const pairedId = ids.at(input.index)
  const decoded = decodeNestedUrl(
    input.item,
    pairedId ?? `legacy:custom:${input.project.collectionId}:${input.index}`,
    state,
  )
  if (!decoded) {
    return
  }
  const metadata = resolveNestedCustomMetadata(state, {
    categoryIds: input.categoryIds,
    decoded,
    metadataKey: pairedId ?? decoded.id,
    project: input.project,
  })
  if (pairedId && state.urlsById.has(pairedId)) {
    checkNestedCanonicalUrl(decoded, pairedId, state)
    mergeMembershipMetadata(state, {
      ...metadata,
      collectionId: input.project.collectionId,
      ...(decoded.savedAt === undefined ? {} : { timestamp: decoded.savedAt }),
      urlId: pairedId,
    })
    return
  }
  const url = addUrl(state, { ...decoded, source: 'nested' })
  if (url && !pairedId) {
    addMembership(state, {
      ...metadata,
      collectionId: input.project.collectionId,
      index: ids.length + input.index,
      timestamp: decoded.savedAt ?? url.firstSavedAt,
      timestampProvenance:
        decoded.savedAt === undefined ? 'legacy-fallback' : 'exact',
      urlId: url.id,
    })
  }
}

const appendNestedCustomProjectUrls = (
  input: DecodedCustomProject,
  categoryIds: ReadonlyMap<string, string>,
  state: AnalyzerState,
): void => {
  const ids = input.urlIds ?? []
  if (
    input.urlIds &&
    input.nestedUrls.length > 0 &&
    input.nestedUrls.length !== ids.length
  ) {
    addIssue(state, 'LEGACY_URL_REFERENCE_CONFLICT', 'error')
  }
  input.nestedUrls.forEach((item, index) => {
    appendNestedCustomProjectUrl(state, {
      categoryIds,
      index,
      item,
      project: input,
    })
  })
}

const parseCustomProjects = (
  values: readonly unknown[],
  orderValues: readonly unknown[],
  state: AnalyzerState,
): void => {
  const projectIds = new Set<string>()
  for (const value of values) {
    if (isRecord(value) && typeof value.id === 'string') {
      projectIds.add(value.id)
    }
  }
  const order = parseCustomProjectOrder(orderValues, projectIds, state)

  values.forEach((value, collectionIndex) => {
    const input = decodeCustomProject(value, state)
    if (!input) {
      return
    }
    state.collections.push({
      createdAt: input.createdAt,
      definition: { projectKeywords: input.projectKeywords, type: 'custom' },
      id: input.collectionId,
      name: input.name,
      sortOrder: order.get(input.collectionId) ?? collectionIndex * ORDER_GAP,
      updatedAt: input.updatedAt,
    })
    const categoryIds = createCategories(state, {
      collectionId: input.collectionId,
      createdAt: input.createdAt,
      keywords: new Map(),
      names: input.categoryNames,
      updatedAt: input.updatedAt,
    })
    appendCustomProjectMemberships(input, categoryIds, state)
    appendNestedCustomProjectUrls(input, categoryIds, state)
  })
}

const parseDomainCategoryMappings = (
  values: readonly unknown[],
  state: AnalyzerState,
): ReadonlyMap<string, ReadonlySet<string>> => {
  const categoriesByDomain = new Map<string, Set<string>>()
  for (const value of values) {
    if (
      !isRecord(value) ||
      typeof value.domain !== 'string' ||
      typeof value.categoryId !== 'string'
    ) {
      addIssue(state, 'MIGRATION_SOURCE_INVALID_TYPE', 'error')
      continue
    }
    const domain = safeDomain(value.domain)
    if (!domain) {
      addIssue(state, 'MIGRATION_SOURCE_INVALID_TYPE', 'error')
      continue
    }
    const categories = categoriesByDomain.get(domain) ?? new Set<string>()
    categories.add(value.categoryId)
    categoriesByDomain.set(domain, categories)
    if (categories.size > 1) {
      addIssue(state, 'LEGACY_DOMAIN_CATEGORY_MAPPING_CONFLICT', 'error')
    }
  }
  return categoriesByDomain
}

const countMessageAttachments = (
  messages: readonly unknown[],
  state: AnalyzerState,
): number => {
  let attachments = 0
  for (const message of messages) {
    if (!isRecord(message)) {
      addIssue(state, 'MIGRATION_SOURCE_INVALID_TYPE', 'error')
      continue
    }
    if (message.attachments === undefined) {
      continue
    }
    if (!Array.isArray(message.attachments)) {
      addIssue(state, 'MIGRATION_SOURCE_INVALID_TYPE', 'error')
      continue
    }
    attachments += message.attachments.length
  }
  return attachments
}

type LegacyAiConversationRecord = RecordLike & {
  readonly createdAt: number
  readonly id: string
  readonly messages: readonly unknown[]
  readonly title: string
  readonly updatedAt: number
}

type LegacyAiMessageRecord = JsonObject & {
  readonly content: string
  readonly id: string
  readonly role: 'assistant' | 'user'
}

const isLegacyAiConversationRecord = (
  value: unknown,
): value is LegacyAiConversationRecord =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.title === 'string' &&
  isFiniteTimestamp(value.createdAt) &&
  isFiniteTimestamp(value.updatedAt) &&
  Array.isArray(value.messages)

const isLegacyAiMessageRecord = (
  value: unknown,
): value is LegacyAiMessageRecord =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.content === 'string' &&
  (value.role === 'user' || value.role === 'assistant') &&
  isJsonValue(value)

const mapAiEntities = (
  conversations: readonly unknown[],
  state: AnalyzerState,
): {
  readonly attachments: number
  readonly conversations: readonly PersistenceJsonRecord[]
  readonly messages: readonly PersistenceMessageRecord[]
} => {
  let attachments = 0
  const conversationRecords: PersistenceJsonRecord[] = []
  const messageRecords: PersistenceMessageRecord[] = []
  const conversationIds = new Set<string>()
  const messageIds = new Set<string>()
  for (const value of conversations) {
    if (!isLegacyAiConversationRecord(value)) {
      addIssue(state, 'MIGRATION_SOURCE_INVALID_TYPE', 'error')
      continue
    }
    if (conversationIds.has(value.id)) {
      addIssue(state, 'LEGACY_AI_ENTITY_ID_COLLISION', 'error')
      continue
    }
    conversationIds.add(value.id)
    const conversationMessageIds: string[] = []
    attachments += countMessageAttachments(value.messages, state)
    for (const message of value.messages) {
      if (!isLegacyAiMessageRecord(message)) {
        addIssue(state, 'MIGRATION_SOURCE_INVALID_TYPE', 'error')
        continue
      }
      if (messageIds.has(message.id)) {
        addIssue(state, 'LEGACY_AI_ENTITY_ID_COLLISION', 'error')
        continue
      }
      messageIds.add(message.id)
      conversationMessageIds.push(message.id)
      messageRecords.push({
        conversationId: value.id,
        createdAt: value.createdAt,
        id: message.id,
        value: message,
      })
    }
    conversationRecords.push({
      id: value.id,
      updatedAt: value.updatedAt,
      value: {
        createdAt: value.createdAt,
        messageIds: conversationMessageIds,
        title: value.title,
      },
    })
  }
  return {
    attachments,
    conversations: conversationRecords,
    messages: messageRecords,
  }
}

const mapAnalyticsViews = (
  values: readonly unknown[],
  state: AnalyzerState,
): readonly PersistenceJsonRecord[] => {
  const ids = new Set<string>()
  const records: PersistenceJsonRecord[] = []
  for (const value of values) {
    if (
      !isRecord(value) ||
      typeof value.id !== 'string' ||
      !isFiniteTimestamp(value.createdAt) ||
      !isFiniteTimestamp(value.updatedAt) ||
      ids.has(value.id) ||
      !isJsonValue(value)
    ) {
      addIssue(state, 'MIGRATION_SOURCE_INVALID_TYPE', 'error')
      continue
    }
    ids.add(value.id)
    records.push({
      id: value.id,
      updatedAt: value.updatedAt,
      value,
    })
  }
  return records
}

const createSourcePayload = (
  source: RawLegacyStorageSnapshot,
): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(source).map(([key, entry]) => [
      key,
      entry.status === 'missing' ? { missing: true } : entry.value,
    ]),
  )

export const mapLegacyStorageToPersistenceV2 = (
  source: RawLegacyStorageSnapshot,
): MigrationPreflightAnalysis => {
  const state: AnalyzerState = {
    categories: [],
    collections: [],
    collisions: [],
    collisionKinds: new Set(),
    groups: [],
    issues: new Map(),
    membershipIndex: new Map(),
    memberships: [],
    urlIdentityTitles: new Map(),
    urls: [],
    urlsById: new Map(),
    urlsByIdentity: new Map(),
  }

  const { dto, issues: schemaIssues } = parseLegacyChromeStorage(source)
  for (const issue of schemaIssues) {
    addIssue(state, issue.code, issue.severity)
  }

  parseCanonicalUrls(dto.urls, state)
  const parentRelations = parseParentCategories(dto.parentCategories, state)
  const mappingParentsByDomain = parseDomainCategoryMappings(
    dto.domainCategoryMappings,
    state,
  )
  const settingsByDomain = parseDomainCategorySettings(
    dto.domainCategorySettings,
    state,
  )
  parseSavedTabs(
    dto.savedTabs,
    {
      mappingParentsByDomain,
      parentIds: parentRelations.ids,
      parentsByCollectionId: parentRelations.parentsByCollectionId,
      parentsByDomain: parentRelations.parentsByDomain,
    },
    settingsByDomain,
    state,
  )
  parseCustomProjects(dto.customProjects, dto.customProjectOrder, state)

  const aiRecords = mapAiEntities(dto.aiChatConversations, state)
  const analyticsRecords = mapAnalyticsViews(dto.savedAnalyticsViews, state)
  if (
    typeof dto.activeAiChatConversationId === 'string' &&
    dto.activeAiChatConversationId.length > 0 &&
    !dto.aiChatConversations.some(
      (value) => isRecord(value) && value.id === dto.activeAiChatConversationId,
    )
  ) {
    addIssue(state, 'INVALID_ACTIVE_CHAT_REFERENCE', 'warning')
  }

  const snapshot: PersistenceV2Snapshot = {
    categories: state.categories,
    collections: state.collections,
    groups: state.groups,
    memberships: state.memberships,
    urls: state.urls,
  }
  const target: PersistenceV2MigrationTarget = {
    analyticsViews: analyticsRecords,
    conversations: aiRecords.conversations,
    messages: aiRecords.messages,
    savedTabs: snapshot,
  }
  const integrity = checkPersistenceIntegrity(snapshot)
  for (const issue of integrity.issues) {
    addIssue(state, issue.code, issue.severity)
  }

  let approximateSourceBytes = 0
  try {
    approximateSourceBytes = measureSerializedBytes(createSourcePayload(source))
  } catch {
    addIssue(state, 'NON_JSON_SAFE_VALUE', 'error')
  }
  let targetSerializedBytes = 0
  if (!hasIssue(state, 'NON_JSON_SAFE_VALUE', 'error')) {
    try {
      targetSerializedBytes = measureSerializedBytes({
        target,
      })
    } catch {
      addIssue(state, 'NON_JSON_SAFE_VALUE', 'error')
    }
  }
  const issues = [...state.issues.values()].toSorted((left, right) =>
    left.code.localeCompare(right.code),
  )
  const entityCounts: PersistenceSourceEntityCounts = {
    analyticsViews: analyticsRecords.length,
    attachments: aiRecords.attachments,
    categories: snapshot.categories.length,
    collections: snapshot.collections.length,
    conversations: aiRecords.conversations.length,
    groups: snapshot.groups.length,
    memberships: snapshot.memberships.length,
    messages: aiRecords.messages.length,
    settings: 0,
    urls: snapshot.urls.length,
  }
  const countProvenance = (
    values: readonly (PersistenceTimestampProvenance | undefined)[],
  ) => ({
    exactCount: values.filter((value) => value === 'exact').length,
    legacyFallbackCount: values.filter((value) => value !== 'exact').length,
  })
  const timestampMigrationSummary: PersistenceTimestampMigrationSummary = {
    membershipAddedAt: countProvenance(
      snapshot.memberships.map(({ addedAtProvenance }) => addedAtProvenance),
    ),
    urlFirstSavedAt: countProvenance(
      snapshot.urls.map(({ firstSavedAtProvenance }) => firstSavedAtProvenance),
    ),
    urlLastSavedAt: countProvenance(
      snapshot.urls.map(({ lastSavedAtProvenance }) => lastSavedAtProvenance),
    ),
  }

  return {
    approximateSourceBytes,
    collisionCount: state.collisions.length,
    collisionKinds: [...state.collisionKinds].toSorted(),
    entityCounts,
    issueCodes: issues.map(({ code }) => code),
    issues,
    snapshot,
    target,
    targetSerializedBytes,
    timestampMigrationSummary,
  }
}

export const analyzeLegacyMigrationPreflight = mapLegacyStorageToPersistenceV2
