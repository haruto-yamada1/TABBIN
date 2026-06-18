import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { DomainCategoryMappingDto } from '../../domain/dto/DomainCategoryMappingDto'
import type { SavedTabRawSummaryDto } from '../../domain/dto/SavedTabRawSummaryDto'
import type { DomainCategoryMappingRepository } from '../../domain/repositories/DomainCategoryMappingRepository'
import type { ParentCategoryRepository } from '../../domain/repositories/ParentCategoryRepository'
import type { TabGroupRepository } from '../../domain/repositories/TabGroupRepository'
import { createTabGroupId } from '../../domain/value-objects/TabGroupId'
import type { CategoriesCommandService } from '../ports/CategoriesCommandService'
import { createPrepareTabGroupDeletionUseCase } from './PrepareTabGroupDeletionUseCase'
import type { PrepareTabGroupDeletionUseCaseDeps } from './PrepareTabGroupDeletionUseCase'

const createTabGroupRepositoryMock = (
  summaries: readonly SavedTabRawSummaryDto[],
): {
  readonly repository: TabGroupRepository
  readonly findRawTabGroupById: ReturnType<typeof vi.fn>
} => {
  const findRawTabGroupById = vi.fn(
    // eslint-disable-next-line typescript/require-await -- Promise contract は TabGroupRepository 側で必須
    async (id: Parameters<TabGroupRepository['findRawTabGroupById']>[0]) => {
      const idString = id as unknown as string
      return summaries.find((entry) => entry.id === idString) ?? null
    },
  )
  const repository = {
    // eslint-disable-next-line typescript/require-await -- Promise contract は TabGroupRepository 側で必須
    findAll: vi.fn(async () => []),
    // eslint-disable-next-line typescript/require-await -- Promise contract は TabGroupRepository 側で必須
    findById: vi.fn(async () => null),
    // eslint-disable-next-line typescript/require-await -- Promise contract は TabGroupRepository 側で必須
    findRawDomainById: vi.fn(async () => null),
    findRawTabGroupById,
    // eslint-disable-next-line typescript/require-await -- Promise contract は TabGroupRepository 側で必須
    removeByIds: vi.fn(async () => undefined),
    // eslint-disable-next-line typescript/require-await -- Promise contract は TabGroupRepository 側で必須
    saveAll: vi.fn(async () => undefined),
  } as unknown as TabGroupRepository
  return { repository, findRawTabGroupById }
}

const createParentCategoryRepositoryMock = (
  initial: readonly {
    readonly id: string
    readonly domainNames: string[]
    readonly domains: string[]
  }[] = [],
): {
  readonly repository: ParentCategoryRepository
  readonly saveAll: ReturnType<typeof vi.fn>
} => {
  let store = initial.map((category) => ({ ...category }))
  const saveAll = vi.fn(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- mock 副作用テストのため
    async (_next: Parameters<ParentCategoryRepository['saveAll']>[0]) => {
      store = initial.map((category) => ({ ...category }))
    },
  )
  const repository = {
    // eslint-disable-next-line typescript/require-await -- Promise contract は ParentCategoryRepository 側で必須
    findAll: vi.fn(async () =>
      store.map((category) => ({
        domainNames: [...category.domainNames],
        domains: category.domains as never,
        id: category.id as never,
        name: '',
      })),
    ),
    // eslint-disable-next-line typescript/require-await -- Promise contract は ParentCategoryRepository 側で必須
    findById: vi.fn(async () => null),
    saveAll,
    // eslint-disable-next-line typescript/require-await -- Promise contract は ParentCategoryRepository 側で必須
    removeByIds: vi.fn(async () => undefined),
  } as unknown as ParentCategoryRepository
  return { repository, saveAll }
}

const createDomainCategoryMappingRepositoryMock = (
  initial: readonly DomainCategoryMappingDto[] = [],
): {
  readonly repository: DomainCategoryMappingRepository
  readonly saveAll: ReturnType<typeof vi.fn>
} => {
  // eslint-disable-next-line typescript/require-await -- Promise contract は DomainCategoryMappingRepository 側で必須
  const saveAll = vi.fn(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- mock 副作用テストのため
    async (
      _next: Parameters<DomainCategoryMappingRepository['saveAll']>[0],
    ) => {
      // no-op mock
    },
  )
  const repository = {
    // eslint-disable-next-line typescript/require-await -- Promise contract は DomainCategoryMappingRepository 側で必須
    findAll: vi.fn(async () => initial),
    saveAll,
  } as unknown as DomainCategoryMappingRepository
  return { repository, saveAll }
}

const createCategoriesCommandServiceMock = (): {
  readonly service: CategoriesCommandService
  readonly updateDomainCategorySettings: ReturnType<typeof vi.fn>
} => {
  const updateDomainCategorySettings = vi.fn(
    // eslint-disable-next-line typescript/require-await -- Promise contract は CategoriesCommandService 側で必須
    async (): Promise<void> => undefined,
  )
  const service = {
    updateDomainCategorySettings,
  } as unknown as CategoriesCommandService
  return { service, updateDomainCategorySettings }
}

interface Bundle {
  readonly deps: PrepareTabGroupDeletionUseCaseDeps
  readonly tabGroupRepository: TabGroupRepository
  readonly parentCategoryRepository: ParentCategoryRepository
  readonly domainCategoryMappingRepository: DomainCategoryMappingRepository
  readonly categoriesCommandService: CategoriesCommandService
  readonly findRawTabGroupById: ReturnType<typeof vi.fn>
  readonly parentSaveAll: ReturnType<typeof vi.fn>
  readonly mappingSaveAll: ReturnType<typeof vi.fn>
  readonly updateDomainCategorySettings: ReturnType<typeof vi.fn>
}

const createBundle = (
  summaries: readonly SavedTabRawSummaryDto[],
  options: {
    readonly parentInitial?: readonly {
      readonly id: string
      readonly domainNames: string[]
      readonly domains: string[]
    }[]
    readonly mappingsInitial?: readonly DomainCategoryMappingDto[]
    readonly categoriesCommandService?: CategoriesCommandService
  } = {},
): Bundle => {
  const tabGroup = createTabGroupRepositoryMock(summaries)
  const parent = createParentCategoryRepositoryMock(options.parentInitial ?? [])
  const mapping = createDomainCategoryMappingRepositoryMock(
    options.mappingsInitial ?? [],
  )
  const categories = options.categoriesCommandService
    ? {
        service: options.categoriesCommandService,
        updateDomainCategorySettings: vi.fn(),
      }
    : createCategoriesCommandServiceMock()
  return {
    categoriesCommandService: categories.service,
    deps: {
      categoriesCommandService: categories.service,
      domainCategoryMappingRepository: mapping.repository,
      parentCategoryRepository: parent.repository,
      tabGroupRepository: tabGroup.repository,
    },
    domainCategoryMappingRepository: mapping.repository,
    findRawTabGroupById: tabGroup.findRawTabGroupById,
    mappingSaveAll: mapping.saveAll,
    parentCategoryRepository: parent.repository,
    parentSaveAll: parent.saveAll,
    tabGroupRepository: tabGroup.repository,
    updateDomainCategorySettings: categories.updateDomainCategorySettings,
  }
}

describe('createPrepareTabGroupDeletionUseCase', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('カテゴリ設定とマッピングを永続化する', async () => {
    const { deps, updateDomainCategorySettings } = createBundle([
      {
        categoryKeywords: [
          {
            categoryName: 'Docs',
            keywords: ['guide'],
          },
        ],
        domain: 'example.com',
        id: 'group-1',
        parentCategoryId: 'parent-1',
        subCategories: ['Docs'],
      },
    ])
    const useCase = createPrepareTabGroupDeletionUseCase(deps)
    await useCase({ tabGroupId: createTabGroupId('group-1') })
    expect(updateDomainCategorySettings).toHaveBeenCalledWith(
      'example.com',
      ['Docs'],
      [{ categoryName: 'Docs', keywords: ['guide'] }],
    )
  })

  it('対象グループが存在しない場合は no-op', async () => {
    const { deps, updateDomainCategorySettings } = createBundle([])
    const useCase = createPrepareTabGroupDeletionUseCase(deps)
    await useCase({ tabGroupId: createTabGroupId('missing') })
    expect(updateDomainCategorySettings).not.toHaveBeenCalled()
  })

  it('parentCategoryId 未設定なら domainNames 追加と mapping 更新は skip', async () => {
    const { deps, parentSaveAll, mappingSaveAll } = createBundle(
      [
        {
          categoryKeywords: [],
          domain: 'example.com',
          id: 'group-1',
          parentCategoryId: undefined,
          subCategories: ['Docs'],
        },
      ],
      {
        mappingsInitial: [{ categoryId: 'parent-x', domain: 'example.com' }],
        parentInitial: [
          { domainNames: ['a.com'], domains: [], id: 'parent-1' },
        ],
      },
    )
    const useCase = createPrepareTabGroupDeletionUseCase(deps)
    await useCase({ tabGroupId: createTabGroupId('group-1') })
    expect(parentSaveAll).not.toHaveBeenCalled()
    expect(mappingSaveAll).not.toHaveBeenCalled()
  })

  it('domainNames に domain が未登録なら parentCategoryRepository.saveAll が呼ばれる', async () => {
    const { deps, parentSaveAll } = createBundle(
      [
        {
          categoryKeywords: [],
          domain: 'example.com',
          id: 'group-1',
          parentCategoryId: 'parent-1',
          subCategories: ['Docs'],
        },
      ],
      {
        parentInitial: [
          { domainNames: ['a.com'], domains: ['g-1'], id: 'parent-1' },
        ],
      },
    )
    const useCase = createPrepareTabGroupDeletionUseCase(deps)
    await useCase({ tabGroupId: createTabGroupId('group-1') })
    expect(parentSaveAll).toHaveBeenCalledTimes(1)
  })

  it('storage エラー時は握りつぶしてログ出力する', async () => {
    const categoriesCommandService: CategoriesCommandService = {
      updateDomainCategorySettings: vi
        .fn()
        .mockRejectedValueOnce(new Error('storage failed')),
    }
    const { deps } = createBundle(
      [
        {
          categoryKeywords: [],
          domain: 'example.com',
          id: 'group-1',
          parentCategoryId: undefined,
          subCategories: [],
        },
      ],
      { categoriesCommandService },
    )
    const useCase = createPrepareTabGroupDeletionUseCase(deps)
    await useCase({ tabGroupId: createTabGroupId('group-1') })
    expect(console.error).toHaveBeenCalledWith(
      'タブグループ削除前処理エラー:',
      expect.any(Error),
    )
  })
})
