import { describe, expect, it, vi } from 'vitest'

import type { DomainCategoryMappingRepository } from '@/contexts/saved-tabs/domain/repositories/DomainCategoryMappingRepository'
import {
  createMockParentCategoryRepository,
  toMockParentCategory,
} from '@/contexts/saved-tabs/testing/createMockParentCategoryRepository'
import {
  createMockTabGroupRepository,
  toMockTabGroup,
} from '@/contexts/saved-tabs/testing/createMockTabGroupRepository'

import { createAssignDomainToCategoryUseCase } from './AssignDomainToCategoryUseCase'
import { createCreateParentCategoryUseCase } from './CreateParentCategoryUseCase'

const createMappingRepository = (
  initial: readonly { domain: string; categoryId: string }[] = [],
): DomainCategoryMappingRepository => {
  let mappings = [...initial]
  return {
    findAll: vi.fn(async () => mappings),
    saveAll: vi.fn(async (next) => {
      mappings = [...next]
    }),
  }
}

describe('parent category management use-cases', () => {
  it('カテゴリを生成してapplication DTOを返す', async () => {
    const parentCategoryRepository = createMockParentCategoryRepository({
      parentCategories: [],
    })
    const createCategory = createCreateParentCategoryUseCase({
      idGenerator: { generate: () => 'category-1' },
      parentCategoryRepository,
    })

    const result = await createCategory({ name: '  Docs  ' })

    expect(result).toStrictEqual({
      all: [
        {
          collections: [].map((id, index) => ({
            id,
            domain: [][index] ?? id,
          })),
          id: 'category-1',
          name: 'Docs',
        },
      ],
      category: {
        collections: [].map((id, index) => ({
          id,
          domain: [][index] ?? id,
        })),
        id: 'category-1',
        name: 'Docs',
      },
    })
    expect(parentCategoryRepository.saveAll).toHaveBeenCalledOnce()
  })

  it.each([
    ['', 'DUPLICATE_CATEGORY_NAME:'],
    [' docs ', 'DUPLICATE_CATEGORY_NAME:docs'],
  ])('空名と重複名を拒否する: %s', async (name, message) => {
    const parentCategoryRepository = createMockParentCategoryRepository({
      parentCategories: [
        toMockParentCategory({ id: 'category-1', name: 'Docs' }),
      ],
    })
    const createCategory = createCreateParentCategoryUseCase({
      idGenerator: { generate: () => 'category-2' },
      parentCategoryRepository,
    })

    await expect(createCategory({ name })).rejects.toThrow(message)
    expect(parentCategoryRepository.saveAll).not.toHaveBeenCalled()
  })

  it('ドメインを別カテゴリへ移動してraw domain mappingも更新する', async () => {
    const source = toMockParentCategory({
      collections: ['group-1'].map((id, index) => ({
        id,
        domain: ['example.com'][index] ?? id,
      })),
      id: 'source',
      name: 'Source',
    })
    const target = toMockParentCategory({ id: 'target', name: 'Target' })
    const parentCategoryRepository = createMockParentCategoryRepository({
      parentCategories: [source, target],
    })
    const tabGroupRepository = createMockTabGroupRepository({
      savedTabs: [toMockTabGroup({ domain: 'example.com', id: 'group-1' })],
    })
    const domainCategoryMappingRepository = createMappingRepository([
      { categoryId: 'source', domain: 'example.com' },
    ])
    const assign = createAssignDomainToCategoryUseCase({
      domainCategoryMappingRepository,
      parentCategoryRepository,
      tabGroupRepository,
    })

    const result = await assign({ categoryId: 'target', domainId: 'group-1' })

    expect(result.all).toStrictEqual([
      {
        collections: [].map((id, index) => ({
          id,
          domain: [][index] ?? id,
        })),
        id: 'source',
        name: 'Source',
      },
      {
        collections: ['group-1'].map((id, index) => ({
          id,
          domain: ['example.com'][index] ?? id,
        })),
        id: 'target',
        name: 'Target',
      },
    ])
    expect(result.mappings).toStrictEqual([
      { categoryId: 'target', domain: 'example.com' },
    ])
    expect(parentCategoryRepository.saveAll).toHaveBeenCalledOnce()
    expect(domainCategoryMappingRepository.saveAll).toHaveBeenCalledOnce()
  })

  it('既に分類済みならrepository書込みを行わない', async () => {
    const category = toMockParentCategory({
      collections: ['group-1'].map((id, index) => ({
        id,
        domain: ['example.com'][index] ?? id,
      })),
      id: 'target',
      name: 'Target',
    })
    const parentCategoryRepository = createMockParentCategoryRepository({
      parentCategories: [category],
    })
    const tabGroupRepository = createMockTabGroupRepository({
      savedTabs: [toMockTabGroup({ domain: 'example.com', id: 'group-1' })],
    })
    const domainCategoryMappingRepository = createMappingRepository([
      { categoryId: 'target', domain: 'example.com' },
    ])
    const assign = createAssignDomainToCategoryUseCase({
      domainCategoryMappingRepository,
      parentCategoryRepository,
      tabGroupRepository,
    })

    await assign({ categoryId: 'target', domainId: 'group-1' })

    expect(parentCategoryRepository.saveAll).not.toHaveBeenCalled()
    expect(domainCategoryMappingRepository.saveAll).not.toHaveBeenCalled()
  })

  it('none指定でカテゴリとmappingからドメインを除去する', async () => {
    const parentCategoryRepository = createMockParentCategoryRepository({
      parentCategories: [
        toMockParentCategory({
          collections: ['group-1'].map((id, index) => ({
            id,
            domain: ['example.com'][index] ?? id,
          })),
          id: 'source',
          name: 'Source',
        }),
      ],
    })
    const tabGroupRepository = createMockTabGroupRepository({
      savedTabs: [toMockTabGroup({ domain: 'example.com', id: 'group-1' })],
    })
    const domainCategoryMappingRepository = createMappingRepository([
      { categoryId: 'source', domain: 'example.com' },
    ])
    const assign = createAssignDomainToCategoryUseCase({
      domainCategoryMappingRepository,
      parentCategoryRepository,
      tabGroupRepository,
    })

    const result = await assign({ categoryId: 'none', domainId: 'group-1' })

    expect(result.all[0]).toMatchObject({
      collections: [].map((id, index) => ({
        id,
        domain: [][index] ?? id,
      })),
    })
    expect(result.mappings).toStrictEqual([])
  })

  it('missing groupはカテゴリ指定でno-op、none指定でエラーにする', async () => {
    const parentCategoryRepository = createMockParentCategoryRepository({
      parentCategories: [
        toMockParentCategory({
          collections: ['missing'].map((id, index) => ({
            id,
            domain: ['missing'][index] ?? id,
          })),
          id: 'target',
          name: 'Target',
        }),
      ],
    })
    const tabGroupRepository = createMockTabGroupRepository({ savedTabs: [] })
    const domainCategoryMappingRepository = createMappingRepository()
    const assign = createAssignDomainToCategoryUseCase({
      domainCategoryMappingRepository,
      parentCategoryRepository,
      tabGroupRepository,
    })

    const result = await assign({ categoryId: 'target', domainId: 'missing' })
    expect(result.all[0]?.collections.map(({ id }) => id)).toStrictEqual([
      'missing',
    ])
    expect(parentCategoryRepository.saveAll).not.toHaveBeenCalled()

    await expect(
      assign({ categoryId: 'none', domainId: 'missing' }),
    ).rejects.toMatchObject({ code: 'TAB_GROUP_NOT_FOUND' })
  })
})
