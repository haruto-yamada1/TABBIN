import type { PersistenceOperationGatePort } from '@/contexts/saved-tabs/application/ports/PersistenceBootstrapPort'
import type {
  PersistenceV2ReplacementErrorCode,
  PersistenceV2ReplacementPort,
  PersistenceV2ReplacementResult,
  PersistenceV2ReplacementTarget,
} from '@/contexts/saved-tabs/application/ports/PersistenceV2ReplacementPort'
import { checkPersistenceIntegrity } from '@/contexts/saved-tabs/domain/services/PersistenceIntegrityChecker'

import type { IndexedDbConnectionManager } from './IndexedDbConnectionManager'
import { queueIndexedDbTransaction } from './IndexedDbTransaction'
import { PERSISTENCE_STORE_NAMES } from './persistenceDatabaseSchema'
import {
  decodePersistenceRecords,
  isPersistenceJsonRecord,
  isPersistenceMessageRecord,
  isPersistenceV2Category,
  isPersistenceV2Collection,
  isPersistenceV2Group,
  isPersistenceV2Membership,
  isPersistenceV2Url,
  readIndexedDbRequestResult,
} from './PersistenceRecordDecoders'
import { decodePersistenceRevision } from './PersistenceRevision'

const LOGICAL_STORE_NAMES = [
  PERSISTENCE_STORE_NAMES.analyticsViews,
  PERSISTENCE_STORE_NAMES.categories,
  PERSISTENCE_STORE_NAMES.collections,
  PERSISTENCE_STORE_NAMES.conversations,
  PERSISTENCE_STORE_NAMES.groups,
  PERSISTENCE_STORE_NAMES.memberships,
  PERSISTENCE_STORE_NAMES.messages,
  PERSISTENCE_STORE_NAMES.urls,
] as const

const REPLACEMENT_ERROR_MESSAGES = {
  DUPLICATE_ANALYTICS_VIEW_ID:
    'Backup replacement contains duplicate analytics identifiers.',
  DUPLICATE_CONVERSATION_ID:
    'Backup replacement contains duplicate conversation identifiers.',
  DUPLICATE_MESSAGE_ID:
    'Backup replacement contains duplicate message identifiers.',
  INVALID_STORED_REVISION:
    'Persistence revision cannot be used for Backup replacement.',
  INVALID_TARGET_RECORD:
    'Backup replacement contains an invalid persistence record.',
  ORPHAN_MESSAGE_CONVERSATION:
    'Backup replacement contains an invalid message relation.',
  REVISION_NOT_COMMITTED: 'Backup replacement revision was not committed.',
  REVISION_OVERFLOW: 'Persistence revision cannot be incremented safely.',
  TRANSACTION_FAILED: 'Backup replacement transaction failed.',
  UNHEALTHY_SAVED_TABS:
    'Backup replacement contains an unhealthy Saved Tabs graph.',
} as const satisfies Readonly<Record<PersistenceV2ReplacementErrorCode, string>>

export class PersistenceV2ReplacementError extends Error {
  readonly code: PersistenceV2ReplacementErrorCode

  constructor(code: PersistenceV2ReplacementErrorCode) {
    super(REPLACEMENT_ERROR_MESSAGES[code])
    this.code = code
    this.name = 'PersistenceV2ReplacementError'
  }
}

type UnknownRecord = Readonly<Record<string, unknown>>

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isTimestamp = (value: number): boolean =>
  Number.isSafeInteger(value) && value >= 0

const hasDuplicateId = (
  records: readonly { readonly id: string }[],
): boolean => {
  const ids = new Set<string>()
  for (const { id } of records) {
    if (ids.has(id)) {
      return true
    }
    ids.add(id)
  }
  return false
}

const decodeReplacementTarget = (
  value: unknown,
): PersistenceV2ReplacementTarget => {
  if (!isRecord(value) || !isRecord(value.savedTabs)) {
    throw new PersistenceV2ReplacementError('INVALID_TARGET_RECORD')
  }

  try {
    return {
      analyticsViews: decodePersistenceRecords(
        value.analyticsViews,
        isPersistenceJsonRecord,
        PERSISTENCE_STORE_NAMES.analyticsViews,
      ),
      conversations: decodePersistenceRecords(
        value.conversations,
        isPersistenceJsonRecord,
        PERSISTENCE_STORE_NAMES.conversations,
      ),
      messages: decodePersistenceRecords(
        value.messages,
        isPersistenceMessageRecord,
        PERSISTENCE_STORE_NAMES.messages,
      ),
      savedTabs: {
        categories: decodePersistenceRecords(
          value.savedTabs.categories,
          isPersistenceV2Category,
          PERSISTENCE_STORE_NAMES.categories,
        ),
        collections: decodePersistenceRecords(
          value.savedTabs.collections,
          isPersistenceV2Collection,
          PERSISTENCE_STORE_NAMES.collections,
        ),
        groups: decodePersistenceRecords(
          value.savedTabs.groups,
          isPersistenceV2Group,
          PERSISTENCE_STORE_NAMES.groups,
        ),
        memberships: decodePersistenceRecords(
          value.savedTabs.memberships,
          isPersistenceV2Membership,
          PERSISTENCE_STORE_NAMES.memberships,
        ),
        urls: decodePersistenceRecords(
          value.savedTabs.urls,
          isPersistenceV2Url,
          PERSISTENCE_STORE_NAMES.urls,
        ),
      },
    }
  } catch {
    throw new PersistenceV2ReplacementError('INVALID_TARGET_RECORD')
  }
}

const hasValidTimestamps = (target: PersistenceV2ReplacementTarget): boolean =>
  target.analyticsViews.every(({ updatedAt }) => isTimestamp(updatedAt)) &&
  target.conversations.every(({ updatedAt }) => isTimestamp(updatedAt)) &&
  target.messages.every(({ createdAt }) => isTimestamp(createdAt)) &&
  target.savedTabs.categories.every(
    ({ createdAt, updatedAt }) =>
      isTimestamp(createdAt) && isTimestamp(updatedAt),
  ) &&
  target.savedTabs.collections.every(
    ({ createdAt, updatedAt }) =>
      isTimestamp(createdAt) && isTimestamp(updatedAt),
  ) &&
  target.savedTabs.groups.every(
    ({ createdAt, updatedAt }) =>
      isTimestamp(createdAt) && isTimestamp(updatedAt),
  ) &&
  target.savedTabs.memberships.every(
    ({ addedAt, updatedAt }) => isTimestamp(addedAt) && isTimestamp(updatedAt),
  ) &&
  target.savedTabs.urls.every(
    ({ firstSavedAt, lastSavedAt, updatedAt }) =>
      isTimestamp(firstSavedAt) &&
      isTimestamp(lastSavedAt) &&
      isTimestamp(updatedAt),
  )

const validateReplacementTarget = (
  value: unknown,
): PersistenceV2ReplacementTarget => {
  const target = decodeReplacementTarget(value)
  if (!hasValidTimestamps(target)) {
    throw new PersistenceV2ReplacementError('INVALID_TARGET_RECORD')
  }

  if (!checkPersistenceIntegrity(target.savedTabs).isHealthy) {
    throw new PersistenceV2ReplacementError('UNHEALTHY_SAVED_TABS')
  }
  if (hasDuplicateId(target.analyticsViews)) {
    throw new PersistenceV2ReplacementError('DUPLICATE_ANALYTICS_VIEW_ID')
  }
  if (hasDuplicateId(target.conversations)) {
    throw new PersistenceV2ReplacementError('DUPLICATE_CONVERSATION_ID')
  }
  if (hasDuplicateId(target.messages)) {
    throw new PersistenceV2ReplacementError('DUPLICATE_MESSAGE_ID')
  }

  const conversationIds = new Set(target.conversations.map(({ id }) => id))
  if (
    target.messages.some(
      ({ conversationId }) => !conversationIds.has(conversationId),
    )
  ) {
    throw new PersistenceV2ReplacementError('ORPHAN_MESSAGE_CONVERSATION')
  }

  return target
}

const recordsByStore = (target: PersistenceV2ReplacementTarget) =>
  [
    [PERSISTENCE_STORE_NAMES.analyticsViews, target.analyticsViews],
    [PERSISTENCE_STORE_NAMES.categories, target.savedTabs.categories],
    [PERSISTENCE_STORE_NAMES.collections, target.savedTabs.collections],
    [PERSISTENCE_STORE_NAMES.conversations, target.conversations],
    [PERSISTENCE_STORE_NAMES.groups, target.savedTabs.groups],
    [PERSISTENCE_STORE_NAMES.memberships, target.savedTabs.memberships],
    [PERSISTENCE_STORE_NAMES.messages, target.messages],
    [PERSISTENCE_STORE_NAMES.urls, target.savedTabs.urls],
  ] as const

export class IndexedDbPersistenceReplacementAdapter implements PersistenceV2ReplacementPort {
  private readonly connectionManager: IndexedDbConnectionManager
  private readonly operationGate: PersistenceOperationGatePort

  constructor(
    connectionManager: IndexedDbConnectionManager,
    operationGate: PersistenceOperationGatePort,
  ) {
    this.connectionManager = connectionManager
    this.operationGate = operationGate
  }

  async replaceAll(
    input: PersistenceV2ReplacementTarget,
  ): Promise<PersistenceV2ReplacementResult> {
    const target = validateReplacementTarget(input)

    return this.operationGate.runIndexedDbWrite(async () => {
      const database = await this.connectionManager.open()
      let committedRevision: number | undefined
      let transactionError: PersistenceV2ReplacementError | undefined

      try {
        await queueIndexedDbTransaction(
          {
            database,
            durability: 'strict',
            mode: 'readwrite',
            storeNames: [
              ...LOGICAL_STORE_NAMES,
              PERSISTENCE_STORE_NAMES.metadata,
            ],
          },
          (transaction) => {
            const metadata = transaction.objectStore(
              PERSISTENCE_STORE_NAMES.metadata,
            )
            const revisionRequest = metadata.get('revision')
            revisionRequest.addEventListener('success', () => {
              try {
                let currentRevision: number
                try {
                  currentRevision = decodePersistenceRevision(
                    readIndexedDbRequestResult(revisionRequest),
                  )
                } catch {
                  throw new PersistenceV2ReplacementError(
                    'INVALID_STORED_REVISION',
                  )
                }
                if (currentRevision === Number.MAX_SAFE_INTEGER) {
                  throw new PersistenceV2ReplacementError('REVISION_OVERFLOW')
                }

                for (const [storeName] of recordsByStore(target)) {
                  transaction.objectStore(storeName).clear()
                }
                for (const [storeName, records] of recordsByStore(target)) {
                  const store = transaction.objectStore(storeName)
                  for (const record of records) {
                    store.put(record)
                  }
                }

                committedRevision = currentRevision + 1
                metadata.put({
                  key: 'revision',
                  value: committedRevision,
                })
              } catch (error) {
                transactionError =
                  error instanceof PersistenceV2ReplacementError
                    ? error
                    : new PersistenceV2ReplacementError('TRANSACTION_FAILED')
                transaction.abort()
              }
            })
          },
        )
      } catch {
        throw (
          transactionError ??
          new PersistenceV2ReplacementError('TRANSACTION_FAILED')
        )
      }

      if (committedRevision === undefined) {
        throw new PersistenceV2ReplacementError('REVISION_NOT_COMMITTED')
      }

      return { revision: committedRevision }
    })
  }
}
