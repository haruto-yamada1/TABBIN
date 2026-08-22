import type { PersistenceOperationGatePort } from '@/contexts/saved-tabs/application/ports/PersistenceBootstrapPort'
import type {
  PersistenceChangeScope,
  PersistenceCommitOptions,
  PersistenceCommitResult,
  PersistenceV2UnitOfWorkPort,
  PersistenceV2WritePlan,
} from '@/contexts/saved-tabs/application/ports/PersistenceV2UnitOfWorkPort'
import { PersistenceRevisionConflictError } from '@/contexts/saved-tabs/application/ports/PersistenceV2UnitOfWorkPort'
import { isJsonValue } from '@/lib/persistence/jsonValue'

import type { IndexedDbConnectionManager } from './IndexedDbConnectionManager'
import { toIndexedDbError } from './IndexedDbError'
import { queueIndexedDbTransaction } from './IndexedDbTransaction'
import { PERSISTENCE_STORE_NAMES } from './persistenceDatabaseSchema'
import type { PersistenceStoreName } from './persistenceDatabaseSchema'
import { readIndexedDbRequestResult } from './PersistenceRecordDecoders'
import { decodePersistenceRevision } from './PersistenceRevision'

const PLAN_STORE_NAMES = {
  analyticsViews: PERSISTENCE_STORE_NAMES.analyticsViews,
  categories: PERSISTENCE_STORE_NAMES.categories,
  collections: PERSISTENCE_STORE_NAMES.collections,
  conversations: PERSISTENCE_STORE_NAMES.conversations,
  groups: PERSISTENCE_STORE_NAMES.groups,
  memberships: PERSISTENCE_STORE_NAMES.memberships,
  messages: PERSISTENCE_STORE_NAMES.messages,
  recoverySnapshots: PERSISTENCE_STORE_NAMES.recoverySnapshots,
  urls: PERSISTENCE_STORE_NAMES.urls,
} as const satisfies Record<keyof PersistenceV2WritePlan, PersistenceStoreName>

const PLAN_KEYS = [
  'analyticsViews',
  'categories',
  'collections',
  'conversations',
  'groups',
  'memberships',
  'messages',
  'recoverySnapshots',
  'urls',
] as const satisfies readonly (keyof PersistenceV2WritePlan)[]

type UnknownMutation = {
  readonly delete?: readonly unknown[]
  readonly put?: readonly unknown[]
}

const hasChanges = (mutation: UnknownMutation | undefined): boolean =>
  Boolean(mutation?.put?.length) || Boolean(mutation?.delete?.length)

const toIndexedDbKey = (key: unknown): IDBValidKey => {
  if (
    typeof key === 'number' ||
    typeof key === 'string' ||
    key instanceof Date
  ) {
    return key
  }
  if (Array.isArray(key)) {
    return key.map(toIndexedDbKey)
  }

  throw new TypeError('Persistence delete key is not a valid IndexedDB key.')
}

const queueMutation = (
  store: IDBObjectStore,
  mutation: UnknownMutation | undefined,
): void => {
  for (const value of mutation?.put ?? []) {
    store.put(value)
  }
  for (const key of mutation?.delete ?? []) {
    store.delete(toIndexedDbKey(key))
  }
}

const changedScopeForPlanKey = (
  key: keyof PersistenceV2WritePlan,
): PersistenceChangeScope => (key === 'messages' ? 'conversations' : key)

const collectPlan = (plan: PersistenceV2WritePlan) => {
  const entries = PLAN_KEYS.filter((key) => hasChanges(plan[key]))
  const storeNames = entries.map((key) => PLAN_STORE_NAMES[key])
  const changedScopes = [
    ...new Set(entries.map(changedScopeForPlanKey)),
  ].toSorted((left, right) => left.localeCompare(right))

  return { changedScopes, entries, storeNames }
}

const assertJsonSafeValues = (plan: PersistenceV2WritePlan): void => {
  for (const key of PLAN_KEYS) {
    for (const record of plan[key]?.put ?? []) {
      if (!isJsonValue(record)) {
        throw new PersistenceWritePlanValidationError(key)
      }
    }
  }
}

export class PersistenceEmptyWritePlanError extends Error {
  constructor() {
    super('Persistence write plan must contain at least one mutation.')
    this.name = 'PersistenceEmptyWritePlanError'
  }
}

export class PersistenceWritePlanValidationError extends Error {
  constructor(planKey: keyof PersistenceV2WritePlan) {
    super(`${planKey} persistence records must be JSON-safe.`)
    this.name = 'PersistenceWritePlanValidationError'
  }
}

export class IndexedDbPersistenceUnitOfWork implements PersistenceV2UnitOfWorkPort {
  private readonly connectionManager: IndexedDbConnectionManager
  private readonly operationGate: PersistenceOperationGatePort

  constructor(
    connectionManager: IndexedDbConnectionManager,
    operationGate: PersistenceOperationGatePort,
  ) {
    this.connectionManager = connectionManager
    this.operationGate = operationGate
  }

  async commit(
    plan: PersistenceV2WritePlan,
    options: PersistenceCommitOptions = {},
  ): Promise<PersistenceCommitResult> {
    return this.operationGate.runIndexedDbWrite(async () => {
      assertJsonSafeValues(plan)
      const { changedScopes, entries, storeNames } = collectPlan(plan)
      if (entries.length === 0) {
        throw new PersistenceEmptyWritePlanError()
      }

      const database = await this.connectionManager.open()
      let committedRevision: number | undefined
      await queueIndexedDbTransaction(
        {
          database,
          ...(options.durability !== undefined
            ? { durability: options.durability }
            : {}),
          mode: 'readwrite',
          storeNames: [...storeNames, PERSISTENCE_STORE_NAMES.metadata],
        },
        (transaction, abortWithError) => {
          const metadata = transaction.objectStore(
            PERSISTENCE_STORE_NAMES.metadata,
          )
          const revisionRequest = metadata.get('revision')
          revisionRequest.addEventListener('success', () => {
            try {
              const current = decodePersistenceRevision(
                readIndexedDbRequestResult(revisionRequest),
              )
              if (
                options.expectedRevision !== undefined &&
                current !== options.expectedRevision
              ) {
                abortWithError(
                  new PersistenceRevisionConflictError(
                    options.expectedRevision,
                    current,
                  ),
                )
                return
              }

              for (const key of entries) {
                queueMutation(
                  transaction.objectStore(PLAN_STORE_NAMES[key]),
                  plan[key],
                )
              }
              committedRevision = current + 1
              metadata.put({ key: 'revision', value: committedRevision })
            } catch (error) {
              abortWithError(error)
            }
          })
        },
      )

      if (committedRevision === undefined) {
        throw new Error('Persistence revision was not committed.')
      }

      return {
        changedScopes,
        revision: committedRevision,
      }
    })
  }

  async readRevision(): Promise<number> {
    return this.operationGate.runIndexedDbRead(async () => {
      const database = await this.connectionManager.open()
      const transaction = database.transaction(
        PERSISTENCE_STORE_NAMES.metadata,
        'readonly',
      )
      const request = transaction
        .objectStore(PERSISTENCE_STORE_NAMES.metadata)
        .get('revision')
      const result = await new Promise<unknown>((resolve, reject) => {
        request.addEventListener('error', () => {
          reject(
            toIndexedDbError(
              request.error,
              'Failed to read the persistence revision.',
            ),
          )
        })
        request.addEventListener('success', () => {
          resolve(readIndexedDbRequestResult(request))
        })
      })

      return decodePersistenceRevision(result)
    })
  }
}
