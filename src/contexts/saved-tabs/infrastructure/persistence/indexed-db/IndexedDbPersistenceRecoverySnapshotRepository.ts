import type { PersistenceOperationGatePort } from '@/contexts/saved-tabs/application/ports/PersistenceBootstrapPort'
import type {
  PersistenceRecoverySnapshotRecord,
  PersistenceRecoverySnapshotRepositoryPort,
  PersistenceRecoverySnapshotRetentionPolicy,
  PersistenceRecoverySnapshotSaveResult,
  PersistenceRecoverySnapshotSummary,
} from '@/contexts/saved-tabs/application/ports/PersistenceRecoverySnapshotPort'
import { measureSerializedBytes } from '@/lib/persistence/capacity'
import { isJsonValue } from '@/lib/persistence/jsonValue'

import type { IndexedDbConnectionManager } from './IndexedDbConnectionManager'
import { queueIndexedDbTransaction } from './IndexedDbTransaction'
import { PERSISTENCE_STORE_NAMES } from './persistenceDatabaseSchema'
import { readIndexedDbRequestResult } from './PersistenceRecordDecoders'
import { decodePersistenceRevision } from './PersistenceRevision'

const HOURS_PER_DAY = 24
const MINUTES_PER_HOUR = 60
const SECONDS_PER_MINUTE = 60
const MILLISECONDS_PER_SECOND = 1_000
const MILLISECONDS_PER_DAY =
  HOURS_PER_DAY *
  MINUTES_PER_HOUR *
  SECONDS_PER_MINUTE *
  MILLISECONDS_PER_SECOND

export type PersistenceRecoverySnapshotRepositoryErrorCode =
  | 'DUPLICATE_SNAPSHOT_ID'
  | 'INVALID_POLICY'
  | 'INVALID_SNAPSHOT'
  | 'INVALID_STORED_REVISION'
  | 'INVALID_STORED_SNAPSHOT'
  | 'REVISION_NOT_COMMITTED'
  | 'REVISION_OVERFLOW'
  | 'SOURCE_REVISION_CHANGED'
  | 'TRANSACTION_FAILED'

const ERROR_MESSAGES = {
  DUPLICATE_SNAPSHOT_ID: 'The recovery snapshot identifier already exists.',
  INVALID_POLICY: 'The recovery retention policy is invalid.',
  INVALID_SNAPSHOT: 'The recovery snapshot is invalid.',
  INVALID_STORED_REVISION: 'The persistence revision is invalid.',
  INVALID_STORED_SNAPSHOT: 'A stored recovery snapshot is invalid.',
  REVISION_NOT_COMMITTED: 'The recovery snapshot revision was not committed.',
  REVISION_OVERFLOW: 'The persistence revision cannot be incremented.',
  SOURCE_REVISION_CHANGED:
    'Persistence changed after the recovery source was captured.',
  TRANSACTION_FAILED: 'The recovery snapshot transaction failed.',
} as const satisfies Record<
  PersistenceRecoverySnapshotRepositoryErrorCode,
  string
>

export class PersistenceRecoverySnapshotRepositoryError extends Error {
  readonly code: PersistenceRecoverySnapshotRepositoryErrorCode

  constructor(code: PersistenceRecoverySnapshotRepositoryErrorCode) {
    super(ERROR_MESSAGES[code])
    this.code = code
    this.name = 'PersistenceRecoverySnapshotRepositoryError'
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isSafeNonNegativeInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

const isSafePositiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0

const decodeSnapshot = (
  value: unknown,
  errorCode: 'INVALID_SNAPSHOT' | 'INVALID_STORED_SNAPSHOT',
): PersistenceRecoverySnapshotRecord => {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    value.id.length === 0 ||
    !isSafePositiveInteger(value.backupSchemaVersion) ||
    !isSafeNonNegativeInteger(value.createdAt) ||
    !isSafeNonNegativeInteger(value.expiresAt) ||
    value.expiresAt <= value.createdAt ||
    !isSafeNonNegativeInteger(value.serializedBytes) ||
    !isSafeNonNegativeInteger(value.sourceRevision) ||
    !isJsonValue(value.data)
  ) {
    throw new PersistenceRecoverySnapshotRepositoryError(errorCode)
  }

  let measuredBytes: number
  try {
    measuredBytes = measureSerializedBytes(value.data)
  } catch {
    throw new PersistenceRecoverySnapshotRepositoryError(errorCode)
  }
  if (measuredBytes !== value.serializedBytes) {
    throw new PersistenceRecoverySnapshotRepositoryError(errorCode)
  }

  return {
    backupSchemaVersion: value.backupSchemaVersion,
    createdAt: value.createdAt,
    data: value.data,
    expiresAt: value.expiresAt,
    id: value.id,
    serializedBytes: value.serializedBytes,
    sourceRevision: value.sourceRevision,
  }
}

const decodeSnapshots = (
  value: unknown,
): readonly PersistenceRecoverySnapshotRecord[] => {
  if (!Array.isArray(value)) {
    throw new PersistenceRecoverySnapshotRepositoryError(
      'INVALID_STORED_SNAPSHOT',
    )
  }
  return value.map((record) =>
    decodeSnapshot(record, 'INVALID_STORED_SNAPSHOT'),
  )
}

const decodePolicy = (
  value: PersistenceRecoverySnapshotRetentionPolicy,
): PersistenceRecoverySnapshotRetentionPolicy => {
  if (
    !isSafePositiveInteger(value.maxAgeDays) ||
    !isSafePositiveInteger(value.maxAggregateBytes) ||
    !isSafePositiveInteger(value.maxSnapshots) ||
    !isSafeNonNegativeInteger(value.now)
  ) {
    throw new PersistenceRecoverySnapshotRepositoryError('INVALID_POLICY')
  }
  return value
}

const toSummary = (
  record: PersistenceRecoverySnapshotRecord,
): PersistenceRecoverySnapshotSummary => ({
  createdAt: record.createdAt,
  expiresAt: record.expiresAt,
  id: record.id,
  serializedBytes: record.serializedBytes,
  sourceRevision: record.sourceRevision,
})

const compareNewestFirst = (
  left: PersistenceRecoverySnapshotRecord,
  right: PersistenceRecoverySnapshotRecord,
): number => right.createdAt - left.createdAt || right.id.localeCompare(left.id)

const selectRetainedSnapshots = (
  candidate: PersistenceRecoverySnapshotRecord,
  existing: readonly PersistenceRecoverySnapshotRecord[],
  policy: PersistenceRecoverySnapshotRetentionPolicy,
): readonly PersistenceRecoverySnapshotRecord[] => {
  if (
    candidate.createdAt > policy.now ||
    candidate.expiresAt <= policy.now ||
    candidate.expiresAt - candidate.createdAt >
      policy.maxAgeDays * MILLISECONDS_PER_DAY ||
    candidate.serializedBytes > policy.maxAggregateBytes
  ) {
    throw new PersistenceRecoverySnapshotRepositoryError('INVALID_SNAPSHOT')
  }
  if (existing.some(({ id }) => id === candidate.id)) {
    throw new PersistenceRecoverySnapshotRepositoryError(
      'DUPLICATE_SNAPSHOT_ID',
    )
  }

  const retained: PersistenceRecoverySnapshotRecord[] = [candidate]
  let aggregateBytes = candidate.serializedBytes
  const availableExisting = existing
    .filter(({ expiresAt }) => expiresAt > policy.now)
    .toSorted(compareNewestFirst)

  for (const record of availableExisting) {
    if (retained.length >= policy.maxSnapshots) {
      break
    }
    const nextAggregateBytes = aggregateBytes + record.serializedBytes
    if (
      !Number.isSafeInteger(nextAggregateBytes) ||
      nextAggregateBytes > policy.maxAggregateBytes
    ) {
      continue
    }
    retained.push(record)
    aggregateBytes = nextAggregateBytes
  }
  return retained
}

type RecoverySaveTransactionState = {
  committedRevision?: number
  error?: PersistenceRecoverySnapshotRepositoryError
}

const toRepositoryError = (
  error: unknown,
): PersistenceRecoverySnapshotRepositoryError =>
  error instanceof PersistenceRecoverySnapshotRepositoryError
    ? error
    : new PersistenceRecoverySnapshotRepositoryError('TRANSACTION_FAILED')

const abortRecoverySave = (
  transaction: IDBTransaction,
  state: RecoverySaveTransactionState,
  error: unknown,
): void => {
  state.error = toRepositoryError(error)
  transaction.abort()
}

const queueRevisionedRetentionWrite = ({
  candidate,
  existing,
  metadata,
  policy,
  snapshots,
  state,
  transaction,
}: {
  readonly candidate: PersistenceRecoverySnapshotRecord
  readonly existing: readonly PersistenceRecoverySnapshotRecord[]
  readonly metadata: IDBObjectStore
  readonly policy: PersistenceRecoverySnapshotRetentionPolicy
  readonly snapshots: IDBObjectStore
  readonly state: RecoverySaveTransactionState
  readonly transaction: IDBTransaction
}): void => {
  const revisionRequest = metadata.get('revision')
  revisionRequest.addEventListener('success', () => {
    try {
      let currentRevision: number
      try {
        currentRevision = decodePersistenceRevision(
          readIndexedDbRequestResult(revisionRequest),
        )
      } catch {
        throw new PersistenceRecoverySnapshotRepositoryError(
          'INVALID_STORED_REVISION',
        )
      }
      if (currentRevision !== candidate.sourceRevision) {
        throw new PersistenceRecoverySnapshotRepositoryError(
          'SOURCE_REVISION_CHANGED',
        )
      }
      if (currentRevision === Number.MAX_SAFE_INTEGER) {
        throw new PersistenceRecoverySnapshotRepositoryError(
          'REVISION_OVERFLOW',
        )
      }

      const retained = selectRetainedSnapshots(candidate, existing, policy)
      snapshots.clear()
      for (const record of retained) {
        snapshots.put(record)
      }
      state.committedRevision = currentRevision + 1
      metadata.put({
        key: 'revision',
        value: state.committedRevision,
      })
    } catch (error) {
      abortRecoverySave(transaction, state, error)
    }
  })
}

const queueRecoverySave = ({
  candidate,
  policy,
  state,
  transaction,
}: {
  readonly candidate: PersistenceRecoverySnapshotRecord
  readonly policy: PersistenceRecoverySnapshotRetentionPolicy
  readonly state: RecoverySaveTransactionState
  readonly transaction: IDBTransaction
}): void => {
  const snapshots = transaction.objectStore(
    PERSISTENCE_STORE_NAMES.recoverySnapshots,
  )
  const getAllRequest = snapshots.getAll()
  getAllRequest.addEventListener('success', () => {
    try {
      const existing = decodeSnapshots(
        readIndexedDbRequestResult(getAllRequest),
      )
      queueRevisionedRetentionWrite({
        candidate,
        existing,
        metadata: transaction.objectStore(PERSISTENCE_STORE_NAMES.metadata),
        policy,
        snapshots,
        state,
        transaction,
      })
    } catch (error) {
      abortRecoverySave(transaction, state, error)
    }
  })
}

export class IndexedDbPersistenceRecoverySnapshotRepository implements PersistenceRecoverySnapshotRepositoryPort {
  private readonly connectionManager: IndexedDbConnectionManager
  private readonly operationGate: PersistenceOperationGatePort

  constructor(
    connectionManager: IndexedDbConnectionManager,
    operationGate: PersistenceOperationGatePort,
  ) {
    this.connectionManager = connectionManager
    this.operationGate = operationGate
  }

  readonly findAvailableById = async (
    id: string,
    now: number,
  ): Promise<PersistenceRecoverySnapshotRecord | undefined> => {
    if (
      typeof id !== 'string' ||
      id.length === 0 ||
      !isSafeNonNegativeInteger(now)
    ) {
      throw new PersistenceRecoverySnapshotRepositoryError('INVALID_POLICY')
    }
    return this.operationGate.runIndexedDbRead(async () => {
      const database = await this.connectionManager.open()
      let result: unknown
      await queueIndexedDbTransaction(
        {
          database,
          mode: 'readonly',
          storeNames: [PERSISTENCE_STORE_NAMES.recoverySnapshots],
        },
        (transaction) => {
          const request = transaction
            .objectStore(PERSISTENCE_STORE_NAMES.recoverySnapshots)
            .get(id)
          request.addEventListener('success', () => {
            result = readIndexedDbRequestResult(request)
          })
        },
      )
      if (result === undefined) {
        return undefined
      }
      const record = decodeSnapshot(result, 'INVALID_STORED_SNAPSHOT')
      return record.expiresAt > now ? structuredClone(record) : undefined
    })
  }

  readonly listAvailable = async (
    now: number,
  ): Promise<readonly PersistenceRecoverySnapshotSummary[]> => {
    if (!isSafeNonNegativeInteger(now)) {
      throw new PersistenceRecoverySnapshotRepositoryError('INVALID_POLICY')
    }
    return this.operationGate.runIndexedDbRead(async () => {
      const database = await this.connectionManager.open()
      let result: unknown
      await queueIndexedDbTransaction(
        {
          database,
          mode: 'readonly',
          storeNames: [PERSISTENCE_STORE_NAMES.recoverySnapshots],
        },
        (transaction) => {
          const request = transaction
            .objectStore(PERSISTENCE_STORE_NAMES.recoverySnapshots)
            .getAll()
          request.addEventListener('success', () => {
            result = readIndexedDbRequestResult(request)
          })
        },
      )
      return decodeSnapshots(result ?? [])
        .filter(({ expiresAt }) => expiresAt > now)
        .toSorted(compareNewestFirst)
        .map(toSummary)
    })
  }

  readonly saveWithRetention = async (
    input: PersistenceRecoverySnapshotRecord,
    inputPolicy: PersistenceRecoverySnapshotRetentionPolicy,
  ): Promise<PersistenceRecoverySnapshotSaveResult> => {
    const candidate = decodeSnapshot(input, 'INVALID_SNAPSHOT')
    const policy = decodePolicy(inputPolicy)

    return this.operationGate.runIndexedDbWrite(async () => {
      const database = await this.connectionManager.open()
      const state: RecoverySaveTransactionState = {}

      try {
        await queueIndexedDbTransaction(
          {
            database,
            durability: 'strict',
            mode: 'readwrite',
            storeNames: [
              PERSISTENCE_STORE_NAMES.metadata,
              PERSISTENCE_STORE_NAMES.recoverySnapshots,
            ],
          },
          (transaction) => {
            queueRecoverySave({
              candidate,
              policy,
              state,
              transaction,
            })
          },
        )
      } catch {
        throw (
          state.error ??
          new PersistenceRecoverySnapshotRepositoryError('TRANSACTION_FAILED')
        )
      }

      if (state.error) {
        throw state.error
      }
      if (state.committedRevision === undefined) {
        throw new PersistenceRecoverySnapshotRepositoryError(
          'REVISION_NOT_COMMITTED',
        )
      }
      return {
        revision: state.committedRevision,
        snapshot: toSummary(candidate),
      }
    })
  }
}
