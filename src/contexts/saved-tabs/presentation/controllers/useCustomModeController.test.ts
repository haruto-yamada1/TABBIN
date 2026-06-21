// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createSavedTabsUseCases } from '@/contexts/saved-tabs/application/createSavedTabsUseCases'
import type { BrowserTabPort } from '@/contexts/saved-tabs/application/ports/BrowserTabPort'
import type { BrowserWindowPort } from '@/contexts/saved-tabs/application/ports/BrowserWindowPort'
import type { NotificationPort } from '@/contexts/saved-tabs/application/ports/NotificationPort'
import type { SetCategoryKeywordsPort } from '@/contexts/saved-tabs/application/ports/SetCategoryKeywordsPort'
import type { SavedTabsUseCasesDeps } from '@/contexts/saved-tabs/application/SavedTabsUseCasesDeps'
import { createCustomProject } from '@/contexts/saved-tabs/domain/entities/CustomProject'
import type { CustomProject } from '@/contexts/saved-tabs/domain/entities/CustomProject'
import { createUrlRecord } from '@/contexts/saved-tabs/domain/entities/UrlRecord'
import type { CustomProjectRepository } from '@/contexts/saved-tabs/domain/repositories/CustomProjectRepository'
import type { ParentCategoryRepository } from '@/contexts/saved-tabs/domain/repositories/ParentCategoryRepository'
import type { TabGroupRepository } from '@/contexts/saved-tabs/domain/repositories/TabGroupRepository'
import type { UrlRecordRepository } from '@/contexts/saved-tabs/domain/repositories/UrlRecordRepository'

import { useCustomModeController } from './useCustomModeController'
import { useSavedTabsController } from './useSavedTabsController'

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
  customProjects: CustomProject[]
}

const createInMemoryRepositories = (initial: Partial<InMemoryState> = {}) => {
  const state: InMemoryState = {
    customProjects: [...(initial.customProjects ?? [])],
  }
  const customProjectRepository: CustomProjectRepository = {
    findAll: async () =>
      state.customProjects.map((project) => ({ ...project })),

    findById: async (id) =>
      state.customProjects.find((project) => project.id === id) ?? null,

    removeByIds: async (ids) => {
      const idSet = new Set(ids)
      state.customProjects = state.customProjects.filter(
        (project) => !idSet.has(project.id),
      )
    },

    saveAll: async (projects) => {
      state.customProjects = projects.map((project) => ({ ...project }))
    },

    findOrder: async () => [],

    saveOrder: async () => undefined,
  }
  return { customProjectRepository, state }
}

const createEmptyDeps = (
  initialUrlRecords: ReturnType<typeof createUrlRecord>[] = [],
): {
  deps: SavedTabsUseCasesDeps
  openSpy: ReturnType<typeof vi.fn>
} => {
  const urlRecords: ReturnType<typeof createUrlRecord>[] = [
    ...initialUrlRecords,
  ]
  const urlRecordRepository: UrlRecordRepository = {
    findAll: async () => urlRecords.map((record) => ({ ...record })),

    findById: async (id) =>
      urlRecords.find((record) => record.id === id) ?? null,

    removeByIds: async (ids) => {
      const idSet = new Set(ids)
      for (let i = urlRecords.length - 1; i >= 0; i--) {
        if (idSet.has(urlRecords[i]?.id ?? '')) {
          urlRecords.splice(i, 1)
        }
      }
    },

    saveAll: async (records) => {
      urlRecords.splice(
        0,
        urlRecords.length,
        ...records.map((record) => ({ ...record })),
      )
    },
  }
  const parentCategoryRepository: ParentCategoryRepository = {
    findAll: async () => [],

    findById: async () => null,

    removeByIds: async () => undefined,

    saveAll: async () => undefined,
  }
  const tabGroupRepository: TabGroupRepository = {
    findAll: async () => [],

    findById: async () => null,

    findRawDomainById: async () => null,

    findRawTabGroupById: async () => null,

    removeByIds: async () => undefined,

    saveAll: async () => undefined,
  }
  const openSpy = vi.fn(async (input: { url: string }) => ({ url: input.url }))
  const browserTabPort: BrowserTabPort = { open: openSpy }
  const browserWindowPort: BrowserWindowPort = {
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
      categoryAssignmentPort: {
        saveParentCategories: vi.fn().mockResolvedValue(undefined),
        saveTabGroups: vi.fn().mockResolvedValue(undefined),
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
        findAll: async () => [],

        saveAll: async () => undefined,
      },
      domainCategorySettingsRepository: {
        findAll: async () => [],

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
      removeSubCategoryFromTabGroupPort: {
        removeSubCategoryFromTabGroup: vi.fn().mockResolvedValue([]),
      },
      setCategoryKeywordsPort,
      storageChangePort: {
        subscribe: () => () => {},
      },
      messagingPort: {
        send: vi.fn().mockResolvedValue(undefined),
      },
      tabGroupRepository,
      urlRecordRepository,
      userSettingsRepository: {
        findAll: async () => ({}) as never,

        save: async () => undefined,
      },
    },
    openSpy,
  }
}

const renderCustomModeController = (input: {
  deps: SavedTabsUseCasesDeps
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
      useCases,
    })
    return useCustomModeController({
      controller,
      initialCustomProjects: input.initialCustomProjects,
    })
  })
}

describe('useCustomModeController', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('initialCustomProjects を view-model へ反映する', () => {
    const { deps } = createEmptyDeps()
    const projects = [createSampleCustomProject('p1', 'Reading')]
    const { result } = renderCustomModeController({
      deps,
      initialCustomProjects: projects,
    })
    // 親 controller は initialTabGroups 未指定でも `loading: true` を返すため、
    // 子 controller もそれを伝播する。projects は view-model へ反映済み。
    expect(result.current.viewModel.loading).toBe(true)
    expect(result.current.projects).toHaveLength(1)
    expect(result.current.viewModel.hasContent).toBe(true)
    expect(result.current.viewModel.searchQuery).toBe('')
  })

  it('親 view-model が空で initial が指定されていればそれを採用する', () => {
    const { deps } = createEmptyDeps()
    const projects = [createSampleCustomProject('p1', 'Reading')]
    const { result } = renderCustomModeController({
      deps,
      initialCustomProjects: projects,
      passInitialToParent: false,
    })
    expect(result.current.projects).toHaveLength(1)
    expect(result.current.viewModel.projects[0]?.name).toBe('Reading')
  })

  it('initialCustomProjects が無くても空 view-model を返す', () => {
    const { deps } = createEmptyDeps()
    const { result } = renderCustomModeController({ deps })
    expect(result.current.viewModel.loading).toBe(true)
    expect(result.current.projects).toHaveLength(0)
    expect(result.current.viewModel.hasContent).toBe(false)
  })

  it('setSearchQuery で view-model の searchQuery が更新される', () => {
    const { deps } = createEmptyDeps()
    const { result } = renderCustomModeController({ deps })
    act(() => {
      result.current.setSearchQuery('reading')
    })
    expect(result.current.searchQuery).toBe('reading')
    expect(result.current.viewModel.searchQuery).toBe('reading')
  })

  it('openUrl は urlRecord が見つかれば openSavedUrl use-case を呼ぶ', async () => {
    const urlRecord = createUrlRecord({
      id: 'url-p1',
      savedAt: 1,
      title: 'example article',
      url: 'https://example.com/article',
    })
    const { deps, openSpy } = createEmptyDeps([urlRecord])
    const { result } = renderCustomModeController({ deps })
    await act(async () => {
      await result.current.openUrl('https://example.com/article')
    })
    expect(openSpy).toHaveBeenCalledWith({ url: 'https://example.com/article' })
  })

  it('openUrl は urlRecord が見つからなければ browserTabPort.open を呼ぶ', async () => {
    const { deps, openSpy } = createEmptyDeps()
    const { result } = renderCustomModeController({ deps })
    await act(async () => {
      await result.current.openUrl('https://unknown.example')
    })
    expect(openSpy).toHaveBeenCalledWith({ url: 'https://unknown.example' })
  })

  it('refresh は親 controller の refresh をそのまま返す', async () => {
    const { deps } = createEmptyDeps()
    const projects = [createSampleCustomProject('p1', 'Reading')]
    const inMemory = createInMemoryRepositories({ customProjects: projects })
    const overrideDeps: SavedTabsUseCasesDeps = {
      ...deps,
      customProjectRepository: inMemory.customProjectRepository,
    }
    const { result } = renderCustomModeController({ deps: overrideDeps })
    await act(async () => {
      await result.current.refresh()
    })
    expect(result.current.viewModel.hasContent).toBe(true)
  })
})
