import type {
  PersistenceJsonRecord,
  PersistenceLogicalSnapshot,
  PersistenceMessageRecord,
  PersistenceV2Collection,
  PersistenceV2CollectionDefinition,
  PersistenceV2Snapshot,
} from '@/contexts/saved-tabs/public-api'
import type { JsonObject, JsonValue } from '@/lib/persistence/jsonValue'
import { isJsonValue } from '@/lib/persistence/jsonValue'
import { UserSettingsSchema } from '@/lib/storage/zod-storage'
import type { UserSettings } from '@/types/storage'

import { BackupDataV2Schema } from './BackupV2Schema'
import type { BackupDataV2 } from './BackupV2Schema'

const compareCodePointStrings = (left: string, right: string): number => {
  const leftCodePoints = Array.from(left)
  const rightCodePoints = Array.from(right)
  const sharedLength = Math.min(leftCodePoints.length, rightCodePoints.length)

  for (let index = 0; index < sharedLength; index += 1) {
    const leftCodePoint = leftCodePoints[index]?.codePointAt(0) ?? -1
    const rightCodePoint = rightCodePoints[index]?.codePointAt(0) ?? -1
    if (leftCodePoint !== rightCodePoint) {
      return leftCodePoint - rightCodePoint
    }
  }

  return leftCodePoints.length - rightCodePoints.length
}

const compareCompositeKey = (
  left: readonly string[],
  right: readonly string[],
): number => {
  const sharedLength = Math.min(left.length, right.length)
  for (let index = 0; index < sharedLength; index += 1) {
    const result = compareCodePointStrings(
      left[index] ?? '',
      right[index] ?? '',
    )
    if (result !== 0) {
      return result
    }
  }
  return left.length - right.length
}

const isJsonValueArray = (value: JsonValue): value is readonly JsonValue[] =>
  Array.isArray(value)

const canonicalizeJsonValue = (value: JsonValue): JsonValue => {
  if (value === null || typeof value !== 'object') {
    return value
  }
  if (isJsonValueArray(value)) {
    return value.map(canonicalizeJsonValue)
  }

  const canonical: Record<string, JsonValue> = {}
  for (const key of Object.keys(value).toSorted(compareCodePointStrings)) {
    canonical[key] = canonicalizeJsonValue(value[key])
  }
  return canonical satisfies JsonObject
}

const canonicalizeRecordValue = (value: JsonValue): JsonValue => {
  if (!isJsonValue(value)) {
    throw new TypeError('Persistence record value must be JSON-safe')
  }
  return canonicalizeJsonValue(value)
}

const canonicalizeJsonRecord = (
  record: PersistenceJsonRecord,
): PersistenceJsonRecord => ({
  id: record.id,
  updatedAt: record.updatedAt,
  value: canonicalizeRecordValue(record.value),
})

const canonicalizeMessageRecord = (
  record: PersistenceMessageRecord,
): PersistenceMessageRecord => ({
  conversationId: record.conversationId,
  createdAt: record.createdAt,
  id: record.id,
  value: canonicalizeRecordValue(record.value),
})

const canonicalizeCollectionDefinition = (
  definition: PersistenceV2CollectionDefinition,
): PersistenceV2CollectionDefinition => {
  if (definition.type === 'domain') {
    return {
      domain: definition.domain,
      type: 'domain',
    }
  }
  return {
    projectKeywords: {
      domainKeywords: definition.projectKeywords.domainKeywords.toSorted(
        compareCodePointStrings,
      ),
      titleKeywords: definition.projectKeywords.titleKeywords.toSorted(
        compareCodePointStrings,
      ),
      urlKeywords: definition.projectKeywords.urlKeywords.toSorted(
        compareCodePointStrings,
      ),
    },
    type: 'custom',
  }
}

const canonicalizeCollection = (
  collection: PersistenceV2Collection,
): PersistenceV2Collection => ({
  createdAt: collection.createdAt,
  definition: canonicalizeCollectionDefinition(collection.definition),
  ...(collection.groupId === undefined ? {} : { groupId: collection.groupId }),
  id: collection.id,
  name: collection.name,
  sortOrder: collection.sortOrder,
  updatedAt: collection.updatedAt,
})

const canonicalizeSavedTabs = (
  savedTabs: PersistenceV2Snapshot,
): PersistenceV2Snapshot => ({
  categories: savedTabs.categories
    .map((category) => ({
      collectionId: category.collectionId,
      createdAt: category.createdAt,
      id: category.id,
      keywords: category.keywords.toSorted(compareCodePointStrings),
      name: category.name,
      sortOrder: category.sortOrder,
      updatedAt: category.updatedAt,
    }))
    .toSorted((left, right) => compareCodePointStrings(left.id, right.id)),
  collections: savedTabs.collections
    .map(canonicalizeCollection)
    .toSorted((left, right) => compareCodePointStrings(left.id, right.id)),
  groups: savedTabs.groups
    .map((group) => ({ ...group }))
    .toSorted((left, right) => compareCodePointStrings(left.id, right.id)),
  memberships: savedTabs.memberships
    .map((membership) => ({ ...membership }))
    .toSorted((left, right) =>
      compareCompositeKey(
        [left.collectionId, left.urlId],
        [right.collectionId, right.urlId],
      ),
    ),
  urls: savedTabs.urls
    .map((url) => ({ ...url }))
    .toSorted((left, right) => compareCodePointStrings(left.id, right.id)),
})

const canonicalizeUserSettings = (userSettings: UserSettings): UserSettings => {
  if (!isJsonValue(userSettings)) {
    throw new TypeError('User settings must be JSON-safe')
  }

  const persistedSettings = UserSettingsSchema.parse(userSettings)
  const canonical = canonicalizeJsonValue({
    ...persistedSettings,
    excludePatterns: persistedSettings.excludePatterns.toSorted(
      compareCodePointStrings,
    ),
  })
  return BackupDataV2Schema.shape.userSettings.parse(canonical)
}

const canonicalizeBackupData = (data: BackupDataV2): BackupDataV2 =>
  BackupDataV2Schema.parse({
    analyticsViews: data.analyticsViews
      .map(canonicalizeJsonRecord)
      .toSorted((left, right) => compareCodePointStrings(left.id, right.id)),
    conversations: data.conversations
      .map(canonicalizeJsonRecord)
      .toSorted((left, right) => compareCodePointStrings(left.id, right.id)),
    messages: data.messages
      .map(canonicalizeMessageRecord)
      .toSorted((left, right) =>
        compareCompositeKey(
          [left.conversationId, left.id],
          [right.conversationId, right.id],
        ),
      ),
    savedTabs: canonicalizeSavedTabs(data.savedTabs),
    userSettings: canonicalizeUserSettings(data.userSettings),
  })

const toBackupData = (
  snapshot: PersistenceLogicalSnapshot,
  userSettings: UserSettings,
): BackupDataV2 => {
  const canonicalUserSettings = canonicalizeUserSettings(userSettings)
  const validated = BackupDataV2Schema.parse({
    analyticsViews: snapshot.analyticsViews,
    conversations: snapshot.conversations,
    messages: snapshot.messages,
    savedTabs: snapshot.savedTabs,
    userSettings: canonicalUserSettings,
  })
  return canonicalizeBackupData(validated)
}

const toLogicalSnapshot = (
  data: BackupDataV2,
  revision: number,
): PersistenceLogicalSnapshot => {
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw new RangeError('Persistence revision must be a non-negative integer')
  }

  const canonical = canonicalizeBackupData(BackupDataV2Schema.parse(data))
  return {
    analyticsViews: canonical.analyticsViews,
    conversations: canonical.conversations,
    messages: canonical.messages,
    revision,
    savedTabs: canonical.savedTabs,
  }
}

export const BackupMapper = {
  toBackupData,
  toLogicalSnapshot,
} as const
