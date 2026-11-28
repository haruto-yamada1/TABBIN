import { describe, expect, it, vi } from 'vitest'

import type { PersistenceV2SnapshotReaderPort } from '@/contexts/saved-tabs/application/ports/PersistenceV2SnapshotReaderPort'
import { PersistenceRevisionConflictError } from '@/contexts/saved-tabs/application/ports/PersistenceV2UnitOfWorkPort'
import type { PersistenceV2UnitOfWorkPort } from '@/contexts/saved-tabs/application/ports/PersistenceV2UnitOfWorkPort'

import { IndexedDbSavedTabsSessionService } from './IndexedDbSavedTabsSessionService'

const url = {
  firstSavedAt: 1,
  id: 'url-1',
  lastSavedAt: 2,
  normalizedUrl: 'https://example.com/',
  title: 'Example',
  updatedAt: 2,
  url: 'https://example.com/',
}

const collection = {
  createdAt: 1,
  definition: { domain: 'example.com', type: 'domain' as const },
  groupId: 'group-1',
  id: 'collection-1',
  name: 'example.com',
  sortOrder: 0,
  updatedAt: 2,
}

const category = {
  collectionId: collection.id,
  createdAt: 1,
  id: 'category-1',
  keywords: ['docs'],
  name: 'Docs',
  sortOrder: 0,
  updatedAt: 2,
}

const membership = {
  addedAt: 1,
  categoryId: category.id,
  collectionId: collection.id,
  sortOrder: 0,
  updatedAt: 2,
  urlId: url.id,
}

const group = {
  createdAt: 1,
  id: 'group-1',
  name: 'Research',
  sortOrder: 0,
  updatedAt: 2,
}

const createSnapshotReaderPort = (): PersistenceV2SnapshotReaderPort => ({
  readConsistentSnapshot: vi.fn(),
  readVerifiedSavedTabsSnapshot: vi.fn(async () => ({
    revision: 7,
    savedTabs: {
      categories: [category],
      collections: [collection],
      groups: [group],
      memberships: [membership],
      urls: [url],
    },
  })),
})

const createUnitOfWork = () => {
  const commit = vi.fn<PersistenceV2UnitOfWorkPort['commit']>(
    async (_plan, options) => {
      options?.assertCanCommit?.()
      return { changedScopes: ['memberships', 'urls'], revision: 8 }
    },
  )
  const unitOfWork: PersistenceV2UnitOfWorkPort = {
    commit,
    readRevision: vi.fn(async () => 7),
  }
  return { commit, unitOfWork }
}

describe('IndexedDbSavedTabsSessionService', () => {
  it('maps only native commit rejection with the already computed result', async () => {
    const snapshotReaderPort = createSnapshotReaderPort()
    const { commit, unitOfWork } = createUnitOfWork()
    const commitError = new Error('native commit failed')
    commit.mockRejectedValueOnce(commitError)
    const mappedError = new Error('confirmed operation failed to commit')
    const onCommitFailure = vi.fn((_error: unknown, _result: string): never => {
      throw mappedError
    })
    const service = new IndexedDbSavedTabsSessionService({
      snapshotReaderPort,
      unitOfWorkPort: unitOfWork,
    })

    await expect(
      service.run(async (state) => {
        state.memberships = []
        state.urls = []
        return 'confirmed-result'
      }, onCommitFailure),
    ).rejects.toBe(mappedError)
    expect(onCommitFailure).toHaveBeenCalledExactlyOnceWith(
      commitError,
      'confirmed-result',
    )
  })

  it('does not map failure before the operation returns', async () => {
    const snapshotReaderPort = createSnapshotReaderPort()
    const { commit, unitOfWork } = createUnitOfWork()
    const operationError = new Error(
      'operation failed before producing a result',
    )
    const onCommitFailure = vi.fn((): never => {
      throw new Error('must not run')
    })
    const service = new IndexedDbSavedTabsSessionService({
      snapshotReaderPort,
      unitOfWorkPort: unitOfWork,
    })

    await expect(
      service.run(async () => {
        throw operationError
      }, onCommitFailure),
    ).rejects.toBe(operationError)
    expect(onCommitFailure).not.toHaveBeenCalled()
    expect(commit).not.toHaveBeenCalled()
  })

  it('commits one normalized multi-store plan with expectedRevision CAS', async () => {
    const snapshotReaderPort = createSnapshotReaderPort()
    const { commit, unitOfWork } = createUnitOfWork()
    const service = new IndexedDbSavedTabsSessionService({
      snapshotReaderPort,
      unitOfWorkPort: unitOfWork,
    })

    const result = await service.run(async (state) => {
      state.memberships = []
      state.urls = []
      return 'removed'
    })

    expect(result).toBe('removed')
    expect(commit).toHaveBeenCalledExactlyOnceWith(
      {
        memberships: { delete: [[collection.id, url.id]] },
        urls: { delete: [url.id] },
      },
      { expectedRevision: 7 },
    )
  })

  it('does not create an empty commit for a read-only operation', async () => {
    const snapshotReaderPort = createSnapshotReaderPort()
    const { commit, unitOfWork } = createUnitOfWork()
    const service = new IndexedDbSavedTabsSessionService({
      snapshotReaderPort,
      unitOfWorkPort: unitOfWork,
    })

    await expect(
      service.run(async (state) => state.collections[0]?.id),
    ).resolves.toBe(collection.id)

    expect(commit).not.toHaveBeenCalled()
  })

  it('undoes only the committed changes against the committed revision', async () => {
    const { commit, unitOfWork } = createUnitOfWork()
    const service = new IndexedDbSavedTabsSessionService({
      snapshotReaderPort: createSnapshotReaderPort(),
      unitOfWorkPort: unitOfWork,
    })
    const destination = { ...membership, notes: 'Moved' }
    const { result, undo } = await service.runUndoable((state) => {
      state.memberships = [destination]
      return 'moved'
    })

    expect(result).toBe('moved')
    expect(undo).toBeTypeOf('function')
    await undo?.()
    expect(commit).toHaveBeenNthCalledWith(
      2,
      { memberships: { put: [membership] } },
      { expectedRevision: 8 },
    )
  })

  it('rejects Undo when another writer changes the revision', async () => {
    const { commit, unitOfWork } = createUnitOfWork()
    const service = new IndexedDbSavedTabsSessionService({
      snapshotReaderPort: createSnapshotReaderPort(),
      unitOfWorkPort: unitOfWork,
    })
    const { undo } = await service.runUndoable((state) => {
      state.memberships = []
    })

    const conflict = new PersistenceRevisionConflictError(8, 9)
    commit.mockRejectedValueOnce(conflict)
    expect(undo).toBeTypeOf('function')
    await expect(undo?.()).rejects.toBe(conflict)
    expect(commit).toHaveBeenCalledTimes(2)
  })

  it('does not re-archive purged or newly overdue rows when undoing a restore', async () => {
    const snapshotReaderPort = createSnapshotReaderPort()
    const { commit, unitOfWork } = createUnitOfWork()
    const archived = {
      expiredAt: 1,
      id: 'archived',
      memberships: [],
      recoverUntil: 10,
      url,
    }
    let now = 3
    const clock = vi.fn(() => now)
    const service = new IndexedDbSavedTabsSessionService({
      readWithExpiredUrls: async () => ({
        ...(await snapshotReaderPort.readVerifiedSavedTabsSnapshot()),
        expiredUrls: [
          archived,
          { ...archived, id: 'expired', recoverUntil: 2 },
        ],
      }),
      snapshotReaderPort,
      unitOfWorkPort: unitOfWork,
    })

    const { undo } = await service.runUndoableWithExpiredUrls(
      (state, cutoff) => {
        expect(cutoff).toBe(3)
        now = 4
        state.expiredUrls = []
      },
      clock,
    )
    expect(clock).toHaveBeenCalledOnce()
    expect(undo).toBeTypeOf('function')
    await undo?.()
    expect(commit).toHaveBeenNthCalledWith(
      2,
      { expiredUrls: { put: [archived] } },
      {
        assertCanCommit: expect.any(Function),
        durability: 'strict',
        expectedRevision: 8,
      },
    )

    now = 10
    await expect(undo?.()).rejects.toThrow('original recovery deadline')
    expect(commit).toHaveBeenCalledTimes(3)
  })

  it('returns no Undo for an unchanged operation', async () => {
    const { commit, unitOfWork } = createUnitOfWork()
    const service = new IndexedDbSavedTabsSessionService({
      snapshotReaderPort: createSnapshotReaderPort(),
      unitOfWorkPort: unitOfWork,
    })

    await expect(service.runUndoable(() => 0)).resolves.toEqual({ result: 0 })
    expect(commit).not.toHaveBeenCalled()
  })

  it('keeps categories that have no membership in the native session state', async () => {
    const snapshotReaderPort = createSnapshotReaderPort()
    const emptyCategory = { ...category, id: 'category-empty', name: 'Empty' }
    vi.mocked(
      snapshotReaderPort.readVerifiedSavedTabsSnapshot,
    ).mockResolvedValueOnce({
      revision: 7,
      savedTabs: {
        categories: [category, emptyCategory],
        collections: [collection],
        groups: [group],
        memberships: [membership],
        urls: [url],
      },
    })
    const { commit, unitOfWork } = createUnitOfWork()
    const service = new IndexedDbSavedTabsSessionService({
      snapshotReaderPort,
      unitOfWorkPort: unitOfWork,
    })

    await expect(
      service.run(async (state) =>
        state.categories.map(({ id }) => id).toSorted(),
      ),
    ).resolves.toStrictEqual(['category-1', 'category-empty'])

    expect(commit).not.toHaveBeenCalled()
  })

  it('keeps warning-only orphan URLs in the mutation source state', async () => {
    const snapshotReaderPort = createSnapshotReaderPort()
    const orphanUrl = {
      ...url,
      id: 'url-orphan',
      normalizedUrl: 'https://orphan.example/',
      title: 'Orphan',
      url: 'https://orphan.example/',
    }
    vi.mocked(
      snapshotReaderPort.readVerifiedSavedTabsSnapshot,
    ).mockResolvedValueOnce({
      revision: 7,
      savedTabs: {
        categories: [category],
        collections: [collection],
        groups: [group],
        memberships: [membership],
        urls: [url, orphanUrl],
      },
    })
    const { commit, unitOfWork } = createUnitOfWork()
    const service = new IndexedDbSavedTabsSessionService({
      snapshotReaderPort,
      unitOfWorkPort: unitOfWork,
    })

    await expect(
      service.run(async (state) => state.urls.map(({ id }) => id).toSorted()),
    ).resolves.toStrictEqual(['url-1', 'url-orphan'])

    expect(commit).not.toHaveBeenCalled()
  })

  it('propagates a rejected CAS commit without retry or fallback', async () => {
    const snapshotReaderPort = createSnapshotReaderPort()
    const error = new Error('revision conflict')
    const unitOfWork: PersistenceV2UnitOfWorkPort = {
      commit: vi.fn(async () => {
        throw error
      }),
      readRevision: vi.fn(async () => 7),
    }
    const service = new IndexedDbSavedTabsSessionService({
      snapshotReaderPort,
      unitOfWorkPort: unitOfWork,
    })

    await expect(
      service.run(async (state) => {
        state.collections = []
      }),
    ).rejects.toBe(error)
    expect(
      snapshotReaderPort.readVerifiedSavedTabsSnapshot,
    ).toHaveBeenCalledOnce()
    expect(unitOfWork.commit).toHaveBeenCalledOnce()
  })
})
