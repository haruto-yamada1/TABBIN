import type { PersistenceDurability } from '@/contexts/saved-tabs/application/ports/PersistenceV2UnitOfWorkPort'

import { toIndexedDbError } from './IndexedDbError'
import type { PersistenceStoreName } from './persistenceDatabaseSchema'

export class IndexedDbExternalAsyncTransactionError extends Error {
  constructor() {
    super(
      'IndexedDB transaction callbacks must only queue IDB requests synchronously.',
    )
    this.name = 'IndexedDbExternalAsyncTransactionError'
  }
}

const isPromiseLike = (value: unknown): value is PromiseLike<unknown> =>
  typeof value === 'object' &&
  value !== null &&
  'then' in value &&
  typeof value.then === 'function'

export const waitForIndexedDbTransaction = async (
  transaction: IDBTransaction,
  queuedError?: unknown,
): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    transaction.addEventListener('complete', () => {
      resolve()
    })
    transaction.addEventListener('abort', () => {
      reject(
        toIndexedDbError(
          queuedError ?? transaction.error,
          'IndexedDB transaction aborted.',
        ),
      )
    })
  })
}

export type QueueIndexedDbTransactionOptions = {
  readonly database: IDBDatabase
  readonly durability?: PersistenceDurability
  readonly mode: IDBTransactionMode
  readonly storeNames: readonly PersistenceStoreName[]
}

export const queueIndexedDbTransaction = async (
  options: QueueIndexedDbTransactionOptions,
  queueRequests: (transaction: IDBTransaction) => unknown,
): Promise<void> => {
  const transaction = options.database.transaction(
    options.storeNames,
    options.mode,
    { durability: options.durability ?? 'default' },
  )
  let queuedError: unknown

  try {
    const result: unknown = Reflect.apply(queueRequests, undefined, [
      transaction,
    ])
    if (isPromiseLike(result)) {
      const observedPromise = Promise.resolve(result)
      observedPromise.catch(() => undefined)
      queuedError = new IndexedDbExternalAsyncTransactionError()
      transaction.abort()
    }
  } catch (error) {
    queuedError = error
    transaction.abort()
  }

  await waitForIndexedDbTransaction(transaction, queuedError)
}
