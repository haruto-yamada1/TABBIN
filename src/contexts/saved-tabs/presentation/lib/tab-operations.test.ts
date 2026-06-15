import { beforeEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

import type { CategoriesCommandService } from '@/contexts/saved-tabs/application/ports/CategoriesCommandService'
import type { DomainCategoryMappingRepository } from '@/contexts/saved-tabs/domain/repositories/DomainCategoryMappingRepository'
import type { ParentCategoryRepository } from '@/contexts/saved-tabs/domain/repositories/ParentCategoryRepository'
import type { TabGroupRepository } from '@/contexts/saved-tabs/domain/repositories/TabGroupRepository'
import type { TabGroup } from '@/types/storage'

import { handleTabGroupRemoval } from './tab-operations'

const createTabGroupRepositoryMock = (
  savedTabs: readonly TabGroup[],
): TabGroupRepository =>
  ({
    // eslint-disable-next-line typescript/require-await
    findAll: async () => savedTabs as never,
    // eslint-disable-next-line typescript/require-await
    findById: async () => null,
    // eslint-disable-next-line typescript/require-await
    removeByIds: async () => undefined,
    // eslint-disable-next-line typescript/require-await
    saveAll: async () => undefined,
  }) as unknown as TabGroupRepository

const createParentCategoryRepositoryMock = () => ({
  // eslint-disable-next-line typescript/require-await
  findAll: async () => [],
  // eslint-disable-next-line typescript/require-await
  findById: async () => null,
  // eslint-disable-next-line typescript/require-await
  removeByIds: async () => undefined,
  // eslint-disable-next-line typescript/require-await
  saveAll: vi.fn().mockResolvedValue(undefined),
}) as unknown as ParentCategoryRepository

const createDomainCategoryMappingRepositoryMock = () => ({
  // eslint-disable-next-line typescript/require-await
  findAll: async () => [],
  // eslint-disable-next-line typescript/require-await
  saveAll: vi.fn().mockResolvedValue(undefined),
}) as unknown as DomainCategoryMappingRepository

const createCategoriesCommandServiceMock = (): CategoriesCommandService => ({
  updateDomainCategorySettings: vi.fn().mockResolvedValue(undefined),
})

interface Bundle {
  readonly deps: {
    readonly tabGroupRepository: TabGroupRepository
    readonly parentCategoryRepository: ParentCategoryRepository
    readonly domainCategoryMappingRepository: DomainCategoryMappingRepository
    readonly categoriesCommandService: CategoriesCommandService
  }
}

const createBundle = (savedTabs: readonly TabGroup[]): Bundle => {
  const categoriesCommandService = createCategoriesCommandServiceMock()
  return {
    deps: {
      categoriesCommandService,
      domainCategoryMappingRepository:
        createDomainCategoryMappingRepositoryMock(),
      parentCategoryRepository: createParentCategoryRepositoryMock(),
      tabGroupRepository: createTabGroupRepositoryMock(savedTabs),
    },
  }
}

describe('handleTabGroupRemoval', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('カテゴリ設定とマッピングを永続化する', async () => {
    const { deps } = createBundle([
      {
        id: 'group-1',
        domain: 'example.com',
        parentCategoryId: 'parent-1',
        subCategories: ['Docs'],
        categoryKeywords: [
          {
            categoryName: 'Docs',
            keywords: ['guide'],
          },
        ],
      },
    ])
    await handleTabGroupRemoval('group-1', deps)
    expect(
      deps.categoriesCommandService.updateDomainCategorySettings,
    ).toHaveBeenCalledWith('example.com', ['Docs'], [
      { categoryName: 'Docs', keywords: ['guide'] },
    ])
  })

  it('対象グループが存在しない場合は no-op', async () => {
    const { deps } = createBundle([])
    await handleTabGroupRemoval('missing', deps)
    expect(
      deps.categoriesCommandService.updateDomainCategorySettings,
    ).not.toHaveBeenCalled()
  })

  it('storage エラー時は握りつぶしてログ出力する', async () => {
    const categoriesCommandService = {
      updateDomainCategorySettings: vi
        .fn()
        .mockRejectedValueOnce(new Error('storage failed')),
    } as unknown as CategoriesCommandService
    const { deps } = createBundle([
      { id: 'group-1', domain: 'example.com' },
    ])
    await handleTabGroupRemoval(
      'group-1',
      {
        ...deps,
        categoriesCommandService,
      },
    )
    expect(console.error).toHaveBeenCalledWith(
      'タブグループ削除前処理エラー:',
      expect.any(Error),
    )
  })
})
