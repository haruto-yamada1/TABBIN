import { beforeEach, describe, expect, it } from 'vitest'

import { createParentCategory } from '../../domain/entities/ParentCategory'
import { SavedTabsDomainError } from '../../domain/errors/SavedTabsDomainError'
import type { ParentCategoryRepository } from '../../domain/repositories/ParentCategoryRepository'
import { createParentCategoryId } from '../../domain/value-objects/ParentCategoryId'
import {
  createRenameParentCategoryUseCase,
  type RenameParentCategoryUseCaseDeps,
} from './RenameParentCategoryUseCase'

const createInMemoryRepository = (
  initial: ReturnType<typeof createParentCategory>[] = [],
): ParentCategoryRepository => {
  let store: ReturnType<typeof createParentCategory>[] = [...initial]
  return {
    findAll: async () => store.map((category) => ({ ...category })),
    findById: async (id) =>
      store.find((category) => category.id === id) ?? null,
    removeByIds: async (ids) => {
      const idSet = new Set(ids)
      store = store.filter((category) => !idSet.has(category.id))
    },
    saveAll: async (categories) => {
      store = categories.map((category) => ({ ...category }))
    },
  }
}

const createDeps = (
  repo: ParentCategoryRepository,
): RenameParentCategoryUseCaseDeps => ({
  parentCategoryRepository: repo,
})

describe('createRenameParentCategoryUseCase', () => {
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
        domainNames: [],
        domains: [],
        id: 'cat-2',
        name: 'News',
      }),
    ])
  })

  it('対象カテゴリの name を更新する', async () => {
    const useCase = createRenameParentCategoryUseCase(createDeps(repo))
    const result = await useCase({
      categoryId: createParentCategoryId('cat-1'),
      newName: 'Documents',
    })
    expect(result.find((c) => c.id === 'cat-1')?.name).toBe('Documents')
    // domains / domainNames は保持する
    expect(result.find((c) => c.id === 'cat-1')?.domains).toEqual(['tab-1'])
    expect(result.find((c) => c.id === 'cat-1')?.domainNames).toEqual([
      'example.com',
    ])
  })

  it('他のカテゴリには影響しない', async () => {
    const useCase = createRenameParentCategoryUseCase(createDeps(repo))
    const result = await useCase({
      categoryId: createParentCategoryId('cat-1'),
      newName: 'Documents',
    })
    expect(result.find((c) => c.id === 'cat-2')?.name).toBe('News')
  })

  it('新 name が同じ場合は noop として元配列を返す', async () => {
    const useCase = createRenameParentCategoryUseCase(createDeps(repo))
    const result = await useCase({
      categoryId: createParentCategoryId('cat-1'),
      newName: 'Docs',
    })
    expect(result.find((c) => c.id === 'cat-1')?.name).toBe('Docs')
  })

  it('対象カテゴリが見つからない場合は SavedTabsDomainError を投げる', async () => {
    const useCase = createRenameParentCategoryUseCase(createDeps(repo))
    await expect(
      useCase({
        categoryId: createParentCategoryId('cat-missing'),
        newName: 'Anything',
      }),
    ).rejects.toThrowError(SavedTabsDomainError)
  })

  it('saveAll が永続化される', async () => {
    const useCase = createRenameParentCategoryUseCase(createDeps(repo))
    await useCase({
      categoryId: createParentCategoryId('cat-1'),
      newName: 'Documents',
    })
    // 同じ repository インスタンスで findAll して確認
    const all = await repo.findAll()
    expect(all.find((c) => c.id === 'cat-1')?.name).toBe('Documents')
  })
})
