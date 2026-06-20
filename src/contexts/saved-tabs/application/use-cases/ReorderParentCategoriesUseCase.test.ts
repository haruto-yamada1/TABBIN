import { describe, expect, it, vi } from 'vitest'

import { createParentCategory } from '../../domain/entities/ParentCategory'
import type { ParentCategory } from '../../domain/entities/ParentCategory'
import type { ParentCategoryRepository } from '../../domain/repositories/ParentCategoryRepository'
import { createReorderParentCategoriesUseCase } from './ReorderParentCategoriesUseCase'
import type { ReorderParentCategoriesUseCaseDeps } from './ReorderParentCategoriesUseCase'

const createInMemoryRepository = (
  initial: ReturnType<typeof createParentCategory>[] = [],
): ParentCategoryRepository => {
  let store: ReturnType<typeof createParentCategory>[] = [...initial]
  const findAll = async (): Promise<readonly ParentCategory[]> => store
  const findById = async (
    id: ReturnType<typeof createParentCategory>['id'],
  ): Promise<ParentCategory | null> =>
    store.find((category) => category.id === id) ?? null
  const saveAll = async (
    categories: readonly ReturnType<typeof createParentCategory>[],
  ): Promise<void> => {
    store = [...categories]
  }
  return {
    findAll,
    findById,
    removeByIds: async (): Promise<void> => {},
    saveAll,
  }
}

const createDeps = (
  repo: ParentCategoryRepository,
): ReorderParentCategoriesUseCaseDeps => ({
  parentCategoryRepository: repo,
})

describe('createReorderParentCategoriesUseCase', () => {
  it('受け取った categories を repository.saveAll へ委譲する', async () => {
    const repo = createInMemoryRepository([
      createParentCategory({
        domainNames: [],
        domains: [],
        id: 'cat-a',
        name: 'A',
      }),
    ])
    const saveAllSpy = vi.spyOn(repo, 'saveAll')
    const useCase = createReorderParentCategoriesUseCase(createDeps(repo))

    const reordered = [
      createParentCategory({
        domainNames: [],
        domains: [],
        id: 'cat-b',
        name: 'B',
      }),
      createParentCategory({
        domainNames: [],
        domains: [],
        id: 'cat-a',
        name: 'A',
      }),
    ]
    // command は storage 層 `ParentCategory[]` を要求するため widen。
    const reorderedAsStorage =
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      reordered as unknown as Parameters<typeof useCase>[0]['categories']

    await useCase({ categories: reorderedAsStorage })

    expect(saveAllSpy).toHaveBeenCalledTimes(1)
    expect(saveAllSpy).toHaveBeenCalledWith(reordered)
  })

  it('空配列を渡された場合は repository へ空配列を保存する', async () => {
    const repo = createInMemoryRepository([
      createParentCategory({
        domainNames: [],
        domains: [],
        id: 'cat-a',
        name: 'A',
      }),
    ])
    const saveAllSpy = vi.spyOn(repo, 'saveAll')
    const useCase = createReorderParentCategoriesUseCase(createDeps(repo))

    await useCase({ categories: [] })

    expect(saveAllSpy).toHaveBeenCalledWith([])
  })
})
