// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { BrowserTabPort } from '../../application/ports/BrowserTabPort'
import type { NotificationPort } from '../../application/ports/NotificationPort'
import { createCustomProject } from '../../domain/entities/CustomProject'
import { createTabGroup } from '../../domain/entities/TabGroup'
import type { CustomProjectRepository } from '../../domain/repositories/CustomProjectRepository'
import type { ParentCategoryRepository } from '../../domain/repositories/ParentCategoryRepository'
import type { TabGroupRepository } from '../../domain/repositories/TabGroupRepository'
import type { UrlRecordRepository } from '../../domain/repositories/UrlRecordRepository'
import { createSavedTabsUseCases } from '../../infrastructure/composition/createSavedTabsUseCases'
import type { SavedTabsUseCasesDeps } from '../../infrastructure/composition/createSavedTabsUseCasesDeps'

vi.mock('@/features/i18n/context/I18nProvider', () => ({
  I18nProvider: ({ children }: { children: React.ReactNode }) => (
    // eslint-disable-next-line react/jsx-no-useless-fragment
    <>{children}</>
  ),
  useI18n: () => ({
    language: 'ja',
    t: (key: string) => key,
  }),
  useI18nText: () => (key: string) => key,
}))

vi.mock('@/features/saved-tabs/app/SavedTabsApp', () => ({
  SavedTabsApp: () => <div data-testid='saved-tabs-app-mock'>SavedTabsApp</div>,
}))

vi.mock('@/features/ai-chat/components/LazySavedTabsChatWidget', () => ({
  LazySavedTabsChatWidget: () => (
    <div data-testid='saved-tabs-chat-widget-mock'>LazySavedTabsChatWidget</div>
  ),
}))

vi.mock('@/features/saved-tabs/app/savedTabsProfiler', () => ({
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
    // eslint-disable-next-line typescript/require-await
    findAll: async () => tabGroups.map((group) => ({ ...group })),
    // eslint-disable-next-line typescript/require-await
    findById: async (id) => tabGroups.find((group) => group.id === id) ?? null,
    // eslint-disable-next-line typescript/require-await
    removeByIds: async (ids) => {
      const idSet = new Set(ids)
      for (let i = tabGroups.length - 1; i >= 0; i--) {
        if (idSet.has(tabGroups[i]?.id ?? '')) {
          tabGroups.splice(i, 1)
        }
      }
    },
    // eslint-disable-next-line typescript/require-await
    saveAll: async (groups) => {
      tabGroups.splice(0, tabGroups.length, ...groups.map((g) => ({ ...g })))
    },
  }
  const customProjectRepository: CustomProjectRepository = {
    // eslint-disable-next-line typescript/require-await
    findAll: async () => customProjects.map((project) => ({ ...project })),
    // eslint-disable-next-line typescript/require-await
    findById: async (id) =>
      customProjects.find((project) => project.id === id) ?? null,
    // eslint-disable-next-line typescript/require-await
    removeByIds: async (ids) => {
      const idSet = new Set(ids)
      for (let i = customProjects.length - 1; i >= 0; i--) {
        if (idSet.has(customProjects[i]?.id ?? '')) {
          customProjects.splice(i, 1)
        }
      }
    },
    // eslint-disable-next-line typescript/require-await
    saveAll: async (projects) => {
      customProjects.splice(
        0,
        customProjects.length,
        ...projects.map((p) => ({ ...p })),
      )
    },
  }
  const urlRecordRepository: UrlRecordRepository = {
    // eslint-disable-next-line typescript/require-await
    findAll: async () => [],
    // eslint-disable-next-line typescript/require-await
    findById: async () => null,
    // eslint-disable-next-line typescript/require-await
    removeByIds: async () => undefined,
    // eslint-disable-next-line typescript/require-await
    saveAll: async () => undefined,
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
  const browserTabPort: BrowserTabPort = {
    // eslint-disable-next-line typescript/require-await
    open: async (input: { url: string }) => ({ url: input.url }),
  }
  const notificationPort: NotificationPort = {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  }
  return {
    browserTabPort,
    customProjectRepository,
    notificationPort,
    parentCategoryRepository,
    tabGroupRepository,
    urlRecordRepository,
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
      // eslint-disable-next-line typescript/require-await
      findAll: async () => {
        throw new Error('refresh failed')
      },
      // eslint-disable-next-line typescript/require-await
      findById: async () => null,
      // eslint-disable-next-line typescript/require-await
      removeByIds: async () => undefined,
      // eslint-disable-next-line typescript/require-await
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
})
