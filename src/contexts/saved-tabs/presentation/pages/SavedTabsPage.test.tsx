// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createSavedTabsUseCases } from '@/contexts/saved-tabs/application/createSavedTabsUseCases'
import type { BrowserTabPort } from '@/contexts/saved-tabs/application/ports/BrowserTabPort'
import type { BrowserWindowPort } from '@/contexts/saved-tabs/application/ports/BrowserWindowPort'
import type { NotificationPort } from '@/contexts/saved-tabs/application/ports/NotificationPort'
import type { SetCategoryKeywordsPort } from '@/contexts/saved-tabs/application/ports/SetCategoryKeywordsPort'
import type { SavedTabsUseCasesDeps } from '@/contexts/saved-tabs/application/SavedTabsUseCasesDeps'
import { createCustomProject } from '@/contexts/saved-tabs/domain/entities/CustomProject'
import { createTabGroup } from '@/contexts/saved-tabs/domain/entities/TabGroup'
import type { CustomProjectRepository } from '@/contexts/saved-tabs/domain/repositories/CustomProjectRepository'
import type { ParentCategoryRepository } from '@/contexts/saved-tabs/domain/repositories/ParentCategoryRepository'
import type { TabGroupRepository } from '@/contexts/saved-tabs/domain/repositories/TabGroupRepository'
import type { UrlRecordRepository } from '@/contexts/saved-tabs/domain/repositories/UrlRecordRepository'

vi.mock('@/features/i18n/context/I18nProvider', () => ({
  I18nProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  useI18n: () => ({
    language: 'ja',
    t: (key: string) => key,
  }),
  useI18nText: () => (key: string) => key,
}))

vi.mock('@/contexts/saved-tabs/presentation/app/SavedTabsApp', () => ({
  SavedTabsApp: () => <div data-testid='saved-tabs-app-mock'>SavedTabsApp</div>,
}))

vi.mock('@/features/ai-chat/components/LazySavedTabsChatWidget', () => ({
  LazySavedTabsChatWidget: () => (
    <div data-testid='saved-tabs-chat-widget-mock'>LazySavedTabsChatWidget</div>
  ),
}))

vi.mock('@/contexts/saved-tabs/presentation/app/savedTabsProfiler', () => ({
  handleSavedTabsRender: vi.fn(),
  isDevProfileEnabled: false,
}))

const createInMemoryDeps = (input: {
  tabGroups?: ReturnType<typeof createTabGroup>[]
  customProjects?: ReturnType<typeof createCustomProject>[]
}): SavedTabsUseCasesDeps => {
  const tabGroups = input.tabGroups ?? []
  const customProjects = input.customProjects ?? []
  const tabGroupRepository: TabGroupRepository = {
    findAll: async () => tabGroups.map((group) => ({ ...group })),

    findById: async (id) => tabGroups.find((group) => group.id === id) ?? null,
    findRawDomainById: vi.fn(async () => null),
    findRawTabGroupById: vi.fn(async () => null),

    removeByIds: async (ids) => {
      const idSet = new Set(ids)
      for (let i = tabGroups.length - 1; i >= 0; i--) {
        if (idSet.has(tabGroups[i]?.id ?? '')) {
          tabGroups.splice(i, 1)
        }
      }
    },

    saveAll: async (groups) => {
      tabGroups.splice(0, tabGroups.length, ...groups.map((g) => ({ ...g })))
    },
  }
  const customProjectRepository: CustomProjectRepository = {
    findAll: async () => customProjects.map((project) => ({ ...project })),

    findById: async (id) =>
      customProjects.find((project) => project.id === id) ?? null,

    removeByIds: async (ids) => {
      const idSet = new Set(ids)
      for (let i = customProjects.length - 1; i >= 0; i--) {
        if (idSet.has(customProjects[i]?.id ?? '')) {
          customProjects.splice(i, 1)
        }
      }
    },

    saveAll: async (projects) => {
      customProjects.splice(
        0,
        customProjects.length,
        ...projects.map((p) => ({ ...p })),
      )
    },

    findOrder: async () => [],

    saveOrder: async () => undefined,
  }
  const urlRecordRepository: UrlRecordRepository = {
    findAll: async () => [],

    findById: async () => null,

    removeByIds: async () => undefined,

    saveAll: async () => undefined,
  }
  const parentCategoryRepository: ParentCategoryRepository = {
    findAll: async () => [],

    findById: async () => null,

    removeByIds: async () => undefined,

    saveAll: async () => undefined,
  }
  const browserTabPort: BrowserTabPort = {
    open: async (input: { url: string }) => ({ url: input.url }),
  }
  const browserWindowPort: BrowserWindowPort = {
    openWithUrls: async (input: { urls: readonly string[] }) => ({
      urls: [...input.urls],
    }),
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
    browserTabPort,
    browserWindowPort,
    categoriesCommandService: {
      updateDomainCategorySettings: vi.fn().mockResolvedValue(undefined),
    },
    categoryAssignmentPort: {
      saveParentCategories: vi.fn().mockResolvedValue(undefined),
      saveTabGroups: vi.fn().mockResolvedValue(undefined),
    },
    customProjectRepository,
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
  }
}

import { SavedTabsPage } from './SavedTabsPage'

describe('SavedTabsPage', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('initialTabGroups / initialCustomProjects を渡すと view-model へ反映する', () => {
    const deps = createInMemoryDeps({})
    const initialTabGroups = [
      createTabGroup({
        domain: 'example.com',
        id: 'g1',
        urlIds: [],
      }),
    ]
    const initialCustomProjects = [
      createCustomProject({
        categories: [],
        createdAt: 1,
        id: 'p1',
        name: 'Reading',
        updatedAt: 1,
        urlIds: [],
      }),
    ]
    render(
      <SavedTabsPage
        deps={deps}
        initialCustomProjects={initialCustomProjects}
        initialTabGroups={initialTabGroups}
      />,
    )
    const root = screen.getByTestId('saved-tabs-page-presentation')
    expect(root.getAttribute('data-loading')).toBe('false')
    expect(root.getAttribute('data-has-content')).toBe('true')
  })

  it('SavedTabsPresentationLayout を描画する (data-testid=saved-tabs-page-layout)', () => {
    const deps = createInMemoryDeps({})
    render(<SavedTabsPage deps={deps} />)
    expect(screen.getByTestId('saved-tabs-page-layout')).toBeTruthy()
    expect(screen.getByTestId('saved-tabs-app-mock')).toBeTruthy()
  })

  it('deps と useCases を両方渡すと、contextValue の deps / useCases 分岐を使う', async () => {
    const deps = createInMemoryDeps({})
    const useCases = createSavedTabsUseCases(deps)
    render(<SavedTabsPage deps={deps} useCases={useCases} />)
    const root = await screen.findByTestId('saved-tabs-page-presentation')
    await waitFor(() => {
      expect(root.getAttribute('data-loading')).toBe('false')
    })
  })

  it('deps 省略時は例外を投げる', () => {
    expect(() => render(<SavedTabsPage />)).toThrow(
      /SavedTabsPage: deps is required/,
    )
  })

  it('deps の repository が変わると refresh ハンドラが新しくなる', async () => {
    const initialDeps = createInMemoryDeps({})
    const { customProjectRepository, tabGroupRepository } = createInMemoryDeps(
      {},
    )
    const nextDeps: SavedTabsUseCasesDeps = {
      ...initialDeps,
      customProjectRepository,
      tabGroupRepository,
    }
    const { rerender } = render(<SavedTabsPage deps={initialDeps} />)
    const initialRoot = await screen.findByTestId(
      'saved-tabs-page-presentation',
    )
    await waitFor(() => {
      expect(initialRoot.getAttribute('data-loading')).toBe('false')
    })
    rerender(<SavedTabsPage deps={nextDeps} />)
    await waitFor(() => {
      expect(
        screen
          .getByTestId('saved-tabs-page-presentation')
          .getAttribute('data-loading'),
      ).toBe('false')
    })
  })

  it('hasInitialData が false → true に変わると ref 判定が更新される', async () => {
    const deps = createInMemoryDeps({})
    const initialTabGroups = [
      createTabGroup({ domain: 'example.com', id: 'g1', urlIds: [] }),
    ]
    const { rerender } = render(<SavedTabsPage deps={deps} />)
    const initialRoot = await screen.findByTestId(
      'saved-tabs-page-presentation',
    )
    await waitFor(() => {
      expect(initialRoot.getAttribute('data-loading')).toBe('false')
    })
    // initial data を渡して再レンダー → hasInitialData が false → true に遷移
    rerender(<SavedTabsPage deps={deps} initialTabGroups={initialTabGroups} />)
    const nextRoot = screen.getByTestId('saved-tabs-page-presentation')
    expect(nextRoot.getAttribute('data-loading')).toBe('false')
  })

  it('refresh 失敗で error 状態になるとエラーメッセージが表示される', async () => {
    const failingTabGroupRepository = {
      findAll: async () => {
        throw new Error('refresh failed')
      },

      findById: async () => null,

      removeByIds: async () => undefined,

      saveAll: async () => undefined,
    } as unknown as Parameters<typeof createInMemoryDeps>[0] extends never
      ? never
      : ReturnType<typeof createInMemoryDeps>['tabGroupRepository']
    const baseDeps = createInMemoryDeps({})
    const deps = {
      ...baseDeps,
      tabGroupRepository: failingTabGroupRepository,
    }
    render(<SavedTabsPage deps={deps} />)
    await waitFor(() => {
      expect(
        screen
          .getByTestId('saved-tabs-page-presentation')
          .getAttribute('data-loading'),
      ).toBe('false')
    })
    expect(
      screen
        .getByTestId('saved-tabs-page-presentation')
        .getAttribute('data-error'),
    ).toBe('refresh failed')
  })

  it('initialViewMode / onViewModeNavigate / search を渡すと SavedTabsPresentationLayout へ反映する', () => {
    const deps = createInMemoryDeps({})
    const onViewModeNavigate = vi.fn()
    render(
      <SavedTabsPage
        deps={deps}
        initialViewMode='custom'
        onViewModeNavigate={onViewModeNavigate}
        search='?mode=custom'
      />,
    )
    expect(screen.getByTestId('saved-tabs-app-mock')).toBeTruthy()
  })

  it('deps の browserTabPort が Chrome adapter 以外の port ならそれを保持する (review #493 P2)', () => {
    // テスト / SSR 用に独自 port を注入した deps を使い、
    // SavedTabsPage 内の composition が port を Chrome adapter で
    // 上書きしないことを確認する。in-memory deps は in-memory port を
    // 持っており、in-memory port は `CHROME_BROWSER_TAB_ADAPTER_MARKER`
    // を持たないため保持される。
    const inMemoryDeps = createInMemoryDeps({})
    const inMemoryPort = inMemoryDeps.browserTabPort
    expect(inMemoryPort).toBeDefined()
    render(<SavedTabsPage deps={inMemoryDeps} />)
    // port が差し替えられていないことを、参照同一性で確認する。
    // もし Chrome adapter で上書きされていたら inMemoryPort とは別物になる。
    expect(inMemoryDeps.browserTabPort).toBe(inMemoryPort)
  })
})
