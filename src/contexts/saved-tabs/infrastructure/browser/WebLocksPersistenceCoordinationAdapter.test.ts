import { describe, expect, it } from 'vitest'

import { PersistenceUnavailableError } from '@/contexts/saved-tabs/application/errors/PersistenceUnavailableError'

import {
  PERSISTENCE_COORDINATION_LOCK_NAME,
  WebLocksPersistenceCoordinationAdapter,
} from './WebLocksPersistenceCoordinationAdapter'
import type { PersistenceLockManager } from './WebLocksPersistenceCoordinationAdapter'

const expectCoordinationUnavailable = async (
  operation: Promise<unknown>,
): Promise<void> => {
  try {
    await operation
  } catch (error) {
    expect(error).toBeInstanceOf(PersistenceUnavailableError)
    expect((error as PersistenceUnavailableError).code).toBe(
      'PERSISTENCE_COORDINATION_UNAVAILABLE',
    )
    return
  }
  throw new Error('Expected persistence coordination to fail.')
}

describe('WebLocksPersistenceCoordinationAdapter', () => {
  it.each(['shared', 'exclusive'] as const)(
    'holds the stable %s lock until the operation settles',
    async (mode) => {
      const events: string[] = []
      const request: PersistenceLockManager['request'] = async <Result>(
        name: string,
        options: { readonly mode: 'exclusive' | 'shared' },
        callback: () => Promise<Result>,
      ): Promise<Result> => {
        events.push(`acquired:${name}:${options.mode}`)
        const result = await callback()
        events.push('released')
        return result
      }
      const adapter = new WebLocksPersistenceCoordinationAdapter({
        getLockManager: () => ({ request }),
      })

      const result = await (mode === 'shared'
        ? adapter.runShared(async () => {
            events.push('operation')
            return 'shared-result'
          })
        : adapter.runExclusive(async () => {
            events.push('operation')
            return 'exclusive-result'
          }))

      expect(result).toBe(`${mode}-result`)
      expect(events).toEqual([
        `acquired:${PERSISTENCE_COORDINATION_LOCK_NAME}:${mode}`,
        'operation',
        'released',
      ])
    },
  )

  it('preserves an operation error after the lock was acquired', async () => {
    const operationError = new Error('write failed')
    const manager: PersistenceLockManager = {
      request: async (_name, _options, callback) => callback(),
    }
    const adapter = new WebLocksPersistenceCoordinationAdapter({
      getLockManager: () => manager,
    })

    await expect(
      adapter.runShared(async () => {
        throw operationError
      }),
    ).rejects.toBe(operationError)
  })

  it('fails closed when Web Locks is missing or rejects before acquisition', async () => {
    expect.hasAssertions()
    const missing = new WebLocksPersistenceCoordinationAdapter({
      getLockManager: () => undefined,
    })
    await expectCoordinationUnavailable(
      missing.runShared(async () => undefined),
    )

    const rejected = new WebLocksPersistenceCoordinationAdapter({
      getLockManager: () => ({
        request: async () => {
          throw new Error('request rejected')
        },
      }),
    })
    await expectCoordinationUnavailable(
      rejected.runExclusive(async () => undefined),
    )

    const inaccessible = new WebLocksPersistenceCoordinationAdapter({
      getLockManager: () => {
        throw new Error('navigator.locks is inaccessible')
      },
    })
    await expectCoordinationUnavailable(
      inaccessible.runShared(async () => undefined),
    )
  })
})
