import { describe, expect, it, vi } from 'vitest'

import type { PersistenceChangePort } from '@/contexts/saved-tabs/application/ports/PersistenceChangePort'
import type { PersistenceV2UnitOfWorkPort } from '@/contexts/saved-tabs/application/ports/PersistenceV2UnitOfWorkPort'

import { createNotifyingPersistenceV2UnitOfWork } from './createNotifyingPersistenceV2UnitOfWork'

const plan = { memberships: { delete: [['collection-1', 'url-1']] } } as const

describe('createNotifyingPersistenceV2UnitOfWork', () => {
  it('publishes #739 only after commit and preserves the commit result', async () => {
    const order: string[] = []
    const commitResult = {
      changedScopes: ['memberships'] as const,
      revision: 3,
    }
    const delegate: PersistenceV2UnitOfWorkPort = {
      commit: vi.fn(async () => {
        order.push('commit')
        return commitResult
      }),
      readRevision: vi.fn(async () => 2),
    }
    const changePort: PersistenceChangePort = {
      publish: vi.fn(async () => {
        order.push('publish')
      }),
      subscribe: vi.fn(() => () => {}),
    }
    const unitOfWork = createNotifyingPersistenceV2UnitOfWork({
      changePort,
      idGenerator: { generate: () => 'change-1' },
      onNotificationFailure: vi.fn(),
      unitOfWork: delegate,
    })

    await expect(
      unitOfWork.commit(plan, { expectedRevision: 2 }),
    ).resolves.toBe(commitResult)
    expect(order).toStrictEqual(['commit', 'publish'])
    expect(changePort.publish).toHaveBeenCalledExactlyOnceWith({
      changeId: 'change-1',
      revision: 3,
      scopes: ['memberships'],
    })
  })

  it('reports notification failure after commit without retrying the write', async () => {
    const commitResult = {
      changedScopes: ['urls'] as const,
      revision: 4,
    }
    const delegate: PersistenceV2UnitOfWorkPort = {
      commit: vi.fn(async () => commitResult),
      readRevision: vi.fn(async () => 3),
    }
    const changePort: PersistenceChangePort = {
      publish: vi.fn(async () => {
        throw new Error('transport failed')
      }),
      subscribe: vi.fn(() => () => {}),
    }
    const onNotificationFailure = vi.fn()
    const unitOfWork = createNotifyingPersistenceV2UnitOfWork({
      changePort,
      idGenerator: { generate: () => 'change-2' },
      onNotificationFailure,
      unitOfWork: delegate,
    })

    await expect(
      unitOfWork.commit({ urls: { delete: ['url-1'] } }),
    ).resolves.toBe(commitResult)
    expect(delegate.commit).toHaveBeenCalledOnce()
    expect(onNotificationFailure).toHaveBeenCalledExactlyOnceWith({
      code: 'PERSISTENCE_NOTIFICATION_FAILED_AFTER_COMMIT',
      revision: 4,
      scopes: ['urls'],
      stage: 'change_publication',
    })
  })
})
