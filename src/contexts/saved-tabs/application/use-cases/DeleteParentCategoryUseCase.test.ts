import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createParentCategory } from '@/contexts/saved-tabs/domain/entities/ParentCategory'
import { SavedTabsDomainError } from '@/contexts/saved-tabs/domain/errors/SavedTabsDomainError'
import type { ParentCategoryRepository } from '@/contexts/saved-tabs/domain/repositories/ParentCategoryRepository'
import { createParentCategoryId } from '@/contexts/saved-tabs/domain/value-objects/ParentCategoryId'

import { createDeleteParentCategoryUseCase } from './DeleteParentCategoryUseCase'
import type { DeleteParentCategoryUseCaseDeps } from './DeleteParentCategoryUseCase'

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
): DeleteParentCategoryUseCaseDeps => ({
  parentCategoryRepository: repo,
})

describe('createDeleteParentCategoryUseCase', () => {
  let repo: ParentCategoryRepository

  beforeEach(() => {
    repo = createInMemoryRepository([
      createParentCategory({
        domainNames: ['example.com'],
        domains: ['tab-1'],
        id: 'cat-1',
        name: 'Docs',
      }),
      createParentCategory({
        domainNames: ['news.com'],
        domains: ['tab-2'],
        id: 'cat-2',
        name: 'News',
      }),
    ])
  })

  it('対象カテゴリを all から除外し saveAll で永続化する', async () => {
    const useCase = createDeleteParentCategoryUseCase(createDeps(repo))
    const result = await useCase({
      categoryId: createParentCategoryId('cat-1'),
    })
    expect(result.all.map((c) => c.id)).toStrictEqual(['cat-2'])
    expect(result.removedCategory.id).toBe('cat-1')
    expect(result.removedCategory.name).toBe('Docs')
  })

  it('saveAll が呼ばれ、永続化後の findAll からも対象が消えている', async () => {
    const saveAllSpy = vi.fn(repo.saveAll.bind(repo))
    const spyingRepo: ParentCategoryRepository = {
      ...repo,
      saveAll: saveAllSpy,
    }
    const useCase = createDeleteParentCategoryUseCase(createDeps(spyingRepo))
    await useCase({ categoryId: createParentCategoryId('cat-1') })
    expect(saveAllSpy).toHaveBeenCalledTimes(1)
    const all = await spyingRepo.findAll()
    expect(all.map((c) => c.id)).toStrictEqual(['cat-2'])
  })

  it('他のカテゴリには影響しない', async () => {
    const useCase = createDeleteParentCategoryUseCase(createDeps(repo))
    const result = await useCase({
      categoryId: createParentCategoryId('cat-1'),
    })
    const remaining = result.all.find((c) => c.id === 'cat-2')
    expect(remaining?.name).toBe('News')
    expect(remaining?.domainNames).toStrictEqual(['news.com'])
    expect(remaining?.domains).toStrictEqual(['tab-2'])
  })

  it('対象カテゴリが見つからない場合は SavedTabsDomainError を投げる', async () => {
    const useCase = createDeleteParentCategoryUseCase(createDeps(repo))
    await expect(
      useCase({ categoryId: createParentCategoryId('cat-missing') }),
    ).rejects.toThrow(SavedTabsDomainError)
  })

  it('removeByIds は呼ばれず saveAll で全件置き換える (issue #518: 最小削除挙動)', async () => {
    const removeByIdsSpy = vi.fn(repo.removeByIds.bind(repo))
    const saveAllSpy = vi.fn(repo.saveAll.bind(repo))
    const spyingRepo: ParentCategoryRepository = {
      ...repo,
      removeByIds: removeByIdsSpy,
      saveAll: saveAllSpy,
    }
    const useCase = createDeleteParentCategoryUseCase(createDeps(spyingRepo))
    await useCase({ categoryId: createParentCategoryId('cat-1') })
    expect(removeByIdsSpy).not.toHaveBeenCalled()
    expect(saveAllSpy).toHaveBeenCalledTimes(1)
  })
})
