import { describe, expect, it, vi } from 'vitest'

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
        domainNames: ['example.com'],
        domains: ['group-1'],
        id: 'category-1',
        name: 'Docs',
      },
    ])

    expect(saveAll).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'category-1', name: 'Docs' }),
    ])
  })

  it('presentation tab group DTO は urlIds 既定値込みで entity 化する', async () => {
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
      { domain: 'example.com', id: 'group-1', urlIds: undefined },
      { domain: 'docs.example.com', id: 'group-2', urlIds: ['url-1'] },
    ])

    expect(saveAll).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'group-1', urlIds: [] }),
      expect.objectContaining({ id: 'group-2', urlIds: ['url-1'] }),
    ])
  })
})
