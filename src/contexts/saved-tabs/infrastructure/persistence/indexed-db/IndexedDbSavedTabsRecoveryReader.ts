import type { PersistenceOperationGatePort } from '@/contexts/saved-tabs/application/ports/PersistenceBootstrapPort'
import { isJsonValue } from '@/lib/persistence/jsonValue'
import type { JsonValue } from '@/lib/persistence/jsonValue'

import type { IndexedDbConnectionManager } from './IndexedDbConnectionManager'
import { waitForIndexedDbTransaction } from './IndexedDbTransaction'
import { PERSISTENCE_STORE_NAMES } from './persistenceDatabaseSchema'
import { readIndexedDbRequestResult } from './PersistenceRecordDecoders'

const STORE_NAMES = [
  PERSISTENCE_STORE_NAMES.urls,
  PERSISTENCE_STORE_NAMES.collections,
  PERSISTENCE_STORE_NAMES.memberships,
  PERSISTENCE_STORE_NAMES.categories,
  PERSISTENCE_STORE_NAMES.groups,
  PERSISTENCE_STORE_NAMES.metadata,
] as const

const encodeArray = (
  value: readonly unknown[],
  ancestors: Set<object>,
): JsonValue => {
  const keys = Object.keys(value)
  if (
    keys.length !== value.length ||
    keys.some(
      (key) => !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length,
    )
  ) {
    throw new Error('Saved-tab recovery export contains an unsupported value.')
  }
  return ['array', value.map((item) => encodeValue(item, ancestors))]
}

// Tag every value so corrupt user objects can never impersonate encoding tags.
// Unsupported structured-clone types fail explicitly, without a partial file.
const encodeValue = (
  value: unknown,
  ancestors = new Set<object>(),
): JsonValue => {
  if (isJsonValue(value)) {
    return ['json', value]
  }
  if (typeof value === 'number') {
    return ['number', Object.is(value, -0) ? '-0' : String(value)]
  }
  if (value === undefined) {
    return ['undefined']
  }
  if (typeof value === 'bigint') {
    return ['bigint', String(value)]
  }
  if (value instanceof Date) {
    return ['date', encodeValue(value.getTime())]
  }
  if (typeof value === 'object' && !ancestors.has(value)) {
    ancestors.add(value)
    try {
      if (Array.isArray(value)) {
        return encodeArray(value, ancestors)
      }
      const prototype: unknown = Object.getPrototypeOf(value)
      if (prototype === Object.prototype || prototype === null) {
        return [
          'object',
          Object.entries(value).map(([key, item]) => [
            key,
            encodeValue(item, ancestors),
          ]),
        ]
      }
    } finally {
      ancestors.delete(value)
    }
  }
  throw new Error('Saved-tab recovery export contains an unsupported value.')
}

/** Read-only rescue data for manual repair; never a validated Backup V2. */
export const readSavedTabsRecoveryData = async (
  manager: IndexedDbConnectionManager,
  gate: PersistenceOperationGatePort,
) =>
  gate.runIndexedDbRead(async () => {
    const database = await manager.open()
    const transaction = database.transaction(STORE_NAMES, 'readonly')
    const requests = STORE_NAMES.map((name) => ({
      name,
      request: transaction.objectStore(name).getAll(),
    }))
    await waitForIndexedDbTransaction(transaction)
    return {
      encoding: 'tagged-json-v1',
      format: 'tabbin-saved-tabs-recovery',
      stores: Object.fromEntries(
        requests.map(({ name, request }) => [
          name,
          encodeValue(readIndexedDbRequestResult(request)),
        ]),
      ),
      version: 1,
    }
  })
