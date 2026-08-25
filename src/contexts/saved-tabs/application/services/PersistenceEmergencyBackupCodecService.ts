import type { PersistenceEmergencyBackup } from '@/contexts/saved-tabs/application/ports/PersistenceMigrationRecoveryPort'
import { MIGRATION_SOURCE_KEYS } from '@/contexts/saved-tabs/application/ports/RawLegacyStorageReaderPort'
import type {
  RawLegacyStorageSnapshot,
  RawLegacyStorageValue,
} from '@/contexts/saved-tabs/application/ports/RawLegacyStorageReaderPort'

const VALUE_ENCODING = 'tabbin-tagged-json-v1'

type EncodedValue =
  | { readonly type: 'array'; readonly value: readonly EncodedValue[] }
  | { readonly type: 'boolean'; readonly value: boolean }
  | {
      readonly type: 'number'
      readonly value: number | 'Infinity' | '-Infinity' | 'NaN' | '-0'
    }
  | {
      readonly type: 'object'
      readonly value: readonly (readonly [string, EncodedValue])[]
    }
  | { readonly type: 'null' }
  | { readonly type: 'string'; readonly value: string }
  | { readonly type: 'undefined' }

type EncodedRawLegacyStorageValue =
  | { readonly status: 'missing' }
  | { readonly status: 'present'; readonly value: EncodedValue }

type EncodedRawLegacyStorage = Readonly<
  Record<string, EncodedRawLegacyStorageValue>
>

type PersistenceEmergencyBackupWire = Omit<
  PersistenceEmergencyBackup,
  'rawLegacyStorage'
> & {
  readonly rawLegacyStorage: EncodedRawLegacyStorage
  readonly valueEncoding: typeof VALUE_ENCODING
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const encodeNumber = (
  value: number,
): Extract<EncodedValue, { readonly type: 'number' }>['value'] => {
  if (Number.isNaN(value)) {
    return 'NaN'
  }
  if (value === Number.POSITIVE_INFINITY) {
    return 'Infinity'
  }
  if (value === Number.NEGATIVE_INFINITY) {
    return '-Infinity'
  }
  return Object.is(value, -0) ? '-0' : value
}

const encodeValue = (
  value: unknown,
  ancestors: WeakSet<object>,
): EncodedValue => {
  if (value === undefined) {
    return { type: 'undefined' }
  }
  if (value === null) {
    return { type: 'null' }
  }
  if (typeof value === 'boolean') {
    return { type: 'boolean', value }
  }
  if (typeof value === 'number') {
    return { type: 'number', value: encodeNumber(value) }
  }
  if (typeof value === 'string') {
    return { type: 'string', value }
  }
  if (typeof value !== 'object') {
    throw new TypeError('Emergency backup contains an unsupported value.')
  }
  if (ancestors.has(value)) {
    throw new TypeError('Emergency backup contains a cyclic value.')
  }

  ancestors.add(value)
  try {
    if (Array.isArray(value)) {
      return {
        type: 'array',
        value: Array.from(value, (entry) => encodeValue(entry, ancestors)),
      }
    }
    if (Object.getOwnPropertySymbols(value).length > 0) {
      throw new TypeError('Emergency backup contains an unsupported value.')
    }
    return {
      type: 'object',
      value: Object.entries(value).map(([key, entry]) => [
        key,
        encodeValue(entry, ancestors),
      ]),
    }
  } finally {
    ancestors.delete(value)
  }
}

const encodeRawLegacyStorage = (
  source: RawLegacyStorageSnapshot,
): EncodedRawLegacyStorage => {
  const entries: [string, EncodedRawLegacyStorageValue][] = []
  for (const key of MIGRATION_SOURCE_KEYS) {
    const entry = source[key]
    entries.push([
      key,
      entry.status === 'missing'
        ? entry
        : {
            status: 'present',
            value: encodeValue(entry.value, new WeakSet()),
          },
    ])
  }
  return Object.fromEntries(entries)
}

const decodeNumber = (value: unknown): number => {
  if (typeof value === 'number') {
    return value
  }
  if (value === 'NaN') {
    return Number.NaN
  }
  if (value === 'Infinity') {
    return Number.POSITIVE_INFINITY
  }
  if (value === '-Infinity') {
    return Number.NEGATIVE_INFINITY
  }
  if (value === '-0') {
    return -0
  }
  throw new TypeError('Emergency backup number encoding is invalid.')
}

const decodeBoolean = (value: unknown): boolean => {
  if (typeof value === 'boolean') {
    return value
  }
  throw new TypeError('Emergency backup boolean encoding is invalid.')
}

const decodeString = (value: unknown): string => {
  if (typeof value === 'string') {
    return value
  }
  throw new TypeError('Emergency backup string encoding is invalid.')
}

const decodeArray = (value: unknown): unknown[] => {
  if (Array.isArray(value)) {
    return value.map(decodeValue)
  }
  throw new TypeError('Emergency backup array encoding is invalid.')
}

const decodeObject = (value: unknown): Record<string, unknown> => {
  if (!Array.isArray(value)) {
    throw new TypeError('Emergency backup object encoding is invalid.')
  }
  const result: Record<string, unknown> = {}
  for (const pair of value) {
    if (
      !Array.isArray(pair) ||
      pair.length !== 2 ||
      typeof pair[0] !== 'string' ||
      Object.hasOwn(result, pair[0])
    ) {
      throw new TypeError('Emergency backup object encoding is invalid.')
    }
    Object.defineProperty(result, pair[0], {
      configurable: true,
      enumerable: true,
      value: decodeValue(pair[1]),
      writable: true,
    })
  }
  return result
}

const decodeValue = (input: unknown): unknown => {
  if (!isRecord(input) || typeof input.type !== 'string') {
    throw new TypeError('Emergency backup value encoding is invalid.')
  }
  switch (input.type) {
    case 'undefined': {
      return undefined
    }
    case 'null': {
      return null
    }
    case 'boolean': {
      return decodeBoolean(input.value)
    }
    case 'number': {
      return decodeNumber(input.value)
    }
    case 'string': {
      return decodeString(input.value)
    }
    case 'array': {
      return decodeArray(input.value)
    }
    case 'object': {
      return decodeObject(input.value)
    }
    default: {
      throw new TypeError('Emergency backup value encoding is invalid.')
    }
  }
}

const decodeRawLegacyStorageValue = (entry: unknown): RawLegacyStorageValue => {
  if (!isRecord(entry)) {
    throw new TypeError('Emergency backup source entry is invalid.')
  }
  if (entry.status === 'missing') {
    return { status: 'missing' }
  }
  if (entry.status !== 'present' || !Object.hasOwn(entry, 'value')) {
    throw new TypeError('Emergency backup source entry is invalid.')
  }
  return { status: 'present', value: decodeValue(entry.value) }
}

const decodeRawLegacyStorage = (value: unknown): RawLegacyStorageSnapshot => {
  if (!isRecord(value)) {
    throw new TypeError('Emergency backup source payload is invalid.')
  }
  return {
    activeAiChatConversationId: decodeRawLegacyStorageValue(
      value.activeAiChatConversationId,
    ),
    aiChatConversations: decodeRawLegacyStorageValue(value.aiChatConversations),
    customProjectOrder: decodeRawLegacyStorageValue(value.customProjectOrder),
    customProjects: decodeRawLegacyStorageValue(value.customProjects),
    domainCategoryMappings: decodeRawLegacyStorageValue(
      value.domainCategoryMappings,
    ),
    domainCategorySettings: decodeRawLegacyStorageValue(
      value.domainCategorySettings,
    ),
    parentCategories: decodeRawLegacyStorageValue(value.parentCategories),
    savedAnalyticsViews: decodeRawLegacyStorageValue(value.savedAnalyticsViews),
    savedTabs: decodeRawLegacyStorageValue(value.savedTabs),
    urls: decodeRawLegacyStorageValue(value.urls),
  }
}

export const serializePersistenceEmergencyBackup = (
  backup: PersistenceEmergencyBackup,
): string => {
  const wire: PersistenceEmergencyBackupWire = {
    createdAt: backup.createdAt,
    format: backup.format,
    rawLegacyStorage: encodeRawLegacyStorage(backup.rawLegacyStorage),
    valueEncoding: VALUE_ENCODING,
    version: backup.version,
    warning: backup.warning,
  }
  return JSON.stringify(wire)
}

export const deserializePersistenceEmergencyBackup = (
  serialized: string,
): PersistenceEmergencyBackup => {
  const value: unknown = JSON.parse(serialized)
  if (
    !isRecord(value) ||
    value.format !== 'tabbin-legacy-emergency-backup' ||
    value.version !== 1 ||
    value.warning !== 'contains-private-user-data' ||
    value.valueEncoding !== VALUE_ENCODING ||
    typeof value.createdAt !== 'number' ||
    !Number.isFinite(value.createdAt)
  ) {
    throw new TypeError('Emergency backup envelope is invalid.')
  }
  return {
    createdAt: value.createdAt,
    format: value.format,
    rawLegacyStorage: decodeRawLegacyStorage(value.rawLegacyStorage),
    version: value.version,
    warning: value.warning,
  }
}
