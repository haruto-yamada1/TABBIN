import type { RawLegacyStorageSnapshot } from '@/contexts/saved-tabs/application/ports/RawLegacyStorageReaderPort'
import type {
  PersistenceV2Collection,
  PersistenceV2CollectionCategory,
  PersistenceV2CollectionGroup,
  PersistenceV2CollectionMembership,
  PersistenceV2InvariantCode,
  PersistenceV2Snapshot,
  PersistenceV2Url,
} from '@/contexts/saved-tabs/domain/entities/PersistenceModelV2'
import { checkPersistenceIntegrity } from '@/contexts/saved-tabs/domain/services/PersistenceIntegrityChecker'
import { createUrlIdentityKey } from '@/contexts/saved-tabs/domain/services/UrlIdentityPolicy'
import { normalizeDomainString } from '@/contexts/saved-tabs/domain/value-objects/DomainName'
import type { PersistenceSourceEntityCounts } from '@/lib/persistence/capacity'
import { measureSerializedBytes } from '@/lib/persistence/capacity'

export type LegacyMigrationIssueCode =
  | 'MIGRATION_SOURCE_MISSING_KEY'
  | 'MIGRATION_SOURCE_INVALID_TYPE'
  | 'LEGACY_URL_REFERENCE_CONFLICT'
  | 'LEGACY_PARENT_CATEGORY_CONFLICT'
  | 'LEGACY_DOMAIN_CATEGORY_MAPPING_CONFLICT'
  | 'LEGACY_CUSTOM_PROJECT_ORDER_CONFLICT'
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
  readonly targetSerializedBytes: number
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
  readonly memberships: PersistenceV2CollectionMembership[]
  readonly urls: PersistenceV2Url[]
  readonly collisionKinds: Set<UrlIdentityCollisionKind>
  readonly urlIdentityTitles: Map<string, Set<string>>
  readonly urlsById: Map<string, number>
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

const readArray = (
  source: RawLegacyStorageSnapshot,
  key: Exclude<keyof RawLegacyStorageSnapshot, 'activeAiChatConversationId'>,
  state: AnalyzerState,
): readonly unknown[] => {
  const entry = source[key]
  if (entry.status === 'missing') {
    addIssue(state, 'MIGRATION_SOURCE_MISSING_KEY', 'warning')
    return []
  }
  if (!Array.isArray(entry.value)) {
    addIssue(state, 'MIGRATION_SOURCE_INVALID_TYPE', 'error')
    return []
  }
  return entry.value
}

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

  const idCount = state.urlsById.get(input.id) ?? 0
  if (idCount > 0) {
    addIssue(state, 'DUPLICATE_URL_ID', 'error')
    state.collisions.push('duplicate-id')
    state.collisionKinds.add('duplicate-id')
  }
  state.urlsById.set(input.id, idCount + 1)

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
    id: input.id,
    lastSavedAt: timestamp,
    normalizedUrl: identity,
    title: input.title,
    updatedAt: timestamp,
    url: input.url,
  }
  state.urls.push(url)
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
    if ([...keywords.keys()].some((name) => !names.includes(name))) {
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
    readonly urlId: string
  },
): void => {
  state.memberships.push({
    addedAt: input.timestamp,
    ...(input.categoryId ? { categoryId: input.categoryId } : {}),
    collectionId: input.collectionId,
    ...(input.notes ? { notes: input.notes } : {}),
    sortOrder: input.index * ORDER_GAP,
    updatedAt: input.timestamp,
    urlId: input.urlId,
  })
}

type DecodedNestedUrl = {
  readonly id: string
  readonly savedAt?: number
  readonly title: string
  readonly url: string
}

const decodeNestedUrl = (
  value: unknown,
  fallbackId: string,
  state: AnalyzerState,
): DecodedNestedUrl | undefined => {
  if (
    !isRecord(value) ||
    typeof value.url !== 'string' ||
    typeof value.title !== 'string' ||
    (value.id !== undefined && typeof value.id !== 'string') ||
    (value.savedAt !== undefined && !isFiniteTimestamp(value.savedAt))
  ) {
    addIssue(state, 'MIGRATION_SOURCE_INVALID_TYPE', 'error')
    return undefined
  }
  return {
    id: typeof value.id === 'string' ? value.id : fallbackId,
    ...(isFiniteTimestamp(value.savedAt) ? { savedAt: value.savedAt } : {}),
    title: value.title,
    url: value.url,
  }
}

const matchesCanonicalUrl = (
  decoded: DecodedNestedUrl,
  state: AnalyzerState,
): boolean =>
  state.urls.some(
    (url) =>
      url.id === decoded.id &&
      url.url === decoded.url &&
      url.title === decoded.title &&
      (decoded.savedAt === undefined || url.firstSavedAt === decoded.savedAt),
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

const decodeSavedTabFields = (
  value: RecordLike,
  state: AnalyzerState,
): DecodedSavedTabFields | undefined => {
  const urlIds = readOptionalStringArray(value, 'urlIds')
  const subCategories = readOptionalStringArray(value, 'subCategories')
  const savedAt = readOptionalTimestamp(value, 'savedAt')
  const nestedUrls = value.urls
  const parentCategoryId = value.parentCategoryId
  if (
    hasInvalidSavedTabReferences({ nestedUrls, subCategories, urlIds }) ||
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
  const nestedIds = input.nestedUrls
    .filter(isRecord)
    .map((item) => item.id)
    .filter((id): id is string => typeof id === 'string')
  if (
    nestedIds.length !== input.nestedUrls.length ||
    input.urlIds.length !== nestedIds.length ||
    input.urlIds.some((id) => !nestedIds.includes(id))
  ) {
    addIssue(state, 'LEGACY_URL_REFERENCE_CONFLICT', 'error')
  }
}

const appendSavedTabMemberships = (
  input: DecodedSavedTab,
  categoryIds: ReadonlyMap<string, string>,
  state: AnalyzerState,
): void => {
  const ids = input.urlIds ?? []
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
      collectionId: input.collectionId,
      index,
      timestamp: input.timestamp,
      urlId,
    })
  })
  for (const metadataUrlId of Object.keys(input.urlSubCategories)) {
    if (!ids.includes(metadataUrlId)) {
      addIssue(state, 'LEGACY_URL_REFERENCE_CONFLICT', 'error')
    }
  }
}

const appendNestedSavedTabUrls = (
  input: DecodedSavedTab,
  state: AnalyzerState,
): void => {
  const ids = input.urlIds ?? []
  ;(input.nestedUrls ?? []).forEach((item, index) => {
    const decoded = decodeNestedUrl(
      item,
      `legacy:domain:${input.collectionId}:${index}`,
      state,
    )
    if (!decoded) {
      return
    }
    if (state.urlsById.has(decoded.id)) {
      checkNestedCanonicalUrl(decoded, decoded.id, state)
      if (!ids.includes(decoded.id)) {
        const canonical = state.urls.find((url) => url.id === decoded.id)
        if (canonical) {
          addMembership(state, {
            collectionId: input.collectionId,
            index: ids.length + index,
            timestamp: canonical.firstSavedAt,
            urlId: decoded.id,
          })
        }
      }
      return
    }
    const url = addUrl(state, decoded)
    if (url && !ids.includes(url.id)) {
      addMembership(state, {
        collectionId: input.collectionId,
        index: ids.length + index,
        timestamp: url.firstSavedAt,
        urlId: url.id,
      })
    }
  })
}

const haveSameOrderedStrings = (
  left: readonly string[],
  right: readonly string[],
): boolean =>
  left.length === right.length &&
  left.every((value, index) => value === right[index])

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
  const names = [
    ...new Set([...(setting?.names ?? []), ...input.subCategories]),
  ]
  const keywords = new Map(setting?.keywords)
  for (const [name, values] of embeddedKeywords) {
    const existing = keywords.get(name)
    if (existing && !haveSameOrderedStrings(existing, values)) {
      addIssue(state, 'LEGACY_DOMAIN_CATEGORY_MAPPING_CONFLICT', 'error')
    }
    keywords.set(name, values)
  }
  if ([...keywords.keys()].some((name) => !names.includes(name))) {
    addIssue(state, 'LEGACY_DOMAIN_CATEGORY_MAPPING_CONFLICT', 'error')
  }
  return { keywords, names }
}

const parseSavedTabs = (
  values: readonly unknown[],
  relations: ParentRelationContext,
  settingsByDomain: ReadonlyMap<string, DecodedDomainCategorySetting>,
  state: AnalyzerState,
): void => {
  const matchedSettingDomains = new Set<string>()
  values.forEach((value, collectionIndex) => {
    const input = decodeSavedTab(value, state)
    if (!input) {
      return
    }
    if (hasParentRelationConflict(input, relations)) {
      addIssue(state, 'LEGACY_PARENT_CATEGORY_CONFLICT', 'error')
    }
    state.collections.push({
      createdAt: input.timestamp,
      definition: { domain: input.domain, type: 'domain' },
      ...(input.parentCategoryId ? { groupId: input.parentCategoryId } : {}),
      id: input.collectionId,
      name: input.domain,
      sortOrder: collectionIndex * ORDER_GAP,
      updatedAt: input.timestamp,
    })
    const setting = settingsByDomain.get(input.domain)
    if (setting) {
      matchedSettingDomains.add(input.domain)
    }
    const categories = resolveDomainCategories(input, setting, state)
    const categoryIds = createCategories(state, {
      collectionId: input.collectionId,
      createdAt: input.timestamp,
      keywords: categories.keywords,
      names: categories.names,
      updatedAt: input.timestamp,
    })
    checkParallelUrlRepresentations(input, state)
    appendSavedTabMemberships(input, categoryIds, state)
    appendNestedSavedTabUrls(input, state)
  })
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
    categoryNames: categoryOrder ?? categories ?? [],
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
      urlId,
    })
  })
  for (const metadataUrlId of Object.keys(input.metadata)) {
    if (!ids.includes(metadataUrlId)) {
      addIssue(state, 'LEGACY_URL_REFERENCE_CONFLICT', 'error')
    }
  }
}

const appendNestedCustomProjectUrls = (
  input: DecodedCustomProject,
  state: AnalyzerState,
): void => {
  const ids = input.urlIds ?? []
  if (input.urlIds && input.nestedUrls.length !== ids.length) {
    addIssue(state, 'LEGACY_URL_REFERENCE_CONFLICT', 'error')
  }
  input.nestedUrls.forEach((item, index) => {
    const pairedId = ids.at(index)
    const decoded = decodeNestedUrl(
      item,
      pairedId ?? `legacy:custom:${input.collectionId}:${index}`,
      state,
    )
    if (!decoded) {
      return
    }
    if (pairedId && state.urlsById.has(pairedId)) {
      checkNestedCanonicalUrl(decoded, pairedId, state)
      return
    }
    const url = addUrl(state, decoded)
    if (url && !pairedId) {
      addMembership(state, {
        collectionId: input.collectionId,
        index: ids.length + index,
        timestamp: url.firstSavedAt,
        urlId: url.id,
      })
    }
  })
}

const parseCustomProjects = (
  values: readonly unknown[],
  orderValues: readonly unknown[],
  state: AnalyzerState,
): void => {
  const projectIds = new Set(
    values
      .filter(isRecord)
      .map((value) => value.id)
      .filter((id): id is string => typeof id === 'string'),
  )
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
    appendNestedCustomProjectUrls(input, state)
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

const countAiEntities = (
  conversations: readonly unknown[],
  state: AnalyzerState,
): { attachments: number; conversations: number; messages: number } => {
  let attachments = 0
  let messages = 0
  let validConversations = 0
  const conversationIds = new Set<string>()
  for (const value of conversations) {
    if (!isRecord(value) || typeof value.id !== 'string') {
      addIssue(state, 'MIGRATION_SOURCE_INVALID_TYPE', 'error')
      continue
    }
    validConversations += 1
    conversationIds.add(value.id)
    if (value.messages === undefined) {
      continue
    }
    if (!Array.isArray(value.messages)) {
      addIssue(state, 'MIGRATION_SOURCE_INVALID_TYPE', 'error')
      continue
    }
    messages += value.messages.length
    attachments += countMessageAttachments(value.messages, state)
  }
  return { attachments, conversations: validConversations, messages }
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

export const analyzeLegacyMigrationPreflight = (
  source: RawLegacyStorageSnapshot,
): MigrationPreflightAnalysis => {
  const state: AnalyzerState = {
    categories: [],
    collections: [],
    collisions: [],
    collisionKinds: new Set(),
    groups: [],
    issues: new Map(),
    memberships: [],
    urlIdentityTitles: new Map(),
    urls: [],
    urlsById: new Map(),
    urlsByIdentity: new Map(),
  }

  const urls = readArray(source, 'urls', state)
  const savedTabs = readArray(source, 'savedTabs', state)
  const customProjects = readArray(source, 'customProjects', state)
  const customProjectOrder = readArray(source, 'customProjectOrder', state)
  const parentCategories = readArray(source, 'parentCategories', state)
  const domainCategorySettings = readArray(
    source,
    'domainCategorySettings',
    state,
  )
  const mappings = readArray(source, 'domainCategoryMappings', state)
  const conversations = readArray(source, 'aiChatConversations', state)
  const analyticsViews = readArray(source, 'savedAnalyticsViews', state)

  parseCanonicalUrls(urls, state)
  const parentRelations = parseParentCategories(parentCategories, state)
  const mappingParentsByDomain = parseDomainCategoryMappings(mappings, state)
  const settingsByDomain = parseDomainCategorySettings(
    domainCategorySettings,
    state,
  )
  parseSavedTabs(
    savedTabs,
    {
      mappingParentsByDomain,
      parentIds: parentRelations.ids,
      parentsByCollectionId: parentRelations.parentsByCollectionId,
      parentsByDomain: parentRelations.parentsByDomain,
    },
    settingsByDomain,
    state,
  )
  parseCustomProjects(customProjects, customProjectOrder, state)

  const aiCounts = countAiEntities(conversations, state)
  const activeConversation = source.activeAiChatConversationId
  if (activeConversation.status === 'missing') {
    addIssue(state, 'MIGRATION_SOURCE_MISSING_KEY', 'warning')
  } else if (typeof activeConversation.value !== 'string') {
    addIssue(state, 'MIGRATION_SOURCE_INVALID_TYPE', 'error')
  } else if (
    activeConversation.value.length > 0 &&
    !conversations.some(
      (value) => isRecord(value) && value.id === activeConversation.value,
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
  const targetSerializedBytes = measureSerializedBytes({
    analyticsViews,
    conversations,
    snapshot,
  })
  const issues = [...state.issues.values()].toSorted((left, right) =>
    left.code.localeCompare(right.code),
  )
  const entityCounts: PersistenceSourceEntityCounts = {
    analyticsViews: analyticsViews.length,
    attachments: aiCounts.attachments,
    categories: snapshot.categories.length,
    collections: snapshot.collections.length,
    conversations: aiCounts.conversations,
    groups: snapshot.groups.length,
    memberships: snapshot.memberships.length,
    messages: aiCounts.messages,
    settings: 0,
    urls: snapshot.urls.length,
  }

  return {
    approximateSourceBytes,
    collisionCount: state.collisions.length,
    collisionKinds: [...state.collisionKinds].toSorted(),
    entityCounts,
    issueCodes: issues.map(({ code }) => code),
    issues,
    snapshot,
    targetSerializedBytes,
  }
}
