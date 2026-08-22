import { describe, expect, it, vi } from 'vitest'

import type { PersistenceV2SnapshotReaderPort } from '@/contexts/saved-tabs/application/ports/PersistenceV2SnapshotReaderPort'
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
  const commit = vi.fn(async () => ({
    changedScopes: ['memberships', 'urls'] as const,
    revision: 8,
  }))
  const unitOfWork: PersistenceV2UnitOfWorkPort = {
    commit,
    readRevision: vi.fn(async () => 7),
  }
  return { commit, unitOfWork }
}

describe('IndexedDbSavedTabsSessionService', () => {
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
