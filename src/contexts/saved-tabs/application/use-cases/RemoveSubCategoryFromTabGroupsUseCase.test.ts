import { describe, expect, it, vi } from 'vitest'

import type { TabGroup as StorageTabGroup } from '@/types/storage'

import { createTabGroup } from '../../domain/entities/TabGroup'
import type { TabGroup } from '../../domain/entities/TabGroup'
import type { TabGroupRepository } from '../../domain/repositories/TabGroupRepository'
import { createRemoveSubCategoryFromTabGroupsUseCase } from './RemoveSubCategoryFromTabGroupsUseCase'
import type { RemoveSubCategoryFromTabGroupsUseCaseDeps } from './RemoveSubCategoryFromTabGroupsUseCase'

const createInMemoryRepository = (
  initial: ReturnType<typeof createTabGroup>[] = [],
): {
  repo: TabGroupRepository
  saveAllSpy: ReturnType<typeof vi.fn>
} => {
  let store: ReturnType<typeof createTabGroup>[] = [...initial]
  const findAll = (): Promise<readonly TabGroup[]> => Promise.resolve(store)
  const findById = (
    id: ReturnType<typeof createTabGroup>['id'],
  ): Promise<TabGroup | null> =>
    Promise.resolve(store.find((group) => group.id === id) ?? null)
  const saveAllSpy = vi.fn(
    (groups: readonly ReturnType<typeof createTabGroup>[]): Promise<void> => {
      store = [...groups]
      return Promise.resolve()
    },
  )
  const removeByIds = (
    _ids: readonly ReturnType<typeof createTabGroup>['id'][],
  ): Promise<void> => Promise.resolve()
  return {
    repo: {
      findAll,
      findById,
      findRawDomainById: vi.fn(() => Promise.resolve(null)),
      removeByIds,
      saveAll: saveAllSpy,
    },
    saveAllSpy,
  }
}

const createDeps = (
  repo: TabGroupRepository,
): RemoveSubCategoryFromTabGroupsUseCaseDeps => ({
  tabGroupRepository: repo,
})

// テストでは storage 層 `TabGroup` の補助フィールド (subCategories /
// urlSubCategories / categoryKeywords) を含んだ入力を domain entity
// へ widening キャストして domain `TabGroup` として組み立てる。
const createStorageLikeDomainTabGroup = (input: {
  categoryKeywords?: { categoryName: string; keywords: string[] }[]
  domain: string
  id: string
  subCategories?: string[]
  urlIds: string[]
  urlSubCategories?: Record<string, string>
}): ReturnType<typeof createTabGroup> =>
  // eslint-disable-next-line typescript/no-unsafe-type-assertion
  ({
    ...createTabGroup({
      domain: input.domain,
      id: input.id,
      urlIds: input.urlIds,
    }),
    categoryKeywords: input.categoryKeywords,
    subCategories: input.subCategories,
    urlSubCategories: input.urlSubCategories,
  }) as unknown as ReturnType<typeof createTabGroup>

describe('createRemoveSubCategoryFromTabGroupsUseCase', () => {
  it('対象 group の subCategories / urlSubCategories / categoryKeywords を削除し saveAll する', async () => {
    const target = createStorageLikeDomainTabGroup({
      categoryKeywords: [
        { categoryName: 'docs', keywords: ['guide'] },
        { categoryName: 'news', keywords: ['headline'] },
      ],
      domain: 'example.com',
      id: 'group-1',
      subCategories: ['docs', 'news'],
      urlIds: ['url-1', 'url-2', 'url-3'],
      urlSubCategories: { 'url-1': 'docs', 'url-2': 'news', 'url-3': 'docs' },
    })
    const other = createTabGroup({
      domain: 'other.com',
      id: 'group-2',
      urlIds: [],
    })
    const { repo, saveAllSpy } = createInMemoryRepository([target, other])
    const useCase = createRemoveSubCategoryFromTabGroupsUseCase(
      createDeps(repo),
    )

    // presentation 層が query から取得した storage 層 `TabGroup[]` 相当
    // を widen して渡すケースを再現するため、 cast して storage 入力に
    // 揃える。
    const tabGroupsAsStorage = [
      target,
      other,
    ] as unknown as readonly StorageTabGroup[]

    const result = await useCase({
      categoryName: 'docs',
      groupId: 'group-1',
      tabGroups: tabGroupsAsStorage,
    })

    expect(saveAllSpy).toHaveBeenCalledTimes(1)
    const saved = saveAllSpy.mock.calls[0]?.[0] ?? []
    const updatedTarget = saved[0] as unknown as {
      categoryKeywords: { categoryName: string; keywords: string[] }[]
      id: string
      subCategories: string[]
      urlSubCategories: Record<string, string>
    }
    expect(updatedTarget.id).toBe('group-1')
    expect(updatedTarget.subCategories).toStrictEqual(['news'])
    expect(updatedTarget.urlSubCategories).toStrictEqual({ 'url-2': 'news' })
    expect(updatedTarget.categoryKeywords).toStrictEqual([
      { categoryName: 'news', keywords: ['headline'] },
    ])
    expect(saved[1]).toBe(other)
    expect(result.tabGroups).toBe(saved)
  })

  it('groupId が存在しない場合、tabGroups は変更されず saveAll も同内容で呼ばれる', async () => {
    const target = createStorageLikeDomainTabGroup({
      categoryKeywords: [],
      domain: 'example.com',
      id: 'group-1',
      subCategories: ['docs'],
      urlIds: [],
      urlSubCategories: { 'url-1': 'docs' },
    })
    const { repo, saveAllSpy } = createInMemoryRepository([target])
    const useCase = createRemoveSubCategoryFromTabGroupsUseCase(
      createDeps(repo),
    )

    await useCase({
      categoryName: 'docs',
      groupId: 'non-existent',
      tabGroups: [target] as unknown as readonly StorageTabGroup[],
    })

    expect(saveAllSpy).toHaveBeenCalledTimes(1)
    const saved = saveAllSpy.mock.calls[0]?.[0] ?? []
    expect(saved).toHaveLength(1)
  })

  it('repository の saveAll がエラーを投げると use-case からも伝播する', async () => {
    const target = createStorageLikeDomainTabGroup({
      categoryKeywords: [],
      domain: 'example.com',
      id: 'group-1',
      subCategories: ['docs'],
      urlIds: [],
      urlSubCategories: {},
    })
    const { repo } = createInMemoryRepository([target])
    repo.saveAll = vi.fn(
      (): Promise<void> => Promise.reject(new Error('save failed')),
    )
    const useCase = createRemoveSubCategoryFromTabGroupsUseCase(
      createDeps(repo),
    )

    await expect(
      useCase({
        categoryName: 'docs',
        groupId: 'group-1',
        tabGroups: [target] as unknown as readonly StorageTabGroup[],
      }),
    ).rejects.toThrow('save failed')
  })
})
