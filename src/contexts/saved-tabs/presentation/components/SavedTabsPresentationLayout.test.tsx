// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createSavedTabsUseCases } from '@/contexts/saved-tabs/infrastructure/composition/createSavedTabsUseCases'
import type { SavedTabsUseCases } from '@/contexts/saved-tabs/infrastructure/composition/createSavedTabsUseCases'
import type { SavedTabsUseCasesDeps } from '@/contexts/saved-tabs/infrastructure/composition/createSavedTabsUseCasesDeps'
import { useSavedTabsController } from '@/contexts/saved-tabs/presentation/controllers/useSavedTabsController'
import type { UseSavedTabsControllerReturn } from '@/contexts/saved-tabs/presentation/controllers/useSavedTabsController'
import type { ResolveActiveRef } from '@/contexts/saved-tabs/presentation/pages/SavedTabsPage'

import { SavedTabsPresentationLayout } from './SavedTabsPresentationLayout'

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

const presentationMock = vi.hoisted(() => ({
  onAiSidebarOpenChange: undefined as ((isOpen: boolean) => void) | undefined,
  scrollControlsCalls: 0,
}))

vi.mock('@/contexts/saved-tabs/presentation/app/SavedTabsApp', () => ({
  SavedTabsApp: ({
    initialViewMode,
    isAiSidebarOpen,
    onViewModeNavigate,
  }: {
    initialViewMode?: string
    isAiSidebarOpen?: boolean
    onViewModeNavigate?: (mode: string) => void
  }) => (
    <div>
      <div data-testid='saved-tabs-app-mock'>
        {`SavedTabsApp:${String(Boolean(isAiSidebarOpen))}:${initialViewMode ?? 'none'}`}
      </div>
      <button type='button' onClick={() => onViewModeNavigate?.('custom')}>
        navigate-custom
      </button>
    </div>
  ),
}))

vi.mock('@/contexts/saved-tabs/presentation/app/savedTabsProfiler', () => ({
  handleSavedTabsRender: vi.fn(),
  isDevProfileEnabled: false,
}))

vi.mock('./SavedTabsScrollControls', () => ({
  SavedTabsScrollControls: () => {
    presentationMock.scrollControlsCalls += 1
    return <div data-testid='saved-tabs-scroll-controls-mock' />
  },
}))

vi.mock('./SavedTabsChatWidgetBridge', () => ({
  SavedTabsChatWidgetBridge: ({
    onOpenChange,
  }: {
    onOpenChange: (isOpen: boolean) => void
  }) => {
    presentationMock.onAiSidebarOpenChange = onOpenChange
    return (
      <div data-testid='saved-tabs-chat-widget-bridge-mock'>
        chat-widget-bridge
      </div>
    )
  },
}))

/**
 * テストで SavedTabsPresentationLayout が要求する composition props
 * (deps / useCases / controller / resolveActiveRef) を組み立てるヘルパ。
 *
 * 実 chrome 依存は注入せず、空の in-memory リポジトリ / port を使う。
 * `controller` は `useSavedTabsController` フックで生成するため、
 * 組み立てヘルパからは外している。
 */
const buildLayoutComposition = () => {
  const deps: SavedTabsUseCasesDeps = {
    browserTabPort: {
      open: async (input: { url: string }) => ({ url: input.url }),
    },
    browserWindowPort: {
      openWithUrls: async (input: { urls: readonly string[] }) => ({
        urls: [...input.urls],
      }),
    },
    notificationPort: { error: vi.fn(), info: vi.fn(), success: vi.fn() },
    setCategoryKeywordsPort: {
      setCategoryKeywords: vi.fn().mockResolvedValue(undefined),
    },
    storageChangePort: {
      subscribe: () => () => {},
    },
    messagingPort: {
      send: vi.fn().mockResolvedValue(undefined),
    },
    customProjectRepository: {
      findAll: async () => [],

      findById: async () => null,

      removeByIds: async () => undefined,

      saveAll: async () => undefined,

      findOrder: async () => [],

      saveOrder: async () => undefined,
    },
    parentCategoryRepository: {
      findAll: async () => [],

      findById: async () => null,

      removeByIds: async () => undefined,

      saveAll: async () => undefined,
    },
    tabGroupRepository: {
      findAll: async () => [],

      findById: async () => null,

      findRawDomainById: async () => null,

      findRawTabGroupById: async () => null,

      removeByIds: async () => undefined,

      saveAll: async () => undefined,
    },
    urlRecordRepository: {
      findAll: async () => [],

      findById: async () => null,

      removeByIds: async () => undefined,

      saveAll: async () => undefined,
    },
    userSettingsRepository: {
      findAll: async () => ({}) as never,

      save: async () => undefined,
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
    categoriesCommandService: {
      updateDomainCategorySettings: vi.fn().mockResolvedValue(undefined),
    },
    categoryAssignmentPort: {
      saveParentCategories: vi.fn().mockResolvedValue(undefined),
      saveTabGroups: vi.fn().mockResolvedValue(undefined),
    },
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
    removeSubCategoryFromTabGroupPort: {
      removeSubCategoryFromTabGroup: vi.fn().mockResolvedValue([]),
    },
  }
  const useCases: SavedTabsUseCases = createSavedTabsUseCases(deps)
  const resolveActiveRef: ResolveActiveRef = { current: () => true }
  return { deps, resolveActiveRef, useCases }
}

interface CompositionContext {
  readonly controller: UseSavedTabsControllerReturn
  readonly deps: SavedTabsUseCasesDeps
  readonly resolveActiveRef: ResolveActiveRef
  readonly useCases: SavedTabsUseCases
}

const CompositionProbe = ({
  children,
}: {
  children: (composition: CompositionContext) => React.ReactNode
}) => {
  const composition = buildLayoutComposition()
  const controller = useSavedTabsController({
    deps: composition.deps,
    useCases: composition.useCases,
  })
  return <>{children({ ...composition, controller })}</>
}

describe('SavedTabsPresentationLayout', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    presentationMock.onAiSidebarOpenChange = undefined
    presentationMock.scrollControlsCalls = 0
  })

  const renderLayout = ({
    isCompactLeftPaneLayout = false,
    isAiSidebarOpen = false,
    initialViewMode = 'domain' as 'domain' | 'custom',
  } = {}) => {
    const Probe = () => {
      const leftPaneRef = useRef<HTMLDivElement>(null)
      return (
        <CompositionProbe>
          {({ controller, deps, resolveActiveRef, useCases }) => (
            <SavedTabsPresentationLayout
              attachLeftPaneRef={(node) => {
                leftPaneRef.current = node
              }}
              controller={controller}
              deps={deps}
              initialViewMode={initialViewMode}
              isAiSidebarOpen={isAiSidebarOpen}
              isCompactLeftPaneLayout={isCompactLeftPaneLayout}
              leftPaneRef={leftPaneRef}
              onAiSidebarOpenChange={vi.fn()}
              resolveActiveRef={resolveActiveRef}
              useCases={useCases}
            />
          )}
        </CompositionProbe>
      )
    }
    return render(<Probe />)
  }

  it('outer split layout (saved-tabs-page-layout) と left pane (saved-tabs-left-pane) を描画する', () => {
    renderLayout()
    expect(screen.getByTestId('saved-tabs-page-layout')).toBeTruthy()
    expect(screen.getByTestId('saved-tabs-left-pane')).toBeTruthy()
    expect(screen.getByTestId('saved-tabs-app-mock')).toBeTruthy()
  })

  it('SavedTabsApp に initialViewMode / isAiSidebarOpen を渡す', () => {
    renderLayout({ initialViewMode: 'custom', isAiSidebarOpen: true })
    expect(screen.getByTestId('saved-tabs-app-mock').textContent).toBe(
      'SavedTabsApp:true:custom',
    )
  })

  it('compact layout のとき data-saved-tabs-layout="compact" を出力する', () => {
    renderLayout({ isCompactLeftPaneLayout: true })
    expect(
      screen
        .getByTestId('saved-tabs-left-pane')
        .getAttribute('data-saved-tabs-layout'),
    ).toBe('compact')
  })

  it('full layout のとき data-saved-tabs-layout="full" を出力する', () => {
    renderLayout({ isCompactLeftPaneLayout: false })
    expect(
      screen
        .getByTestId('saved-tabs-left-pane')
        .getAttribute('data-saved-tabs-layout'),
    ).toBe('full')
  })

  it('SavedTabsScrollControls と SavedTabsChatWidgetBridge を描画する', () => {
    renderLayout()
    expect(screen.getByTestId('saved-tabs-scroll-controls-mock')).toBeTruthy()
    expect(
      screen.getByTestId('saved-tabs-chat-widget-bridge-mock'),
    ).toBeTruthy()
    expect(presentationMock.scrollControlsCalls).toBe(1)
  })

  it('onAiSidebarOpenChange を SavedTabsChatWidgetBridge へ伝える', () => {
    const onAiSidebarOpenChange = vi.fn()
    const Probe = () => {
      const leftPaneRef = useRef<HTMLDivElement>(null)
      return (
        <CompositionProbe>
          {({ controller, deps, resolveActiveRef, useCases }) => (
            <SavedTabsPresentationLayout
              attachLeftPaneRef={() => undefined}
              controller={controller}
              deps={deps}
              initialViewMode='domain'
              isAiSidebarOpen={false}
              isCompactLeftPaneLayout={false}
              leftPaneRef={leftPaneRef}
              onAiSidebarOpenChange={onAiSidebarOpenChange}
              resolveActiveRef={resolveActiveRef}
              useCases={useCases}
            />
          )}
        </CompositionProbe>
      )
    }
    render(<Probe />)
    expect(presentationMock.onAiSidebarOpenChange).toBe(onAiSidebarOpenChange)
  })

  it('onViewModeNavigate を SavedTabsApp へ伝える', () => {
    const onViewModeNavigate = vi.fn()
    const Probe = () => {
      const leftPaneRef = useRef<HTMLDivElement>(null)
      return (
        <CompositionProbe>
          {({ controller, deps, resolveActiveRef, useCases }) => (
            <SavedTabsPresentationLayout
              attachLeftPaneRef={() => undefined}
              controller={controller}
              deps={deps}
              initialViewMode='domain'
              isAiSidebarOpen={false}
              isCompactLeftPaneLayout={false}
              leftPaneRef={leftPaneRef}
              onAiSidebarOpenChange={vi.fn()}
              onViewModeNavigate={onViewModeNavigate}
              resolveActiveRef={resolveActiveRef}
              useCases={useCases}
            />
          )}
        </CompositionProbe>
      )
    }
    render(<Probe />)
    screen.getByText('navigate-custom').click()
    expect(onViewModeNavigate).toHaveBeenCalledWith('custom')
  })
})
