import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createParentCategory } from '@/contexts/saved-tabs/domain/entities/ParentCategory'
import type { ParentCategoryRepository } from '@/contexts/saved-tabs/domain/repositories/ParentCategoryRepository'
import { createTabGroupId } from '@/contexts/saved-tabs/domain/value-objects/TabGroupId'
import type { TabGroup } from '@/types/storage'

import { createMoveDomainBetweenCategoriesUseCase } from './MoveDomainBetweenCategoriesUseCase'
import type { MoveDomainBetweenCategoriesUseCaseDeps } from './MoveDomainBetweenCategoriesUseCase'

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
): MoveDomainBetweenCategoriesUseCaseDeps => ({
  parentCategoryRepository: repo,
})

const buildTabGroup = (id: string, domain: string): TabGroup =>
  ({
    domain,
    id: createTabGroupId(id),
    parentCategoryId: null,
    savedAt: 0,
    subCategories: [],
    urls: [],
  }) as unknown as TabGroup

describe('createMoveDomainBetweenCategoriesUseCase', () => {
  let repo: ParentCategoryRepository

  beforeEach(() => {
    repo = createInMemoryRepository([
      createParentCategory({
        domainNames: ['example.com', 'docs.com'],
        domains: ['tab-1', 'tab-2'],
        id: 'cat-docs',
        name: 'Docs',
      }),
      createParentCategory({
        domainNames: ['news.com'],
        domains: ['tab-3'],
        id: 'cat-news',
        name: 'News',
      }),
    ])
  })

  it('移動元から取り除き移動先へ追加する', async () => {
    const useCase = createMoveDomainBetweenCategoriesUseCase(createDeps(repo))
    const tabGroups = [
      buildTabGroup('tab-1', 'example.com'),
      buildTabGroup('tab-3', 'news.com'),
    ]
    const result = await useCase({
      domainId: createTabGroupId('tab-1'),
      fromCategoryId: 'cat-docs',
      tabGroups,
      toCategoryId: 'cat-news',
    })
    const docs = result.find((c) => c.id === 'cat-docs')
    const news = result.find((c) => c.id === 'cat-news')
    expect(docs?.domains).toStrictEqual(['tab-2'])
    expect(docs?.domainNames).toStrictEqual(['docs.com'])
    expect(news?.domains).toStrictEqual(['tab-3', 'tab-1'])
    expect(news?.domainNames).toStrictEqual(['news.com', 'example.com'])
  })

  it('domainId が tabGroups 中に存在しない場合は no-op', async () => {
    const useCase = createMoveDomainBetweenCategoriesUseCase(createDeps(repo))
    const tabGroups = [buildTabGroup('tab-1', 'example.com')]
    const result = await useCase({
      domainId: createTabGroupId('tab-missing'),
      fromCategoryId: 'cat-docs',
      tabGroups,
      toCategoryId: 'cat-news',
    })
    expect(result.find((c) => c.id === 'cat-docs')?.domains).toStrictEqual([
      'tab-1',
      'tab-2',
    ])
    expect(result.find((c) => c.id === 'cat-news')?.domains).toStrictEqual([
      'tab-3',
    ])
  })

  it('fromCategoryId が null の場合は追加のみ行う', async () => {
    const useCase = createMoveDomainBetweenCategoriesUseCase(createDeps(repo))
    const tabGroups = [buildTabGroup('tab-99', 'new.com')]
    const result = await useCase({
      domainId: createTabGroupId('tab-99'),
      fromCategoryId: null,
      tabGroups,
      toCategoryId: 'cat-docs',
    })
    const docs = result.find((c) => c.id === 'cat-docs')
    expect(docs?.domains).toStrictEqual(['tab-1', 'tab-2', 'tab-99'])
    expect(docs?.domainNames).toStrictEqual([
      'example.com',
      'docs.com',
      'new.com',
    ])
  })

  it('saveAll が更新後の categories で呼ばれる', async () => {
    const useCase = createMoveDomainBetweenCategoriesUseCase(createDeps(repo))
    const saveAllSpy = vi.spyOn(repo, 'saveAll')
    const tabGroups = [
      buildTabGroup('tab-1', 'example.com'),
      buildTabGroup('tab-3', 'news.com'),
    ]
    await useCase({
      domainId: createTabGroupId('tab-1'),
      fromCategoryId: 'cat-docs',
      tabGroups,
      toCategoryId: 'cat-news',
    })
    expect(saveAllSpy).toHaveBeenCalledTimes(1)
    const saved = saveAllSpy.mock.calls[0]?.[0]
    expect(saved).toHaveLength(2)
  })
})
