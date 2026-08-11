import { describe, expect, it, vi } from 'vitest'

import type { PersistenceV2QueryPort } from '@/contexts/saved-tabs/application/ports/PersistenceV2QueryPort'
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

const createQueryPort = (): PersistenceV2QueryPort => ({
  findCollection: vi.fn(),
  findCollectionsForUrl: vi.fn(),
  findCollectionsInGroup: vi.fn(),
  readAnalyticsRecords: vi.fn(async () => [
    { collectionCount: 1, membershipCount: 1, url },
  ]),
  readInitialLoad: vi.fn(async () => ({
    categories: [category],
    collections: [
      {
        collection,
        items: [{ category, membership, url }],
      },
    ],
    groups: [group],
    revision: 7,
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
    const queryPort = createQueryPort()
    const { commit, unitOfWork } = createUnitOfWork()
    const service = new IndexedDbSavedTabsSessionService({
      queryPort,
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
    const queryPort = createQueryPort()
    const { commit, unitOfWork } = createUnitOfWork()
    const service = new IndexedDbSavedTabsSessionService({
      queryPort,
      unitOfWorkPort: unitOfWork,
    })

    await expect(
      service.run(async (state) => state.collections[0]?.id),
    ).resolves.toBe(collection.id)

    expect(commit).not.toHaveBeenCalled()
  })

  it('keeps categories that have no membership in the native session state', async () => {
    const queryPort = createQueryPort()
    const emptyCategory = { ...category, id: 'category-empty', name: 'Empty' }
    vi.mocked(queryPort.readInitialLoad).mockResolvedValueOnce({
      categories: [category, emptyCategory],
      collections: [
        {
          collection,
          items: [{ category, membership, url }],
        },
      ],
      groups: [group],
      revision: 7,
    })
    const { commit, unitOfWork } = createUnitOfWork()
    const service = new IndexedDbSavedTabsSessionService({
      queryPort,
      unitOfWorkPort: unitOfWork,
    })

    await expect(
      service.run(async (state) =>
        state.categories.map(({ id }) => id).toSorted(),
      ),
    ).resolves.toStrictEqual(['category-1', 'category-empty'])

    expect(commit).not.toHaveBeenCalled()
  })

  it('propagates a rejected CAS commit without retry or fallback', async () => {
    const queryPort = createQueryPort()
    const error = new Error('revision conflict')
    const unitOfWork: PersistenceV2UnitOfWorkPort = {
      commit: vi.fn(async () => {
        throw error
      }),
      readRevision: vi.fn(async () => 7),
    }
    const service = new IndexedDbSavedTabsSessionService({
      queryPort,
      unitOfWorkPort: unitOfWork,
    })

    await expect(
      service.run(async (state) => {
        state.collections = []
      }),
    ).rejects.toBe(error)
    expect(queryPort.readInitialLoad).toHaveBeenCalledOnce()
    expect(unitOfWork.commit).toHaveBeenCalledOnce()
  })
})
