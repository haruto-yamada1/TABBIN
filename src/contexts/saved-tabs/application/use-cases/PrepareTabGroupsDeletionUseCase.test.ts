import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { CategoriesCommandService } from '@/contexts/saved-tabs/application/ports/CategoriesCommandService'
import type { SavedTabRawSummaryDto } from '@/contexts/saved-tabs/domain/dto/SavedTabRawSummaryDto'
import type { DomainCategoryMappingRepository } from '@/contexts/saved-tabs/domain/repositories/DomainCategoryMappingRepository'
import type { ParentCategoryRepository } from '@/contexts/saved-tabs/domain/repositories/ParentCategoryRepository'
import type { TabGroupRepository } from '@/contexts/saved-tabs/domain/repositories/TabGroupRepository'
import { createTabGroupId } from '@/contexts/saved-tabs/domain/value-objects/TabGroupId'
import { createTabGroup } from '@/contexts/saved-tabs/testing/createCurrentCollectionFixtures'

import { createPrepareTabGroupsDeletionUseCase } from './PrepareTabGroupsDeletionUseCase'
import type { PrepareTabGroupsDeletionUseCaseDeps } from './PrepareTabGroupsDeletionUseCase'

const createBundle = (
  summaries: readonly SavedTabRawSummaryDto[],
): {
  readonly deps: PrepareTabGroupsDeletionUseCaseDeps
  readonly findRawTabGroupById: ReturnType<typeof vi.fn>
  readonly updateCollectionCategories: ReturnType<typeof vi.fn>
} => {
  const findRawTabGroupById = vi.fn(
    // eslint-disable-next-line typescript/require-await -- Promise contract は TabGroupRepository 側で必須
    async (id: Parameters<TabGroupRepository['findRawTabGroupById']>[0]) => {
      const idString = id as unknown as string
      return summaries.find((entry) => entry.id === idString) ?? null
    },
  )
  const updateCollectionCategories = vi.fn(
    // eslint-disable-next-line typescript/require-await -- Promise contract は CategoriesCommandService 側で必須
    async (): Promise<void> => undefined,
  )
  const deps: PrepareTabGroupsDeletionUseCaseDeps = {
    categoriesCommandService: {
      updateCollectionCategories,
    } as unknown as CategoriesCommandService,
    domainCategoryMappingRepository: {
      findAll: vi.fn(async () => []),

      saveAll: vi.fn(async () => undefined),
    } as unknown as DomainCategoryMappingRepository,
    parentCategoryRepository: {
      findAll: vi.fn(async () => []),

      findById: vi.fn(async () => null),

      removeByIds: vi.fn(async () => undefined),

      saveAll: vi.fn(async () => undefined),
    } as unknown as ParentCategoryRepository,
    tabGroupRepository: {
      findAll: vi.fn(async () => []),

      findById: vi.fn(async () => null),

      findRawDomainById: vi.fn(async () => null),
      findRawTabGroupById,

      removeByIds: vi.fn(async () => undefined),

      saveAll: vi.fn(async () => undefined),
    } as unknown as TabGroupRepository,
  }
  return { deps, findRawTabGroupById, updateCollectionCategories }
}

describe('createPrepareTabGroupsDeletionUseCase', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('複数 ID を順次処理して各々で updateDomainCategorySettings を呼ぶ', async () => {
    const groups = [
      createTabGroup({
        categoryKeywords: [],
        domain: 'a.example.com',
        id: 'group-1',
        subCategories: ['Docs'],
      }),
      createTabGroup({
        categoryKeywords: [],
        domain: 'b.example.com',
        id: 'group-2',
        subCategories: ['News'],
      }),
    ]
    const { deps, updateCollectionCategories } = createBundle(groups)
    const useCase = createPrepareTabGroupsDeletionUseCase(deps)
    await useCase({
      tabGroupIds: [createTabGroupId('group-1'), createTabGroupId('group-2')],
    })
    expect(updateCollectionCategories).toHaveBeenCalledTimes(2)
    expect(updateCollectionCategories).toHaveBeenNthCalledWith(
      1,
      groups[0]?.collection,
      groups[0]?.collectionCategories,
    )
    expect(updateCollectionCategories).toHaveBeenNthCalledWith(
      2,
      groups[1]?.collection,
      groups[1]?.collectionCategories,
    )
  })

  it('tabGroupIds が空の場合は副作用を呼ばない', async () => {
    const { deps, updateCollectionCategories } = createBundle([])
    const useCase = createPrepareTabGroupsDeletionUseCase(deps)
    await useCase({ tabGroupIds: [] })
    expect(updateCollectionCategories).not.toHaveBeenCalled()
  })
})
