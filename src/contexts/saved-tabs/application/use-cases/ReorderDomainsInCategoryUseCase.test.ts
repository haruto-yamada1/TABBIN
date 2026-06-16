import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { TabGroup } from '@/types/storage'

import { createParentCategory } from '../../domain/entities/ParentCategory'
import type { ParentCategoryRepository } from '../../domain/repositories/ParentCategoryRepository'
import { createTabGroupId } from '../../domain/value-objects/TabGroupId'
import { createReorderDomainsInCategoryUseCase } from './ReorderDomainsInCategoryUseCase'
import type { ReorderDomainsInCategoryUseCaseDeps } from './ReorderDomainsInCategoryUseCase'

const createInMemoryRepository = (
  initial: ReturnType<typeof createParentCategory>[] = [],
): ParentCategoryRepository => {
  let store: ReturnType<typeof createParentCategory>[] = [...initial]
  return {
    // eslint-disable-next-line @typescript-eslint/require-await, typescript/require-await -- Promise contract は ParentCategoryRepository 側で必須
    findAll: async () => store.map((category) => ({ ...category })),
    // eslint-disable-next-line @typescript-eslint/require-await, typescript/require-await -- Promise contract は ParentCategoryRepository 側で必須
    findById: async (id) =>
      store.find((category) => category.id === id) ?? null,
    // eslint-disable-next-line @typescript-eslint/require-await, typescript/require-await -- Promise contract は ParentCategoryRepository 側で必須
    removeByIds: async (ids) => {
      const idSet = new Set(ids)
      store = store.filter((category) => !idSet.has(category.id))
    },
    // eslint-disable-next-line @typescript-eslint/require-await, typescript/require-await -- Promise contract は ParentCategoryRepository 側で必須
    saveAll: async (categories) => {
      store = categories.map((category) => ({ ...category }))
    },
  }
}

const createDeps = (
  repo: ParentCategoryRepository,
): ReorderDomainsInCategoryUseCaseDeps => ({
  parentCategoryRepository: repo,
})

const buildTabGroup = (id: string): TabGroup =>
  ({ id: createTabGroupId(id) }) as unknown as TabGroup

describe('createReorderDomainsInCategoryUseCase', () => {
  let repo: ParentCategoryRepository

  beforeEach(() => {
    repo = createInMemoryRepository([
      createParentCategory({
        domainNames: ['example.com', 'docs.com', 'extra.com'],
        domains: ['tab-1', 'tab-2', 'tab-3'],
        id: 'cat-docs',
        name: 'Docs',
      }),
    ])
  })

  it('新しい domainIds 順で categories.domains を更新して saveAll する', async () => {
    const useCase = createReorderDomainsInCategoryUseCase(createDeps(repo))
    const saveAllSpy = vi.spyOn(repo, 'saveAll')
    const result = await useCase({
      categoryId: 'cat-docs',
      updatedDomains: [
        buildTabGroup('tab-3'),
        buildTabGroup('tab-1'),
        buildTabGroup('tab-2'),
      ],
    })
    const docs = result.find((c) => c.id === 'cat-docs')
    expect(docs?.domains).toStrictEqual(['tab-3', 'tab-1', 'tab-2'])
    expect(saveAllSpy).toHaveBeenCalledTimes(1)
  })

  it('updatedDomains が空の場合は no-op として現在値を返す', async () => {
    const useCase = createReorderDomainsInCategoryUseCase(createDeps(repo))
    const saveAllSpy = vi.spyOn(repo, 'saveAll')
    const result = await useCase({
      categoryId: 'cat-docs',
      updatedDomains: [],
    })
    const docs = result.find((c) => c.id === 'cat-docs')
    expect(docs?.domains).toStrictEqual(['tab-1', 'tab-2', 'tab-3'])
    expect(saveAllSpy).toHaveBeenCalledTimes(1)
  })

  it('対象カテゴリが見つからない場合は no-op として現在値を返す', async () => {
    const useCase = createReorderDomainsInCategoryUseCase(createDeps(repo))
    const result = await useCase({
      categoryId: 'cat-missing',
      updatedDomains: [buildTabGroup('tab-1')],
    })
    const docs = result.find((c) => c.id === 'cat-docs')
    expect(docs?.domains).toStrictEqual(['tab-1', 'tab-2', 'tab-3'])
  })

  it('domainNames は変更しない (並び替えは domains のみ)', async () => {
    const useCase = createReorderDomainsInCategoryUseCase(createDeps(repo))
    const result = await useCase({
      categoryId: 'cat-docs',
      updatedDomains: [buildTabGroup('tab-3'), buildTabGroup('tab-1')],
    })
    const docs = result.find((c) => c.id === 'cat-docs')
    expect(docs?.domainNames).toStrictEqual([
      'example.com',
      'docs.com',
      'extra.com',
    ])
  })
})
