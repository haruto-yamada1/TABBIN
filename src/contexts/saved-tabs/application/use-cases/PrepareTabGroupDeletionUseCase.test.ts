import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { CategoriesCommandService } from '@/contexts/saved-tabs/application/ports/CategoriesCommandService'
import { createParentCategory } from '@/contexts/saved-tabs/domain/entities/ParentCategory'
import type { TabGroup } from '@/contexts/saved-tabs/domain/entities/TabGroup'
import type { DomainCategoryMappingRepository } from '@/contexts/saved-tabs/domain/repositories/DomainCategoryMappingRepository'
import type { ParentCategoryRepository } from '@/contexts/saved-tabs/domain/repositories/ParentCategoryRepository'
import type { TabGroupRepository } from '@/contexts/saved-tabs/domain/repositories/TabGroupRepository'
import { createTabGroupId } from '@/contexts/saved-tabs/domain/value-objects/TabGroupId'
import { createTabGroup } from '@/contexts/saved-tabs/testing/createCurrentCollectionFixtures'

import { createPrepareTabGroupDeletionUseCase } from './PrepareTabGroupDeletionUseCase'

const createBundle = ({
  categoriesFailure,
  groups = [],
  parents = [],
}: {
  readonly categoriesFailure?: Error
  readonly groups?: readonly TabGroup[]
  readonly parents?: readonly ReturnType<typeof createParentCategory>[]
} = {}) => {
  const updateCollectionCategories = categoriesFailure
    ? vi.fn(async () => {
        throw categoriesFailure
      })
    : vi.fn(async () => {})
  const categoriesCommandService: CategoriesCommandService = {
    updateCollectionCategories,
  }
  const parentSaveAll = vi.fn(async () => {})
  const parentCategoryRepository: ParentCategoryRepository = {
    findAll: vi.fn(async () => parents),
    findById: vi.fn(
      async (id) => parents.find((parent) => parent.id === id) ?? null,
    ),
    removeByIds: vi.fn(async () => {}),
    saveAll: parentSaveAll,
  }
  const mappingSaveAll = vi.fn(async () => {})
  const domainCategoryMappingRepository: DomainCategoryMappingRepository = {
    findAll: vi.fn(async () => []),
    saveAll: mappingSaveAll,
  }
  const tabGroupRepository = {
    findAll: vi.fn(async () => groups),
    findById: vi.fn(async () => null),
    findRawDomainById: vi.fn(async () => null),
    findRawTabGroupById: vi.fn(
      async (id) => groups.find((group) => group.id === id) ?? null,
    ),
    removeByIds: vi.fn(async () => {}),
    saveAll: vi.fn(async () => {}),
  } as TabGroupRepository
  return {
    deps: {
      categoriesCommandService,
      domainCategoryMappingRepository,
      parentCategoryRepository,
      tabGroupRepository,
    },
    mappingSaveAll,
    parentSaveAll,
    updateCollectionCategories,
  }
}

describe('createPrepareTabGroupDeletionUseCase', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('current collectionとcategoriesをcommand portへ永続化する', async () => {
    const group = createTabGroup({
      categoryKeywords: [{ categoryName: 'Docs', keywords: ['guide'] }],
      domain: 'example.com',
      id: 'group-1',
      subCategories: ['Docs'],
    })
    const bundle = createBundle({ groups: [group] })
    const useCase = createPrepareTabGroupDeletionUseCase(bundle.deps)

    await useCase({ tabGroupId: createTabGroupId('group-1') })

    expect(bundle.updateCollectionCategories).toHaveBeenCalledWith(
      group.collection,
      group.collectionCategories,
    )
  })

  it('対象groupが存在しなければ副作用を起こさない', async () => {
    const bundle = createBundle()
    const useCase = createPrepareTabGroupDeletionUseCase(bundle.deps)

    await useCase({ tabGroupId: createTabGroupId('missing') })

    expect(bundle.updateCollectionCategories).not.toHaveBeenCalled()
    expect(bundle.parentSaveAll).not.toHaveBeenCalled()
    expect(bundle.mappingSaveAll).not.toHaveBeenCalled()
  })

  it('collection groupIdがなければparentとmapping更新をskipする', async () => {
    const group = createTabGroup({ domain: 'example.com', id: 'group-1' })
    const bundle = createBundle({ groups: [group] })
    const useCase = createPrepareTabGroupDeletionUseCase(bundle.deps)

    await useCase({ tabGroupId: createTabGroupId('group-1') })

    expect(bundle.parentSaveAll).not.toHaveBeenCalled()
    expect(bundle.mappingSaveAll).not.toHaveBeenCalled()
  })

  it('parentにcollection referenceがなければreferenceとmappingを追加する', async () => {
    const group = createTabGroup({
      domain: 'example.com',
      id: 'group-1',
      parentCategoryId: 'parent-1',
    })
    const parent = createParentCategory({
      collections: [{ domain: 'other.com', id: 'other-group' }],
      id: 'parent-1',
      name: 'Docs',
    })
    const bundle = createBundle({ groups: [group], parents: [parent] })
    const useCase = createPrepareTabGroupDeletionUseCase(bundle.deps)

    await useCase({ tabGroupId: createTabGroupId('group-1') })

    expect(bundle.parentSaveAll).toHaveBeenCalledWith([
      expect.objectContaining({
        collections: [
          { domain: 'other.com', id: 'other-group' },
          { domain: 'example.com', id: 'group-1' },
        ],
      }),
    ])
    expect(bundle.mappingSaveAll).toHaveBeenCalledWith([
      { categoryId: 'parent-1', domain: 'example.com' },
    ])
  })

  it('port failureを削除前処理から伝播させずlogする', async () => {
    const group = createTabGroup({ id: 'group-1' })
    const bundle = createBundle({
      categoriesFailure: new Error('storage failed'),
      groups: [group],
    })
    const useCase = createPrepareTabGroupDeletionUseCase(bundle.deps)

    await expect(
      useCase({ tabGroupId: createTabGroupId('group-1') }),
    ).resolves.toBeUndefined()
    expect(console.error).toHaveBeenCalledWith(
      'タブグループ削除前処理エラー:',
      expect.any(Error),
    )
  })
})
