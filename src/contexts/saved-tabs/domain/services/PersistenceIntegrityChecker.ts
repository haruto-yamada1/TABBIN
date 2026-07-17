import { PERSISTENCE_V2_INVARIANT_CODES } from '@/contexts/saved-tabs/domain/entities/PersistenceModelV2'
import type {
  PersistenceV2Collection,
  PersistenceV2CollectionMembership,
  PersistenceV2InvariantCode,
  PersistenceV2Snapshot,
} from '@/contexts/saved-tabs/domain/entities/PersistenceModelV2'
import { isJsonValue } from '@/lib/persistence/jsonValue'

export type IntegrityIssueSeverity = 'error' | 'warning'

export type IntegrityRepairability =
  | 'automatic-safe'
  | 'not-repairable'
  | 'requires-review'

type IntegrityIssuePolicy = {
  readonly repairability: IntegrityRepairability
  readonly severity: IntegrityIssueSeverity
}

export const PERSISTENCE_V2_INVARIANT_POLICY = {
  DUPLICATE_URL_ID: {
    repairability: 'requires-review',
    severity: 'error',
  },
  DUPLICATE_NORMALIZED_URL: {
    repairability: 'requires-review',
    severity: 'error',
  },
  URL_IDENTITY_COLLISION: {
    repairability: 'requires-review',
    severity: 'error',
  },
  URL_TITLE_CONFLICT: {
    repairability: 'requires-review',
    severity: 'warning',
  },
  COLLECTION_MISSING: {
    repairability: 'requires-review',
    severity: 'error',
  },
  URL_MISSING: {
    repairability: 'requires-review',
    severity: 'error',
  },
  CATEGORY_MISSING: {
    repairability: 'requires-review',
    severity: 'error',
  },
  CATEGORY_COLLECTION_MISMATCH: {
    repairability: 'requires-review',
    severity: 'error',
  },
  GROUP_MISSING: {
    repairability: 'requires-review',
    severity: 'error',
  },
  DUPLICATE_MEMBERSHIP: {
    repairability: 'requires-review',
    severity: 'error',
  },
  ORPHAN_URL: {
    repairability: 'requires-review',
    severity: 'warning',
  },
  ORPHAN_CATEGORY: {
    repairability: 'requires-review',
    severity: 'error',
  },
  INVALID_MEMBERSHIP_ORDER: {
    repairability: 'requires-review',
    severity: 'error',
  },
  INVALID_CATEGORY_ORDER: {
    repairability: 'requires-review',
    severity: 'error',
  },
  INVALID_COLLECTION_ORDER: {
    repairability: 'requires-review',
    severity: 'error',
  },
  INVALID_GROUP_ORDER: {
    repairability: 'requires-review',
    severity: 'error',
  },
  DUPLICATE_DOMAIN_COLLECTION: {
    repairability: 'requires-review',
    severity: 'error',
  },
  INVALID_TIMESTAMP_RELATION: {
    repairability: 'not-repairable',
    severity: 'error',
  },
  MISSING_TIMESTAMP_PROVENANCE: {
    repairability: 'not-repairable',
    severity: 'warning',
  },
  NON_JSON_SAFE_VALUE: {
    repairability: 'not-repairable',
    severity: 'error',
  },
  INVALID_ACTIVE_CHAT_REFERENCE: {
    repairability: 'automatic-safe',
    severity: 'warning',
  },
} as const satisfies Readonly<
  Record<PersistenceV2InvariantCode, IntegrityIssuePolicy>
>

type TimestampEntityType =
  | 'category'
  | 'collection'
  | 'group'
  | 'membership'
  | 'url'

type NonJsonValueType =
  | 'array'
  | 'bigint'
  | 'boolean'
  | 'function'
  | 'negative-zero'
  | 'non-finite-number'
  | 'object'
  | 'string'
  | 'symbol'
  | 'undefined'

type PersistenceV2DomainCollection = PersistenceV2Collection & {
  readonly definition: Extract<
    PersistenceV2Collection['definition'],
    { readonly type: 'domain' }
  >
}

export type StorageIntegrityIssueDetails = {
  readonly CATEGORY_COLLECTION_MISMATCH: {
    readonly categoryCollectionId: string
    readonly categoryId: string
    readonly collectionId: string
    readonly urlId: string
  }
  readonly CATEGORY_MISSING: {
    readonly categoryId: string
    readonly collectionId: string
    readonly urlId: string
  }
  readonly COLLECTION_MISSING: {
    readonly collectionId: string
    readonly urlId: string
  }
  readonly DUPLICATE_DOMAIN_COLLECTION: {
    readonly collectionIds: readonly string[]
  }
  readonly DUPLICATE_MEMBERSHIP: {
    readonly collectionId: string
    readonly occurrenceCount: number
    readonly urlId: string
  }
  readonly DUPLICATE_NORMALIZED_URL: {
    readonly occurrenceCount: number
    readonly urlIds: readonly string[]
  }
  readonly DUPLICATE_URL_ID: {
    readonly occurrenceCount: number
    readonly urlId: string
  }
  readonly GROUP_MISSING: {
    readonly collectionId: string
    readonly groupId: string
  }
  readonly INVALID_ACTIVE_CHAT_REFERENCE: {
    readonly conversationId: string
  }
  readonly INVALID_CATEGORY_ORDER: {
    readonly categoryId: string
  }
  readonly INVALID_COLLECTION_ORDER: {
    readonly collectionId: string
  }
  readonly INVALID_GROUP_ORDER: {
    readonly groupId: string
  }
  readonly INVALID_MEMBERSHIP_ORDER: {
    readonly collectionId: string
    readonly urlId: string
  }
  readonly INVALID_TIMESTAMP_RELATION: {
    readonly earlierField: string
    readonly entityId: string
    readonly entityType: TimestampEntityType
    readonly laterField: string
  }
  readonly MISSING_TIMESTAMP_PROVENANCE: {
    readonly entityId: string
    readonly entityType: TimestampEntityType
    readonly field: string
  }
  readonly NON_JSON_SAFE_VALUE: {
    readonly path: string
    readonly typeClass: NonJsonValueType
  }
  readonly ORPHAN_CATEGORY: {
    readonly categoryId: string
    readonly collectionId: string
  }
  readonly ORPHAN_URL: {
    readonly urlId: string
  }
  readonly URL_IDENTITY_COLLISION: {
    readonly occurrenceCount: number
    readonly sourceRecordIds: readonly string[]
  }
  readonly URL_MISSING: {
    readonly collectionId: string
    readonly urlId: string
  }
  readonly URL_TITLE_CONFLICT: {
    readonly urlIds: readonly string[]
  }
}

type StorageIntegrityIssueBase<Code extends PersistenceV2InvariantCode> = {
  readonly code: Code
  readonly repairability: IntegrityRepairability
  readonly severity: IntegrityIssueSeverity
}

type StorageIntegrityIssueFor<Code extends PersistenceV2InvariantCode> =
  StorageIntegrityIssueBase<Code> & StorageIntegrityIssueDetails[Code]

export type StorageIntegrityIssue<
  Code extends PersistenceV2InvariantCode = PersistenceV2InvariantCode,
> = {
  readonly [CurrentCode in Code]: StorageIntegrityIssueFor<CurrentCode>
}[Code]

export type StorageIntegrityReport = {
  readonly isHealthy: boolean
  readonly issues: readonly StorageIntegrityIssue[]
}

const createIssue = <Code extends PersistenceV2InvariantCode>(
  code: Code,
  details: StorageIntegrityIssueDetails[Code],
  repairability?: IntegrityRepairability,
): StorageIntegrityIssueFor<Code> => {
  const policy: IntegrityIssuePolicy = PERSISTENCE_V2_INVARIANT_POLICY[code]
  return {
    code,
    repairability: repairability ?? policy.repairability,
    severity: policy.severity,
    ...details,
  }
}

const groupBy = <Value>(
  values: readonly Value[],
  getKey: (value: Value) => string,
): Map<string, Value[]> => {
  const groups = new Map<string, Value[]>()
  for (const value of values) {
    const key = getKey(value)
    const group = groups.get(key)
    if (group) {
      group.push(value)
    } else {
      groups.set(key, [value])
    }
  }
  return groups
}

const isValidOrder = (value: number): boolean => Number.isSafeInteger(value)

const NON_JSON_PRIMITIVE_TYPE_CLASSES = {
  bigint: 'bigint',
  boolean: 'boolean',
  function: 'function',
  string: 'string',
  symbol: 'symbol',
  undefined: 'undefined',
} as const

const classifyNonJsonValue = (value: unknown): NonJsonValueType => {
  const valueType = typeof value
  if (valueType === 'number') {
    return Object.is(value, -0) ? 'negative-zero' : 'non-finite-number'
  }
  if (valueType === 'object') {
    return Array.isArray(value) ? 'array' : 'object'
  }
  return NON_JSON_PRIMITIVE_TYPE_CLASSES[valueType]
}

const findNonJsonIssues = (
  snapshot: PersistenceV2Snapshot,
): readonly StorageIntegrityIssue<'NON_JSON_SAFE_VALUE'>[] => {
  const issues: StorageIntegrityIssue<'NON_JSON_SAFE_VALUE'>[] = []
  const collections = [
    ['categories', snapshot.categories],
    ['collections', snapshot.collections],
    ['groups', snapshot.groups],
    ['memberships', snapshot.memberships],
    ['urls', snapshot.urls],
  ] as const

  for (const [collectionName, records] of collections) {
    records.forEach((record, index) => {
      if (isJsonValue(record)) {
        return
      }
      const invalidFields = Object.entries(record).filter(
        ([, value]) => !isJsonValue(value),
      )
      if (invalidFields.length === 0) {
        issues.push(
          createIssue('NON_JSON_SAFE_VALUE', {
            path: `${collectionName}[${index}]`,
            typeClass: 'object',
          }),
        )
        return
      }
      for (const [field, value] of invalidFields) {
        issues.push(
          createIssue('NON_JSON_SAFE_VALUE', {
            path: `${collectionName}[${index}].${field}`,
            typeClass: classifyNonJsonValue(value),
          }),
        )
      }
    })
  }

  return issues
}

const compareIssues = (
  left: StorageIntegrityIssue,
  right: StorageIntegrityIssue,
): number => {
  const codeOrder =
    PERSISTENCE_V2_INVARIANT_CODES.indexOf(left.code) -
    PERSISTENCE_V2_INVARIANT_CODES.indexOf(right.code)
  if (codeOrder !== 0) {
    return codeOrder
  }
  const leftSerialized = JSON.stringify(left)
  const rightSerialized = JSON.stringify(right)
  if (leftSerialized === rightSerialized) {
    return 0
  }
  return leftSerialized < rightSerialized ? -1 : 1
}

const findUrlIdentityIssues = (
  snapshot: PersistenceV2Snapshot,
): readonly StorageIntegrityIssue[] => {
  const issues: StorageIntegrityIssue[] = []
  const urlsById = groupBy(snapshot.urls, ({ id }) => id)
  const urlsByNormalizedUrl = groupBy(
    snapshot.urls,
    ({ normalizedUrl }) => normalizedUrl,
  )

  for (const [urlId, urls] of urlsById) {
    if (urls.length > 1) {
      issues.push(
        createIssue('DUPLICATE_URL_ID', {
          occurrenceCount: urls.length,
          urlId,
        }),
      )
    }
  }
  for (const urls of urlsByNormalizedUrl.values()) {
    if (urls.length > 1) {
      issues.push(
        createIssue('DUPLICATE_NORMALIZED_URL', {
          occurrenceCount: urls.length,
          urlIds: urls.map(({ id }) => id).toSorted(),
        }),
      )
    }
  }
  return issues
}

type MembershipGroups = Map<
  string,
  Map<string, PersistenceV2CollectionMembership[]>
>

const addMembership = (
  groups: MembershipGroups,
  membership: PersistenceV2CollectionMembership,
): void => {
  const groupsByUrl =
    groups.get(membership.collectionId) ??
    new Map<string, PersistenceV2CollectionMembership[]>()
  const memberships = groupsByUrl.get(membership.urlId) ?? []
  memberships.push(membership)
  groupsByUrl.set(membership.urlId, memberships)
  groups.set(membership.collectionId, groupsByUrl)
}

const hasSameMembershipMetadata = (
  left: PersistenceV2CollectionMembership,
  right: PersistenceV2CollectionMembership,
): boolean =>
  left.addedAt === right.addedAt &&
  left.categoryId === right.categoryId &&
  left.notes === right.notes &&
  left.sortOrder === right.sortOrder &&
  left.updatedAt === right.updatedAt

const hasConflictingMembershipMetadata = (
  memberships: readonly PersistenceV2CollectionMembership[],
): boolean => {
  const first = memberships[0]
  return memberships.some(
    (membership) => !hasSameMembershipMetadata(first, membership),
  )
}

const findDuplicateMembershipIssues = (
  groups: ReadonlyMap<
    string,
    ReadonlyMap<string, readonly PersistenceV2CollectionMembership[]>
  >,
): readonly StorageIntegrityIssue[] => {
  const issues: StorageIntegrityIssue[] = []
  for (const [collectionId, groupsByUrl] of groups) {
    for (const [urlId, memberships] of groupsByUrl) {
      if (memberships.length > 1) {
        issues.push(
          createIssue(
            'DUPLICATE_MEMBERSHIP',
            {
              collectionId,
              occurrenceCount: memberships.length,
              urlId,
            },
            hasConflictingMembershipMetadata(memberships)
              ? 'requires-review'
              : 'automatic-safe',
          ),
        )
      }
    }
  }
  return issues
}

const findMembershipIssues = (
  snapshot: PersistenceV2Snapshot,
): readonly StorageIntegrityIssue[] => {
  const issues: StorageIntegrityIssue[] = []
  const collectionIds = new Set(snapshot.collections.map(({ id }) => id))
  const urlIds = new Set(snapshot.urls.map(({ id }) => id))
  const categoryById = new Map(
    snapshot.categories.map((category) => [category.id, category]),
  )
  const membershipGroups: MembershipGroups = new Map()

  for (const membership of snapshot.memberships) {
    if (!collectionIds.has(membership.collectionId)) {
      issues.push(
        createIssue('COLLECTION_MISSING', {
          collectionId: membership.collectionId,
          urlId: membership.urlId,
        }),
      )
    }
    if (!urlIds.has(membership.urlId)) {
      issues.push(
        createIssue('URL_MISSING', {
          collectionId: membership.collectionId,
          urlId: membership.urlId,
        }),
      )
    }
    if (membership.categoryId) {
      const category = categoryById.get(membership.categoryId)
      if (!category) {
        issues.push(
          createIssue('CATEGORY_MISSING', {
            categoryId: membership.categoryId,
            collectionId: membership.collectionId,
            urlId: membership.urlId,
          }),
        )
      } else if (category.collectionId !== membership.collectionId) {
        issues.push(
          createIssue('CATEGORY_COLLECTION_MISMATCH', {
            categoryCollectionId: category.collectionId,
            categoryId: category.id,
            collectionId: membership.collectionId,
            urlId: membership.urlId,
          }),
        )
      }
    }
    addMembership(membershipGroups, membership)
    if (!isValidOrder(membership.sortOrder)) {
      issues.push(
        createIssue('INVALID_MEMBERSHIP_ORDER', {
          collectionId: membership.collectionId,
          urlId: membership.urlId,
        }),
      )
    }
    if (membership.addedAt > membership.updatedAt) {
      issues.push(
        createIssue('INVALID_TIMESTAMP_RELATION', {
          earlierField: 'addedAt',
          entityId: `${membership.collectionId}:${membership.urlId}`,
          entityType: 'membership',
          laterField: 'updatedAt',
        }),
      )
    }
  }
  issues.push(...findDuplicateMembershipIssues(membershipGroups))
  return issues
}

const findUrlIssues = (
  snapshot: PersistenceV2Snapshot,
): readonly StorageIntegrityIssue[] => {
  const issues: StorageIntegrityIssue[] = []
  const referencedUrlIds = new Set(
    snapshot.memberships.map(({ urlId }) => urlId),
  )
  for (const url of snapshot.urls) {
    if (!referencedUrlIds.has(url.id)) {
      issues.push(createIssue('ORPHAN_URL', { urlId: url.id }))
    }
    if (url.firstSavedAt > url.lastSavedAt) {
      issues.push(
        createIssue('INVALID_TIMESTAMP_RELATION', {
          earlierField: 'firstSavedAt',
          entityId: url.id,
          entityType: 'url',
          laterField: 'lastSavedAt',
        }),
      )
    }
  }
  return issues
}

const findCollectionIssues = (
  snapshot: PersistenceV2Snapshot,
): readonly StorageIntegrityIssue[] => {
  const issues: StorageIntegrityIssue[] = []
  const groupIds = new Set(snapshot.groups.map(({ id }) => id))
  const domainCollections = groupBy(
    snapshot.collections.filter(
      (collection): collection is PersistenceV2DomainCollection =>
        collection.definition.type === 'domain',
    ),
    ({ definition }) => definition.domain,
  )

  for (const collections of domainCollections.values()) {
    if (collections.length > 1) {
      issues.push(
        createIssue('DUPLICATE_DOMAIN_COLLECTION', {
          collectionIds: collections.map(({ id }) => id).toSorted(),
        }),
      )
    }
  }
  for (const collection of snapshot.collections) {
    if (collection.groupId && !groupIds.has(collection.groupId)) {
      issues.push(
        createIssue('GROUP_MISSING', {
          collectionId: collection.id,
          groupId: collection.groupId,
        }),
      )
    }
    if (!isValidOrder(collection.sortOrder)) {
      issues.push(
        createIssue('INVALID_COLLECTION_ORDER', {
          collectionId: collection.id,
        }),
      )
    }
    if (collection.createdAt > collection.updatedAt) {
      issues.push(
        createIssue('INVALID_TIMESTAMP_RELATION', {
          earlierField: 'createdAt',
          entityId: collection.id,
          entityType: 'collection',
          laterField: 'updatedAt',
        }),
      )
    }
  }
  return issues
}

const findCategoryIssues = (
  snapshot: PersistenceV2Snapshot,
): readonly StorageIntegrityIssue[] => {
  const issues: StorageIntegrityIssue[] = []
  const collectionIds = new Set(snapshot.collections.map(({ id }) => id))
  for (const category of snapshot.categories) {
    if (!collectionIds.has(category.collectionId)) {
      issues.push(
        createIssue('ORPHAN_CATEGORY', {
          categoryId: category.id,
          collectionId: category.collectionId,
        }),
      )
    }
    if (!isValidOrder(category.sortOrder)) {
      issues.push(
        createIssue('INVALID_CATEGORY_ORDER', {
          categoryId: category.id,
        }),
      )
    }
    if (category.createdAt > category.updatedAt) {
      issues.push(
        createIssue('INVALID_TIMESTAMP_RELATION', {
          earlierField: 'createdAt',
          entityId: category.id,
          entityType: 'category',
          laterField: 'updatedAt',
        }),
      )
    }
  }
  return issues
}

const findGroupIssues = (
  snapshot: PersistenceV2Snapshot,
): readonly StorageIntegrityIssue[] => {
  const issues: StorageIntegrityIssue[] = []
  for (const group of snapshot.groups) {
    if (!isValidOrder(group.sortOrder)) {
      issues.push(createIssue('INVALID_GROUP_ORDER', { groupId: group.id }))
    }
    if (group.createdAt > group.updatedAt) {
      issues.push(
        createIssue('INVALID_TIMESTAMP_RELATION', {
          earlierField: 'createdAt',
          entityId: group.id,
          entityType: 'group',
          laterField: 'updatedAt',
        }),
      )
    }
  }
  return issues
}

export const checkPersistenceIntegrity = (
  snapshot: PersistenceV2Snapshot,
): StorageIntegrityReport => {
  const issues = [
    ...findUrlIdentityIssues(snapshot),
    ...findMembershipIssues(snapshot),
    ...findUrlIssues(snapshot),
    ...findCollectionIssues(snapshot),
    ...findCategoryIssues(snapshot),
    ...findGroupIssues(snapshot),
    ...findNonJsonIssues(snapshot),
  ].toSorted(compareIssues)

  return {
    isHealthy: issues.length === 0,
    issues,
  }
}
