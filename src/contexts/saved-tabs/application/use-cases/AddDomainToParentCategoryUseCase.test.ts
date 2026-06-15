import { beforeEach, describe, expect, it } from 'vitest'

import { createParentCategory } from '../../domain/entities/ParentCategory'
import { SavedTabsDomainError } from '../../domain/errors/SavedTabsDomainError'
import type { ParentCategoryRepository } from '../../domain/repositories/ParentCategoryRepository'
import { createDomainName } from '../../domain/value-objects/DomainName'
import { createParentCategoryId } from '../../domain/value-objects/ParentCategoryId'
import { createTabGroupId } from '../../domain/value-objects/TabGroupId'
import { createAddDomainToParentCategoryUseCase } from './AddDomainToParentCategoryUseCase'
import type { AddDomainToParentCategoryUseCaseDeps } from './AddDomainToParentCategoryUseCase'

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
): AddDomainToParentCategoryUseCaseDeps => ({
  parentCategoryRepository: repo,
})

describe('createAddDomainToParentCategoryUseCase', () => {
  let repo: ParentCategoryRepository

  beforeEach(() => {
    repo = createInMemoryRepository([
      createParentCategory({
        domainNames: ['existing.com'],
        domains: ['tab-existing'],
        id: 'cat-1',
        name: 'Docs',
      }),
    ])
  })

  it('新規 domain を domains / domainNames 両方に追加する', async () => {
    const useCase = createAddDomainToParentCategoryUseCase(createDeps(repo))
    const result = await useCase({
      categoryId: createParentCategoryId('cat-1'),
      domainId: createTabGroupId('tab-new'),
      domainName: createDomainName('new.com'),
    })
    const target = result.find((c) => c.id === 'cat-1')
    expect(target?.domains).toStrictEqual(['tab-existing', 'tab-new'])
    expect(target?.domainNames).toStrictEqual(['existing.com', 'new.com'])
  })

  it('既存 domains にある domainId の追加はエラー', async () => {
    const useCase = createAddDomainToParentCategoryUseCase(createDeps(repo))
    await expect(
      useCase({
        categoryId: createParentCategoryId('cat-1'),
        domainId: createTabGroupId('tab-existing'),
        domainName: createDomainName('new.com'),
      }),
    ).rejects.toThrow(SavedTabsDomainError)
  })

  it('既存 domainNames にある domainName の追加はエラー', async () => {
    const useCase = createAddDomainToParentCategoryUseCase(createDeps(repo))
    await expect(
      useCase({
        categoryId: createParentCategoryId('cat-1'),
        domainId: createTabGroupId('tab-new'),
        domainName: createDomainName('existing.com'),
      }),
    ).rejects.toThrow(SavedTabsDomainError)
  })

  it('対象カテゴリが見つからない場合はエラー', async () => {
    const useCase = createAddDomainToParentCategoryUseCase(createDeps(repo))
    await expect(
      useCase({
        categoryId: createParentCategoryId('cat-missing'),
        domainId: createTabGroupId('tab-new'),
        domainName: createDomainName('new.com'),
      }),
    ).rejects.toThrow(SavedTabsDomainError)
  })
})
