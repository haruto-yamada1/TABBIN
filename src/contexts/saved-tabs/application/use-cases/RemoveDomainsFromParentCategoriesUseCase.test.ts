import { beforeEach, describe, expect, it } from 'vitest'

import { createParentCategory } from '../../domain/entities/ParentCategory'
import type { ParentCategoryRepository } from '../../domain/repositories/ParentCategoryRepository'
import { createTabGroupId } from '../../domain/value-objects/TabGroupId'
import { createRemoveDomainsFromParentCategoriesUseCase } from './RemoveDomainsFromParentCategoriesUseCase'
import type { RemoveDomainsFromParentCategoriesUseCaseDeps } from './RemoveDomainsFromParentCategoriesUseCase'

const createInMemoryRepository = (
  initial: ReturnType<typeof createParentCategory>[] = [],
): ParentCategoryRepository => {
  let store: ReturnType<typeof createParentCategory>[] = [...initial]
  return {
    // eslint-disable-next-line typescript/require-await -- Promise contract は ParentCategoryRepository 側で必須
    findAll: async () => store.map((category) => ({ ...category })),
    // eslint-disable-next-line typescript/require-await -- Promise contract は ParentCategoryRepository 側で必須
    findById: async (id) =>
      store.find((category) => category.id === id) ?? null,
    // eslint-disable-next-line typescript/require-await -- Promise contract は ParentCategoryRepository 側で必須
    removeByIds: async (ids) => {
      const idSet = new Set(ids)
      store = store.filter((category) => !idSet.has(category.id))
    },
    // eslint-disable-next-line typescript/require-await -- Promise contract は ParentCategoryRepository 側で必須
    saveAll: async (categories) => {
      store = categories.map((category) => ({ ...category }))
    },
  }
}

const createDeps = (
  repo: ParentCategoryRepository,
): RemoveDomainsFromParentCategoriesUseCaseDeps => ({
  parentCategoryRepository: repo,
})

describe('createRemoveDomainsFromParentCategoriesUseCase', () => {
  let repo: ParentCategoryRepository

  beforeEach(() => {
    repo = createInMemoryRepository([
      createParentCategory({
        domainNames: ['a.com', 'b.com', 'c.com'],
        domains: ['tab-1', 'tab-2', 'tab-3'],
        id: 'cat-1',
        name: 'Docs',
      }),
      createParentCategory({
        domainNames: ['d.com'],
        domains: ['tab-2'],
        id: 'cat-2',
        name: 'Work',
      }),
    ])
  })

  it('単一 domainId を全カテゴリの domains から取り除く (domainNames は維持)', async () => {
    const useCase = createRemoveDomainsFromParentCategoriesUseCase(
      createDeps(repo),
    )
    const result = await useCase({
      domainIds: [createTabGroupId('tab-2')],
    })
    const cat1 = result.find((c) => c.id === 'cat-1')
    const cat2 = result.find((c) => c.id === 'cat-2')
    expect(cat1?.domains).toStrictEqual(['tab-1', 'tab-3'])
    expect(cat1?.domainNames).toStrictEqual(['a.com', 'b.com', 'c.com'])
    expect(cat2?.domains).toStrictEqual([])
    expect(cat2?.domainNames).toStrictEqual(['d.com'])
  })

  it('複数 domainId を一括で取り除く', async () => {
    const useCase = createRemoveDomainsFromParentCategoriesUseCase(
      createDeps(repo),
    )
    const result = await useCase({
      domainIds: [createTabGroupId('tab-1'), createTabGroupId('tab-3')],
    })
    const cat1 = result.find((c) => c.id === 'cat-1')
    const cat2 = result.find((c) => c.id === 'cat-2')
    expect(cat1?.domains).toStrictEqual(['tab-2'])
    expect(cat2?.domains).toStrictEqual(['tab-2'])
  })

  it('存在しない domainId は no-op として現在値を返す', async () => {
    const useCase = createRemoveDomainsFromParentCategoriesUseCase(
      createDeps(repo),
    )
    const result = await useCase({
      domainIds: [createTabGroupId('tab-missing')],
    })
    const cat1 = result.find((c) => c.id === 'cat-1')
    expect(cat1?.domains).toStrictEqual(['tab-1', 'tab-2', 'tab-3'])
  })

  it('domainIds が空の場合は saveAll を呼ばず現在値を返す', async () => {
    const useCase = createRemoveDomainsFromParentCategoriesUseCase(
      createDeps(repo),
    )
    const result = await useCase({ domainIds: [] })
    expect(result).toHaveLength(2)
    const cat1 = result.find((c) => c.id === 'cat-1')
    expect(cat1?.domains).toStrictEqual(['tab-1', 'tab-2', 'tab-3'])
  })
})
