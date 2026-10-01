import { PersistenceV2MigrationTargetError } from '@/contexts/saved-tabs/application/ports/PersistenceV2MigrationTargetPort'
import type {
  PersistenceV2MigrationTargetErrorCode,
  PersistenceV2MigrationTargetPort,
  PersistenceV2VerifiedMigrationTargetPort,
} from '@/contexts/saved-tabs/application/ports/PersistenceV2MigrationTargetPort'
import type { PersistenceLogicalSnapshot } from '@/contexts/saved-tabs/application/ports/PersistenceV2SnapshotReaderPort'
import type { PersistenceV2WritePlan } from '@/contexts/saved-tabs/application/ports/PersistenceV2UnitOfWorkPort'
import type { IndexedDbConnectionManager } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbConnectionManager'
import { queueIndexedDbTransaction } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbTransaction'
import { PERSISTENCE_STORE_NAMES } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/persistenceDatabaseSchema'
import type { PersistenceStoreName } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/persistenceDatabaseSchema'
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
} from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/PersistenceRecordDecoders'
import { decodePersistenceRevision } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/PersistenceRevision'

const MIGRATION_TARGET_METADATA_KEY = 'migrationTarget'

type MigrationPlanKey = Exclude<
  keyof PersistenceV2WritePlan,
  'recoverySnapshots'
>

const MIGRATION_PLAN_KEYS = [
  'analyticsViews',
  'categories',
  'collections',
  'conversations',
  'groups',
  'memberships',
  'messages',
  'urls',
] as const satisfies readonly MigrationPlanKey[]

const MIGRATION_PLAN_KEY_SET: ReadonlySet<string> = new Set(MIGRATION_PLAN_KEYS)

const PLAN_STORE_NAMES = {
  analyticsViews: PERSISTENCE_STORE_NAMES.analyticsViews,
  categories: PERSISTENCE_STORE_NAMES.categories,
  collections: PERSISTENCE_STORE_NAMES.collections,
  conversations: PERSISTENCE_STORE_NAMES.conversations,
  groups: PERSISTENCE_STORE_NAMES.groups,
  memberships: PERSISTENCE_STORE_NAMES.memberships,
  messages: PERSISTENCE_STORE_NAMES.messages,
  urls: PERSISTENCE_STORE_NAMES.urls,
} as const satisfies Record<MigrationPlanKey, PersistenceStoreName>

const MIGRATABLE_STORE_NAMES = Object.values(
  PLAN_STORE_NAMES,
) satisfies readonly PersistenceStoreName[]

const PLAN_RECORD_VALIDATORS = {
  analyticsViews: isPersistenceJsonRecord,
  categories: isPersistenceV2Category,
  collections: isPersistenceV2Collection,
  conversations: isPersistenceJsonRecord,
  groups: isPersistenceV2Group,
  memberships: isPersistenceV2Membership,
  messages: isPersistenceMessageRecord,
  urls: isPersistenceV2Url,
} as const satisfies Record<MigrationPlanKey, (value: unknown) => boolean>

type MigrationTargetState = 'copying' | 'verified' | 'written'

type MigrationTargetMetadata = {
  readonly migrationId: string
  readonly state: MigrationTargetState
}

type UnknownMutation = {
  readonly delete?: readonly unknown[]
  readonly put?: readonly unknown[]
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isMigrationTargetState = (
  value: unknown,
): value is MigrationTargetState =>
  value === 'copying' || value === 'written' || value === 'verified'

const decodeMigrationTargetMetadata = (
  value: unknown,
): MigrationTargetMetadata => {
  if (value === undefined) {
    throw new PersistenceV2MigrationTargetError('MIGRATION_TARGET_NOT_PREPARED')
  }
  if (
    !isRecord(value) ||
    value.key !== MIGRATION_TARGET_METADATA_KEY ||
    !isRecord(value.value) ||
    typeof value.value.migrationId !== 'string' ||
    !isMigrationTargetState(value.value.state)
  ) {
    throw new PersistenceV2MigrationTargetError(
      'MIGRATION_TARGET_STATE_INVALID',
    )
  }

  return {
    migrationId: value.value.migrationId,
    state: value.value.state,
  }
}

const assertMigrationId = (migrationId: string): void => {
  if (typeof migrationId !== 'string' || migrationId.trim().length === 0) {
    throw new PersistenceV2MigrationTargetError('MIGRATION_ID_INVALID')
  }
}

const assertTarget = (
  value: unknown,
  migrationId: string,
  allowedStates: readonly MigrationTargetState[],
): MigrationTargetMetadata => {
  const metadata = decodeMigrationTargetMetadata(value)
  if (metadata.migrationId !== migrationId) {
    throw new PersistenceV2MigrationTargetError('MIGRATION_TARGET_ID_MISMATCH')
  }
  if (!allowedStates.includes(metadata.state)) {
    throw new PersistenceV2MigrationTargetError(
      'MIGRATION_TARGET_STATE_INVALID',
    )
  }

  return metadata
}

const toDeleteKey = (key: unknown, planKey: MigrationPlanKey): IDBValidKey => {
  if (planKey === 'memberships') {
    if (
      Array.isArray(key) &&
      key.length === 2 &&
      typeof key[0] === 'string' &&
      typeof key[1] === 'string'
    ) {
      return [key[0], key[1]]
    }
  } else if (typeof key === 'string') {
    return key
  }

  throw new PersistenceV2MigrationTargetError('MIGRATION_WRITE_PLAN_INVALID')
}

const hasValidatedChanges = (
  key: MigrationPlanKey,
  mutation: unknown,
): boolean => {
  if (
    !isRecord(mutation) ||
    (mutation.put !== undefined && !Array.isArray(mutation.put)) ||
    (mutation.delete !== undefined && !Array.isArray(mutation.delete))
  ) {
    throw new PersistenceV2MigrationTargetError('MIGRATION_WRITE_PLAN_INVALID')
  }

  const put = mutation.put ?? []
  const deleted = mutation.delete ?? []
  if (put.some((value) => !PLAN_RECORD_VALIDATORS[key](value))) {
    throw new PersistenceV2MigrationTargetError('MIGRATION_WRITE_PLAN_INVALID')
  }
  for (const value of deleted) {
    toDeleteKey(value, key)
  }

  return put.length + deleted.length > 0
}

const collectPlanEntries = (
  plan: PersistenceV2WritePlan,
): readonly MigrationPlanKey[] => {
  if (!isRecord(plan)) {
    throw new PersistenceV2MigrationTargetError('MIGRATION_WRITE_PLAN_INVALID')
  }
  const planKeys = Object.keys(plan)
  if (
    plan.recoverySnapshots !== undefined ||
    planKeys.some(
      (key) => key !== 'recoverySnapshots' && !MIGRATION_PLAN_KEY_SET.has(key),
    )
  ) {
    throw new PersistenceV2MigrationTargetError('MIGRATION_WRITE_PLAN_INVALID')
  }

  const entries: MigrationPlanKey[] = []
  for (const key of MIGRATION_PLAN_KEYS) {
    const mutation: unknown = plan[key]
    if (mutation === undefined) {
      continue
    }
    if (hasValidatedChanges(key, mutation)) {
      entries.push(key)
    }
  }
  if (entries.length === 0) {
    throw new PersistenceV2MigrationTargetError('MIGRATION_WRITE_PLAN_INVALID')
  }

  return entries
}

const queueMutation = (
  store: IDBObjectStore,
  planKey: MigrationPlanKey,
  mutation: UnknownMutation | undefined,
): void => {
  for (const value of mutation?.put ?? []) {
    store.put(value)
  }
  for (const key of mutation?.delete ?? []) {
    store.delete(toDeleteKey(key, planKey))
  }
}

const toTargetError = (
  error: unknown,
  fallbackCode: PersistenceV2MigrationTargetErrorCode,
): PersistenceV2MigrationTargetError =>
  error instanceof PersistenceV2MigrationTargetError
    ? error
    : new PersistenceV2MigrationTargetError(fallbackCode)

const queueTargetStateRequest = (
  transaction: IDBTransaction,
): IDBRequest<unknown> =>
  transaction
    .objectStore(PERSISTENCE_STORE_NAMES.metadata)
    .get(MIGRATION_TARGET_METADATA_KEY)

const toTargetMetadataRecord = (
  migrationId: string,
  state: MigrationTargetState,
) => ({
  key: MIGRATION_TARGET_METADATA_KEY,
  value: { migrationId, state },
})

export class IndexedDbPersistenceMigrationTarget
  implements
    PersistenceV2MigrationTargetPort,
    PersistenceV2VerifiedMigrationTargetPort
{
  private readonly connectionManager: IndexedDbConnectionManager

  constructor(connectionManager: IndexedDbConnectionManager) {
    this.connectionManager = connectionManager
  }

  async prepare(migrationId: string): Promise<void> {
    assertMigrationId(migrationId)
    let operationError: PersistenceV2MigrationTargetError | undefined
    try {
      const database = await this.connectionManager.open()
      await queueIndexedDbTransaction(
        {
          database,
          durability: 'strict',
          mode: 'readwrite',
          storeNames: [
            ...MIGRATABLE_STORE_NAMES,
            PERSISTENCE_STORE_NAMES.metadata,
          ],
        },
        (transaction) => {
          const metadata = transaction.objectStore(
            PERSISTENCE_STORE_NAMES.metadata,
          )
          const targetRequest = metadata.get(MIGRATION_TARGET_METADATA_KEY)
          targetRequest.addEventListener('success', () => {
            try {
              const current = readIndexedDbRequestResult(targetRequest)
              if (current !== undefined) {
                const existing = decodeMigrationTargetMetadata(current)
                if (existing.migrationId !== migrationId) {
                  throw new PersistenceV2MigrationTargetError(
                    'MIGRATION_TARGET_ID_MISMATCH',
                  )
                }
              }
              for (const storeName of MIGRATABLE_STORE_NAMES) {
                transaction.objectStore(storeName).clear()
              }
              metadata.put({ key: 'revision', value: 0 })
              metadata.put(toTargetMetadataRecord(migrationId, 'copying'))
            } catch (error) {
              operationError = toTargetError(
                error,
                'MIGRATION_TARGET_TRANSACTION_FAILED',
              )
              transaction.abort()
            }
          })
        },
      )
    } catch (error) {
      throw (
        operationError ??
        toTargetError(error, 'MIGRATION_TARGET_TRANSACTION_FAILED')
      )
    }
  }

  async writeBatch(
    migrationId: string,
    plan: PersistenceV2WritePlan,
  ): Promise<void> {
    assertMigrationId(migrationId)
    const entries = collectPlanEntries(plan)
    const database = await this.connectionManager
      .open()
      .catch((error: unknown) => {
        throw toTargetError(error, 'MIGRATION_TARGET_TRANSACTION_FAILED')
      })
    let operationError: PersistenceV2MigrationTargetError | undefined

    try {
      await queueIndexedDbTransaction(
        {
          database,
          durability: 'strict',
          mode: 'readwrite',
          storeNames: [
            ...entries.map((key) => PLAN_STORE_NAMES[key]),
            PERSISTENCE_STORE_NAMES.metadata,
          ],
        },
        (transaction) => {
          const targetRequest = queueTargetStateRequest(transaction)
          targetRequest.addEventListener('success', () => {
            try {
              assertTarget(
                readIndexedDbRequestResult(targetRequest),
                migrationId,
                ['copying'],
              )
              for (const key of entries) {
                queueMutation(
                  transaction.objectStore(PLAN_STORE_NAMES[key]),
                  key,
                  plan[key],
                )
              }
              const metadata = transaction.objectStore(
                PERSISTENCE_STORE_NAMES.metadata,
              )
              const revisionRequest = metadata.get('revision')
              revisionRequest.addEventListener('success', () => {
                try {
                  const revision = decodePersistenceRevision(
                    readIndexedDbRequestResult(revisionRequest),
                  )
                  metadata.put({ key: 'revision', value: revision + 1 })
                } catch {
                  operationError = new PersistenceV2MigrationTargetError(
                    'MIGRATION_TARGET_SNAPSHOT_INVALID',
                  )
                  transaction.abort()
                }
              })
            } catch (error) {
              operationError = toTargetError(
                error,
                'MIGRATION_TARGET_TRANSACTION_FAILED',
              )
              transaction.abort()
            }
          })
        },
      )
    } catch (error) {
      throw (
        operationError ??
        toTargetError(error, 'MIGRATION_TARGET_TRANSACTION_FAILED')
      )
    }
  }

  async markWritten(migrationId: string): Promise<void> {
    await this.transitionTargetState(migrationId, 'written')
  }

  async readSnapshot(migrationId: string): Promise<PersistenceLogicalSnapshot> {
    return this.readSnapshotForStates(migrationId, ['written', 'verified'])
  }

  async readVerifiedSnapshot(
    migrationId: string,
  ): Promise<PersistenceLogicalSnapshot> {
    return this.readSnapshotForStates(migrationId, ['verified'])
  }

  private async readSnapshotForStates(
    migrationId: string,
    allowedStates: readonly MigrationTargetState[],
  ): Promise<PersistenceLogicalSnapshot> {
    assertMigrationId(migrationId)
    const database = await this.connectionManager
      .open()
      .catch((error: unknown) => {
        throw toTargetError(error, 'MIGRATION_TARGET_TRANSACTION_FAILED')
      })
    let requests:
      | {
          readonly analyticsViews: IDBRequest
          readonly categories: IDBRequest
          readonly collections: IDBRequest
          readonly conversations: IDBRequest
          readonly groups: IDBRequest
          readonly memberships: IDBRequest
          readonly messages: IDBRequest
          readonly revision: IDBRequest
          readonly target: IDBRequest
          readonly urls: IDBRequest
        }
      | undefined

    try {
      await queueIndexedDbTransaction(
        {
          database,
          mode: 'readonly',
          storeNames: [
            ...MIGRATABLE_STORE_NAMES,
            PERSISTENCE_STORE_NAMES.metadata,
          ],
        },
        (transaction) => {
          requests = {
            analyticsViews: transaction
              .objectStore(PERSISTENCE_STORE_NAMES.analyticsViews)
              .getAll(),
            categories: transaction
              .objectStore(PERSISTENCE_STORE_NAMES.categories)
              .getAll(),
            collections: transaction
              .objectStore(PERSISTENCE_STORE_NAMES.collections)
              .getAll(),
            conversations: transaction
              .objectStore(PERSISTENCE_STORE_NAMES.conversations)
              .getAll(),
            groups: transaction
              .objectStore(PERSISTENCE_STORE_NAMES.groups)
              .getAll(),
            memberships: transaction
              .objectStore(PERSISTENCE_STORE_NAMES.memberships)
              .getAll(),
            messages: transaction
              .objectStore(PERSISTENCE_STORE_NAMES.messages)
              .getAll(),
            revision: transaction
              .objectStore(PERSISTENCE_STORE_NAMES.metadata)
              .get('revision'),
            target: queueTargetStateRequest(transaction),
            urls: transaction
              .objectStore(PERSISTENCE_STORE_NAMES.urls)
              .getAll(),
          }
        },
      )
    } catch (error) {
      throw toTargetError(error, 'MIGRATION_TARGET_TRANSACTION_FAILED')
    }

    if (!requests) {
      throw new PersistenceV2MigrationTargetError(
        'MIGRATION_TARGET_TRANSACTION_FAILED',
      )
    }
    assertTarget(
      readIndexedDbRequestResult(requests.target),
      migrationId,
      allowedStates,
    )

    try {
      return {
        analyticsViews: decodePersistenceRecords(
          readIndexedDbRequestResult(requests.analyticsViews),
          isPersistenceJsonRecord,
          PERSISTENCE_STORE_NAMES.analyticsViews,
        ),
        conversations: decodePersistenceRecords(
          readIndexedDbRequestResult(requests.conversations),
          isPersistenceJsonRecord,
          PERSISTENCE_STORE_NAMES.conversations,
        ),
        messages: decodePersistenceRecords(
          readIndexedDbRequestResult(requests.messages),
          isPersistenceMessageRecord,
          PERSISTENCE_STORE_NAMES.messages,
        ),
        revision: decodePersistenceRevision(
          readIndexedDbRequestResult(requests.revision),
        ),
        savedTabs: {
          categories: decodePersistenceRecords(
            readIndexedDbRequestResult(requests.categories),
            isPersistenceV2Category,
            PERSISTENCE_STORE_NAMES.categories,
          ),
          collections: decodePersistenceRecords(
            readIndexedDbRequestResult(requests.collections),
            isPersistenceV2Collection,
            PERSISTENCE_STORE_NAMES.collections,
          ),
          groups: decodePersistenceRecords(
            readIndexedDbRequestResult(requests.groups),
            isPersistenceV2Group,
            PERSISTENCE_STORE_NAMES.groups,
          ),
          memberships: decodePersistenceRecords(
            readIndexedDbRequestResult(requests.memberships),
            isPersistenceV2Membership,
            PERSISTENCE_STORE_NAMES.memberships,
          ),
          urls: decodePersistenceRecords(
            readIndexedDbRequestResult(requests.urls),
            isPersistenceV2Url,
            PERSISTENCE_STORE_NAMES.urls,
          ),
        },
      }
    } catch {
      throw new PersistenceV2MigrationTargetError(
        'MIGRATION_TARGET_SNAPSHOT_INVALID',
      )
    }
  }

  async markVerified(migrationId: string): Promise<void> {
    await this.transitionTargetState(migrationId, 'verified')
  }

  private async transitionTargetState(
    migrationId: string,
    nextState: Extract<MigrationTargetState, 'verified' | 'written'>,
  ): Promise<void> {
    assertMigrationId(migrationId)
    const database = await this.connectionManager
      .open()
      .catch((error: unknown) => {
        throw toTargetError(error, 'MIGRATION_TARGET_TRANSACTION_FAILED')
      })
    let operationError: PersistenceV2MigrationTargetError | undefined

    try {
      await queueIndexedDbTransaction(
        {
          database,
          durability: 'strict',
          mode: 'readwrite',
          storeNames: [PERSISTENCE_STORE_NAMES.metadata],
        },
        (transaction) => {
          const request = queueTargetStateRequest(transaction)
          request.addEventListener('success', () => {
            try {
              const current = assertTarget(
                readIndexedDbRequestResult(request),
                migrationId,
                nextState === 'written'
                  ? ['copying', 'written', 'verified']
                  : ['written', 'verified'],
              )
              if (
                current.state !== nextState &&
                !(nextState === 'written' && current.state === 'verified')
              ) {
                transaction
                  .objectStore(PERSISTENCE_STORE_NAMES.metadata)
                  .put(toTargetMetadataRecord(migrationId, nextState))
              }
            } catch (error) {
              operationError = toTargetError(
                error,
                'MIGRATION_TARGET_TRANSACTION_FAILED',
              )
              transaction.abort()
            }
          })
        },
      )
    } catch (error) {
      throw (
        operationError ??
        toTargetError(error, 'MIGRATION_TARGET_TRANSACTION_FAILED')
      )
    }
  }
}
