import type {
  PersistenceJsonRecord,
  PersistenceMessageRecord,
} from '@/contexts/saved-tabs/application/ports/PersistenceV2UnitOfWorkPort'
import type {
  PersistenceV2Collection,
  PersistenceV2CollectionCategory,
  PersistenceV2CollectionDefinition,
  PersistenceV2CollectionGroup,
  PersistenceV2CollectionMembership,
  PersistenceV2Url,
} from '@/contexts/saved-tabs/domain/entities/PersistenceModelV2'
import { isJsonValue } from '@/lib/persistence/jsonValue'

type UnknownRecord = Readonly<Record<string, unknown>>

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isJsonRecord = (value: unknown): value is UnknownRecord =>
  isRecord(value) && isJsonValue(value)

const isOptionalString = (value: unknown): value is string | undefined =>
  value === undefined || typeof value === 'string'

const isOptionalTimestampProvenance = (
  value: unknown,
): value is 'exact' | 'legacy-fallback' | undefined =>
  value === undefined || value === 'exact' || value === 'legacy-fallback'

const isStringArray = (value: unknown): value is readonly string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string')

const isProjectKeywords = (value: unknown): boolean =>
  isRecord(value) &&
  isStringArray(value.domainKeywords) &&
  isStringArray(value.titleKeywords) &&
  isStringArray(value.urlKeywords)

const isCollectionDefinition = (
  value: unknown,
): value is PersistenceV2CollectionDefinition => {
  if (!isRecord(value)) {
    return false
  }

  return value.type === 'domain'
    ? typeof value.domain === 'string'
    : value.type === 'custom' && isProjectKeywords(value.projectKeywords)
}

export const isPersistenceV2Url = (value: unknown): value is PersistenceV2Url =>
  isJsonRecord(value) &&
  isOptionalString(value.favIconUrl) &&
  typeof value.firstSavedAt === 'number' &&
  isOptionalTimestampProvenance(value.firstSavedAtProvenance) &&
  typeof value.id === 'string' &&
  typeof value.lastSavedAt === 'number' &&
  isOptionalTimestampProvenance(value.lastSavedAtProvenance) &&
  typeof value.normalizedUrl === 'string' &&
  typeof value.title === 'string' &&
  typeof value.updatedAt === 'number' &&
  typeof value.url === 'string'

export const isPersistenceV2Collection = (
  value: unknown,
): value is PersistenceV2Collection =>
  isJsonRecord(value) &&
  typeof value.createdAt === 'number' &&
  isCollectionDefinition(value.definition) &&
  isOptionalString(value.groupId) &&
  typeof value.id === 'string' &&
  typeof value.name === 'string' &&
  typeof value.sortOrder === 'number' &&
  typeof value.updatedAt === 'number'

export const isPersistenceV2Membership = (
  value: unknown,
): value is PersistenceV2CollectionMembership =>
  isJsonRecord(value) &&
  typeof value.addedAt === 'number' &&
  isOptionalTimestampProvenance(value.addedAtProvenance) &&
  isOptionalString(value.categoryId) &&
  typeof value.collectionId === 'string' &&
  isOptionalString(value.notes) &&
  typeof value.sortOrder === 'number' &&
  typeof value.updatedAt === 'number' &&
  typeof value.urlId === 'string'

export const isPersistenceV2Category = (
  value: unknown,
): value is PersistenceV2CollectionCategory =>
  isJsonRecord(value) &&
  typeof value.collectionId === 'string' &&
  typeof value.createdAt === 'number' &&
  typeof value.id === 'string' &&
  isStringArray(value.keywords) &&
  typeof value.name === 'string' &&
  typeof value.sortOrder === 'number' &&
  typeof value.updatedAt === 'number'

export const isPersistenceV2Group = (
  value: unknown,
): value is PersistenceV2CollectionGroup =>
  isJsonRecord(value) &&
  typeof value.createdAt === 'number' &&
  typeof value.id === 'string' &&
  typeof value.name === 'string' &&
  typeof value.sortOrder === 'number' &&
  typeof value.updatedAt === 'number'

export const isPersistenceJsonRecord = (
  value: unknown,
): value is PersistenceJsonRecord =>
  isJsonRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.updatedAt === 'number' &&
  isJsonValue(value.value)

export const isPersistenceMessageRecord = (
  value: unknown,
): value is PersistenceMessageRecord =>
  isJsonRecord(value) &&
  typeof value.conversationId === 'string' &&
  typeof value.createdAt === 'number' &&
  typeof value.id === 'string' &&
  isJsonValue(value.value)

export class PersistenceRecordDecodeError extends Error {
  constructor(storeName: string) {
    super(`IndexedDB ${storeName} contains an invalid persistence record.`)
    this.name = 'PersistenceRecordDecodeError'
  }
}

export const decodePersistenceRecords = <Value>(
  value: unknown,
  isValue: (item: unknown) => item is Value,
  storeName: string,
): readonly Value[] => {
  if (!Array.isArray(value) || !value.every(isValue)) {
    throw new PersistenceRecordDecodeError(storeName)
  }

  return value
}

export const readIndexedDbRequestResult = (request: IDBRequest): unknown => {
  const result: unknown = request.result

  return result
}
