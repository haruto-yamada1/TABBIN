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
): DeleteParentCategoryUseCaseDeps => ({
  parentCategoryRepository: repo,
})

describe('createDeleteParentCategoryUseCase', () => {
  let repo: ParentCategoryRepository

  beforeEach(() => {
    repo = createInMemoryRepository([
      createParentCategory({
        collections: ['tab-1'].map((id, index) => ({
          id,
          domain: ['example.com'][index] ?? id,
        })),
        id: 'cat-1',
        name: 'Docs',
      }),
      createParentCategory({
        collections: ['tab-2'].map((id, index) => ({
          id,
          domain: ['news.com'][index] ?? id,
        })),
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
    expect(remaining?.collections.map(({ domain }) => domain)).toStrictEqual([
      'news.com',
    ])
    expect(remaining?.collections.map(({ id }) => id)).toStrictEqual(['tab-2'])
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

describe('createDeleteParentCategoryUseCase requireEmpty (issue #898)', () => {
  it('割り当てのないカテゴリは削除できる', async () => {
    const repo = createInMemoryRepository([
      createParentCategory({
        collections: [],
        id: 'cat-empty',
        name: 'Empty',
      }),
      createParentCategory({
        collections: [{ domain: 'example.com', id: 'tab-1' }],
        id: 'cat-1',
        name: 'Docs',
      }),
    ])
    const useCase = createDeleteParentCategoryUseCase(createDeps(repo))
    const result = await useCase({
      categoryId: createParentCategoryId('cat-empty'),
      requireEmpty: true,
    })
    expect(result.all.map((c) => c.id)).toStrictEqual(['cat-1'])
    expect(result.removedCategory.id).toBe('cat-empty')
  })

  it('割り当ての有るカテゴリは削除を拒否し saveAll を呼ばない', async () => {
    const repo = createInMemoryRepository([
      createParentCategory({
        collections: [{ domain: 'example.com', id: 'tab-1' }],
        id: 'cat-1',
        name: 'Docs',
      }),
    ])
    const saveAllSpy = vi.fn(repo.saveAll.bind(repo))
    const spyingRepo: ParentCategoryRepository = {
      ...repo,
      saveAll: saveAllSpy,
    }
    const useCase = createDeleteParentCategoryUseCase(createDeps(spyingRepo))
    await expect(
      useCase({
        categoryId: createParentCategoryId('cat-1'),
        requireEmpty: true,
      }),
    ).rejects.toMatchObject({
      code: 'PARENT_CATEGORY_NOT_EMPTY',
    })
    expect(saveAllSpy).not.toHaveBeenCalled()
  })

  it('保存直前の再読込で割り当てが増えていた場合は削除を拒否する', async () => {
    const empty = createParentCategory({
      collections: [],
      id: 'cat-empty',
      name: 'Empty',
    })
    const assigned = createParentCategory({
      collections: [{ domain: 'example.com', id: 'tab-1' }],
      id: 'cat-empty',
      name: 'Empty',
    })
    let findAllCalls = 0
    const repo: ParentCategoryRepository = {
      findAll: async () => {
        findAllCalls += 1
        return findAllCalls === 1 ? [empty] : [assigned]
      },
      findById: async (id) => (id === 'cat-empty' ? empty : null),
      removeByIds: async () => {},
      saveAll: vi.fn(),
    }
    const useCase = createDeleteParentCategoryUseCase(createDeps(repo))
    await expect(
      useCase({
        categoryId: createParentCategoryId('cat-empty'),
        requireEmpty: true,
      }),
    ).rejects.toMatchObject({
      code: 'PARENT_CATEGORY_NOT_EMPTY',
    })
    expect(repo.saveAll).not.toHaveBeenCalled()
  })

  it('再読込時に追加された別カテゴリは保存・返却の一覧に残る', async () => {
    const empty = createParentCategory({
      collections: [],
      id: 'cat-empty',
      name: 'Empty',
    })
    const added = createParentCategory({
      collections: [{ domain: 'news.com', id: 'tab-2' }],
      id: 'cat-added',
      name: 'Added',
    })
    let findAllCalls = 0
    const saveAllSpy = vi.fn()
    const repo: ParentCategoryRepository = {
      findAll: async () => {
        findAllCalls += 1
        return findAllCalls === 1 ? [empty] : [empty, added]
      },
      findById: async (id) => (id === 'cat-empty' ? empty : null),
      removeByIds: async () => {},
      saveAll: saveAllSpy,
    }
    const useCase = createDeleteParentCategoryUseCase(createDeps(repo))
    const result = await useCase({
      categoryId: createParentCategoryId('cat-empty'),
      requireEmpty: true,
    })
    expect(result.all.map((c) => c.id)).toStrictEqual(['cat-added'])
    expect(saveAllSpy).toHaveBeenCalledTimes(1)
    expect(saveAllSpy).toHaveBeenCalledWith([added])
  })
})
