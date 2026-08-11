import { beforeEach, describe, expect, it } from 'vitest'

import { createParentCategory } from '@/contexts/saved-tabs/domain/entities/ParentCategory'
import { SavedTabsDomainError } from '@/contexts/saved-tabs/domain/errors/SavedTabsDomainError'
import type { ParentCategoryRepository } from '@/contexts/saved-tabs/domain/repositories/ParentCategoryRepository'
import { createDomainName } from '@/contexts/saved-tabs/domain/value-objects/DomainName'
import { createParentCategoryId } from '@/contexts/saved-tabs/domain/value-objects/ParentCategoryId'
import { createTabGroupId } from '@/contexts/saved-tabs/domain/value-objects/TabGroupId'

import { createRemoveDomainFromParentCategoryUseCase } from './RemoveDomainFromParentCategoryUseCase'
import type { RemoveDomainFromParentCategoryUseCaseDeps } from './RemoveDomainFromParentCategoryUseCase'

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
): RemoveDomainFromParentCategoryUseCaseDeps => ({
  parentCategoryRepository: repo,
})

describe('createRemoveDomainFromParentCategoryUseCase', () => {
  let repo: ParentCategoryRepository

  beforeEach(() => {
    repo = createInMemoryRepository([
      createParentCategory({
        collections: ['tab-1', 'tab-2'].map((id, index) => ({
          id,
          domain: ['example.com', 'extra.com'][index] ?? id,
        })),
        id: 'cat-1',
        name: 'Docs',
      }),
    ])
  })

  it('指定 domain を domains / domainNames から削除する', async () => {
    const useCase = createRemoveDomainFromParentCategoryUseCase(
      createDeps(repo),
    )
    const result = await useCase({
      categoryId: createParentCategoryId('cat-1'),
      domainId: createTabGroupId('tab-1'),
      domainName: createDomainName('example.com'),
    })
    const target = result.find((c) => c.id === 'cat-1')
    expect(target?.collections.map(({ id }) => id)).toStrictEqual(['tab-2'])
    expect(target?.collections.map(({ domain }) => domain)).toStrictEqual([
      'extra.com',
    ])
  })

  it('対象カテゴリが見つからない場合はエラー', async () => {
    const useCase = createRemoveDomainFromParentCategoryUseCase(
      createDeps(repo),
    )
    await expect(
      useCase({
        categoryId: createParentCategoryId('cat-missing'),
        domainId: createTabGroupId('tab-1'),
        domainName: createDomainName('example.com'),
      }),
    ).rejects.toThrow(SavedTabsDomainError)
  })

  it('指定 domain が含まれていない場合はエラー', async () => {
    const useCase = createRemoveDomainFromParentCategoryUseCase(
      createDeps(repo),
    )
    await expect(
      useCase({
        categoryId: createParentCategoryId('cat-1'),
        domainId: createTabGroupId('tab-not-found'),
        domainName: createDomainName('missing.com'),
      }),
    ).rejects.toThrow(SavedTabsDomainError)
  })
})
