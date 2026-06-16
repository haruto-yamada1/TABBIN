import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { SavedTabRawSummaryDto } from '../../domain/dto/SavedTabRawSummaryDto'
import type { DomainCategoryMappingRepository } from '../../domain/repositories/DomainCategoryMappingRepository'
import type { ParentCategoryRepository } from '../../domain/repositories/ParentCategoryRepository'
import type { TabGroupRepository } from '../../domain/repositories/TabGroupRepository'
import { createTabGroupId } from '../../domain/value-objects/TabGroupId'
import type { CategoriesCommandService } from '../ports/CategoriesCommandService'
import { createPrepareTabGroupsDeletionUseCase } from './PrepareTabGroupsDeletionUseCase'
import type { PrepareTabGroupsDeletionUseCaseDeps } from './PrepareTabGroupsDeletionUseCase'

const createBundle = (
  summaries: readonly SavedTabRawSummaryDto[],
): {
  readonly deps: PrepareTabGroupsDeletionUseCaseDeps
  readonly findRawTabGroupById: ReturnType<typeof vi.fn>
  readonly updateDomainCategorySettings: ReturnType<typeof vi.fn>
} => {
  const findRawTabGroupById = vi.fn(
    // eslint-disable-next-line typescript/require-await -- Promise contract は TabGroupRepository 側で必須
    async (id: Parameters<TabGroupRepository['findRawTabGroupById']>[0]) => {
      const idString = id as unknown as string
      return summaries.find((entry) => entry.id === idString) ?? null
    },
  )
  const updateDomainCategorySettings = vi.fn(
    // eslint-disable-next-line typescript/require-await -- Promise contract は CategoriesCommandService 側で必須
    async (): Promise<void> => undefined,
  )
  const deps: PrepareTabGroupsDeletionUseCaseDeps = {
    categoriesCommandService: {
      updateDomainCategorySettings,
    } as unknown as CategoriesCommandService,
    domainCategoryMappingRepository: {
      // eslint-disable-next-line @typescript-eslint/require-await, typescript/require-await
      findAll: vi.fn(async () => []),
      // eslint-disable-next-line @typescript-eslint/require-await, typescript/require-await
      saveAll: vi.fn(async () => undefined),
    } as unknown as DomainCategoryMappingRepository,
    parentCategoryRepository: {
      // eslint-disable-next-line @typescript-eslint/require-await, typescript/require-await
      findAll: vi.fn(async () => []),
      // eslint-disable-next-line @typescript-eslint/require-await, typescript/require-await
      findById: vi.fn(async () => null),
      // eslint-disable-next-line @typescript-eslint/require-await, typescript/require-await
      removeByIds: vi.fn(async () => undefined),
      // eslint-disable-next-line @typescript-eslint/require-await, typescript/require-await
      saveAll: vi.fn(async () => undefined),
    } as unknown as ParentCategoryRepository,
    tabGroupRepository: {
      // eslint-disable-next-line @typescript-eslint/require-await, typescript/require-await
      findAll: vi.fn(async () => []),
      // eslint-disable-next-line @typescript-eslint/require-await, typescript/require-await
      findById: vi.fn(async () => null),
      // eslint-disable-next-line @typescript-eslint/require-await, typescript/require-await
      findRawDomainById: vi.fn(async () => null),
      findRawTabGroupById,
      // eslint-disable-next-line @typescript-eslint/require-await, typescript/require-await
      removeByIds: vi.fn(async () => undefined),
      // eslint-disable-next-line @typescript-eslint/require-await, typescript/require-await
      saveAll: vi.fn(async () => undefined),
    } as unknown as TabGroupRepository,
  }
  return { deps, findRawTabGroupById, updateDomainCategorySettings }
}

describe('createPrepareTabGroupsDeletionUseCase', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('複数 ID を順次処理して各々で updateDomainCategorySettings を呼ぶ', async () => {
    const { deps, updateDomainCategorySettings } = createBundle([
      {
        categoryKeywords: [],
        domain: 'a.example.com',
        id: 'group-1',
        parentCategoryId: undefined,
        subCategories: ['Docs'],
      },
      {
        categoryKeywords: [],
        domain: 'b.example.com',
        id: 'group-2',
        parentCategoryId: undefined,
        subCategories: ['News'],
      },
    ])
    const useCase = createPrepareTabGroupsDeletionUseCase(deps)
    await useCase({
      tabGroupIds: [createTabGroupId('group-1'), createTabGroupId('group-2')],
    })
    expect(updateDomainCategorySettings).toHaveBeenCalledTimes(2)
    expect(updateDomainCategorySettings).toHaveBeenNthCalledWith(
      1,
      'a.example.com',
      ['Docs'],
      [],
    )
    expect(updateDomainCategorySettings).toHaveBeenNthCalledWith(
      2,
      'b.example.com',
      ['News'],
      [],
    )
  })

  it('tabGroupIds が空の場合は副作用を呼ばない', async () => {
    const { deps, updateDomainCategorySettings } = createBundle([])
    const useCase = createPrepareTabGroupsDeletionUseCase(deps)
    await useCase({ tabGroupIds: [] })
    expect(updateDomainCategorySettings).not.toHaveBeenCalled()
  })
})
