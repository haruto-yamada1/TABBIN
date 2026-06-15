// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { BrowserTabPort } from '../../application/ports/BrowserTabPort'
import type { BrowserWindowPort } from '../../application/ports/BrowserWindowPort'
import type { NotificationPort } from '../../application/ports/NotificationPort'
import type { SetCategoryKeywordsPort } from '../../application/ports/SetCategoryKeywordsPort'
import { createCustomProject } from '../../domain/entities/CustomProject'
import type { CustomProject } from '../../domain/entities/CustomProject'
import { createParentCategory } from '../../domain/entities/ParentCategory'
import { createTabGroup } from '../../domain/entities/TabGroup'
import type { TabGroup } from '../../domain/entities/TabGroup'
import { createUrlRecord } from '../../domain/entities/UrlRecord'
import type { CustomProjectRepository } from '../../domain/repositories/CustomProjectRepository'
import type { ParentCategoryRepository } from '../../domain/repositories/ParentCategoryRepository'
import type { TabGroupRepository } from '../../domain/repositories/TabGroupRepository'
import type { UrlRecordRepository } from '../../domain/repositories/UrlRecordRepository'
import { createSavedTabsUseCases } from '../../infrastructure/composition/createSavedTabsUseCases'
import type { SavedTabsUseCasesDeps } from '../../infrastructure/composition/createSavedTabsUseCasesDeps'
import { useDomainModeController } from './useDomainModeController'
import { useSavedTabsController } from './useSavedTabsController'

const createSampleTabGroup = (id: string, domain: string): TabGroup =>
  createTabGroup({
    domain,
    id,
    urlIds: [`url-${id}`],
  })

const createSampleCustomProject = (id: string, name: string): CustomProject =>
  createCustomProject({
    categories: [],
    createdAt: 1,
    id,
    name,
    updatedAt: 1,
    urlIds: [],
  })

interface InMemoryState {
  tabGroups: TabGroup[]
  customProjects: CustomProject[]
}

const createInMemoryRepositories = (initial: Partial<InMemoryState> = {}) => {
  const state: InMemoryState = {
    customProjects: [...(initial.customProjects ?? [])],
    tabGroups: [...(initial.tabGroups ?? [])],
  }
  const tabGroupRepository: TabGroupRepository = {
    // eslint-disable-next-line typescript/require-await
    findAll: async () => state.tabGroups.map((group) => ({ ...group })),
    // eslint-disable-next-line typescript/require-await
    findById: async (id) =>
      state.tabGroups.find((group) => group.id === id) ?? null,
    // eslint-disable-next-line typescript/require-await
    removeByIds: async (ids) => {
      const idSet = new Set(ids)
      state.tabGroups = state.tabGroups.filter((group) => !idSet.has(group.id))
    },
    // eslint-disable-next-line typescript/require-await
    saveAll: async (groups) => {
      state.tabGroups = groups.map((group) => ({ ...group }))
    },
  }
  const customProjectRepository: CustomProjectRepository = {
    // eslint-disable-next-line typescript/require-await
    findAll: async () =>
      state.customProjects.map((project) => ({ ...project })),
    // eslint-disable-next-line typescript/require-await
    findById: async (id) =>
      state.customProjects.find((project) => project.id === id) ?? null,
    // eslint-disable-next-line typescript/require-await
    removeByIds: async (ids) => {
      const idSet = new Set(ids)
      state.customProjects = state.customProjects.filter(
        (project) => !idSet.has(project.id),
      )
    },
    // eslint-disable-next-line typescript/require-await
    saveAll: async (projects) => {
      state.customProjects = projects.map((project) => ({ ...project }))
    },
    // eslint-disable-next-line typescript/require-await
    findOrder: async () => [],
    // eslint-disable-next-line typescript/require-await
    saveOrder: async () => undefined,
  }
  return { customProjectRepository, state, tabGroupRepository }
}

const createEmptyDeps = (
  initialUrlRecords: ReturnType<typeof createUrlRecord>[] = [],
): {
  deps: SavedTabsUseCasesDeps
  openSpy: ReturnType<typeof vi.fn>
  urlRecords: ReturnType<typeof createUrlRecord>[]
} => {
  const urlRecords: ReturnType<typeof createUrlRecord>[] = [
    ...initialUrlRecords,
  ]
  const urlRecordRepository: UrlRecordRepository = {
    // eslint-disable-next-line typescript/require-await
    findAll: async () => urlRecords.map((record) => ({ ...record })),
    // eslint-disable-next-line typescript/require-await
    findById: async (id) =>
      urlRecords.find((record) => record.id === id) ?? null,
    // eslint-disable-next-line typescript/require-await
    removeByIds: async (ids) => {
      const idSet = new Set(ids)
      for (let i = urlRecords.length - 1; i >= 0; i--) {
        if (idSet.has(urlRecords[i]?.id ?? '')) {
          urlRecords.splice(i, 1)
        }
      }
    },
    // eslint-disable-next-line typescript/require-await
    saveAll: async (records) => {
      urlRecords.splice(
        0,
        urlRecords.length,
        ...records.map((record) => ({ ...record })),
      )
    },
  }
  const parentCategoryRepository: ParentCategoryRepository = {
    // eslint-disable-next-line typescript/require-await
    findAll: async () => [],
    // eslint-disable-next-line typescript/require-await
    findById: async () => null,
    // eslint-disable-next-line typescript/require-await
    removeByIds: async () => undefined,
    // eslint-disable-next-line typescript/require-await
    saveAll: async () => undefined,
  }
  const openSpy = vi.fn((input: { url: string }) =>
    Promise.resolve({ url: input.url }),
  )
  const browserTabPort: BrowserTabPort = { open: openSpy }
  const browserWindowPort: BrowserWindowPort = {
    // eslint-disable-next-line typescript/require-await
    openWithUrls: vi.fn(async (input) => ({
      urls: [...input.urls],
    })),
  }
  const notificationPort: NotificationPort = {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  }
  const setCategoryKeywordsPort: SetCategoryKeywordsPort = {
    setCategoryKeywords: vi.fn().mockResolvedValue(undefined),
  }
  return {
    deps: {
      browserTabPort,
      browserWindowPort,
      categoriesCommandService: {
        updateDomainCategorySettings: vi.fn().mockResolvedValue(undefined),
      },
      customProjectRepository:
        createInMemoryRepositories().customProjectRepository,
      customProjectsCommandService: {
        addCategoryToProject: vi.fn().mockResolvedValue(undefined),
        addUrlToCustomProject: vi.fn().mockResolvedValue(undefined),
        moveUrlBetweenCustomProjects: vi.fn().mockResolvedValue(undefined),
        removeCategoryFromProject: vi.fn().mockResolvedValue(undefined),
        removeUrlFromCustomProject: vi.fn().mockResolvedValue(undefined),
        removeUrlIdsFromAllCustomProjects: vi.fn().mockResolvedValue(undefined),
        removeUrlsFromAllCustomProjects: vi.fn().mockResolvedValue(undefined),
        removeUrlsFromCustomProject: vi.fn().mockResolvedValue(undefined),
        renameCategoryInProject: vi.fn().mockResolvedValue(undefined),
        reorderProjectUrls: vi.fn().mockResolvedValue(undefined),
        setUrlCategory: vi.fn().mockResolvedValue(undefined),
        updateCategoryOrder: vi.fn().mockResolvedValue(undefined),
        updateProjectKeywords: vi.fn().mockResolvedValue(undefined),
      },
      domainCategoryMappingRepository: {
        // eslint-disable-next-line typescript/require-await
        findAll: async () => [],
        // eslint-disable-next-line typescript/require-await
        saveAll: async () => undefined,
      },
      domainCategorySettingsRepository: {
        // eslint-disable-next-line typescript/require-await
        findAll: async () => [],
        // eslint-disable-next-line typescript/require-await
        saveAll: async () => undefined,
      },
      migrationPort: {
        migrateParentCategoriesToDomainNames: vi
          .fn()
          .mockResolvedValue(undefined),
        migrateToUrlsStorage: vi.fn().mockResolvedValue(undefined),
      },
      notificationPort,
      parentCategoryRepository,
      setCategoryKeywordsPort,
      storageChangePort: {
        subscribe: () => () => {},
      },
      tabGroupRepository: createInMemoryRepositories().tabGroupRepository,
      urlRecordRepository,
      userSettingsRepository: {
        // eslint-disable-next-line typescript/require-await
        findAll: async () => ({}) as never,
        // eslint-disable-next-line typescript/require-await
        save: async () => undefined,
      },
    },
    openSpy,
    urlRecords,
  }
}

const renderDomainModeController = (input: {
  deps: SavedTabsUseCasesDeps
  initialTabGroups?: readonly TabGroup[]
  initialParentCategories?: ReturnType<typeof createParentCategory>[]
  initialCustomProjects?: readonly CustomProject[]
  passInitialToParent?: boolean
}) => {
  return renderHook(() => {
    const useCases = createSavedTabsUseCases(input.deps)
    const passToParent = input.passInitialToParent ?? true
    const controller = useSavedTabsController({
      deps: input.deps,
      initialCustomProjects: passToParent
        ? input.initialCustomProjects
        : undefined,
      initialTabGroups: passToParent ? input.initialTabGroups : undefined,
      useCases,
    })
    return useDomainModeController({
      controller,
      initialCustomProjects: input.initialCustomProjects,
      initialParentCategories: input.initialParentCategories,
      initialTabGroups: input.initialTabGroups,
    })
  })
}

describe('useDomainModeController', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('initialTabGroups / initialCustomProjects / initialParentCategories を view-model へ反映する', () => {
    const { deps } = createEmptyDeps()
    const groups = [createSampleTabGroup('g1', 'example.com')]
    const projects = [createSampleCustomProject('p1', 'Reading')]
    const categories = [
      createParentCategory({
        domainNames: ['example.com'],
        domains: ['g1'],
        id: 'cat-1',
        name: 'Docs',
      }),
    ]
    const { result } = renderDomainModeController({
      deps,
      initialCustomProjects: projects,
      initialParentCategories: categories,
      initialTabGroups: groups,
    })
    expect(result.current.viewModel.loading).toBe(false)
    expect(result.current.viewModel.tabGroups).toHaveLength(1)
    expect(result.current.viewModel.customProjects).toHaveLength(1)
    expect(result.current.viewModel.categories).toHaveLength(1)
    expect(result.current.viewModel.searchQuery).toBe('')
    expect(result.current.searchQuery).toBe('')
  })

  it('親 view-model が空で initial が指定されていればそれを採用する', () => {
    const { deps } = createEmptyDeps()
    const groups = [createSampleTabGroup('g1', 'example.com')]
    const projects = [createSampleCustomProject('p1', 'Reading')]
    const { result } = renderDomainModeController({
      deps,
      initialCustomProjects: projects,
      initialTabGroups: groups,
      passInitialToParent: false,
    })
    expect(result.current.viewModel.tabGroups).toHaveLength(1)
    expect(result.current.viewModel.customProjects).toHaveLength(1)
    expect(result.current.tabGroups[0]?.domain).toBe('example.com')
    expect(result.current.customProjects[0]?.name).toBe('Reading')
  })

  it('setSearchQuery で view-model の searchQuery が更新される', () => {
    const { deps } = createEmptyDeps()
    const { result } = renderDomainModeController({ deps })
    act(() => {
      result.current.setSearchQuery('example')
    })
    expect(result.current.searchQuery).toBe('example')
    expect(result.current.viewModel.searchQuery).toBe('example')
  })

  it('setParentCategories は categories view-model を更新する', () => {
    const { deps } = createEmptyDeps()
    const { result } = renderDomainModeController({ deps })
    const next = [
      createParentCategory({
        domainNames: ['example.com'],
        domains: ['g1'],
        id: 'cat-2',
        name: 'Work',
      }),
    ]
    act(() => {
      result.current.setParentCategories(next)
    })
    expect(result.current.categories).toHaveLength(1)
    expect(result.current.categories[0]?.id).toBe('cat-2')
  })

  it('openTab は urlRecord が見つかれば openSavedUrl use-case を呼ぶ', async () => {
    const urlRecord = createUrlRecord({
      id: 'url-g1',
      savedAt: 1,
      title: 'example article',
      url: 'https://example.com/article',
    })
    const { deps, openSpy } = createEmptyDeps([urlRecord])
    const { result } = renderDomainModeController({ deps })
    await act(async () => {
      await result.current.openTab('https://example.com/article')
    })
    expect(openSpy).toHaveBeenCalledWith({ url: 'https://example.com/article' })
  })

  it('openTab は urlRecord が見つからなければ browserTabPort.open を呼ぶ', async () => {
    const { deps, openSpy } = createEmptyDeps()
    const { result } = renderDomainModeController({ deps })
    await act(async () => {
      await result.current.openTab('https://unknown.example')
    })
    expect(openSpy).toHaveBeenCalledWith({ url: 'https://unknown.example' })
  })

  it('openAllTabs が空配列なら port を呼ばない', async () => {
    const { deps, openSpy } = createEmptyDeps()
    const { result } = renderDomainModeController({ deps })
    await act(async () => {
      await result.current.openAllTabs([], {
        openAllInNewWindow: false,
        openUrlInBackground: false,
      })
    })
    expect(openSpy).not.toHaveBeenCalled()
  })

  it('openAllTabs は各 URL を port 経由で 1 つずつ開く', async () => {
    const { deps, openSpy } = createEmptyDeps()
    const { result } = renderDomainModeController({ deps })
    await act(async () => {
      await result.current.openAllTabs(
        [
          { title: 'a', url: 'https://a.example' },
          { title: 'b', url: 'https://b.example' },
        ],
        { openAllInNewWindow: false, openUrlInBackground: false },
      )
    })
    expect(openSpy).toHaveBeenCalledTimes(2)
    expect(openSpy).toHaveBeenNthCalledWith(1, { url: 'https://a.example' })
    expect(openSpy).toHaveBeenNthCalledWith(2, { url: 'https://b.example' })
  })

  it('openAllTabs は openAllInNewWindow=true でも port 経由で順次開く', async () => {
    const { deps, openSpy } = createEmptyDeps()
    const { result } = renderDomainModeController({ deps })
    await act(async () => {
      await result.current.openAllTabs(
        [
          { title: 'a', url: 'https://a.example' },
          { title: 'b', url: 'https://b.example' },
        ],
        { openAllInNewWindow: true, openUrlInBackground: false },
      )
    })
    expect(openSpy).toHaveBeenCalledTimes(2)
  })

  it('deleteGroup / deleteGroups は use-case に委譲する', async () => {
    const { deps } = createEmptyDeps()
    const inMemory = createInMemoryRepositories({
      tabGroups: [
        createSampleTabGroup('g1', 'example.com'),
        createSampleTabGroup('g2', 'news.example'),
      ],
    })
    const overrideDeps: SavedTabsUseCasesDeps = {
      ...deps,
      customProjectRepository: inMemory.customProjectRepository,
      tabGroupRepository: inMemory.tabGroupRepository,
    }
    const { result } = renderDomainModeController({ deps: overrideDeps })
    await act(async () => {
      await result.current.deleteGroup('g1')
    })
    expect(result.current.viewModel.tabGroups).toHaveLength(1)
    await act(async () => {
      await result.current.deleteGroups(['g2'])
    })
    expect(result.current.viewModel.tabGroups).toHaveLength(0)
  })

  it('refresh は親 controller の refresh をそのまま返す', async () => {
    const { deps } = createEmptyDeps()
    const inMemory = createInMemoryRepositories({
      tabGroups: [createSampleTabGroup('g1', 'example.com')],
    })
    const overrideDeps: SavedTabsUseCasesDeps = {
      ...deps,
      customProjectRepository: inMemory.customProjectRepository,
      tabGroupRepository: inMemory.tabGroupRepository,
    }
    const { result } = renderDomainModeController({ deps: overrideDeps })
    await act(async () => {
      await result.current.refresh()
    })
    expect(result.current.viewModel.tabGroups).toHaveLength(1)
  })
})
