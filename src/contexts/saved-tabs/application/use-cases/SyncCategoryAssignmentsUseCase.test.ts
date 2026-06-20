import { describe, expect, it, vi } from 'vitest'

import { createParentCategory } from '../../domain/entities/ParentCategory'
import { createTabGroup } from '../../domain/entities/TabGroup'
import { SavedTabsDomainError } from '../../domain/errors/SavedTabsDomainError'
import type { ParentCategoryRepository } from '../../domain/repositories/ParentCategoryRepository'
import type { TabGroupRepository } from '../../domain/repositories/TabGroupRepository'
import { createDomainName } from '../../domain/value-objects/DomainName'
import { createParentCategoryId } from '../../domain/value-objects/ParentCategoryId'
import type { SyncCategoryAssignmentsUseCaseDeps } from './SyncCategoryAssignmentsUseCase'
import { createSyncCategoryAssignmentsUseCase } from './SyncCategoryAssignmentsUseCase'

interface Repositories extends SyncCategoryAssignmentsUseCaseDeps {
  tabGroups: ReturnType<typeof createTabGroup>[]
  parentCategories: ReturnType<typeof createParentCategory>[]
}

const createInMemoryRepositories = (
  initial: {
    tabGroups?: ReturnType<typeof createTabGroup>[]
    parentCategories?: ReturnType<typeof createParentCategory>[]
  } = {},
): Repositories => {
  const tabGroups: ReturnType<typeof createTabGroup>[] = [
    ...(initial.tabGroups ?? []),
  ]
  const parentCategories: ReturnType<typeof createParentCategory>[] = [
    ...(initial.parentCategories ?? []),
  ]
  const tabGroupRepository: TabGroupRepository = {
    findAll: async () => [...tabGroups],

    findById: async (id) => tabGroups.find((group) => group.id === id) ?? null,
    findRawDomainById: vi.fn(async () => null),
    findRawTabGroupById: vi.fn(async () => null),

    removeByIds: async (ids) => {
      const idSet = new Set(ids.map((id) => id))
      const next = tabGroups.filter((group) => !idSet.has(group.id))
      tabGroups.splice(0, tabGroups.length, ...next)
    },

    saveAll: async (groups) => {
      tabGroups.splice(0, tabGroups.length, ...groups)
    },
  }
  const parentCategoryRepository: ParentCategoryRepository = {
    findAll: async () => [...parentCategories],

    findById: async (id) =>
      parentCategories.find((category) => category.id === id) ?? null,

    removeByIds: async (ids) => {
      const idSet = new Set(ids.map((id) => id))
      const next = parentCategories.filter(
        (category) => !idSet.has(category.id),
      )
      parentCategories.splice(0, parentCategories.length, ...next)
    },

    saveAll: async (categories) => {
      parentCategories.splice(0, parentCategories.length, ...categories)
    },
  }
  return {
    parentCategories,
    parentCategoryRepository,
    tabGroupRepository,
    tabGroups,
  }
}

describe('SyncCategoryAssignmentsUseCase', () => {
  describe('command 未指定（バルク同期）', () => {
    it('domainNames に合致する TabGroup を該当 ParentCategory に割り当てる', async () => {
      const category = createParentCategory({
        domainNames: ['example.com'],
        domains: [],
        id: 'cat-1',
        name: 'Docs',
      })
      const group = createTabGroup({
        domain: 'example.com',
        id: 'group-1',
        urlIds: [],
      })
      const repos = createInMemoryRepositories({
        parentCategories: [category],
        tabGroups: [group],
      })
      const useCase = createSyncCategoryAssignmentsUseCase(repos)

      const result = await useCase({})

      expect(result.assignedTabGroupIds).toStrictEqual([group.id])
      expect(repos.tabGroups[0]?.parentCategoryId).toBe(category.id)
    })

    it('既に同じカテゴリが割り当て済みの場合は assignedTabGroupIds に含めない', async () => {
      const category = createParentCategory({
        domainNames: ['example.com'],
        domains: [],
        id: 'cat-1',
        name: 'Docs',
      })
      const group = createTabGroup({
        domain: 'example.com',
        id: 'group-1',
        parentCategoryId: 'cat-1',
        urlIds: [],
      })
      const repos = createInMemoryRepositories({
        parentCategories: [category],
        tabGroups: [group],
      })
      const useCase = createSyncCategoryAssignmentsUseCase(repos)

      const result = await useCase({})

      expect(result.assignedTabGroupIds).toStrictEqual([])
    })

    it('未分類の TabGroup は parentCategoryId を外す', async () => {
      const category = createParentCategory({
        domainNames: ['other.com'],
        domains: [],
        id: 'cat-1',
        name: 'Other',
      })
      const group = createTabGroup({
        domain: 'example.com',
        id: 'group-1',
        parentCategoryId: 'cat-stale',
        urlIds: [],
      })
      const repos = createInMemoryRepositories({
        parentCategories: [category],
        tabGroups: [group],
      })
      const useCase = createSyncCategoryAssignmentsUseCase(repos)

      const result = await useCase({})

      expect(result.unassignedTabGroupIds).toStrictEqual([group.id])
      expect(repos.tabGroups[0]?.parentCategoryId).toBeUndefined()
    })
  })

  describe('command 指定（単一ドメイン同期）', () => {
    it('指定ドメインの TabGroup を該当 ParentCategory に移動し、domainNames を追加する', async () => {
      const category = createParentCategory({
        domainNames: [],
        domains: [],
        id: 'cat-1',
        name: 'Docs',
      })
      const group = createTabGroup({
        domain: 'example.com',
        id: 'group-1',
        urlIds: [],
      })
      const repos = createInMemoryRepositories({
        parentCategories: [category],
        tabGroups: [group],
      })
      const useCase = createSyncCategoryAssignmentsUseCase(repos)

      const result = await useCase({
        command: {
          domain: createDomainName('example.com'),
          parentCategoryId: createParentCategoryId('cat-1'),
        },
      })

      expect(result.assignedTabGroupIds).toStrictEqual([group.id])
      expect(result.updatedCategoryIds).toContain(category.id)
      expect(repos.tabGroups[0]?.parentCategoryId).toBe(category.id)
      expect(repos.parentCategories[0]?.domainNames).toContain('example.com')
    })

    it('他のカテゴリから同じ domainName を取り除く', async () => {
      const oldCategory = createParentCategory({
        domainNames: ['example.com'],
        domains: [],
        id: 'cat-old',
        name: 'Old',
      })
      const newCategory = createParentCategory({
        domainNames: [],
        domains: [],
        id: 'cat-new',
        name: 'New',
      })
      const group = createTabGroup({
        domain: 'example.com',
        id: 'group-1',
        parentCategoryId: 'cat-old',
        urlIds: [],
      })
      const repos = createInMemoryRepositories({
        parentCategories: [oldCategory, newCategory],
        tabGroups: [group],
      })
      const useCase = createSyncCategoryAssignmentsUseCase(repos)

      const result = await useCase({
        command: {
          domain: createDomainName('example.com'),
          parentCategoryId: createParentCategoryId('cat-new'),
        },
      })

      expect(result.assignedTabGroupIds).toStrictEqual([group.id])
      expect(result.unassignedTabGroupIds).toStrictEqual([])
      const oldAfter = repos.parentCategories.find(
        (category) => category.id === oldCategory.id,
      )
      const newAfter = repos.parentCategories.find(
        (category) => category.id === newCategory.id,
      )
      expect(oldAfter?.domainNames).not.toContain('example.com')
      expect(newAfter?.domainNames).toContain('example.com')
    })

    it('バルク同期でカテゴリの domainNames / domains が空のときは同期で自動追加する', async () => {
      const category = createParentCategory({
        domainNames: [],
        domains: [],
        id: 'cat-1',
        name: 'Docs',
      })
      const group = createTabGroup({
        domain: 'example.com',
        id: 'group-1',
        parentCategoryId: 'cat-1',
        urlIds: [],
      })
      const repos = createInMemoryRepositories({
        parentCategories: [category],
        tabGroups: [group],
      })
      const saveSpy = vi.spyOn(repos.parentCategoryRepository, 'saveAll')
      const useCase = createSyncCategoryAssignmentsUseCase(repos)

      const result = await useCase({})

      expect(result.updatedCategoryIds).toContain(category.id)
      expect(saveSpy).toHaveBeenCalled()
    })

    it('バルク同期で group.parentCategoryId が別カテゴリを指していれば付け替える', async () => {
      const category = createParentCategory({
        domainNames: ['example.com'],
        domains: [],
        id: 'cat-1',
        name: 'Docs',
      })
      const group = createTabGroup({
        domain: 'example.com',
        id: 'group-1',
        parentCategoryId: 'cat-stale',
        urlIds: [],
      })
      const repos = createInMemoryRepositories({
        parentCategories: [category],
        tabGroups: [group],
      })
      const useCase = createSyncCategoryAssignmentsUseCase(repos)

      const result = await useCase({})

      // 旧カテゴリ → 新カテゴリへの付け替え
      expect(result.assignedTabGroupIds).toStrictEqual([group.id])
      // 旧 parentCategoryId は一旦未分類扱いになる
      expect(result.unassignedTabGroupIds).toContain(group.id)
    })

    it('バルク同期で categories が空のときは何も保存しない', async () => {
      const group = createTabGroup({
        domain: 'example.com',
        id: 'group-1',
        urlIds: [],
      })
      const repos = createInMemoryRepositories({ tabGroups: [group] })
      const saveSpy = vi.spyOn(repos.tabGroupRepository, 'saveAll')
      const useCase = createSyncCategoryAssignmentsUseCase(repos)

      const result = await useCase({})

      expect(result.assignedTabGroupIds).toStrictEqual([])
      expect(saveSpy).not.toHaveBeenCalled()
    })

    it('バルク同期で category に domains / domainNames の更新が無い場合は save を呼ばない', async () => {
      const category = createParentCategory({
        domainNames: ['example.com'],
        domains: ['group-1'],
        id: 'cat-1',
        name: 'Docs',
      })
      const group = createTabGroup({
        domain: 'example.com',
        id: 'group-1',
        parentCategoryId: 'cat-1',
        urlIds: [],
      })
      const repos = createInMemoryRepositories({
        parentCategories: [category],
        tabGroups: [group],
      })
      const saveTabSpy = vi.spyOn(repos.tabGroupRepository, 'saveAll')
      const saveCatSpy = vi.spyOn(repos.parentCategoryRepository, 'saveAll')
      const useCase = createSyncCategoryAssignmentsUseCase(repos)

      await useCase({})

      expect(saveTabSpy).not.toHaveBeenCalled()
      expect(saveCatSpy).not.toHaveBeenCalled()
    })

    it('command 指定時、対象以外のドメインの TabGroup は変更しない', async () => {
      const targetCategory = createParentCategory({
        domainNames: [],
        domains: [],
        id: 'cat-target',
        name: 'Target',
      })
      const otherCategory = createParentCategory({
        domainNames: ['other.example.com'],
        domains: ['group-other'],
        id: 'cat-other',
        name: 'Other',
      })
      const targetGroup = createTabGroup({
        domain: 'target.example.com',
        id: 'group-target',
        urlIds: [],
      })
      const otherGroup = createTabGroup({
        domain: 'other.example.com',
        id: 'group-other',
        urlIds: [],
      })
      const repos = createInMemoryRepositories({
        parentCategories: [targetCategory, otherCategory],
        tabGroups: [targetGroup, otherGroup],
      })
      const useCase = createSyncCategoryAssignmentsUseCase(repos)

      const result = await useCase({
        command: {
          domain: createDomainName('target.example.com'),
          parentCategoryId: createParentCategoryId('cat-target'),
        },
      })

      // otherGroup は domain が違うので変更なし、assigned にも入らない
      expect(result.assignedTabGroupIds).toStrictEqual([targetGroup.id])
    })

    it('command 指定時、既に同カテゴリの TabGroup は変更しない', async () => {
      const targetCategory = createParentCategory({
        domainNames: [],
        domains: [],
        id: 'cat-target',
        name: 'Target',
      })
      const alreadyGroup = createTabGroup({
        domain: 'example.com',
        id: 'group-1',
        parentCategoryId: 'cat-target',
        urlIds: [],
      })
      const repos = createInMemoryRepositories({
        parentCategories: [targetCategory],
        tabGroups: [alreadyGroup],
      })
      const useCase = createSyncCategoryAssignmentsUseCase(repos)

      const result = await useCase({
        command: {
          domain: createDomainName('example.com'),
          parentCategoryId: createParentCategoryId('cat-target'),
        },
      })

      // 既に cat-target にいるので assigned にも入らない
      expect(result.assignedTabGroupIds).toStrictEqual([])
    })

    it('command 指定時、対象ドメインを持たない他カテゴリはそのまま残す', async () => {
      const targetCategory = createParentCategory({
        domainNames: ['example.com'],
        domains: [],
        id: 'cat-target',
        name: 'Target',
      })
      const oldCategory = createParentCategory({
        domainNames: ['example.com'],
        domains: [],
        id: 'cat-old',
        name: 'Old',
      })
      const unrelatedCategory = createParentCategory({
        domainNames: ['other.com'],
        domains: [],
        id: 'cat-unrelated',
        name: 'Unrelated',
      })
      const group = createTabGroup({
        domain: 'example.com',
        id: 'group-1',
        parentCategoryId: 'cat-old',
        urlIds: [],
      })
      const repos = createInMemoryRepositories({
        parentCategories: [oldCategory, targetCategory, unrelatedCategory],
        tabGroups: [group],
      })
      const useCase = createSyncCategoryAssignmentsUseCase(repos)

      await useCase({
        command: {
          domain: createDomainName('example.com'),
          parentCategoryId: createParentCategoryId('cat-target'),
        },
      })

      // cat-unrelated は example.com を持たないので何も変わらない
      const unrelated = repos.parentCategories.find(
        (category) => category.id === unrelatedCategory.id,
      )
      expect(unrelated?.domainNames).toStrictEqual(['other.com'])
    })

    it('command 指定時、対象カテゴリに既に domainName があり他カテゴリにも無いなら categories を保存しない', async () => {
      const targetCategory = createParentCategory({
        domainNames: ['example.com'],
        domains: [],
        id: 'cat-target',
        name: 'Target',
      })
      const group = createTabGroup({
        domain: 'example.com',
        id: 'group-1',
        parentCategoryId: 'cat-other',
        urlIds: [],
      })
      const repos = createInMemoryRepositories({
        parentCategories: [targetCategory],
        tabGroups: [group],
      })
      const saveCatSpy = vi.spyOn(repos.parentCategoryRepository, 'saveAll')
      const useCase = createSyncCategoryAssignmentsUseCase(repos)

      await useCase({
        command: {
          domain: createDomainName('example.com'),
          parentCategoryId: createParentCategoryId('cat-target'),
        },
      })

      // targetCategory は既に example.com を持つので更新不要
      expect(saveCatSpy).not.toHaveBeenCalled()
    })

    it('存在しない ParentCategoryId を指定すると SavedTabsDomainError を投げる', async () => {
      const repos = createInMemoryRepositories()
      const useCase = createSyncCategoryAssignmentsUseCase(repos)

      await expect(
        useCase({
          command: {
            domain: createDomainName('example.com'),
            parentCategoryId: createParentCategoryId('missing'),
          },
        }),
      ).rejects.toBeInstanceOf(SavedTabsDomainError)
    })
  })
})
