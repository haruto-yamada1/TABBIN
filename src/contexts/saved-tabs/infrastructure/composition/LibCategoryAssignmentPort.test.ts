import { describe, expect, it, vi } from 'vitest'

import { createTabGroup } from '@/contexts/saved-tabs/testing/createCurrentCollectionFixtures'

import { createLibCategoryAssignmentPort } from './LibCategoryAssignmentPort'

describe('createLibCategoryAssignmentPort', () => {
  it('presentation category DTO を entity 化して repository に保存する', async () => {
    const saveAll = vi.fn()
    const port = createLibCategoryAssignmentPort({
      parentCategoryRepository: {
        findAll: vi.fn(),
        findById: vi.fn(),
        removeByIds: vi.fn(),
        saveAll,
      },
      tabGroupRepository: {
        findAll: vi.fn(),
        findById: vi.fn(),
        findRawDomainById: vi.fn(),
        findRawTabGroupById: vi.fn(),
        removeByIds: vi.fn(),
        saveAll: vi.fn(),
      },
    })

    await port.saveParentCategories([
      {
        collections: [{ domain: 'example.com', id: 'group-1' }],
        id: 'category-1',
        name: 'Docs',
      },
    ])

    expect(saveAll).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'category-1', name: 'Docs' }),
    ])
  })

  it('presentation tab group DTO は membership projection で entity 化する', async () => {
    const saveAll = vi.fn()
    const port = createLibCategoryAssignmentPort({
      parentCategoryRepository: {
        findAll: vi.fn(),
        findById: vi.fn(),
        removeByIds: vi.fn(),
        saveAll: vi.fn(),
      },
      tabGroupRepository: {
        findAll: vi.fn(),
        findById: vi.fn(),
        findRawDomainById: vi.fn(),
        findRawTabGroupById: vi.fn(),
        removeByIds: vi.fn(),
        saveAll,
      },
    })

    await port.saveTabGroups([
      createTabGroup({ domain: 'example.com', id: 'group-1' }),
      createTabGroup({
        domain: 'docs.example.com',
        id: 'group-2',
        memberships: [{ category: 'reference', urlId: 'url-1' }],
        subCategories: ['reference'],
      }),
    ])

    expect(saveAll).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'group-1', memberships: [] }),
      expect.objectContaining({
        id: 'group-2',
        collectionCategories: [
          expect.objectContaining({
            id: 'group-2:category:0',
            name: 'reference',
          }),
        ],
        memberships: [
          expect.objectContaining({
            categoryId: 'group-2:category:0',
            collectionId: 'group-2',
            urlId: 'url-1',
          }),
        ],
      }),
    ])
  })

  it('current projection を defensive copy して repository に渡す', async () => {
    const saveAll = vi.fn()
    const port = createLibCategoryAssignmentPort({
      parentCategoryRepository: {
        findAll: vi.fn(),
        findById: vi.fn(),
        removeByIds: vi.fn(),
        saveAll: vi.fn(),
      },
      tabGroupRepository: {
        findAll: vi.fn(),
        findById: vi.fn(),
        findRawDomainById: vi.fn(),
        findRawTabGroupById: vi.fn(),
        removeByIds: vi.fn(),
        saveAll,
      },
    })

    const group = createTabGroup({ domain: 'example.com', id: 'group-1' })
    await port.saveTabGroups([group])

    expect(saveAll).toHaveBeenCalledTimes(1)
    const saved = saveAll.mock.calls[0]?.[0]
    expect(saved?.[0]).not.toBe(group)
    expect(saved?.[0]?.collection.definition).toStrictEqual({
      domain: 'example.com',
      type: 'domain',
    })
  })
})
