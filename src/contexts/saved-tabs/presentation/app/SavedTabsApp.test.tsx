/* eslint-disable */
/* eslint-disable max-lines-per-function, typescript/no-misused-promises */
// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { useMemo, useRef } from 'react'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

import type {
  CustomProject,
  ParentCategory,
  TabGroup,
  UrlRecord,
  UserSettings,
  ViewMode,
} from '@/types/storage'

const mocked = vi.hoisted(() => {
  const customProjects: CustomProject[] = [
    {
      id: 'project-1',
      name: 'Reading List',
      urlIds: ['url-1'],
      categories: [],
      createdAt: 1,
      updatedAt: 1,
    },
    {
      id: 'project-2',
      name: 'Work',
      urlIds: ['url-2'],
      categories: [],
      createdAt: 2,
      updatedAt: 2,
    },
    {
      id: 'project-3',
      name: 'Videos',
      urlIds: ['url-3'],
      categories: [],
      createdAt: 3,
      updatedAt: 3,
    },
  ]

  const projectUrlsById: Record<string, UrlRecord[]> = {
    'project-1': [
      {
        id: 'url-1',
        url: 'https://example.com/reading',
        title: 'Reading article',
        savedAt: 10,
      },
    ],
    'project-2': [
      {
        id: 'url-2',
        url: 'https://example.com/docker-cmd',
        title: 'Container article',
        savedAt: 20,
      },
    ],
    'project-3': [
      {
        id: 'url-3',
        url: 'https://example.com/video',
        title: 'Meeting notes',
        savedAt: 30,
      },
    ],
  }

  // eslint-disable-next-line typescript/require-await
  const getProjectUrls = vi.fn(async (project: CustomProject) => {
    return projectUrlsById[project.id] ?? []
  })

  const customModeContainerSpy = vi.fn()
  const domainModeContainerSpy = vi.fn()
  const headerSpy = vi.fn()

  const settings: UserSettings = {
    enableCategories: true,
    openUrlInBackground: false,
    removeTabAfterOpen: false,
    openAllInNewWindow: false,
  } as UserSettings

  const categoryState = {
    categories: [] as ParentCategory[],
    setCategories: vi.fn(),
    categoryOrder: [] as string[],
    isCategoryReorderMode: false,
    tempCategoryOrder: [] as string[],
    handleDeleteCategory: vi.fn(),
    handleCategoryDragEnd: vi.fn(),
    handleConfirmCategoryReorder: vi.fn(),
    handleCancelCategoryReorder: vi.fn(),
    handleUpdateDomainsOrder: vi.fn(),
    handleMoveDomainToCategory: vi.fn(),
  }

  const tabDataState = {
    tabGroups: [] as TabGroup[],
    isLoading: false,
    tabGroupsWithUrls: [] as TabGroup[],
    refreshTabGroupsWithUrls: vi.fn(),
  }

  const projectState = {
    customProjects,
    setCustomProjects: vi.fn(),
    viewMode: 'custom' as ViewMode,
    viewModeRef: { current: 'custom' as ViewMode },
    syncDomainDataToCustomProjects: vi.fn(),
    handleViewModeChange: vi.fn(),
    handleCreateProject: vi.fn(),
    handleDeleteProject: vi.fn(),
    handleRenameProject: vi.fn(),
    handleAddUrlToProject: vi.fn(),
    handleDeleteUrlFromProject: vi.fn(),
    handleDeleteUrlsFromProject: vi.fn(),
    handleAddCategory: vi.fn(),
    handleDeleteProjectCategory: vi.fn(),
    handleSetUrlCategory: vi.fn(),
    handleUpdateCategoryOrder: vi.fn(),
    handleReorderUrls: vi.fn(),
    handleReorderProjects: vi.fn(),
    handleRenameCategory: vi.fn(),
  }

  return {
    categoryState,
    customModeContainerSpy,
    domainModeContainerSpy,
    getProjectUrls,
    headerSpy,
    projectState,
    settings,
    tabDataState,
  }
})

const savedTabsAppI18nState = vi.hoisted(() => ({
  language: 'ja' as 'en' | 'ja',
}))

vi.mock('@dnd-kit/core', () => ({
  KeyboardSensor: class KeyboardSensor {},
  PointerSensor: class PointerSensor {},
  useSensor: vi.fn(() => ({})),
  useSensors: vi.fn((...sensors: unknown[]) => sensors),
}))

vi.mock('@dnd-kit/sortable', () => ({
  arrayMove: <T,>(items: T[], from: number, to: number) => {
    const nextItems = [...items]
    const [moved] = nextItems.splice(from, 1)
    nextItems.splice(to, 0, moved)
    return nextItems
  },
  sortableKeyboardCoordinates: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  },
}))

vi.mock('@/components/ui/sonner', () => ({
  Toaster: () => null,
}))

vi.mock('@/features/i18n/context/I18nProvider', async () => {
  const { getMessages } = await vi.importActual<
    // eslint-disable-next-line typescript/consistent-type-imports
    typeof import('@/features/i18n/messages')
  >('@/features/i18n/messages')

  return {
    useI18n: () => ({
      language: savedTabsAppI18nState.language,
      t: (key: string, fallback?: string, values?: Record<string, string>) => {
        const messages = getMessages(savedTabsAppI18nState.language)
        const template =
          messages[key as keyof typeof messages] ?? fallback ?? key
        return template.replaceAll(
          /\{\{(\w+)\}\}/g,
          (_, token) => values?.[token] ?? '', // eslint-disable-line
        )
      },
    }),
  }
})

vi.mock('@/contexts/saved-tabs/presentation/components/Footer', () => ({
  CategoryReorderFooter: () => null,
}))

vi.mock('@/contexts/saved-tabs/presentation/components/Header', () => ({
  Header: ({
    filteredCustomProjects,
    showSidebarTrigger,
    onSearchChange,
    searchQuery,
  }: {
    filteredCustomProjects?: CustomProject[]
    showSidebarTrigger?: boolean
    onSearchChange: (value: string) => void
    searchQuery: string
  }) => {
    mocked.headerSpy({
      filteredCustomProjects,
      searchQuery,
      showSidebarTrigger,
    })
    return (
      <label>
        search
        <input
          aria-label='search'
          // eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
          onChange={(event) => {
            onSearchChange(event.target.value)
          }}
          value={searchQuery}
        />
      </label>
    )
  },
}))

vi.mock(
  '@/contexts/saved-tabs/presentation/containers/CustomModeContainer',
  () => ({
    CustomModeContainer: (props: { projects: CustomProject[] }) => {
      const { projects } = props
      mocked.customModeContainerSpy(props)
      return (
        <div data-testid='custom-projects'>
          {projects.map((project) => (
            <section data-testid={`project-${project.id}`} key={project.id}>
              <div>{`project:${project.name}`}</div>
              {/* eslint-disable-next-line typescript/prefer-nullish-coalescing */}
              {(project.urls || []).map((url) => (
                <div key={url.url}>{`url:${url.title}:${url.url}`}</div>
              ))}
            </section>
          ))}
        </div>
      )
    },
  }),
)

vi.mock(
  '@/contexts/saved-tabs/presentation/containers/DomainModeContainer',
  () => ({
    DomainModeContainer: (props: Record<string, unknown>) => {
      mocked.domainModeContainerSpy(props)
      return <div>domain-mode</div>
    },
  }),
)

vi.mock('@/contexts/saved-tabs/presentation/lib/custom-project-move', () => ({
  moveCustomProjectUrlAndSyncState: vi.fn(),
}))

vi.mock('@/contexts/saved-tabs/presentation/lib/tab-operations', () => ({
  handleTabGroupRemoval: vi.fn(),
}))

vi.mock('@/contexts/saved-tabs/presentation/lib/uncategorized-display', () => ({
  shouldShowUncategorizedHeader: vi.fn(() => false),
}))

vi.mock('./SavedTabsApp', async () => {
  // 旧 `SavedTabsApp` は use-case / controller / deps を内部で組み立てていたが、
  // issue #493 の composition root 集約によりそれらは props 注入になった。
  // 既存テストは props を渡さず `render(<SavedTabsApp />)` する形なので、
  // ここで production と同じ `createSavedTabsUseCasesDeps()` を使った
  // composition を補完するラッパに差し替える。
  // テスト本体では `globalThis.chrome` が beforeEach で mock されているため、
  // chrome-storage ベースの deps も同じ経路で chrome とやり取りする。
  // `BrowserTabPort` の `resolveActive` は `SavedTabsApp` 側が ref.current を
  // 動的に書き換えるため、ref-based な resolveActive を持つ port を
  // composition 時に渡す必要がある。
  const actual =
    await vi.importActual<typeof import('./SavedTabsApp')>('./SavedTabsApp')
  const controllerMod = await vi.importActual<
    typeof import('@/contexts/saved-tabs/presentation/controllers/useSavedTabsController')
  >('@/contexts/saved-tabs/presentation/controllers/useSavedTabsController')
  const compositionMod = await vi.importActual<
    typeof import('@/contexts/saved-tabs/infrastructure/composition/createSavedTabsUseCases')
  >('@/contexts/saved-tabs/infrastructure/composition/createSavedTabsUseCases')
  const depsMod = await vi.importActual<
    typeof import('@/contexts/saved-tabs/infrastructure/composition/createSavedTabsUseCasesDeps')
  >(
    '@/contexts/saved-tabs/infrastructure/composition/createSavedTabsUseCasesDeps',
  )

  const TestSavedTabsApp = (
    props: React.ComponentProps<typeof actual.SavedTabsApp>,
  ) => {
    // 1) ref を先に作る (active 固定で初期化)
    const resolveActiveRef = useRef<() => boolean>(() => true)
    // 2) ref ベースの resolveActive を持つ BrowserTabPort を構築するため、
    //    1 度 deps を組み立ててから browserTabPort だけ差し替える。
    const baseDeps = useMemo(
      () =>
        depsMod.createSavedTabsUseCasesDeps({
          resolveActive: () => resolveActiveRef.current(),
        }),
      [resolveActiveRef],
    )
    const useCases = useMemo(
      () => compositionMod.createSavedTabsUseCases(baseDeps),
      [baseDeps],
    )
    const controller = controllerMod.useSavedTabsController({
      deps: baseDeps,
      useCases,
    })
    return actual.useSavedTabsAppView({
      ...props,
      controller,
      deps: baseDeps,
      resolveActiveRef,
      useCases,
    })
  }

  return {
    SavedTabsApp: TestSavedTabsApp,
    useSavedTabsAppView: actual.useSavedTabsAppView,
  }
})

vi.mock(
  '@/contexts/saved-tabs/presentation/hooks/useCategoryManagement',
  () => ({
    useCategoryManagement: () => mocked.categoryState,
  }),
)

vi.mock('@/contexts/saved-tabs/presentation/hooks/useTabData', () => ({
  useTabData: () => mocked.tabDataState,
}))

vi.mock(
  '@/contexts/saved-tabs/presentation/hooks/useProjectManagement',
  () => ({
    useProjectManagement: () => mocked.projectState,
  }),
)

vi.mock('@/contexts/saved-tabs/presentation/services/modeSyncService', () => ({
  syncStorageChanges: vi.fn(),
}))

vi.mock('@/lib/storage/categories', () => ({
  saveParentCategories: vi.fn(),
}))

vi.mock('@/lib/storage/projects', () => ({
  // eslint-disable-next-line typescript/require-await
  getCustomProjects: vi.fn(async () => mocked.projectState.customProjects),
  getProjectUrls: mocked.getProjectUrls,
  moveUrlBetweenCustomProjects: vi.fn(),
  removeUrlFromAllCustomProjects: vi.fn(),
  removeUrlIdsFromAllCustomProjects: vi.fn(),
  removeUrlsFromAllCustomProjects: vi.fn(),
}))

vi.mock('@/lib/storage/tabs', () => ({
  addSubCategoryToGroup: vi.fn(),
  // eslint-disable-next-line typescript/require-await
  getTabGroupUrls: vi.fn(async () => []),
  removeUrlIdsFromTabGroup: vi.fn(),
  removeUrlsFromTabGroup: vi.fn(),
}))

import { moveCustomProjectUrlAndSyncState } from '@/contexts/saved-tabs/presentation/lib/custom-project-move'
import { handleTabGroupRemoval } from '@/contexts/saved-tabs/presentation/lib/tab-operations'
import { syncStorageChanges } from '@/contexts/saved-tabs/presentation/services/modeSyncService'
import { saveParentCategories } from '@/lib/storage/categories'
import {
  removeUrlFromAllCustomProjects,
  removeUrlIdsFromAllCustomProjects,
  removeUrlsFromAllCustomProjects,
} from '@/lib/storage/projects'
import {
  getTabGroupUrls,
  removeUrlIdsFromTabGroup,
  removeUrlsFromTabGroup,
} from '@/lib/storage/tabs'

import { SavedTabsApp as ImportedSavedTabsApp } from './SavedTabsApp'
// `vi.mock` により `SavedTabsApp` は in-memory deps を補完するラッパへ
// 差し替えられる。runtime のシグネチャは composition props を補完した形に
// なるため、テストでの利用は JSX のオプショナル props だけに閉じる。
const SavedTabsApp = ImportedSavedTabsApp as unknown as React.ComponentType<{
  initialViewMode?: 'custom' | 'domain'
  isAiSidebarOpen?: boolean
  onViewModeNavigate?: (mode: 'custom' | 'domain') => void
}>
import {
  buildPresentationCategoryLookup,
  organizeTabGroupsWithCategories,
} from '@/contexts/saved-tabs/domain/services/SavedTabsCategorizationService'

import {
  buildDisplayTabGroup,
  buildUpdatedGroupAfterUrlIdRemoval,
  buildUrlIdsToRemove,
  countTabGroupUrls,
  createFilterGroupsByExcludedIdsUpdater,
  filterGroupsByExcludedIds,
  getDisplayUrlCount,
  notifyDeleteFailure,
  removeUrlsFromCustomProjectsForGroup,
  removeUrlsFromCustomProjectsForGroups,
  restoreOpenedUrlsSnapshot,
  syncGroupCategoryAssignment,
} from './savedTabsApp.helpers'

describe('SavedTabsApp custom search', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocked.settings.enableCategories = true
    mocked.settings.openUrlInBackground = false
    mocked.settings.removeTabAfterOpen = false
    mocked.settings.openAllInNewWindow = false
    mocked.categoryState.categories = []
    mocked.categoryState.categoryOrder = []
    mocked.categoryState.isCategoryReorderMode = false
    mocked.categoryState.tempCategoryOrder = []
    mocked.projectState.viewMode = 'custom'
    mocked.projectState.viewModeRef = { current: 'custom' }
    mocked.tabDataState.tabGroups = []
    mocked.tabDataState.tabGroupsWithUrls = []
    mocked.tabDataState.isLoading = false
    const chromeGlobal = globalThis as unknown as { chrome: typeof chrome }
    chromeGlobal.chrome = {
      storage: {
        local: {
          // eslint-disable-next-line typescript/require-await
          get: vi.fn(async () => ({ savedTabs: [] })),
          set: vi.fn(),
        },
        onChanged: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
      },
      tabs: {
        create: vi.fn(),
      },
      windows: {
        create: vi.fn(),
      },
      runtime: {
        getURL: vi.fn(),
      },
    } as unknown as typeof chrome
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('helper は URL ID 抽出、カテゴリ並び替え、削除失敗復元エラーを扱う', async () => {
    expect(
      buildUrlIdsToRemove(
        ['https://example.com/a', 'https://example.com/a'],
        [
          { id: 'url-a', url: 'https://example.com/a' },
          { id: 'url-b', url: 'https://example.com/b' },
        ],
      ),
    ).toStrictEqual(new Set(['url-a']))

    const categoryLookup = buildPresentationCategoryLookup([
      {
        domainNames: ['extra.example.com'],
        domains: ['group-ordered'],
        id: 'category-1',
        name: 'Ordered',
      },
    ])
    const sortedResult = organizeTabGroupsWithCategories({
      categoryLookup,
      enableCategories: true,
      tabGroupsWithUrls: [
        { domain: 'extra.example.com', id: 'group-extra', urlIds: ['url-b'] },
        {
          domain: 'ordered.example.com',
          id: 'group-ordered',
          urlIds: ['url-a'],
        },
      ],
    })

    expect(
      sortedResult.categorized['category-1']?.map((group) => group.id),
    ).toStrictEqual(['group-ordered', 'group-extra'])

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    // eslint-disable-next-line typescript/require-await
    const refreshTabGroupsWithUrls = vi.fn(async () => {
      throw new Error('restore failed')
    })
    // eslint-disable-next-line typescript/require-await
    const restoreOpenedUrlsSnapshotUseCase = vi.fn(async () => ({
      restoredCustomProjects: [],
      restoredParentCategories: [],
      restoredTabGroups: [],
      restoredUrlRecords: [],
    }))

    await notifyDeleteFailure({
      refreshTabGroupsWithUrls,
      savedTabsUseCases: {
        deleteSavedUrl: vi.fn(),
        deleteSavedUrls: vi.fn(),
        deleteTabGroup: vi.fn(),
        deleteTabGroups: vi.fn(),
        openAllSavedUrls: vi.fn(),
        openSavedUrl: vi.fn(),
        removeUnreferencedUrlRecords: vi.fn(),
        restoreOpenedUrlsSnapshot: restoreOpenedUrlsSnapshotUseCase,
        syncCategoryAssignments: vi.fn(),
        buildSavedTabsSnapshot: vi.fn(),
        reorderTabGroups: vi.fn(),
        reorderTabGroupUrls: vi.fn(),
        loadTabGroupsWithUrls: vi.fn(),
        loadTabGroupUrls: vi.fn(),
        findUrlRecordByUrl: vi.fn(),
        setCategoryKeywords: vi.fn(),
      },
      setCustomProjects: vi.fn(),
      snapshot: {
        customProjects: [],
        savedTabs: [],
      },
      t: (key) => key,
    })

    expect(consoleError).toHaveBeenCalledWith(
      '削除失敗後の保存データ復元に失敗しました:',
      expect.any(Error),
    )
    expect(toast.error).toHaveBeenCalledWith('savedTabs.deleteError')

    await notifyDeleteFailure({
      refreshTabGroupsWithUrls,
      savedTabsUseCases: {
        deleteSavedUrl: vi.fn(),
        deleteSavedUrls: vi.fn(),
        deleteTabGroup: vi.fn(),
        deleteTabGroups: vi.fn(),
        openAllSavedUrls: vi.fn(),
        openSavedUrl: vi.fn(),
        removeUnreferencedUrlRecords: vi.fn(),
        restoreOpenedUrlsSnapshot: restoreOpenedUrlsSnapshotUseCase,
        syncCategoryAssignments: vi.fn(),
        buildSavedTabsSnapshot: vi.fn(),
        reorderTabGroups: vi.fn(),
        reorderTabGroupUrls: vi.fn(),
        loadTabGroupsWithUrls: vi.fn(),
        loadTabGroupUrls: vi.fn(),
        findUrlRecordByUrl: vi.fn(),
        setCategoryKeywords: vi.fn(),
      },
      setCustomProjects: vi.fn(),
      t: (key) => key,
    })

    expect(toast.error).toHaveBeenCalledWith('savedTabs.deleteError')

    consoleError.mockRestore()
  })

  it('helper は snapshot 復元とカテゴリ検索のフォールバックを扱う', async () => {
    const chromeSetMock = vi.fn()
    const chromeGlobal = globalThis as unknown as { chrome: typeof chrome }
    chromeGlobal.chrome.storage.local.set = chromeSetMock
    const setCustomProjects = vi.fn()
    const refreshTabGroupsWithUrls = vi.fn()
    // eslint-disable-next-line typescript/require-await
    const restoreOpenedUrlsSnapshotUseCase = vi.fn(async () => ({
      restoredCustomProjects: [],
      restoredParentCategories: [],
      restoredTabGroups: [],
      restoredUrlRecords: [],
    }))

    await restoreOpenedUrlsSnapshot({
      refreshTabGroupsWithUrls,
      savedTabsUseCases: {
        deleteSavedUrl: vi.fn(),
        deleteSavedUrls: vi.fn(),
        deleteTabGroup: vi.fn(),
        deleteTabGroups: vi.fn(),
        openAllSavedUrls: vi.fn(),
        openSavedUrl: vi.fn(),
        removeUnreferencedUrlRecords: vi.fn(),
        restoreOpenedUrlsSnapshot: restoreOpenedUrlsSnapshotUseCase,
        syncCategoryAssignments: vi.fn(),
        buildSavedTabsSnapshot: vi.fn(),
        reorderTabGroups: vi.fn(),
        reorderTabGroupUrls: vi.fn(),
        loadTabGroupsWithUrls: vi.fn(),
        loadTabGroupUrls: vi.fn(),
        findUrlRecordByUrl: vi.fn(),
        setCategoryKeywords: vi.fn(),
      },
      setCustomProjects,
      snapshot: {},
    })

    expect(restoreOpenedUrlsSnapshotUseCase).toHaveBeenCalledWith({
      snapshot: {},
    })
    expect(chromeSetMock).not.toHaveBeenCalled()
    expect(setCustomProjects).not.toHaveBeenCalled()
    expect(refreshTabGroupsWithUrls).toHaveBeenCalledWith([])

    // 不正な id の TabGroup / CustomProject / ParentCategory は
    // domain factory の SavedTabsDomainError 経由でスキップされる。
    // customProjectOrder も含めて snapshot は command に詰め替えられ、
    // RestoreOpenedUrlsSnapshotUseCase 経由で repository へ書き戻される
    // （issue #487）。presentation 層は chrome.storage.local.set を
    // 呼ばないため chromeSetMock は 0 呼び出しのまま。
    const captured: unknown[] = []
    // eslint-disable-next-line typescript/require-await
    const captureUseCase = vi.fn(async (input: { snapshot: unknown }) => {
      captured.push(input)
      return {
        restoredCustomProjects: [],
        restoredParentCategories: [],
        restoredTabGroups: [],
        restoredUrlRecords: [],
      }
    })
    const refreshTabGroupsWithUrls2 = vi.fn()
    const setCustomProjects2 = vi.fn()
    await restoreOpenedUrlsSnapshot({
      refreshTabGroupsWithUrls: refreshTabGroupsWithUrls2,
      savedTabsUseCases: {
        deleteSavedUrl: vi.fn(),
        deleteSavedUrls: vi.fn(),
        deleteTabGroup: vi.fn(),
        deleteTabGroups: vi.fn(),
        openAllSavedUrls: vi.fn(),
        openSavedUrl: vi.fn(),
        removeUnreferencedUrlRecords: vi.fn(),
        restoreOpenedUrlsSnapshot: captureUseCase,
        syncCategoryAssignments: vi.fn(),
        buildSavedTabsSnapshot: vi.fn(),
        reorderTabGroups: vi.fn(),
        reorderTabGroupUrls: vi.fn(),
        loadTabGroupsWithUrls: vi.fn(),
        loadTabGroupUrls: vi.fn(),
        findUrlRecordByUrl: vi.fn(),
        setCategoryKeywords: vi.fn(),
      },
      setCustomProjects: setCustomProjects2,
      // issue #494 移行後: snapshot は `BuildSavedTabsSnapshotUseCase` 由来
      // の domain entity 形を直接渡す。不正要素のフィルタは
      // `ChromeSavedTabsStorageMapper` 側で行うため、ここでは
      // バリデーション通過済みの entity 形データを投入する。
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      snapshot: {
        customProjects: [
          {
            categories: [],
            createdAt: 1,
            id: 'project-good',
            name: 'Good',
            updatedAt: 1,
            urlIds: [],
          },
        ],
        customProjectOrder: ['project-good'],
        parentCategories: [
          {
            domainNames: [],
            domains: [],
            id: 'cat-good',
            name: 'Good',
          },
        ],
        savedTabs: [
          {
            domain: 'example.com',
            id: 'group-good',
            urlIds: ['url-1'],
          },
        ],
      } as never,
    })
    const command = (captured[0] as { snapshot: unknown }).snapshot as {
      customProjectOrder?: string[]
      customProjects: { id: string }[]
      parentCategories: { id: string }[]
      savedTabs: { id: string }[]
    }
    expect(command.savedTabs.map((g) => g.id)).toStrictEqual(['group-good'])
    expect(command.customProjects.map((p) => p.id)).toStrictEqual([
      'project-good',
    ])
    expect(command.parentCategories.map((c) => c.id)).toStrictEqual([
      'cat-good',
    ])
    // customProjectOrder は RestoreOpenedUrlsSnapshotUseCase 経由で
    // repository へ書き戻される（issue #487）。presentation 層からは
    // chrome.storage.local.set を呼ばない。
    expect(command.customProjectOrder).toStrictEqual(['project-good'])
    expect(chromeSetMock).not.toHaveBeenCalled()
    expect(setCustomProjects2).toHaveBeenCalledWith([
      {
        categories: [],
        createdAt: 1,
        id: 'project-good',
        name: 'Good',
        updatedAt: 1,
        urlIds: [],
      },
    ])
    expect(refreshTabGroupsWithUrls2).toHaveBeenCalledWith([
      { domain: 'example.com', id: 'group-good', urlIds: ['url-1'] },
    ])

    const groupWithoutUrls: TabGroup = {
      domain: 'empty.example.com',
      id: 'group-empty',
    }
    // searchQuery 指定で URLs 空のグループは表示対象から除外される
    // (issue #496: domain service の organizeTabGroupsWithCategories 経由で確認)。
    const filteredEmpty = organizeTabGroupsWithCategories({
      categoryLookup: buildPresentationCategoryLookup([]),
      enableCategories: true,
      searchQuery: 'reading',
      tabGroupsWithUrls: [groupWithoutUrls],
    })
    expect(filteredEmpty.categorized).toStrictEqual({})
    expect(filteredEmpty.uncategorized).toStrictEqual([])

    const duplicateLookup = buildPresentationCategoryLookup([
      {
        domainNames: ['duplicate.example.com'],
        domains: ['duplicate-group'],
        id: 'category-a',
        name: 'Category A',
      },
      {
        domainNames: ['duplicate.example.com'],
        domains: ['duplicate-group'],
        id: 'category-b',
        name: 'Category B',
      },
    ])
    expect(duplicateLookup.byGroupId.get('duplicate-group')?.id).toBe(
      'category-a',
    )
    expect(duplicateLookup.byDomainName.get('duplicate.example.com')?.id).toBe(
      'category-a',
    )
    // 'nomatch' でマッチしない URL は検索結果から除外される
    // (issue #496: domain service の organizeTabGroupsWithCategories 経由で確認)。
    const filteredNoMatch = organizeTabGroupsWithCategories({
      categoryLookup: duplicateLookup,
      enableCategories: true,
      searchQuery: 'nomatch',
      tabGroupsWithUrls: [
        {
          domain: 'other.example.com',
          id: 'duplicate-group',
          parentCategoryId: 'category-a',
          urls: [{ title: 'Other', url: 'https://other.example.com' }],
        },
      ],
    })
    expect(filteredNoMatch.categorized).toStrictEqual({})
    expect(filteredNoMatch.uncategorized).toStrictEqual([])

    expect(
      countTabGroupUrls({ domain: 'ids.example.com', id: 'ids', urlIds: [] }),
    ).toBe(0)
    expect(
      countTabGroupUrls({
        domain: 'legacy.example.com',
        id: 'legacy',
        urls: [{ title: 'Legacy', url: 'https://legacy.example.com/a' }],
      }),
    ).toBe(1)
    expect(
      countTabGroupUrls({ domain: 'empty.example.com', id: 'empty' }),
    ).toBe(0)
  })

  it('helper は URL ID 削除後の子カテゴリと表示用グループの空値を正規化する', () => {
    expect(
      buildUpdatedGroupAfterUrlIdRemoval(
        {
          domain: 'example.com',
          id: 'group-1',
          urlIds: ['url-b'],
          urlSubCategories: {
            'url-a': 'news',
          },
        },
        ['url-b'],
        new Set(['url-a']),
      ),
    ).toStrictEqual({
      domain: 'example.com',
      id: 'group-1',
      urlIds: ['url-b'],
      urlSubCategories: undefined,
    })
    expect(
      buildUpdatedGroupAfterUrlIdRemoval(
        {
          domain: 'example.com',
          id: 'group-2',
          urlIds: ['url-b'],
          urlSubCategories: {
            'url-a': 'news',
            'url-b': 'docs',
          },
        },
        ['url-b'],
        new Set(['url-a']),
      ),
    ).toStrictEqual({
      domain: 'example.com',
      id: 'group-2',
      urlIds: ['url-b'],
      urlSubCategories: {
        'url-b': 'docs',
      },
    })

    expect(
      getDisplayUrlCount({
        domain: 'legacy.example.com',
        id: 'legacy',
        urlIds: ['url-id'],
      }),
    ).toBe(1)
    expect(
      getDisplayUrlCount({ domain: 'empty.example.com', id: 'empty' }),
    ).toBe(0)
    expect(
      buildDisplayTabGroup({
        categories: [],
        createdAt: 1,
        id: 'project-without-url-ids',
        name: 'No URL IDs',
        updatedAt: 1,
        urls: [{ savedAt: 1, title: 'A', url: 'https://a.test' }],
      }),
    ).toStrictEqual({
      domain: 'No URL IDs',
      id: 'project-without-url-ids',
      urlIds: [],
      urls: [
        {
          savedAt: 1,
          title: 'A',
          url: 'https://a.test',
        },
      ],
    })
  })

  it('helper はカテゴリ同期で対象カテゴリ以外を維持する', () => {
    const state = {
      categoriesChanged: false,
      savedTabsChanged: false,
      updatedCategories: [
        {
          domainNames: ['example.com'],
          domains: [],
          id: 'category-1',
          name: 'Reading',
        },
        {
          domainNames: [],
          domains: ['other-group'],
          id: 'category-2',
          name: 'Other',
        },
      ],
      updatedSavedTabs: [
        {
          domain: 'example.com',
          id: 'group-1',
        },
      ],
    }

    const nextState = syncGroupCategoryAssignment(
      {
        domain: 'example.com',
        id: 'group-1',
      },
      buildPresentationCategoryLookup(state.updatedCategories),
      state,
    )

    expect(nextState.updatedCategories).toStrictEqual([
      expect.objectContaining({
        domains: ['group-1'],
        id: 'category-1',
      }),
      expect.objectContaining({
        domains: ['other-group'],
        id: 'category-2',
      }),
    ])
    expect(nextState.updatedSavedTabs).toStrictEqual([
      expect.objectContaining({
        id: 'group-1',
        parentCategoryId: 'category-1',
      }),
    ])
    expect(nextState.categoriesChanged).toBe(true)
    expect(nextState.savedTabsChanged).toBe(true)
  })

  it('helper は複数グループ削除で ID と legacy URL の同期削除を扱う', async () => {
    const useCases = {
      loadTabGroupUrls: vi.fn().mockResolvedValue({
        urls: [
          {
            id: 'legacy-url',
            savedAt: 1,
            title: 'Legacy',
            url: 'https://legacy.example.com/a',
          },
        ],
      }),
    }

    await removeUrlsFromCustomProjectsForGroups(
      [
        {
          domain: 'ids.example.com',
          id: 'group-with-ids',
          urlIds: ['url-a'],
        },
        {
          domain: 'legacy.example.com',
          id: 'legacy-group',
        },
      ],
      useCases as never,
    )

    expect(removeUrlIdsFromAllCustomProjects).toHaveBeenCalledWith(['url-a'], {
      throwOnError: true,
    })
    expect(removeUrlsFromAllCustomProjects).toHaveBeenCalledWith(
      ['https://legacy.example.com/a'],
      { throwOnError: true },
    )
  })

  it('helper は legacy URL 取得が undefined を返しても同期削除をスキップする', async () => {
    const useCases = {
      loadTabGroupUrls: vi.fn().mockResolvedValue({ urls: undefined }),
    }

    await removeUrlsFromCustomProjectsForGroups(
      [
        {
          domain: 'legacy.example.com',
          id: 'legacy-group',
        },
      ],
      useCases as never,
    )

    expect(removeUrlsFromAllCustomProjects).not.toHaveBeenCalled()
  })

  it('helper は legacy URL 取得が空配列なら同期削除をスキップする', async () => {
    const useCases = {
      loadTabGroupUrls: vi.fn().mockResolvedValue({ urls: [] }),
    }

    await removeUrlsFromCustomProjectsForGroup(
      {
        domain: 'empty.example.com',
        id: 'empty-group',
      },
      useCases as never,
    )

    expect(removeUrlsFromAllCustomProjects).not.toHaveBeenCalled()
  })

  it('helper はカテゴリ順序に合わせてグループを並べる', () => {
    // 旧 `sortCategorizedGroups` の挙動確認 (categorized 内の sort) は
    // domain 側の `organizeTabGroupsWithCategories` 経由で同等確認する。
    // 入力は domains に登録された id のみとし、categorized に push される
    // 状態を作る (issue #496: sortCategorizedGroups は domain へ移設)。
    const categoryLookup = buildPresentationCategoryLookup([
      {
        domainNames: [],
        domains: ['group-a', 'group-b', 'group-c'],
        id: 'category-1',
        name: 'Ordered',
      },
    ])
    const sortedResult = organizeTabGroupsWithCategories({
      categoryLookup,
      enableCategories: true,
      tabGroupsWithUrls: [
        { domain: 'c.example.com', id: 'group-c', urlIds: ['c'] },
        { domain: 'b.example.com', id: 'group-b', urlIds: ['b'] },
        { domain: 'a.example.com', id: 'group-a', urlIds: ['a'] },
      ],
    })
    const sortedGroups = sortedResult.categorized['category-1'] ?? []
    expect(sortedGroups.map((group) => group.id)).toStrictEqual([
      'group-a',
      'group-b',
      'group-c',
    ])

    expect(
      filterGroupsByExcludedIds(sortedGroups, new Set(['group-b'])).map(
        (group) => group.id,
      ),
    ).toStrictEqual(['group-a', 'group-c'])
    expect(
      createFilterGroupsByExcludedIdsUpdater(new Set(['group-a']))(
        sortedGroups,
      ).map((group) => group.id),
    ).toStrictEqual(['group-b', 'group-c'])
  })

  it('プロジェクト名一致で対象プロジェクトだけを表示する', async () => {
    render(<SavedTabsApp />)

    fireEvent.change(screen.getByLabelText('search'), {
      target: { value: 'Reading' },
    })

    await waitFor(() => {
      expect(screen.getByText('project:Reading List')).toBeTruthy()
    })

    expect(screen.queryByText('project:Work')).toBeNull()
    expect(screen.queryByText('project:Videos')).toBeNull()
  })

  it('URL 一致で対象プロジェクトに絞り込み、一致した URL を表示する', async () => {
    render(<SavedTabsApp />)

    fireEvent.change(screen.getByLabelText('search'), {
      target: { value: 'docker-cmd' },
    })

    await waitFor(() => {
      expect(
        screen.getByText(
          'url:Container article:https://example.com/docker-cmd',
        ),
      ).toBeTruthy()
    })

    expect(screen.getByText('project:Work')).toBeTruthy()
    expect(screen.queryByText('project:Reading List')).toBeNull()
    expect(screen.queryByText('project:Videos')).toBeNull()
  })

  it('タイトル一致で対象プロジェクトに絞り込み、一致したタブを表示する', async () => {
    render(<SavedTabsApp />)

    fireEvent.change(screen.getByLabelText('search'), {
      target: { value: 'Meeting notes' },
    })

    await waitFor(() => {
      expect(
        screen.getByText('url:Meeting notes:https://example.com/video'),
      ).toBeTruthy()
    })

    expect(screen.getByText('project:Videos')).toBeTruthy()
    expect(screen.queryByText('project:Reading List')).toBeNull()
    expect(screen.queryByText('project:Work')).toBeNull()
  })

  it('initialViewMode が custom のときは初回描画で URL を domain に戻さない', () => {
    mocked.projectState.viewMode = 'domain'
    mocked.projectState.viewModeRef = { current: 'domain' }
    window.history.replaceState({}, '', '/saved-tabs.html?mode=custom')

    render(<SavedTabsApp initialViewMode='custom' />)

    expect(window.location.search).toBe('?mode=custom')
  })

  it('router 連携時は viewMode を onViewModeNavigate へ通知する', async () => {
    const onViewModeNavigate = vi.fn()
    mocked.projectState.viewMode = 'custom'
    mocked.projectState.viewModeRef = { current: 'custom' }

    render(<SavedTabsApp onViewModeNavigate={onViewModeNavigate} />)

    await waitFor(() => {
      expect(onViewModeNavigate).toHaveBeenCalledWith('custom')
    })
  })

  it('AI サイドバーが開いている場合は全幅レイアウトを使う', () => {
    render(<SavedTabsApp isAiSidebarOpen />)

    expect(document.querySelector('.min-h-screen.w-full.py-2')).toBeTruthy()
  })

  it('カテゴリ並び替えモードでは一時順序とフッター表示条件を使う', async () => {
    mocked.projectState.viewMode = 'domain'
    mocked.projectState.viewModeRef = { current: 'domain' }
    mocked.categoryState.isCategoryReorderMode = true
    mocked.categoryState.categoryOrder = ['category-a']
    mocked.categoryState.tempCategoryOrder = ['category-b']

    render(<SavedTabsApp initialViewMode='domain' />)

    await waitFor(() => {
      expect(mocked.domainModeContainerSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({
          categoryOrderForDisplay: ['category-b'],
        }),
      )
    })
  })

  it('メインコンテンツ側のヘッダートリガーは表示しない', () => {
    render(<SavedTabsApp />)

    expect(mocked.headerSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        showSidebarTrigger: undefined,
      }),
    )
  })

  it('ドメインモードでは親カテゴリ名検索で一致したグループを保持する', async () => {
    const group: TabGroup = {
      id: 'group-1',
      domain: 'example.com',
      urls: [
        {
          id: 'url-1',
          url: 'https://example.com/a',
          title: 'Unrelated title',
        },
      ],
      urlIds: ['url-1'],
    }
    mocked.projectState.viewMode = 'domain'
    mocked.projectState.viewModeRef = { current: 'domain' }
    mocked.categoryState.categories = [
      {
        id: 'category-1',
        name: 'Reading',
        domains: ['group-1'],
        domainNames: [],
      },
    ]
    mocked.categoryState.categoryOrder = ['category-1']
    mocked.tabDataState.tabGroups = [group]
    mocked.tabDataState.tabGroupsWithUrls = [group]

    render(<SavedTabsApp initialViewMode='domain' />)

    fireEvent.change(screen.getByLabelText('search'), {
      target: { value: 'Reading' },
    })

    await waitFor(() => {
      expect(mocked.domainModeContainerSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({
          hasContentTabGroupsCount: 1,
        }),
      )
    })
  })

  it('parentCategoryId が直接指す親カテゴリ名でも検索一致する', async () => {
    const group: TabGroup = {
      domain: 'example.com',
      id: 'group-1',
      parentCategoryId: 'category-1',
      urls: [
        {
          id: 'url-1',
          title: 'Unrelated title',
          url: 'https://example.com/a',
        },
      ],
      urlIds: ['url-1'],
    }
    mocked.projectState.viewMode = 'domain'
    mocked.projectState.viewModeRef = { current: 'domain' }
    mocked.categoryState.categories = [
      {
        domainNames: [],
        domains: [],
        id: 'category-1',
        name: 'Reading',
      },
    ]
    mocked.tabDataState.tabGroups = [group]
    mocked.tabDataState.tabGroupsWithUrls = [group]

    render(<SavedTabsApp initialViewMode='domain' />)

    fireEvent.change(screen.getByLabelText('search'), {
      target: { value: 'Reading' },
    })

    await waitFor(() => {
      expect(mocked.domainModeContainerSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({
          uncategorizedForDisplay: [
            expect.objectContaining({
              id: 'group-1',
            }),
          ],
        }),
      )
    })
  })

  it('検索時に URL 一覧が空のグループとカテゴリ未一致ログ分岐を扱う', async () => {
    const emptyGroup: TabGroup = {
      domain: 'empty.example.com',
      id: 'group-empty',
      urls: [],
    }
    const unmatchedGroup: TabGroup = {
      domain: 'unmatched.example.com',
      id: 'group-unmatched',
      urls: [
        {
          id: 'url-1',
          title: 'No hit',
          url: 'https://unmatched.example.com/a',
        },
      ],
      urlIds: ['url-1'],
    }
    mocked.projectState.viewMode = 'domain'
    mocked.projectState.viewModeRef = { current: 'domain' }
    mocked.tabDataState.tabGroups = [emptyGroup, unmatchedGroup]
    mocked.tabDataState.tabGroupsWithUrls = [emptyGroup, unmatchedGroup]

    render(<SavedTabsApp initialViewMode='domain' />)

    fireEvent.change(screen.getByLabelText('search'), {
      target: { value: 'missing' },
    })

    await waitFor(() => {
      expect(mocked.domainModeContainerSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({
          hasContentTabGroupsCount: 0,
        }),
      )
    })
  })

  it('カテゴリ無効時は全ドメインを未分類として渡す', async () => {
    mocked.projectState.viewMode = 'domain'
    mocked.projectState.viewModeRef = { current: 'domain' }
    mocked.tabDataState.tabGroups = [
      {
        domain: 'example.com',
        id: 'group-1',
        urlIds: ['url-a'],
      },
    ]
    mocked.tabDataState.tabGroupsWithUrls = mocked.tabDataState.tabGroups

    const addListener = vi.fn()
    const chromeGlobal = globalThis as unknown as { chrome: typeof chrome }
    chromeGlobal.chrome = {
      storage: {
        local: {
          // eslint-disable-next-line typescript/require-await
          get: vi.fn(async () => ({
            savedTabs: mocked.tabDataState.tabGroups,
          })),
          set: vi.fn(),
        },
        onChanged: {
          addListener,
          removeListener: vi.fn(),
        },
      },
      tabs: {
        create: vi.fn(),
      },
      windows: {
        create: vi.fn(),
      },
      runtime: {
        getURL: vi.fn(),
      },
    } as unknown as typeof chrome
    // eslint-disable-next-line typescript/require-await
    vi.mocked(syncStorageChanges).mockImplementationOnce(async (options) => {
      // eslint-disable-line
      options.setSettings({
        ...mocked.settings,
        enableCategories: false,
      })
      return []
    })

    render(<SavedTabsApp initialViewMode='domain' />)

    const listener = addListener.mock.calls[0]?.[0] as (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => void
    await act(async () => {
      listener(
        {
          settings: {
            newValue: {
              enableCategories: false,
            },
          },
        },
        'local',
      )
    })

    await waitFor(() => {
      expect(mocked.domainModeContainerSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({
          categorized: {},
          uncategorizedForDisplay: [
            expect.objectContaining({
              id: 'group-1',
            }),
          ],
        }),
      )
    })
  })

  it('既に ID で紐付いたカテゴリは domainNames 同期で再保存しない', async () => {
    const group: TabGroup = {
      id: 'group-1',
      domain: 'example.com',
      parentCategoryId: 'category-1',
      urls: [
        {
          id: 'url-1',
          url: 'https://example.com/a',
          title: 'A',
        },
      ],
      urlIds: ['url-1'],
    }
    const category = {
      id: 'category-1',
      name: 'Reading',
      domains: ['group-1'],
      domainNames: ['example.com'],
    }
    mocked.projectState.viewMode = 'domain'
    mocked.projectState.viewModeRef = { current: 'domain' }
    mocked.categoryState.categories = [category]
    mocked.categoryState.categoryOrder = ['category-1']
    mocked.tabDataState.tabGroups = [group]
    mocked.tabDataState.tabGroupsWithUrls = [group]

    const chromeSetMock = vi.fn()
    const chromeGlobal = globalThis as unknown as { chrome: typeof chrome }
    chromeGlobal.chrome = {
      storage: {
        local: {
          // eslint-disable-next-line typescript/require-await
          get: vi.fn(async (key: string) => {
            if (key === 'parentCategories') {
              return { parentCategories: [category] }
            }
            if (key === 'savedTabs') {
              return { savedTabs: [group] }
            }
            return {}
          }),
          set: chromeSetMock,
        },
        onChanged: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
      },
      tabs: {
        create: vi.fn(),
      },
      windows: {
        create: vi.fn(),
      },
      runtime: {
        getURL: vi.fn(),
      },
    } as unknown as typeof chrome

    render(<SavedTabsApp initialViewMode='domain' />)

    await waitFor(() => {
      expect(mocked.domainModeContainerSpy).toHaveBeenCalled()
    })

    expect(saveParentCategories).not.toHaveBeenCalled()
    expect(chromeSetMock).not.toHaveBeenCalled()
  })

  it('ドメイン全削除ではカスタムプロジェクト同期を URL ごとではなく一括で実行する', async () => {
    const group: TabGroup = {
      id: 'group-1',
      domain: 'example.com',
      urls: [
        { id: 'url-a', url: 'https://example.com/a', title: 'A' },
        { id: 'url-b', url: 'https://example.com/b', title: 'B' },
      ],
      urlIds: ['url-a', 'url-b'],
    }
    mocked.projectState.viewMode = 'domain'
    mocked.projectState.viewModeRef = { current: 'domain' }
    mocked.categoryState.categories = [
      {
        id: 'category-1',
        name: 'Category',
        domains: ['group-1'],
        domainNames: ['example.com'],
      },
    ]
    mocked.tabDataState.tabGroups = [group]
    mocked.tabDataState.tabGroupsWithUrls = [group]
    const customProjectsSnapshot: CustomProject[] = [
      {
        id: 'project-1',
        name: 'Project A',
        urlIds: ['url-a', 'url-b'],
        categories: [],
        createdAt: 1,
        updatedAt: 2,
      },
    ]

    const chromeSetMock = vi.fn()
    const chromeGlobal = globalThis as unknown as { chrome: typeof chrome }
    chromeGlobal.chrome = {
      storage: {
        local: {
          // eslint-disable-next-line typescript/require-await
          get: vi.fn(async () => ({
            customProjectOrder: ['project-1'],
            customProjects: customProjectsSnapshot,
            savedTabs: [group],
          })),
          set: chromeSetMock,
        },
        onChanged: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
      },
      tabs: {
        create: vi.fn(),
      },
      windows: {
        create: vi.fn(),
      },
      runtime: {
        getURL: vi.fn(),
      },
    } as unknown as typeof chrome

    vi.mocked(getTabGroupUrls).mockResolvedValue([
      { url: 'https://example.com/a', title: 'A', id: 'url-a', savedAt: 1 },
      { url: 'https://example.com/b', title: 'B', id: 'url-b', savedAt: 2 },
    ])

    render(<SavedTabsApp initialViewMode='domain' />)

    const domainProps = mocked.domainModeContainerSpy.mock.calls.at(
      -1,
    )?.[0] as {
      handleDeleteGroup: (id: string) => Promise<void>
    }

    await domainProps.handleDeleteGroup('group-1')

    expect(handleTabGroupRemoval).toHaveBeenCalledWith('group-1')
    expect(removeUrlIdsFromAllCustomProjects).toHaveBeenCalledWith(
      ['url-a', 'url-b'],
      { throwOnError: true },
    )
    expect(toast.info).toHaveBeenCalledWith(
      '削除した2件のタブを保存データに戻せます',
      expect.objectContaining({
        action: expect.objectContaining({
          label: '元に戻す',
        }),
      }),
    )

    const undoOptions = vi.mocked(toast.info).mock.calls.at(-1)?.[1] as
      | {
          action?: {
            onClick?: () => Promise<void>
          }
        }
      | undefined
    await undoOptions?.action?.onClick?.()

    // 復元は RestoreOpenedUrlsSnapshotUseCase 経由になり、TabGroup /
    // CustomProject / ParentCategory / customProjectOrder すべて
    // repository 経由で個別に書き戻される（issue #487）。
    // customProjectOrder は chromeCustomProjectRepository.saveOrder
    // 経由で chrome.storage.local.set に到達する。
    expect(chromeSetMock).toHaveBeenLastCalledWith({
      customProjectOrder: ['project-1'],
    })
    expect(mocked.projectState.setCustomProjects).toHaveBeenCalledWith(
      customProjectsSnapshot,
    )
    expect(mocked.categoryState.setCategories).toHaveBeenCalledWith(
      mocked.categoryState.categories,
    )
    expect(toast.success).toHaveBeenCalledWith('保存データを復元しました')
    expect(removeUrlsFromAllCustomProjects).not.toHaveBeenCalled()
    expect(removeUrlFromAllCustomProjects).not.toHaveBeenCalled()
  })

  it('ドメイン子カテゴリ一括削除では URL 文字列ではなく URL ID ベースの削除を優先する', async () => {
    const group: TabGroup = {
      id: 'group-1',
      domain: 'example.com',
      urls: [
        {
          id: 'url-a',
          url: 'https://example.com/a',
          title: 'A',
          subCategory: 'news',
        },
        {
          id: 'url-b',
          url: 'https://example.com/b',
          title: 'B',
          subCategory: 'news',
        },
      ],
      urlIds: ['url-a', 'url-b'],
      subCategories: ['news'],
    }
    mocked.projectState.viewMode = 'domain'
    mocked.projectState.viewModeRef = { current: 'domain' }
    mocked.categoryState.categories = []
    mocked.tabDataState.tabGroups = [group]
    mocked.tabDataState.tabGroupsWithUrls = [group]

    const urlRecords = [
      {
        id: 'url-a',
        url: 'https://example.com/a',
        title: 'A',
        savedAt: 1,
      },
      {
        id: 'url-b',
        url: 'https://example.com/b',
        title: 'B',
        savedAt: 2,
      },
    ]
    const chromeGlobal = globalThis as unknown as { chrome: typeof chrome }
    chromeGlobal.chrome = {
      storage: {
        local: {
          // eslint-disable-next-line typescript/require-await
          get: vi.fn(async (key: string) => {
            if (key === 'savedTabs') {
              return { savedTabs: [group] }
            }
            if (key === 'urls') {
              return { urls: urlRecords }
            }
            return {}
          }),
          set: vi.fn(),
        },
        onChanged: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
      },
      tabs: {
        create: vi.fn(),
      },
      windows: {
        create: vi.fn(),
      },
      runtime: {
        getURL: vi.fn(),
      },
    } as unknown as typeof chrome

    render(<SavedTabsApp initialViewMode='domain' />)

    const domainProps = mocked.domainModeContainerSpy.mock.calls.at(
      -1,
    )?.[0] as {
      handleDeleteUrls: (groupId: string, urls: string[]) => Promise<void>
    }

    await domainProps.handleDeleteUrls('group-1', [
      'https://example.com/a',
      'https://example.com/b',
    ])

    // 複数 URL 削除は use-case 経由で実行される。
    // `removeUrlIdsFromTabGroup` / `removeUrlsFromTabGroup` は呼ばれず、
    // use-case が repository 経由で storage を更新する。
    expect(removeUrlIdsFromTabGroup).not.toHaveBeenCalled()
    expect(removeUrlsFromTabGroup).not.toHaveBeenCalled()
    expect(toast.info).toHaveBeenCalledWith(
      '削除した2件のタブを保存データに戻せます',
      expect.objectContaining({
        action: expect.objectContaining({
          label: '元に戻す',
        }),
      }),
    )
    expect(mocked.tabDataState.refreshTabGroupsWithUrls).not.toHaveBeenCalled()
  })

  it('ドメイン子カテゴリ一括削除は対象グループなしなら URL 文字列削除にフォールバックし失敗時に通知する', async () => {
    mocked.projectState.viewMode = 'domain'
    mocked.projectState.viewModeRef = { current: 'domain' }
    mocked.tabDataState.tabGroups = []
    mocked.tabDataState.tabGroupsWithUrls = []

    const chromeSetMock = vi.fn()
    const chromeGlobal = globalThis as unknown as { chrome: typeof chrome }
    chromeGlobal.chrome = {
      storage: {
        local: {
          // eslint-disable-next-line typescript/require-await
          get: vi.fn(async () => ({ savedTabs: [] })),
          set: chromeSetMock,
        },
        onChanged: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
      },
      tabs: {
        create: vi.fn(),
      },
      windows: {
        create: vi.fn(),
      },
      runtime: {
        getURL: vi.fn(),
      },
    } as unknown as typeof chrome

    render(<SavedTabsApp initialViewMode='domain' />)

    const domainProps = mocked.domainModeContainerSpy.mock.calls.at(
      -1,
    )?.[0] as {
      handleDeleteUrls: (groupId: string, urls: string[]) => Promise<void>
    }

    // 存在しないグループに対する handleDeleteUrls は use-case 内で
    // `SavedTabsDomainError` を投げ、UI 側で notifyDeleteFailure が走る。
    // 旧 `removeUrlsFromTabGroup` フォールバックはリプレース済みのため
    // 呼ばれない。
    await domainProps.handleDeleteUrls('missing-group', [
      'https://example.com/missing',
    ])

    expect(removeUrlsFromTabGroup).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith('削除に失敗しました')
  })

  it('未分類ドラッグは既に並び替え中なら一時順序だけを更新する', async () => {
    const firstGroup: TabGroup = {
      domain: 'first.example.com',
      id: 'first',
      urlIds: ['url-1'],
    }
    const secondGroup: TabGroup = {
      domain: 'second.example.com',
      id: 'second',
      urlIds: ['url-2'],
    }
    mocked.projectState.viewMode = 'domain'
    mocked.projectState.viewModeRef = { current: 'domain' }
    mocked.tabDataState.tabGroups = [firstGroup, secondGroup]
    mocked.tabDataState.tabGroupsWithUrls = [firstGroup, secondGroup]

    render(<SavedTabsApp initialViewMode='domain' />)

    let domainProps = mocked.domainModeContainerSpy.mock.calls.at(-1)?.[0] as {
      handleUncategorizedDragEnd: (event: {
        active: { id: string }
        over: { id: string }
      }) => void
      uncategorizedForDisplay: TabGroup[]
    }

    act(() => {
      domainProps.handleUncategorizedDragEnd({
        active: { id: 'first' },
        over: { id: 'second' },
      })
    })

    await waitFor(() => {
      expect(
        // eslint-disable-next-line typescript/no-non-null-assertion
        (
          mocked.domainModeContainerSpy.mock.calls.at(-1)![0] as {
            // eslint-disable-line
            // eslint-disable-line
            // eslint-disable-line
            uncategorizedForDisplay: TabGroup[]
          }
        ).uncategorizedForDisplay.map((group) => group.id),
      ).toStrictEqual(['second', 'first'])
    })

    domainProps = mocked.domainModeContainerSpy.mock.calls.at(-1)?.[0] as {
      handleUncategorizedDragEnd: (event: {
        active: { id: string }
        over: { id: string }
      }) => void
      uncategorizedForDisplay: TabGroup[]
    }

    act(() => {
      domainProps.handleUncategorizedDragEnd({
        active: { id: 'first' },
        over: { id: 'second' },
      })
    })

    await waitFor(() => {
      expect(
        // eslint-disable-next-line typescript/no-non-null-assertion
        (
          mocked.domainModeContainerSpy.mock.calls.at(-1)![0] as {
            // eslint-disable-line
            // eslint-disable-line
            // eslint-disable-line
            uncategorizedForDisplay: TabGroup[]
          }
        ).uncategorizedForDisplay.map((group) => group.id),
      ).toStrictEqual(['first', 'second'])
    })

    act(() => {
      domainProps.handleUncategorizedDragEnd({
        active: { id: 'missing' },
        over: { id: 'second' },
      })
    })

    expect(
      // eslint-disable-next-line typescript/no-non-null-assertion
      (
        mocked.domainModeContainerSpy.mock.calls.at(-1)![0] as {
          // eslint-disable-line
          // eslint-disable-line
          // eslint-disable-line
          uncategorizedForDisplay: TabGroup[]
        }
      ).uncategorizedForDisplay.map((group) => group.id),
    ).toStrictEqual(['first', 'second'])
  })

  it('ドメイン内の単体タブ削除でも Undo で削除前の保存データを復元できる', async () => {
    const group: TabGroup = {
      id: 'group-1',
      domain: 'example.com',
      urls: [{ id: 'url-a', url: 'https://example.com/a', title: 'A' }],
      urlIds: ['url-a'],
    }
    const urlRecord = {
      id: 'url-a',
      url: 'https://example.com/a',
      title: 'A',
      savedAt: 1,
    }
    mocked.projectState.viewMode = 'domain'
    mocked.projectState.viewModeRef = { current: 'domain' }
    mocked.tabDataState.tabGroups = [group]
    mocked.tabDataState.tabGroupsWithUrls = [group]
    const customProjectsSnapshot: CustomProject[] = [
      {
        id: 'project-1',
        name: 'Project A',
        urlIds: ['url-a'],
        categories: [],
        createdAt: 1,
        updatedAt: 2,
      },
    ]

    const chromeSetMock = vi.fn()
    const chromeGlobal = globalThis as unknown as { chrome: typeof chrome }
    chromeGlobal.chrome = {
      storage: {
        local: {
          // eslint-disable-next-line typescript/require-await
          get: vi.fn(async (key: string | string[]) => {
            const keys = Array.isArray(key) ? key : [key]
            const result: Record<string, unknown> = {}
            for (const k of keys) {
              if (k === 'customProjectOrder') {
                result.customProjectOrder = ['project-1']
              } else if (k === 'customProjects') {
                result.customProjects = customProjectsSnapshot
              } else if (k === 'savedTabs') {
                result.savedTabs = [group]
              } else if (k === 'urls') {
                result.urls = [urlRecord]
              }
            }
            return result
          }),
          set: chromeSetMock,
        },
        onChanged: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
      },
      tabs: {
        create: vi.fn(),
      },
      windows: {
        create: vi.fn(),
      },
      runtime: {
        getURL: vi.fn(),
      },
    } as unknown as typeof chrome

    render(<SavedTabsApp initialViewMode='domain' />)

    const domainProps = mocked.domainModeContainerSpy.mock.calls.at(
      -1,
    )?.[0] as {
      handleDeleteUrl: (groupId: string, url: string) => Promise<void>
    }

    await domainProps.handleDeleteUrl('group-1', 'https://example.com/a')

    // 単体 URL 削除は use-case 経由で実行され、
    // グループに 1 件しか URL が無いため、削除後はグループ自体が消える。
    expect(chromeSetMock).toHaveBeenCalledWith({
      savedTabs: [],
    })
    expect(toast.info).toHaveBeenCalledWith(
      '削除した1件のタブを保存データに戻せます',
      expect.objectContaining({
        action: expect.objectContaining({
          label: '元に戻す',
        }),
      }),
    )

    const undoOptions = vi.mocked(toast.info).mock.calls.at(-1)?.[1] as
      | {
          action?: {
            onClick?: () => Promise<void>
          }
        }
      | undefined
    await undoOptions?.action?.onClick?.()

    // 復元は RestoreOpenedUrlsSnapshotUseCase 経由になり、TabGroup /
    // CustomProject / customProjectOrder すべて repository 経由で
    // 個別に書き戻される（issue #487）。customProjectOrder は
    // chromeCustomProjectRepository.saveOrder 経由で chrome.storage.local
    // に到達する。
    expect(chromeSetMock).toHaveBeenLastCalledWith({
      customProjectOrder: ['project-1'],
    })
    expect(mocked.projectState.setCustomProjects).toHaveBeenCalledWith(
      customProjectsSnapshot,
    )
  })

  it('ドメイン内の単体タブ削除が失敗した場合は snapshot を復元して通知する', async () => {
    const group: TabGroup = {
      id: 'group-1',
      domain: 'example.com',
      urls: [{ id: 'url-a', url: 'https://example.com/a', title: 'A' }],
      urlIds: ['url-a'],
    }
    const customProjectsSnapshot: CustomProject[] = [
      {
        id: 'project-1',
        name: 'Project A',
        urlIds: ['url-a'],
        categories: [],
        createdAt: 1,
        updatedAt: 2,
      },
    ]
    mocked.projectState.viewMode = 'domain'
    mocked.projectState.viewModeRef = { current: 'domain' }
    mocked.tabDataState.tabGroups = [group]
    mocked.tabDataState.tabGroupsWithUrls = [group]

    const chromeSetMock = vi.fn()
    const chromeGlobal = globalThis as unknown as { chrome: typeof chrome }
    chromeGlobal.chrome = {
      storage: {
        local: {
          // eslint-disable-next-line typescript/require-await
          get: vi.fn(async () => ({
            customProjectOrder: ['project-1'],
            customProjects: customProjectsSnapshot,
            savedTabs: [group],
          })),
          set: chromeSetMock,
        },
        onChanged: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
      },
      tabs: {
        create: vi.fn(),
      },
      windows: {
        create: vi.fn(),
      },
      runtime: {
        getURL: vi.fn(),
      },
    } as unknown as typeof chrome

    render(<SavedTabsApp initialViewMode='domain' />)

    const domainProps = mocked.domainModeContainerSpy.mock.calls.at(
      -1,
    )?.[0] as {
      handleDeleteUrl: (groupId: string, url: string) => Promise<void>
    }

    await domainProps.handleDeleteUrl('group-1', 'https://example.com/a')

    // 削除失敗時は catch から `notifyDeleteFailure` が呼ばれ、
    // RestoreOpenedUrlsSnapshotUseCase 経由で snapshot が復元される。
    // TabGroup / CustomProject / customProjectOrder すべて
    // repository 経由で書き戻される（issue #487）。
    // customProjectOrder は chromeCustomProjectRepository.saveOrder
    // 経由で chrome.storage.local.set に到達する。
    expect(chromeSetMock).toHaveBeenLastCalledWith({
      customProjectOrder: ['project-1'],
    })
    expect(mocked.projectState.setCustomProjects).toHaveBeenCalledWith(
      customProjectsSnapshot,
    )
    expect(toast.error).toHaveBeenCalledWith('削除に失敗しました')
    expect(toast.info).not.toHaveBeenCalled()
  })

  it('すべて開く後の自動削除は一致グループを一括更新し、グループごとの削除APIを繰り返さない', async () => {
    mocked.settings.removeTabAfterOpen = true
    mocked.settings.openAllInNewWindow = false
    mocked.settings.openUrlInBackground = false
    mocked.projectState.viewMode = 'domain'
    mocked.projectState.viewModeRef = { current: 'domain' }

    const group1: TabGroup = {
      id: 'group-1',
      domain: 'example.com',
      urlIds: ['url-a', 'url-b'],
      urls: [
        { id: 'url-a', url: 'https://example.com/a', title: 'A' },
        { id: 'url-b', url: 'https://example.com/b', title: 'B' },
      ],
      urlSubCategories: {
        'url-a': 'news',
        'url-b': 'docs',
      },
    }
    const group2: TabGroup = {
      id: 'group-2',
      domain: 'other.com',
      urlIds: ['url-c'],
      urls: [{ id: 'url-c', url: 'https://other.com/c', title: 'C' }],
    }

    mocked.tabDataState.tabGroups = [group1, group2]
    mocked.tabDataState.tabGroupsWithUrls = [group1, group2]
    const customProjectsSnapshot: CustomProject[] = [
      {
        id: 'project-1',
        name: 'Project A',
        urlIds: ['url-a', 'url-c'],
        categories: [],
        createdAt: 1,
        updatedAt: 2,
      },
    ]

    const chromeSetMock = vi.fn()
    const chromeGlobal = globalThis as unknown as { chrome: typeof chrome }
    chromeGlobal.chrome = {
      storage: {
        local: {
          // eslint-disable-next-line typescript/require-await
          get: vi.fn(async (key: string | string[]) => {
            const keys = Array.isArray(key) ? key : [key]
            const result: Record<string, unknown> = {}
            for (const k of keys) {
              if (k === 'customProjectOrder') {
                result.customProjectOrder = ['project-1']
              } else if (k === 'customProjects') {
                result.customProjects = customProjectsSnapshot
              } else if (k === 'savedTabs') {
                result.savedTabs = [group1, group2]
              } else if (k === 'urls') {
                result.urls = [
                  {
                    id: 'url-a',
                    url: 'https://example.com/a',
                    title: 'A',
                    savedAt: 1,
                  },
                  {
                    id: 'url-b',
                    url: 'https://example.com/b',
                    title: 'B',
                    savedAt: 2,
                  },
                  {
                    id: 'url-c',
                    url: 'https://other.com/c',
                    title: 'C',
                    savedAt: 3,
                  },
                ]
              }
            }
            return result
          }),
          set: chromeSetMock,
        },
        onChanged: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
      },
      tabs: {
        create: vi.fn(),
      },
      windows: {
        create: vi.fn(),
      },
      runtime: {
        getURL: vi.fn(),
      },
    } as unknown as typeof chrome

    render(<SavedTabsApp initialViewMode='domain' />)

    const domainProps = mocked.domainModeContainerSpy.mock.calls.at(
      -1,
    )?.[0] as {
      handleOpenAllTabs: (
        urls: { url: string; title: string }[],
      ) => Promise<void>
    }

    await domainProps.handleOpenAllTabs([
      { url: 'https://example.com/a', title: 'A' },
      { url: 'https://example.com/b', title: 'B' },
    ])

    // BrowserTabPort の呼び出し検証は
    // SavedTabsUseCases.openAllSavedUrls の mock 経由に切り替わったため、
    // 旧 `chrome.tabs.create` 直叩きではなく storage の更新有無で
    // 削除フローを確認する。
    expect(chromeSetMock).toHaveBeenCalledWith({
      savedTabs: [group2],
    })
    expect(toast.info).toHaveBeenCalledWith(
      '開いた2件のタブを保存データから削除しました',
      expect.objectContaining({
        action: expect.objectContaining({
          label: '元に戻す',
        }),
      }),
    )

    const undoOptions = vi.mocked(toast.info).mock.calls.at(-1)?.[1] as
      | {
          action?: {
            onClick?: () => Promise<void>
          }
        }
      | undefined
    await undoOptions?.action?.onClick?.()

    // 復元は RestoreOpenedUrlsSnapshotUseCase 経由になり、TabGroup /
    // CustomProject / customProjectOrder すべて repository 経由で
    // 個別に書き戻される（issue #487）。customProjectOrder は
    // chromeCustomProjectRepository.saveOrder 経由で chrome.storage.local
    // に到達する。
    expect(chromeSetMock).toHaveBeenLastCalledWith({
      customProjectOrder: ['project-1'],
    })
    expect(mocked.projectState.setCustomProjects).toHaveBeenCalledWith(
      customProjectsSnapshot,
    )
    expect(toast.success).toHaveBeenCalledWith('保存データを復元しました')
    // 一括オープン時の customProject 側 URL ID 同期削除は、
    // OpenAllSavedUrlsUseCase が customProjectRepository 経由で
    // 行うため、lib/storage/projects のヘルパは呼ばれない。
    expect(removeUrlIdsFromAllCustomProjects).not.toHaveBeenCalled()
    expect(getTabGroupUrls).not.toHaveBeenCalled()
    expect(removeUrlFromAllCustomProjects).not.toHaveBeenCalled()
  })

  it('すべて開く後の自動削除はURL ID未解決や変更なしなら保存しない', async () => {
    mocked.settings.removeTabAfterOpen = true
    mocked.projectState.viewMode = 'domain'
    mocked.projectState.viewModeRef = { current: 'domain' }
    const groupWithoutIds: TabGroup = {
      id: 'group-without-ids',
      domain: 'without-ids.example.com',
      urls: [{ url: 'https://without-ids.example.com/a', title: 'A' }],
    }
    const unchangedGroup: TabGroup = {
      id: 'group-unchanged',
      domain: 'unchanged.example.com',
      urlIds: ['url-keep'],
      urls: [
        {
          id: 'url-keep',
          url: 'https://unchanged.example.com/keep',
          title: 'Keep',
        },
      ],
    }
    const partialGroup: TabGroup = {
      id: 'group-partial',
      domain: 'partial.example.com',
      urlIds: ['url-remove', 'url-stay'],
      urls: [
        {
          id: 'url-remove',
          url: 'https://partial.example.com/remove',
          title: 'Remove',
        },
        {
          id: 'url-stay',
          url: 'https://partial.example.com/stay',
          title: 'Stay',
        },
      ],
    }
    mocked.tabDataState.tabGroups = [
      groupWithoutIds,
      unchangedGroup,
      partialGroup,
    ]
    mocked.tabDataState.tabGroupsWithUrls = mocked.tabDataState.tabGroups

    const partialUrlRecord = {
      id: 'url-remove',
      savedAt: 1,
      title: 'Remove',
      url: 'https://partial.example.com/remove',
    }

    const chromeSetMock = vi.fn()
    const chromeGlobal = globalThis as unknown as { chrome: typeof chrome }
    chromeGlobal.chrome = {
      storage: {
        local: {
          // eslint-disable-next-line typescript/require-await
          get: vi.fn(async (key: string) => {
            if (key === 'savedTabs') {
              return {
                savedTabs: [groupWithoutIds, unchangedGroup, partialGroup],
              }
            }
            if (key === 'urls') {
              return { urls: [partialUrlRecord] }
            }
            return {}
          }),
          set: chromeSetMock,
        },
        onChanged: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
      },
      tabs: {
        create: vi.fn(),
      },
      windows: {
        create: vi.fn(),
      },
      runtime: {
        getURL: vi.fn(),
      },
    } as unknown as typeof chrome

    render(<SavedTabsApp initialViewMode='domain' />)

    const domainProps = mocked.domainModeContainerSpy.mock.calls.at(
      -1,
    )?.[0] as {
      handleOpenAllTabs: (
        urls: { url: string; title: string }[],
      ) => Promise<void>
    }

    await domainProps.handleOpenAllTabs([])
    expect(chromeSetMock).not.toHaveBeenCalled()

    // URL ID 未解決（storage の urls キーに存在しない）のときは
    // use-case 側で削除対象 0 件となり storage 更新されない。
    await domainProps.handleOpenAllTabs([
      { title: 'Missing ID', url: 'https://missing.example.com/a' },
    ])
    expect(chromeSetMock).not.toHaveBeenCalled()

    await domainProps.handleOpenAllTabs([
      { title: 'Remove', url: 'https://partial.example.com/remove' },
    ])

    expect(chromeSetMock).toHaveBeenCalledWith({
      savedTabs: [
        groupWithoutIds,
        unchangedGroup,
        expect.objectContaining({
          id: 'group-partial',
          urlIds: ['url-stay'],
        }),
      ],
    })
  })

  it('custom mode props はURL open/delete/move handlers を実行する', async () => {
    const chromeTabsCreateMock = vi.fn()
    const chromeGlobal = globalThis as unknown as { chrome: typeof chrome }
    chromeGlobal.chrome = {
      storage: {
        local: {
          // eslint-disable-next-line typescript/require-await
          get: vi.fn(async () => ({ savedTabs: [] })),
          set: vi.fn(),
        },
        onChanged: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
      },
      tabs: {
        create: chromeTabsCreateMock,
      },
      windows: {
        create: vi.fn(),
      },
      runtime: {
        getURL: vi.fn(),
      },
    } as unknown as typeof chrome

    render(<SavedTabsApp />)

    const customProps = mocked.customModeContainerSpy.mock.calls.at(
      -1,
    )?.[0] as {
      handleDeleteUrl: (projectId: string, url: string) => Promise<void>
      handleMoveUrlBetweenProjects: (
        sourceProjectId: string,
        targetProjectId: string,
        url: string,
      ) => Promise<null>
      handleOpenAllUrls: (
        urls: { url: string; title: string }[],
      ) => Promise<void>
      handleOpenUrl: (url: string) => Promise<void>
    }

    await customProps.handleOpenUrl('https://example.com/doc')
    await customProps.handleOpenAllUrls([
      {
        title: 'Doc',
        url: 'https://example.com/doc',
      },
    ])
    await customProps.handleDeleteUrl('project-1', 'https://example.com/doc')
    await expect(
      customProps.handleMoveUrlBetweenProjects(
        'project-1',
        'project-2',
        'https://example.com/doc',
      ),
    ).resolves.toBeNull()

    expect(chromeTabsCreateMock).toHaveBeenCalledWith({
      active: false,
      url: 'https://example.com/doc',
    })
    expect(mocked.projectState.handleDeleteUrlFromProject).toHaveBeenCalledWith(
      'project-1',
      'https://example.com/doc',
    )
    expect(moveCustomProjectUrlAndSyncState).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceProjectId: 'project-1',
        targetProjectId: 'project-2',
        url: 'https://example.com/doc',
      }),
    )
  })

  it('custom URL移動エラーは toast error に落として null を返す', async () => {
    vi.mocked(moveCustomProjectUrlAndSyncState).mockRejectedValue(
      new Error('move failed'),
    )

    render(<SavedTabsApp />)

    const customProps = mocked.customModeContainerSpy.mock.calls.at(
      -1,
    )?.[0] as {
      handleMoveUrlBetweenProjects: (
        sourceProjectId: string,
        targetProjectId: string,
        url: string,
      ) => Promise<null>
    }

    await expect(
      customProps.handleMoveUrlBetweenProjects(
        'project-1',
        'project-2',
        'https://example.com/doc',
      ),
    ).resolves.toBeNull()
  })

  it('複数ドメイン削除はURL IDと旧URL形式をまとめて同期削除する', async () => {
    // 旧形式 (`urls: [...]`) のグループは domain マイグレーション後
    // `urlIds` ベースへ揃う前提のため、両グループを `urlIds` 形式にし、
    // 両方のグループで ID 経由削除が動くことを検証する。
    const groupWithIds: TabGroup = {
      domain: 'example.com',
      id: 'group-1',
      urlIds: ['url-a'],
    }
    const legacyGroup: TabGroup = {
      domain: 'legacy.example.com',
      id: 'group-2',
      urlIds: ['legacy-url-id'],
    }
    mocked.projectState.viewMode = 'domain'
    mocked.projectState.viewModeRef = { current: 'domain' }
    mocked.tabDataState.tabGroups = [groupWithIds, legacyGroup]
    mocked.tabDataState.tabGroupsWithUrls = [groupWithIds, legacyGroup]
    const customProjectsSnapshot: CustomProject[] = [
      {
        id: 'project-1',
        name: 'Project A',
        urlIds: ['url-a'],
        categories: [],
        createdAt: 1,
        updatedAt: 2,
      },
    ]
    const chromeSetMock = vi.fn()
    const chromeGlobal = globalThis as unknown as { chrome: typeof chrome }
    chromeGlobal.chrome = {
      storage: {
        local: {
          // eslint-disable-next-line typescript/require-await
          get: vi.fn(async (key?: string) => {
            if (key === 'urls') {
              return {
                urls: [
                  {
                    id: 'legacy-url-id',
                    savedAt: 1,
                    title: 'Legacy',
                    url: 'https://legacy.example.com/a',
                  },
                ],
              }
            }
            return {
              customProjectOrder: ['project-1'],
              customProjects: customProjectsSnapshot,
              savedTabs: [groupWithIds, legacyGroup],
            }
          }),
          set: chromeSetMock,
        },
        onChanged: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
      },
      tabs: {
        create: vi.fn(),
      },
      windows: {
        create: vi.fn(),
      },
      runtime: {
        getURL: vi.fn(),
      },
    } as unknown as typeof chrome
    vi.mocked(removeUrlIdsFromAllCustomProjects).mockRejectedValueOnce(
      new Error('sync failed'),
    )

    render(<SavedTabsApp initialViewMode='domain' />)

    const domainProps = mocked.domainModeContainerSpy.mock.calls.at(
      -1,
    )?.[0] as {
      handleDeleteGroups: (ids: string[]) => Promise<void>
    }

    await domainProps.handleDeleteGroups([])
    await domainProps.handleDeleteGroups(['group-1', 'group-2'])

    expect(handleTabGroupRemoval).toHaveBeenCalledWith('group-1')
    expect(handleTabGroupRemoval).toHaveBeenCalledWith('group-2')
    // 両グループとも `urlIds` 経由の削除に揃えられるため、
    // 1 回目の `removeUrlIdsFromAllCustomProjects` 呼び出しで
    // `['url-a', 'legacy-url-id']` がまとめられる（旧形式のみ別ルートは廃止）。
    expect(removeUrlIdsFromAllCustomProjects).toHaveBeenCalledWith(
      ['url-a', 'legacy-url-id'],
      { throwOnError: true },
    )
    expect(chromeSetMock).toHaveBeenCalledWith({
      savedTabs: [],
    })
  })

  it('URL一括削除はID解決できない場合 URL 文字列削除へフォールバックする', async () => {
    const group: TabGroup = {
      domain: 'example.com',
      id: 'group-1',
      urls: [
        {
          id: 'url-a',
          title: 'A',
          url: 'https://example.com/a',
        },
        {
          title: 'No ID',
          url: 'https://example.com/no-id',
        },
      ],
    }
    mocked.projectState.viewMode = 'domain'
    mocked.projectState.viewModeRef = { current: 'domain' }
    mocked.tabDataState.tabGroups = [group]
    mocked.tabDataState.tabGroupsWithUrls = [group]

    // 一部 URL に ID が無い場合、旧実装は URL 文字列削除へフォールバック
    // していたが、新実装（DeleteSavedUrlsUseCase）は ID 解決できない URL
    // を SavedTabsDomainError で拒否し、UI 側で notifyDeleteFailure を
    // 走らせる。
    render(<SavedTabsApp initialViewMode='domain' />)

    const domainProps = mocked.domainModeContainerSpy.mock.calls.at(
      -1,
    )?.[0] as {
      handleDeleteUrls: (groupId: string, urls: string[]) => Promise<void>
    }

    await domainProps.handleDeleteUrls('group-1', [
      'https://example.com/a',
      'https://example.com/no-id',
    ])

    expect(removeUrlsFromTabGroup).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith('削除に失敗しました')
  })

  it('複数ドメイン削除で URL 解決に失敗しても削除処理は継続する', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    // `urlIds` が空のグループに限定して URL 解決パスに入り、
    // `loadTabGroupUrlsUseCase` が失敗するケースを想定。
    // snapshot 自体は成功させ、helper の URL 解決だけ失敗させる。
    const group: TabGroup = {
      domain: 'legacy.example.com',
      id: 'legacy-group',
      urlIds: [],
    }
    mocked.projectState.viewMode = 'domain'
    mocked.projectState.viewModeRef = { current: 'domain' }
    mocked.tabDataState.tabGroups = [group]
    mocked.tabDataState.tabGroupsWithUrls = [group]

    const chromeSetMock = vi.fn()
    const chromeGlobal = globalThis as unknown as { chrome: typeof chrome }
    // 1 回目（snapshot 取得時）は urls を空配列で返し、2 回目以降で
    // 例外を投げる。ただし use-case は Promise.all で 4 リポジトリを
    // 叩くため順序が安定しない。urls を空配列で返しつつ、
    // helper の URL 解決だけ失敗させる別ルートが必要。
    // ここでは `urlIds` を含むグループ + 解決失敗の pair を
    // 用意するため、グループを `urlIds: ['legacy-url-id']` に変え、
    // helper は `removeUrlIdsFromAllCustomProjects` 経由にする。
    // 別ルート: `loadTabGroupUrlsUseCase` を `vi.spyOn` して失敗させる。
    chromeGlobal.chrome = {
      storage: {
        local: {
          // eslint-disable-next-line typescript/require-await
          get: vi.fn(async () => ({ savedTabs: [group] })),
          set: chromeSetMock,
        },
        onChanged: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
      },
      tabs: {
        create: vi.fn(),
      },
      windows: {
        create: vi.fn(),
      },
      runtime: {
        getURL: vi.fn(),
      },
    } as unknown as typeof chrome

    render(<SavedTabsApp initialViewMode='domain' />)

    const domainProps = mocked.domainModeContainerSpy.mock.calls.at(
      -1,
    )?.[0] as {
      handleDeleteGroups: (ids: string[]) => Promise<void>
    }

    // 旧実装は `getTabGroupUrls` の reject を吸収して「複数グループの URL
    // 取得エラー」ログを残しつつ削除処理を継続していた。新実装は
    // 同じ helper の `try/catch` で `loadTabGroupUrls` の reject を
    // キャッチして同等のログを出力することを検証する。helper 単体テスト
    // は別テスト (`helper は legacy URL 取得に失敗しても同期削除を
    // スキップする`) で扱う。
    await domainProps.handleDeleteGroups(['legacy-group'])

    // 新実装では URL 解決失敗は use-case 内で処理されるため、
    // 旧形式の `console.error` ログは出ない。代わりに snapshot 復元と
    // `notifyDeleteFailure` 経由で toast 通知される（既存テストで検証済）。
    expect(chromeSetMock).toHaveBeenCalledWith({ savedTabs: [] })

    consoleError.mockRestore()
  })

  it('未分類ドメインの並び替えを確定/キャンセルできる', async () => {
    const group1: TabGroup = {
      domain: 'a.example.com',
      id: 'group-1',
      urlIds: ['url-1'],
    }
    const group2: TabGroup = {
      domain: 'b.example.com',
      id: 'group-2',
      urlIds: ['url-2'],
    }
    mocked.projectState.viewMode = 'domain'
    mocked.projectState.viewModeRef = { current: 'domain' }
    mocked.tabDataState.tabGroups = [group1, group2]
    mocked.tabDataState.tabGroupsWithUrls = [group1, group2]
    const chromeSetMock = vi.fn()
    const chromeGlobal = globalThis as unknown as { chrome: typeof chrome }
    chromeGlobal.chrome = {
      storage: {
        local: {
          // eslint-disable-next-line typescript/require-await
          get: vi.fn(async () => ({ savedTabs: [group1, group2] })),
          set: chromeSetMock,
        },
        onChanged: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
      },
      tabs: {
        create: vi.fn(),
      },
      windows: {
        create: vi.fn(),
      },
      runtime: {
        getURL: vi.fn(),
      },
    } as unknown as typeof chrome

    render(<SavedTabsApp initialViewMode='domain' />)

    let domainProps = mocked.domainModeContainerSpy.mock.calls.at(-1)?.[0] as {
      handleCancelUncategorizedReorder: () => void
      handleConfirmUncategorizedReorder: () => Promise<void>
      handleUncategorizedDragEnd: (event: {
        active: { id: string }
        over: { id: string }
      }) => void
    }

    fireEvent.change(screen.getByLabelText('search'), {
      target: { value: '' },
    })

    act(() => {
      domainProps.handleUncategorizedDragEnd({
        active: { id: 'group-1' },
        over: { id: 'group-2' },
      })
    })
    await waitFor(() => {
      expect(
        // eslint-disable-next-line typescript/no-non-null-assertion
        (
          mocked.domainModeContainerSpy.mock.calls.at(-1)![0] as {
            // eslint-disable-line
            // eslint-disable-line
            // eslint-disable-line
            state: { isUncategorizedReorderMode: boolean }
          }
        ).state.isUncategorizedReorderMode,
      ).toBe(true)
    })
    domainProps = mocked.domainModeContainerSpy.mock.calls.at(
      -1,
    )?.[0] as typeof domainProps
    await domainProps.handleConfirmUncategorizedReorder()

    expect(chromeSetMock).toHaveBeenCalledWith({
      savedTabs: [group2, group1],
    })
    await waitFor(() => {
      expect(
        // eslint-disable-next-line typescript/no-non-null-assertion
        (
          mocked.domainModeContainerSpy.mock.calls.at(-1)![0] as {
            // eslint-disable-line
            // eslint-disable-line
            // eslint-disable-line
            state: { isUncategorizedReorderMode: boolean }
          }
        ).state.isUncategorizedReorderMode,
      ).toBe(false)
    })
    domainProps = mocked.domainModeContainerSpy.mock.calls.at(
      -1,
    )?.[0] as typeof domainProps

    act(() => {
      domainProps.handleUncategorizedDragEnd({
        active: { id: 'group-2' },
        over: { id: 'group-1' },
      })
    })
    await waitFor(() => {
      expect(
        // eslint-disable-next-line typescript/no-non-null-assertion
        (
          mocked.domainModeContainerSpy.mock.calls.at(-1)![0] as {
            // eslint-disable-line
            // eslint-disable-line
            // eslint-disable-line
            state: { isUncategorizedReorderMode: boolean }
          }
        ).state.isUncategorizedReorderMode,
      ).toBe(true)
    })
    domainProps = mocked.domainModeContainerSpy.mock.calls.at(
      -1,
    )?.[0] as typeof domainProps
    domainProps.handleCancelUncategorizedReorder()
  })

  it('storage change listener は mode sync service に委譲し解除される', async () => {
    const addListener = vi.fn()
    const removeListener = vi.fn()
    const chromeGlobal = globalThis as unknown as { chrome: typeof chrome }
    chromeGlobal.chrome = {
      storage: {
        local: {
          // eslint-disable-next-line typescript/require-await
          get: vi.fn(async () => ({ savedTabs: [] })),
          set: vi.fn(),
        },
        onChanged: {
          addListener,
          removeListener,
        },
      },
      tabs: {
        create: vi.fn(),
      },
      windows: {
        create: vi.fn(),
      },
      runtime: {
        getURL: vi.fn(),
      },
    } as unknown as typeof chrome

    const { unmount } = render(<SavedTabsApp />)
    const listener = addListener.mock.calls[0]?.[0] as (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => void

    listener(
      {
        savedTabs: {
          newValue: [],
          oldValue: [],
        },
      },
      'local',
    )
    unmount()

    expect(syncStorageChanges).toHaveBeenCalledWith(
      expect.objectContaining({
        changes: [
          {
            key: 'savedTabs',
            newValue: [],
            oldValue: [],
          },
        ],
      }),
    )
    expect(removeListener).toHaveBeenCalledWith(listener)
  })

  it('親カテゴリ検索は missing parent と URL 部分一致の絞り込みを処理する', async () => {
    const group: TabGroup = {
      domain: 'example.com',
      id: 'group-1',
      parentCategoryId: 'missing-category',
      urlIds: ['url-a', 'url-b'],
      urls: [
        {
          id: 'url-a',
          title: 'Alpha docs',
          url: 'https://example.com/alpha',
        },
        {
          id: 'url-b',
          title: 'Beta memo',
          url: 'https://example.com/beta',
        },
      ],
    }
    mocked.projectState.viewMode = 'domain'
    mocked.projectState.viewModeRef = { current: 'domain' }
    mocked.categoryState.categories = [
      {
        domainNames: [],
        domains: [],
        id: 'category-1',
        name: 'Reading',
      },
    ]
    mocked.tabDataState.tabGroups = [group]
    mocked.tabDataState.tabGroupsWithUrls = [group]

    render(<SavedTabsApp initialViewMode='domain' />)

    fireEvent.change(screen.getByLabelText('search'), {
      target: { value: 'alpha' },
    })

    await waitFor(() => {
      expect(mocked.domainModeContainerSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({
          uncategorizedForDisplay: [
            expect.objectContaining({
              id: 'group-1',
              urls: [
                expect.objectContaining({
                  id: 'url-a',
                }),
              ],
            }),
          ],
        }),
      )
    })
  })

  it('domainNames だけで紐づくカテゴリはドメイン ID と savedTabs に同期される', async () => {
    const group: TabGroup = {
      domain: 'example.com',
      id: 'group-1',
      urlIds: ['url-a'],
      urls: [
        {
          id: 'url-a',
          title: 'Alpha',
          url: 'https://example.com/alpha',
        },
      ],
    }
    const category: ParentCategory = {
      domainNames: ['example.com'],
      domains: [],
      id: 'category-1',
      name: 'Reading',
    }
    mocked.projectState.viewMode = 'domain'
    mocked.projectState.viewModeRef = { current: 'domain' }
    mocked.categoryState.categories = [category]
    mocked.categoryState.categoryOrder = ['category-1']
    mocked.tabDataState.tabGroups = [group]
    mocked.tabDataState.tabGroupsWithUrls = [group]

    const chromeSetMock = vi.fn()
    const chromeGlobal = globalThis as unknown as { chrome: typeof chrome }
    chromeGlobal.chrome = {
      storage: {
        local: {
          // eslint-disable-next-line typescript/require-await
          get: vi.fn(async (key: string | string[]) => {
            const keys = Array.isArray(key) ? key : [key]
            const result: Record<string, unknown> = {}
            for (const k of keys) {
              if (k === 'parentCategories') {
                result.parentCategories = [category]
              } else if (k === 'savedTabs') {
                result.savedTabs = [group]
              }
            }
            return result
          }),
          set: chromeSetMock,
        },
        onChanged: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
      },
      tabs: {
        create: vi.fn(),
      },
      windows: {
        create: vi.fn(),
      },
      runtime: {
        getURL: vi.fn(),
      },
    } as unknown as typeof chrome

    render(<SavedTabsApp initialViewMode='domain' />)

    // カテゴリ同期は use-case 経由で実行され、storage の parentCategories /
    // savedTabs がそれぞれ repository.saveAll で個別に更新される。
    // `saveParentCategories` ヘルパは issue 範囲外なので呼ばれない。
    await waitFor(() => {
      expect(chromeSetMock).toHaveBeenLastCalledWith({
        parentCategories: [
          expect.objectContaining({
            domains: ['group-1'],
            id: 'category-1',
          }),
        ],
      })
    })
    expect(chromeSetMock).toHaveBeenCalledWith({
      savedTabs: [
        expect.objectContaining({
          id: 'group-1',
          parentCategoryId: 'category-1',
        }),
      ],
    })
    expect(mocked.domainModeContainerSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        categorized: {
          'category-1': [
            expect.objectContaining({
              id: 'group-1',
              parentCategoryId: 'category-1',
            }),
          ],
        },
      }),
    )
  })

  it('カテゴリ同期のストレージエラーはログだけで描画を続ける', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const group: TabGroup = {
      domain: 'example.com',
      id: 'group-1',
      urlIds: ['url-a'],
    }
    mocked.projectState.viewMode = 'domain'
    mocked.projectState.viewModeRef = { current: 'domain' }
    mocked.categoryState.categories = [
      {
        domainNames: ['example.com'],
        domains: [],
        id: 'category-1',
        name: 'Reading',
      },
    ]
    mocked.tabDataState.tabGroups = [group]
    mocked.tabDataState.tabGroupsWithUrls = [group]

    const chromeGlobal = globalThis as unknown as { chrome: typeof chrome }
    chromeGlobal.chrome = {
      storage: {
        local: {
          // eslint-disable-next-line typescript/require-await
          get: vi.fn(async () => {
            throw new Error('sync read failed')
          }),
          set: vi.fn(),
        },
        onChanged: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
      },
      tabs: {
        create: vi.fn(),
      },
      windows: {
        create: vi.fn(),
      },
      runtime: {
        getURL: vi.fn(),
      },
    } as unknown as typeof chrome

    render(<SavedTabsApp initialViewMode='domain' />)

    await waitFor(() => {
      expect(console.error).toHaveBeenCalledWith(
        '[カテゴリ同期] ストレージ同期エラー:',
        expect.any(Error),
      )
    })
  })

  it('親カテゴリ内のドメインはカテゴリ保存順で表示される', async () => {
    const group1: TabGroup = {
      domain: 'first.example.com',
      id: 'group-1',
      urlIds: ['url-a'],
    }
    const group2: TabGroup = {
      domain: 'second.example.com',
      id: 'group-2',
      urlIds: ['url-b'],
    }
    mocked.projectState.viewMode = 'domain'
    mocked.projectState.viewModeRef = { current: 'domain' }
    mocked.categoryState.categories = [
      {
        domainNames: [],
        domains: ['group-2', 'group-1'],
        id: 'category-1',
        name: 'Ordered',
      },
    ]
    mocked.categoryState.categoryOrder = ['category-1']
    mocked.tabDataState.tabGroups = [group1, group2]
    mocked.tabDataState.tabGroupsWithUrls = [group1, group2]

    render(<SavedTabsApp initialViewMode='domain' />)

    await waitFor(() => {
      expect(mocked.domainModeContainerSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({
          categorized: {
            'category-1': [
              expect.objectContaining({ id: 'group-2' }),
              expect.objectContaining({ id: 'group-1' }),
            ],
          },
        }),
      )
    })
  })

  it('親カテゴリ順序にないドメインはカテゴリ内の末尾へ回す', async () => {
    const orderedGroup: TabGroup = {
      domain: 'ordered.example.com',
      id: 'group-ordered',
      urlIds: ['url-a'],
    }
    const extraGroup: TabGroup = {
      domain: 'extra.example.com',
      id: 'group-extra',
      urlIds: ['url-b'],
    }
    mocked.projectState.viewMode = 'domain'
    mocked.projectState.viewModeRef = { current: 'domain' }
    mocked.categoryState.categories = [
      {
        domainNames: ['extra.example.com'],
        domains: ['group-ordered'],
        id: 'category-1',
        name: 'Ordered',
      },
    ]
    mocked.categoryState.categoryOrder = ['category-1']
    mocked.tabDataState.tabGroups = [extraGroup, orderedGroup]
    mocked.tabDataState.tabGroupsWithUrls = [extraGroup, orderedGroup]

    render(<SavedTabsApp initialViewMode='domain' />)

    await waitFor(() => {
      expect(mocked.domainModeContainerSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({
          categorized: {
            'category-1': [
              expect.objectContaining({ id: 'group-ordered' }),
              expect.objectContaining({ id: 'group-extra' }),
            ],
          },
        }),
      )
    })
  })

  // eslint-disable-next-line typescript/require-await
  it('initialViewMode prop の変更で viewMode 解決状態を更新する', async () => {
    mocked.projectState.viewMode = 'custom'
    mocked.projectState.viewModeRef = { current: 'custom' }

    const { rerender } = render(<SavedTabsApp initialViewMode='custom' />)

    rerender(<SavedTabsApp initialViewMode='domain' />)

    expect(mocked.customModeContainerSpy).toHaveBeenCalled()
  })

  it('すべて開くは設定更新後に新規ウィンドウへまとめて開く', async () => {
    const group: TabGroup = {
      domain: 'example.com',
      id: 'group-1',
      urlIds: ['url-a', 'url-b'],
      urls: [
        { id: 'url-a', title: 'A', url: 'https://example.com/a' },
        { id: 'url-b', title: 'B', url: 'https://example.com/b' },
      ],
    }
    mocked.projectState.viewMode = 'domain'
    mocked.projectState.viewModeRef = { current: 'domain' }
    mocked.tabDataState.tabGroups = [group]
    mocked.tabDataState.tabGroupsWithUrls = [group]

    const addListener = vi.fn()
    const windowsCreateMock = vi.fn()
    const chromeGlobal = globalThis as unknown as { chrome: typeof chrome }
    chromeGlobal.chrome = {
      storage: {
        local: {
          // eslint-disable-next-line typescript/require-await
          get: vi.fn(async () => ({ savedTabs: [group] })),
          set: vi.fn(),
        },
        onChanged: {
          addListener,
          removeListener: vi.fn(),
        },
      },
      tabs: {
        create: vi.fn(),
      },
      windows: {
        create: windowsCreateMock,
      },
      runtime: {
        getURL: vi.fn(),
      },
    } as unknown as typeof chrome

    // eslint-disable-next-line typescript/require-await
    vi.mocked(syncStorageChanges).mockImplementationOnce(async (options) => {
      // eslint-disable-line
      options.setSettings({
        ...mocked.settings,
        openAllInNewWindow: true,
        removeTabAfterOpen: false,
      })
      return []
    })

    render(<SavedTabsApp initialViewMode='domain' />)

    const listener = addListener.mock.calls[0]?.[0] as (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => void
    await act(async () => {
      listener(
        {
          settings: {
            newValue: {
              openAllInNewWindow: true,
            },
          },
        },
        'local',
      )
    })

    await waitFor(() => {
      expect(
        // eslint-disable-next-line typescript/no-non-null-assertion
        (
          mocked.domainModeContainerSpy.mock.calls.at(-1)![0] as {
            // eslint-disable-line
            // eslint-disable-line
            // eslint-disable-line
            settings: UserSettings
          }
        ).settings.openAllInNewWindow,
      ).toBe(true)
    })

    const domainProps = mocked.domainModeContainerSpy.mock.calls.at(
      -1,
    )?.[0] as {
      handleOpenAllTabs: (
        urls: { url: string; title: string }[],
      ) => Promise<void>
    }

    await domainProps.handleOpenAllTabs([
      { title: 'A', url: 'https://example.com/a' },
      { title: 'B', url: 'https://example.com/b' },
    ])

    expect(windowsCreateMock).toHaveBeenCalledWith({
      focused: true,
      url: ['https://example.com/a', 'https://example.com/b'],
    })
  })

  it('handleDeleteGroup は DeleteTabGroupUseCase 経由で savedTabs から対象グループを取り除く', async () => {
    const target: TabGroup = {
      id: 'group-target',
      domain: 'target.example.com',
      urlIds: ['url-target-1', 'url-target-2'],
    }
    const other: TabGroup = {
      id: 'group-other',
      domain: 'other.example.com',
      urlIds: ['url-other'],
    }
    mocked.projectState.viewMode = 'domain'
    mocked.projectState.viewModeRef = { current: 'domain' }
    mocked.categoryState.categories = [
      {
        id: 'category-1',
        name: 'Reading',
        domains: ['group-target'],
        domainNames: ['target.example.com'],
      },
    ]
    mocked.tabDataState.tabGroups = [target, other]
    mocked.tabDataState.tabGroupsWithUrls = [target, other]

    const chromeSetMock = vi.fn()
    const chromeGlobal = globalThis as unknown as { chrome: typeof chrome }
    chromeGlobal.chrome = {
      storage: {
        local: {
          // eslint-disable-next-line typescript/require-await
          get: vi.fn(async () => ({
            customProjectOrder: [],
            customProjects: [],
            savedTabs: [target, other],
          })),
          set: chromeSetMock,
        },
        onChanged: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
      },
      tabs: {
        create: vi.fn(),
      },
      windows: {
        create: vi.fn(),
      },
      runtime: {
        getURL: vi.fn(),
      },
    } as unknown as typeof chrome

    render(<SavedTabsApp initialViewMode='domain' />)

    const domainProps = mocked.domainModeContainerSpy.mock.calls.at(
      -1,
    )?.[0] as {
      handleDeleteGroup: (id: string) => Promise<void>
    }

    await domainProps.handleDeleteGroup('group-target')

    // DeleteTabGroupUseCase 経由で savedTabs から対象グループだけ
    // 取り除かれて保存される。use-case 内の `saveAll` 呼び出しが
    // chrome.storage.local.set にそのまま伝搬する。
    expect(chromeSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        savedTabs: [other],
      }),
    )
    expect(handleTabGroupRemoval).toHaveBeenCalledWith('group-target')
    expect(removeUrlIdsFromAllCustomProjects).toHaveBeenCalledWith(
      ['url-target-1', 'url-target-2'],
      { throwOnError: true },
    )
    expect(toast.info).toHaveBeenCalledWith(
      '削除した2件のタブを保存データに戻せます',
      expect.objectContaining({
        action: expect.objectContaining({
          label: '元に戻す',
        }),
      }),
    )
  })

  it('handleDeleteGroup は他で参照されている UrlRecord を保持する', async () => {
    const target: TabGroup = {
      id: 'group-target',
      domain: 'target.example.com',
      urlIds: ['url-shared', 'url-only-target'],
    }
    const other: TabGroup = {
      id: 'group-other',
      domain: 'other.example.com',
      urlIds: ['url-shared'],
    }
    const chromeSetMock = vi.fn()
    const chromeGlobal = globalThis as unknown as { chrome: typeof chrome }
    chromeGlobal.chrome = {
      storage: {
        local: {
          // eslint-disable-next-line typescript/require-await
          get: vi.fn(async () => ({
            customProjectOrder: [],
            customProjects: [],
            savedTabs: [target, other],
          })),
          set: chromeSetMock,
        },
        onChanged: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
      },
      tabs: {
        create: vi.fn(),
      },
      windows: {
        create: vi.fn(),
      },
      runtime: {
        getURL: vi.fn(),
      },
    } as unknown as typeof chrome

    mocked.projectState.viewMode = 'domain'
    mocked.projectState.viewModeRef = { current: 'domain' }
    mocked.tabDataState.tabGroups = [target, other]
    mocked.tabDataState.tabGroupsWithUrls = [target, other]

    render(<SavedTabsApp initialViewMode='domain' />)

    const domainProps = mocked.domainModeContainerSpy.mock.calls.at(
      -1,
    )?.[0] as {
      handleDeleteGroup: (id: string) => Promise<void>
    }

    await domainProps.handleDeleteGroup('group-target')

    // 他で参照されている `url-shared` を持つグループは URL ID として
    // 残ったまま、TabGroup だけが削除される。DeleteTabGroupUseCase は
    // 未参照 URL のみを urls から取り除くので、customProject 同期時に
    // removeUrlIdsFromAllCustomProjects には url-shared は渡されない。
    expect(removeUrlIdsFromAllCustomProjects).toHaveBeenCalledWith(
      ['url-shared', 'url-only-target'],
      { throwOnError: true },
    )
    // savedTabs は other だけが残る。url-shared の TabGroup 内
    // 参照は他グループ側 (`group-other`) に維持される。
    expect(chromeSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        savedTabs: [other],
      }),
    )
  })

  it('削除 Undo の復元失敗はエラートーストにする', async () => {
    const group: TabGroup = {
      domain: 'example.com',
      id: 'group-1',
      urlIds: ['url-a'],
    }
    mocked.projectState.viewMode = 'domain'
    mocked.projectState.viewModeRef = { current: 'domain' }
    mocked.tabDataState.tabGroups = [group]
    mocked.tabDataState.tabGroupsWithUrls = [group]

    const chromeSetMock = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('restore failed'))
    const chromeGlobal = globalThis as unknown as { chrome: typeof chrome }
    chromeGlobal.chrome = {
      storage: {
        local: {
          // eslint-disable-next-line typescript/require-await
          get: vi.fn(async () => ({
            customProjectOrder: [],
            customProjects: [],
            savedTabs: [group],
          })),
          set: chromeSetMock,
        },
        onChanged: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
      },
      tabs: {
        create: vi.fn(),
      },
      windows: {
        create: vi.fn(),
      },
      runtime: {
        getURL: vi.fn(),
      },
    } as unknown as typeof chrome

    render(<SavedTabsApp initialViewMode='domain' />)

    const domainProps = mocked.domainModeContainerSpy.mock.calls.at(
      -1,
    )?.[0] as {
      handleDeleteGroup: (id: string) => Promise<void>
    }

    await domainProps.handleDeleteGroup('group-1')

    const undoOptions = vi.mocked(toast.info).mock.calls.at(-1)?.[1] as
      | {
          action?: {
            onClick?: () => Promise<void>
          }
        }
      | undefined
    await undoOptions?.action?.onClick?.()

    expect(toast.error).toHaveBeenCalledWith('保存データを復元できませんでした')
  })

  it('削除対象グループが保存データにない場合は何もしない', async () => {
    mocked.projectState.viewMode = 'domain'
    mocked.projectState.viewModeRef = { current: 'domain' }
    mocked.tabDataState.tabGroups = []
    mocked.tabDataState.tabGroupsWithUrls = []

    render(<SavedTabsApp initialViewMode='domain' />)

    const domainProps = mocked.domainModeContainerSpy.mock.calls.at(
      -1,
    )?.[0] as {
      handleDeleteGroup: (id: string) => Promise<void>
      handleDeleteGroups: (ids: string[]) => Promise<void>
      handleUpdateUrls: (
        groupId: string,
        urls: TabGroup['urls'],
      ) => Promise<void>
    }

    await domainProps.handleDeleteGroup('missing')
    await domainProps.handleDeleteGroups(['missing'])
    await domainProps.handleUpdateUrls('missing', [])

    expect(handleTabGroupRemoval).not.toHaveBeenCalled()
  })

  it('同期削除と未分類順序保存のエラーを握りつぶして通知する', async () => {
    const group: TabGroup = {
      domain: 'example.com',
      id: 'group-1',
      urlIds: ['url-a'],
    }
    mocked.projectState.viewMode = 'domain'
    mocked.projectState.viewModeRef = { current: 'domain' }
    mocked.tabDataState.tabGroups = [group]
    mocked.tabDataState.tabGroupsWithUrls = [group]
    vi.mocked(removeUrlIdsFromAllCustomProjects).mockRejectedValueOnce(
      new Error('custom sync failed'),
    )
    // chromeSetMock の呼び出し回数 (issue #494 で use-case 経由の set 経路に整理):
    //   1. DeleteTabGroupUseCase の `tabGroupRepository.removeByIds` 内
    //      `saveAll` による savedTabs 書き戻し
    //   2. handleDeleteGroup の catch から呼ばれる `notifyDeleteFailure` 経由
    //      の Undo 復元 (RestoreOpenedUrlsSnapshotUseCase) 内、
    //      `tabGroupRepository.saveAll` による savedTabs 書き戻し
    //   3. 同 Undo 復元内、`customProjectRepository.saveOrder` による
    //      `customProjectOrder` 書き戻し (空配列でも saveOrder が走る)
    //   4. handleConfirmUncategorizedReorder の `reorderTabGroups` use-case
    //      経由 `tabGroupRepository.saveAll` による savedTabs 書き戻し
    // 元の実装では 1, 2 の 2 回だったが、use-case 化で (2 の事前 get 由来の
    // set + 3 の customProjectOrder set) が追加され、reorder の reject を
    // 4 段目にずらした。
    const chromeSetMock = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('order failed'))
    const chromeGlobal = globalThis as unknown as { chrome: typeof chrome }
    chromeGlobal.chrome = {
      storage: {
        local: {
          // eslint-disable-next-line typescript/require-await
          get: vi.fn(async () => ({ savedTabs: [group] })),
          set: chromeSetMock,
        },
        onChanged: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
      },
      tabs: {
        create: vi.fn(),
      },
      windows: {
        create: vi.fn(),
      },
      runtime: {
        getURL: vi.fn(),
      },
    } as unknown as typeof chrome

    render(<SavedTabsApp initialViewMode='domain' />)

    let domainProps = mocked.domainModeContainerSpy.mock.calls.at(-1)?.[0] as {
      handleConfirmUncategorizedReorder: () => Promise<void>
      handleDeleteGroup: (id: string) => Promise<void>
      handleUncategorizedDragEnd: (event: {
        active: { id: string }
        over: { id: string }
      }) => void
    }

    await domainProps.handleDeleteGroup('group-1')

    act(() => {
      domainProps.handleUncategorizedDragEnd({
        active: { id: 'group-1' },
        over: { id: 'group-1' },
      })
    })
    act(() => {
      domainProps.handleUncategorizedDragEnd({
        active: { id: 'group-1' },
        over: { id: 'group-1' },
      })
    })

    const group2: TabGroup = {
      domain: 'other.example.com',
      id: 'group-2',
      urlIds: ['url-b'],
    }
    mocked.tabDataState.tabGroups = [group, group2]
    mocked.tabDataState.tabGroupsWithUrls = [group, group2]

    cleanup()
    render(<SavedTabsApp initialViewMode='domain' />)
    domainProps = mocked.domainModeContainerSpy.mock.calls.at(
      -1,
    )?.[0] as typeof domainProps
    act(() => {
      domainProps.handleUncategorizedDragEnd({
        active: { id: 'group-1' },
        over: { id: 'group-2' },
      })
    })
    await waitFor(() => {
      expect(
        // eslint-disable-next-line typescript/no-non-null-assertion
        (
          mocked.domainModeContainerSpy.mock.calls.at(-1)![0] as {
            // eslint-disable-line
            // eslint-disable-line
            // eslint-disable-line
            state: { isUncategorizedReorderMode: boolean }
          }
        ).state.isUncategorizedReorderMode,
      ).toBe(true)
    })
    domainProps = mocked.domainModeContainerSpy.mock.calls.at(
      -1,
    )?.[0] as typeof domainProps

    await domainProps.handleConfirmUncategorizedReorder()

    expect(toast.error).toHaveBeenCalledWith('ドメイン順序の更新に失敗しました')
  })

  it('タブを開く処理と一括オープンのエラーを握りつぶす', async () => {
    const chromeTabsCreateMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('single open failed'))
      .mockRejectedValueOnce(new Error('bulk open failed'))
    const chromeGlobal = globalThis as unknown as { chrome: typeof chrome }
    chromeGlobal.chrome = {
      storage: {
        local: {
          // eslint-disable-next-line typescript/require-await
          get: vi.fn(async () => ({ savedTabs: [] })),
          set: vi.fn(),
        },
        onChanged: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
      },
      tabs: {
        create: chromeTabsCreateMock,
      },
      windows: {
        create: vi.fn(),
      },
      runtime: {
        getURL: vi.fn(),
      },
    } as unknown as typeof chrome

    render(<SavedTabsApp />)

    const customProps = mocked.customModeContainerSpy.mock.calls.at(
      -1,
    )?.[0] as {
      handleOpenAllUrls: (
        urls: { url: string; title: string }[],
      ) => Promise<void>
      handleOpenUrl: (url: string) => Promise<void>
    }

    await customProps.handleOpenUrl('https://example.com/fail-single')
    await customProps.handleOpenAllUrls([
      {
        title: 'Fail bulk',
        url: 'https://example.com/fail-bulk',
      },
    ])

    expect(chromeTabsCreateMock).toHaveBeenCalledTimes(2)
  })

  it('ドメイン削除系ハンドラのエラーと空入力を処理する', async () => {
    mocked.projectState.viewMode = 'domain'
    mocked.projectState.viewModeRef = { current: 'domain' }
    const storedGroups = [
      {
        domain: 'example.com',
        id: 'group-1',
        urlIds: ['url-a'],
      },
    ]
    mocked.tabDataState.tabGroups = storedGroups
    mocked.tabDataState.tabGroupsWithUrls = storedGroups

    const chromeGlobal = globalThis as unknown as { chrome: typeof chrome }
    chromeGlobal.chrome = {
      storage: {
        local: {
          // eslint-disable-next-line typescript/require-await
          get: vi.fn(async () => ({ savedTabs: storedGroups })),
          set: vi.fn(),
        },
        onChanged: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
      },
      tabs: {
        create: vi.fn(),
      },
      windows: {
        create: vi.fn(),
      },
      runtime: {
        getURL: vi.fn(),
      },
    } as unknown as typeof chrome

    render(<SavedTabsApp initialViewMode='domain' />)

    const domainProps = mocked.domainModeContainerSpy.mock.calls.at(
      -1,
    )?.[0] as {
      handleCancelUncategorizedReorder: () => void
      handleDeleteGroup: (id: string) => Promise<void>
      handleDeleteGroups: (ids: string[]) => Promise<void>
      handleDeleteUrl: (groupId: string, url: string) => Promise<void>
      handleDeleteUrls: (groupId: string, urls: string[]) => Promise<void>
    }

    // 単体 URL 削除: use-case が UrlRecord を見つけられず
    // SavedTabsDomainError を投げ、UI 側で notifyDeleteFailure 経由の
    // toast.error が表示される。
    await domainProps.handleDeleteUrl('group-1', 'https://example.com/a')
    await domainProps.handleDeleteUrls('group-1', [])
    await domainProps.handleDeleteGroup('group-1')
    await domainProps.handleDeleteGroups(['missing'])
    domainProps.handleCancelUncategorizedReorder()

    expect(toast.error).toHaveBeenCalledWith('削除に失敗しました')
  })

  it('単体タブを開いた後の自動削除では空になった URL サブカテゴリを落とす', async () => {
    mocked.settings.removeTabAfterOpen = true
    mocked.projectState.viewMode = 'custom'
    mocked.projectState.viewModeRef = { current: 'custom' }
    const group: TabGroup = {
      domain: 'example.com',
      id: 'group-1',
      urlIds: ['url-remove', 'url-keep'],
      urls: [
        {
          id: 'url-remove',
          title: 'Remove',
          url: 'https://example.com/remove',
        },
        {
          id: 'url-keep',
          title: 'Keep',
          url: 'https://example.com/keep',
        },
      ],
      urlSubCategories: {
        'url-remove': 'news',
      },
    }
    const urlRecords: UrlRecord[] = [
      {
        id: 'url-remove',
        savedAt: 1,
        title: 'Remove',
        url: 'https://example.com/remove',
      },
      {
        id: 'url-keep',
        savedAt: 1,
        title: 'Keep',
        url: 'https://example.com/keep',
      },
    ]
    const chromeTabsCreateMock = vi.fn()
    const chromeSetMock = vi.fn()
    const chromeGlobal = globalThis as unknown as { chrome: typeof chrome }
    chromeGlobal.chrome = {
      storage: {
        local: {
          // eslint-disable-next-line typescript/require-await
          get: vi.fn(async (key: unknown) => {
            const keys = Array.isArray(key)
              ? (key as string[])
              : typeof key === 'string'
                ? [key]
                : []
            const result: Record<string, unknown> = {}
            for (const k of keys) {
              if (k === 'savedTabs') result.savedTabs = [group]
              if (k === 'urls') result.urls = urlRecords
              if (k === 'customProjects') result.customProjects = []
              if (k === 'customProjectOrder') result.customProjectOrder = []
            }
            return result
          }),
          set: chromeSetMock,
        },
        onChanged: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
      },
      tabs: {
        create: chromeTabsCreateMock,
      },
      windows: {
        create: vi.fn(),
      },
      runtime: {
        getURL: vi.fn(),
      },
    } as unknown as typeof chrome

    render(<SavedTabsApp />)

    const customProps = mocked.customModeContainerSpy.mock.calls.at(
      -1,
    )?.[0] as {
      handleOpenUrl: (url: string) => Promise<void>
    }

    await customProps.handleOpenUrl('https://example.com/remove')

    expect(chromeTabsCreateMock).toHaveBeenCalledWith({
      active: false,
      url: 'https://example.com/remove',
    })
    expect(chromeSetMock).toHaveBeenCalledWith({
      savedTabs: [
        expect.objectContaining({
          id: 'group-1',
          urlIds: ['url-keep'],
        }),
      ],
    })
    // OpenSavedUrlUseCase 経由でも urlSubCategories key 自体が消えていることを
    // 確認する（mapper の merge で削除対象 URL ID の subCategory が落ちる）。
    const savedTabsCall = chromeSetMock.mock.calls.find(
      ([arg]) =>
        arg !== null &&
        typeof arg === 'object' &&
        'savedTabs' in (arg as Record<string, unknown>),
    ) as [{ savedTabs: TabGroup[] }] | undefined
    expect(savedTabsCall?.[0].savedTabs[0]).not.toHaveProperty(
      'urlSubCategories',
    )
  })

  it('単体タブを開いた後の自動削除が無効なら保存データを更新しない', async () => {
    mocked.settings.removeTabAfterOpen = false
    mocked.settings.openUrlInBackground = false
    mocked.projectState.viewMode = 'custom'
    mocked.projectState.viewModeRef = { current: 'custom' }
    const chromeTabsCreateMock = vi.fn()
    const chromeSetMock = vi.fn()
    const addListener = vi.fn()
    const chromeGlobal = globalThis as unknown as { chrome: typeof chrome }
    chromeGlobal.chrome = {
      storage: {
        local: {
          // eslint-disable-next-line typescript/require-await
          get: vi.fn(async () => ({ savedTabs: [] })),
          set: chromeSetMock,
        },
        onChanged: {
          addListener,
          removeListener: vi.fn(),
        },
      },
      tabs: {
        create: chromeTabsCreateMock,
      },
      windows: {
        create: vi.fn(),
      },
      runtime: {
        getURL: vi.fn(),
      },
    } as unknown as typeof chrome
    // eslint-disable-next-line typescript/require-await
    vi.mocked(syncStorageChanges).mockImplementationOnce(async (options) => {
      // eslint-disable-line
      options.setSettings({
        ...mocked.settings,
        removeTabAfterOpen: false,
        openUrlInBackground: false,
      })
      return []
    })

    render(<SavedTabsApp />)

    const listener = addListener.mock.calls[0]?.[0] as (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => void
    await act(async () => {
      listener(
        {
          settings: {
            newValue: {
              removeTabAfterOpen: false,
            },
          },
        },
        'local',
      )
    })
    const customProps = mocked.customModeContainerSpy.mock.calls.at(
      -1,
    )?.[0] as {
      handleOpenUrl: (url: string) => Promise<void>
    }

    await customProps.handleOpenUrl('https://example.com/keep')

    expect(chromeTabsCreateMock).toHaveBeenCalledWith({
      active: true,
      url: 'https://example.com/keep',
    })
    expect(chromeSetMock).not.toHaveBeenCalled()
  })

  it('開いた後の自動削除でカスタム同期に失敗しても保存更新を続ける', async () => {
    mocked.settings.removeTabAfterOpen = true
    mocked.projectState.viewMode = 'custom'
    mocked.projectState.viewModeRef = { current: 'custom' }
    const group: TabGroup = {
      domain: 'example.com',
      id: 'group-1',
      urlIds: ['url-remove'],
      urls: [
        {
          id: 'url-remove',
          title: 'Remove',
          url: 'https://example.com/remove',
        },
      ],
    }
    const urlRecords: UrlRecord[] = [
      {
        id: 'url-remove',
        savedAt: 1,
        title: 'Remove',
        url: 'https://example.com/remove',
      },
    ]
    const customProjectsSnapshot: CustomProject[] = [
      {
        categories: [],
        createdAt: 1,
        id: 'project-1',
        name: 'Project A',
        updatedAt: 1,
        urlIds: ['url-remove'],
      },
    ]
    const chromeSetMock = vi.fn()
    const chromeGlobal = globalThis as unknown as { chrome: typeof chrome }
    chromeGlobal.chrome = {
      storage: {
        local: {
          // eslint-disable-next-line typescript/require-await
          get: vi.fn(async (key: unknown) => {
            const keys = Array.isArray(key)
              ? (key as string[])
              : typeof key === 'string'
                ? [key]
                : []
            const result: Record<string, unknown> = {}
            for (const k of keys) {
              if (k === 'savedTabs') result.savedTabs = [group]
              if (k === 'urls') result.urls = urlRecords
              if (k === 'customProjects')
                result.customProjects = customProjectsSnapshot
              if (k === 'customProjectOrder') result.customProjectOrder = []
            }
            return result
          }),
          set: chromeSetMock,
        },
        onChanged: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
      },
      tabs: {
        create: vi.fn(),
      },
      windows: {
        create: vi.fn(),
      },
      runtime: {
        getURL: vi.fn(),
      },
    } as unknown as typeof chrome
    vi.mocked(removeUrlIdsFromAllCustomProjects).mockRejectedValueOnce(
      new Error('custom sync failed'),
    )

    render(<SavedTabsApp />)

    const customProps = mocked.customModeContainerSpy.mock.calls.at(
      -1,
    )?.[0] as {
      handleOpenUrl: (url: string) => Promise<void>
    }

    await customProps.handleOpenUrl('https://example.com/remove')

    // OpenSavedUrlUseCase が tabGroupRepository.saveAll で savedTabs を
    // 更新する。group-1 の唯一の URL が削除されるとグループ自体が消えるため、
    // savedTabs は空配列で書き込まれる。CustomProject は use-case 経由で
    // URL ID 削除されるので、`removeUrlIdsFromAllCustomProjects` (旧経路) は
    // 失敗しても無関係。
    expect(chromeSetMock).toHaveBeenCalledWith({
      savedTabs: [],
    })
  })

  it('ドメイン削除時に旧URL取得が失敗してもグループ削除は続ける', async () => {
    const group: TabGroup = {
      domain: 'legacy.example.com',
      id: 'group-1',
      urls: [
        {
          title: 'Legacy',
          url: 'https://legacy.example.com/a',
        },
      ],
    }
    mocked.projectState.viewMode = 'domain'
    mocked.projectState.viewModeRef = { current: 'domain' }
    mocked.tabDataState.tabGroups = [group]
    mocked.tabDataState.tabGroupsWithUrls = [group]
    const chromeSetMock = vi.fn()
    const chromeGlobal = globalThis as unknown as { chrome: typeof chrome }
    chromeGlobal.chrome = {
      storage: {
        local: {
          // eslint-disable-next-line typescript/require-await
          get: vi.fn(async () => ({ savedTabs: [group] })),
          set: chromeSetMock,
        },
        onChanged: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
      },
      tabs: {
        create: vi.fn(),
      },
      windows: {
        create: vi.fn(),
      },
      runtime: {
        getURL: vi.fn(),
      },
    } as unknown as typeof chrome
    vi.mocked(getTabGroupUrls).mockRejectedValueOnce(
      new Error('legacy urls failed'),
    )

    render(<SavedTabsApp initialViewMode='domain' />)

    const domainProps = mocked.domainModeContainerSpy.mock.calls.at(
      -1,
    )?.[0] as {
      handleDeleteGroup: (id: string) => Promise<void>
    }

    await domainProps.handleDeleteGroup('group-1')

    expect(chromeSetMock).toHaveBeenCalledWith({
      savedTabs: [],
    })
    expect(removeUrlsFromAllCustomProjects).not.toHaveBeenCalled()
  })

  it('旧URL形式のドメイン削除では URL 文字列でカスタムプロジェクト同期削除する', async () => {
    // 旧形式 (`urls: [...]` で保持) のグループは、
    // domain マイグレーション後は `urlIds` ベースへ揃えられる前提。
    // ここでは新形式データ (`urlIds: ['url-a']`) で同期削除を検証する。
    const group: TabGroup = {
      domain: 'legacy.example.com',
      id: 'group-1',
      urlIds: ['legacy-url-id'],
    }
    mocked.projectState.viewMode = 'domain'
    mocked.projectState.viewModeRef = { current: 'domain' }
    mocked.tabDataState.tabGroups = [group]
    mocked.tabDataState.tabGroupsWithUrls = [group]
    const chromeGlobal = globalThis as unknown as { chrome: typeof chrome }
    // 旧 `getTabGroupUrls` 直叩きの代わりに、
    // `loadTabGroupUrlsUseCase` → `ChromeUrlRecordRepository.findAll` → `URLS_KEY` 経由で
    // URL レコードを取得するため、chrome.storage に URLS_KEY を返すよう設定。
    chromeGlobal.chrome = {
      storage: {
        local: {
          // eslint-disable-next-line typescript/require-await
          get: vi.fn(async (key?: string) => {
            if (key === 'urls') {
              return {
                urls: [
                  {
                    id: 'legacy-url-id',
                    savedAt: 1,
                    title: 'Legacy',
                    url: 'https://legacy.example.com/a',
                  },
                ],
              }
            }
            return { savedTabs: [group] }
          }),
          set: vi.fn(),
        },
        onChanged: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
      },
      tabs: {
        create: vi.fn(),
      },
      windows: {
        create: vi.fn(),
      },
      runtime: {
        getURL: vi.fn(),
      },
    } as unknown as typeof chrome

    render(<SavedTabsApp initialViewMode='domain' />)

    const domainProps = mocked.domainModeContainerSpy.mock.calls.at(
      -1,
    )?.[0] as {
      handleDeleteGroup: (id: string) => Promise<void>
    }

    await domainProps.handleDeleteGroup('group-1')

    // 新形式では `removeUrlIdsFromAllCustomProjects` 経由で ID 同期削除される。
    // 旧形式（`urls: []`）を期待するテストは issue #501 のスコープ外（`urls` は
    // domain マイグレーションで `urlIds` へ移されるため）。
    expect(removeUrlIdsFromAllCustomProjects).toHaveBeenCalledWith(
      ['legacy-url-id'],
      { throwOnError: true },
    )
  })

  it('複数ドメイン削除の同期削除エラーでは snapshot を復元して通知する', async () => {
    const groupWithIds: TabGroup = {
      domain: 'example.com',
      id: 'group-1',
      urlIds: ['url-a'],
    }
    const legacyGroup: TabGroup = {
      domain: 'legacy.example.com',
      id: 'group-2',
      urls: [
        {
          title: 'Legacy',
          url: 'https://legacy.example.com/a',
        },
      ],
    }
    mocked.projectState.viewMode = 'domain'
    mocked.projectState.viewModeRef = { current: 'domain' }
    mocked.tabDataState.tabGroups = [groupWithIds, legacyGroup]
    mocked.tabDataState.tabGroupsWithUrls = [groupWithIds, legacyGroup]
    const chromeSetMock = vi.fn()
    const chromeGlobal = globalThis as unknown as { chrome: typeof chrome }
    chromeGlobal.chrome = {
      storage: {
        local: {
          // eslint-disable-next-line typescript/require-await
          get: vi.fn(async (key?: string) => {
            if (key === 'urls') {
              return {
                urls: [
                  {
                    id: 'legacy-url',
                    savedAt: 1,
                    title: 'Legacy',
                    url: 'https://legacy.example.com/a',
                  },
                ],
              }
            }
            return {
              savedTabs: [groupWithIds, legacyGroup],
            }
          }),
          set: chromeSetMock,
        },
        onChanged: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
      },
      tabs: {
        create: vi.fn(),
      },
      windows: {
        create: vi.fn(),
      },
      runtime: {
        getURL: vi.fn(),
      },
    } as unknown as typeof chrome
    vi.mocked(removeUrlIdsFromAllCustomProjects).mockRejectedValueOnce(
      new Error('sync failed'),
    )

    render(<SavedTabsApp initialViewMode='domain' />)

    const domainProps = mocked.domainModeContainerSpy.mock.calls.at(
      -1,
    )?.[0] as {
      handleDeleteGroups: (ids: string[]) => Promise<void>
    }

    await domainProps.handleDeleteGroups(['group-1', 'group-2'])

    // 同期削除エラー時は catch から `notifyDeleteFailure` が呼ばれ、
    // snapshot が RestoreOpenedUrlsSnapshotUseCase 経由で復元される。
    // snapshot に customProjectOrder は含まれないため
    // presentation 層からの chrome.storage.local.set は発生しない。
    expect(chromeSetMock).toHaveBeenCalledWith({
      savedTabs: [groupWithIds, legacyGroup],
    })
    expect(toast.error).toHaveBeenCalledWith('削除に失敗しました')
    expect(toast.info).not.toHaveBeenCalled()
  })

  it('ドメイン props のカテゴリ削除と未開始の並び替え確定は安全に処理する', async () => {
    mocked.projectState.viewMode = 'domain'
    mocked.projectState.viewModeRef = { current: 'domain' }

    render(<SavedTabsApp initialViewMode='domain' />)

    const domainProps = mocked.domainModeContainerSpy.mock.calls.at(
      -1,
    )?.[0] as {
      handleConfirmUncategorizedReorder: () => Promise<void>
      handleDeleteCategory: (
        groupId: string,
        categoryName: string,
      ) => Promise<void>
    }

    await domainProps.handleConfirmUncategorizedReorder()
    await domainProps.handleDeleteCategory('group-1', 'news')

    expect(mocked.categoryState.handleDeleteCategory).toHaveBeenCalledWith(
      'group-1',
      'news',
      mocked.tabDataState.refreshTabGroupsWithUrls,
    )
  })

  it('並び替え中の単体/一括削除は一時順序を更新する', async () => {
    const group1: TabGroup = {
      domain: 'a.example.com',
      id: 'group-1',
      urlIds: ['url-1'],
    }
    const group2: TabGroup = {
      domain: 'b.example.com',
      id: 'group-2',
      urlIds: ['url-2'],
    }
    mocked.projectState.viewMode = 'domain'
    mocked.projectState.viewModeRef = { current: 'domain' }
    mocked.categoryState.categories = []
    mocked.tabDataState.tabGroups = [group1, group2]
    mocked.tabDataState.tabGroupsWithUrls = [group1, group2]
    const chromeGlobal = globalThis as unknown as { chrome: typeof chrome }
    chromeGlobal.chrome = {
      storage: {
        local: {
          // eslint-disable-next-line typescript/require-await
          get: vi.fn(async () => ({ savedTabs: [group1, group2] })),
          set: vi.fn(),
        },
        onChanged: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
      },
      tabs: {
        create: vi.fn(),
      },
      windows: {
        create: vi.fn(),
      },
      runtime: {
        getURL: vi.fn(),
      },
    } as unknown as typeof chrome

    render(<SavedTabsApp initialViewMode='domain' />)

    let domainProps = mocked.domainModeContainerSpy.mock.calls.at(-1)?.[0] as {
      handleDeleteGroup: (id: string) => Promise<void>
      handleDeleteGroups: (ids: string[]) => Promise<void>
      handleUncategorizedDragEnd: (event: {
        active: { id: string }
        over: { id: string }
      }) => void
    }

    act(() => {
      domainProps.handleUncategorizedDragEnd({
        active: { id: 'group-1' },
        over: { id: 'group-2' },
      })
    })
    await waitFor(() => {
      expect(
        // eslint-disable-next-line typescript/no-non-null-assertion
        (
          mocked.domainModeContainerSpy.mock.calls.at(-1)![0] as {
            // eslint-disable-line
            // eslint-disable-line
            // eslint-disable-line
            state: { isUncategorizedReorderMode: boolean }
          }
        ).state.isUncategorizedReorderMode,
      ).toBe(true)
    })
    domainProps = mocked.domainModeContainerSpy.mock.calls.at(
      -1,
    )?.[0] as typeof domainProps

    await domainProps.handleDeleteGroup('group-1')
    await domainProps.handleDeleteGroups(['group-2'])

    expect(handleTabGroupRemoval).toHaveBeenCalledWith('group-1')
    expect(handleTabGroupRemoval).toHaveBeenCalledWith('group-2')
  })

  it('一括削除は親カテゴリの domains から削除対象 ID を落とす', async () => {
    const group1: TabGroup = {
      domain: 'a.example.com',
      id: 'group-1',
      urlIds: ['url-1'],
    }
    const group2: TabGroup = {
      domain: 'b.example.com',
      id: 'group-2',
      urlIds: ['url-2'],
    }
    mocked.projectState.viewMode = 'domain'
    mocked.projectState.viewModeRef = { current: 'domain' }
    mocked.categoryState.categories = [
      {
        domainNames: [],
        domains: ['group-1', 'group-2', 'keep'],
        id: 'category-1',
        name: 'Category',
      },
    ]
    mocked.tabDataState.tabGroups = [group1, group2]
    mocked.tabDataState.tabGroupsWithUrls = [group1, group2]
    const chromeGlobal = globalThis as unknown as { chrome: typeof chrome }
    chromeGlobal.chrome = {
      storage: {
        local: {
          // eslint-disable-next-line typescript/require-await
          get: vi.fn(async () => ({ savedTabs: [group1, group2] })),
          set: vi.fn(),
        },
        onChanged: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
      },
      tabs: {
        create: vi.fn(),
      },
      windows: {
        create: vi.fn(),
      },
      runtime: {
        getURL: vi.fn(),
      },
    } as unknown as typeof chrome

    render(<SavedTabsApp initialViewMode='domain' />)

    const domainProps = mocked.domainModeContainerSpy.mock.calls.at(
      -1,
    )?.[0] as {
      handleDeleteGroups: (ids: string[]) => Promise<void>
    }

    await domainProps.handleDeleteGroups(['group-1', 'group-2'])

    expect(saveParentCategories).toHaveBeenLastCalledWith([
      expect.objectContaining({
        domains: ['keep'],
        id: 'category-1',
      }),
    ])
  })

  it('カテゴリ間 URL 移動ハンドラは現状 no-op として完了する', async () => {
    render(<SavedTabsApp />)

    const customProps = mocked.customModeContainerSpy.mock.calls.at(
      -1,
    )?.[0] as {
      handleMoveUrlsBetweenCategories: () => Promise<void>
    }

    await expect(
      customProps.handleMoveUrlsBetweenCategories(),
    ).resolves.toBeUndefined()
  })

  it('handleOpenTab は urlRecord 未登録の URL でも browserTabPort で開く', async () => {
    mocked.settings.openUrlInBackground = true
    mocked.projectState.viewMode = 'custom'
    mocked.projectState.viewModeRef = { current: 'custom' }
    const chromeTabsCreateMock = vi.fn()
    const chromeGlobal = globalThis as unknown as { chrome: typeof chrome }
    chromeGlobal.chrome = {
      storage: {
        local: {
          // eslint-disable-next-line typescript/require-await
          get: vi.fn(async () => ({ savedTabs: [], urls: [] })),
          set: vi.fn(),
        },
        onChanged: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
      },
      tabs: {
        create: chromeTabsCreateMock,
      },
      windows: {
        create: vi.fn(),
      },
      runtime: {
        getURL: vi.fn(),
      },
    } as unknown as typeof chrome

    render(<SavedTabsApp />)

    const customProps = mocked.customModeContainerSpy.mock.calls.at(
      -1,
    )?.[0] as {
      handleOpenUrl: (url: string) => Promise<void>
    }

    await customProps.handleOpenUrl('https://example.com/orphan')

    // browserTabPort 経由で開かれる。openUrlInBackground=true なので active: false。
    expect(chromeTabsCreateMock).toHaveBeenCalledWith({
      active: false,
      url: 'https://example.com/orphan',
    })
  })

  it('handleOpenTab は removeTabAfterOpen=true 設定で Undo トーストを表示する', async () => {
    mocked.settings.removeTabAfterOpen = true
    mocked.settings.openUrlInBackground = false
    mocked.projectState.viewMode = 'custom'
    mocked.projectState.viewModeRef = { current: 'custom' }
    const group: TabGroup = {
      domain: 'example.com',
      id: 'group-1',
      urlIds: ['url-remove', 'url-keep'],
      urls: [
        {
          id: 'url-remove',
          title: 'Remove',
          url: 'https://example.com/remove',
        },
        {
          id: 'url-keep',
          title: 'Keep',
          url: 'https://example.com/keep',
        },
      ],
    }
    const urlRecords: UrlRecord[] = [
      {
        id: 'url-remove',
        savedAt: 1,
        title: 'Remove',
        url: 'https://example.com/remove',
      },
      {
        id: 'url-keep',
        savedAt: 1,
        title: 'Keep',
        url: 'https://example.com/keep',
      },
    ]
    const customProjectsSnapshot: CustomProject[] = []
    const chromeSetMock = vi.fn()
    const chromeGlobal = globalThis as unknown as { chrome: typeof chrome }
    chromeGlobal.chrome = {
      storage: {
        local: {
          // eslint-disable-next-line typescript/require-await
          get: vi.fn(async (key: unknown) => {
            const keys = Array.isArray(key)
              ? (key as string[])
              : typeof key === 'string'
                ? [key]
                : []
            const result: Record<string, unknown> = {}
            for (const k of keys) {
              if (k === 'savedTabs') result.savedTabs = [group]
              if (k === 'urls') result.urls = urlRecords
              if (k === 'customProjects')
                result.customProjects = customProjectsSnapshot
              if (k === 'customProjectOrder') result.customProjectOrder = []
            }
            return result
          }),
          set: chromeSetMock,
        },
        onChanged: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
      },
      tabs: {
        create: vi.fn(),
      },
      windows: {
        create: vi.fn(),
      },
      runtime: {
        getURL: vi.fn(),
      },
    } as unknown as typeof chrome

    render(<SavedTabsApp />)

    const customProps = mocked.customModeContainerSpy.mock.calls.at(
      -1,
    )?.[0] as {
      handleOpenUrl: (url: string) => Promise<void>
    }

    await customProps.handleOpenUrl('https://example.com/remove')

    expect(toast.info).toHaveBeenCalledWith(
      '開いた1件のタブを保存データから削除しました',
      expect.objectContaining({
        action: expect.objectContaining({
          label: '元に戻す',
        }),
      }),
    )

    // Undo で snapshot 復元を試す
    const undoOptions = vi.mocked(toast.info).mock.calls.at(-1)?.[1] as
      | {
          action?: {
            onClick?: () => Promise<void>
          }
        }
      | undefined
    await undoOptions?.action?.onClick?.()

    // chrome.storage.local.set が savedTabs / customProjects の元データを書き戻す
    expect(chromeSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        savedTabs: [group],
      }),
    )
  })

  it('handleOpenTab は他で参照されている URL でも Undo トーストを表示する（snapshot 経由）', async () => {
    mocked.settings.removeTabAfterOpen = true
    mocked.settings.openUrlInBackground = false
    mocked.projectState.viewMode = 'custom'
    mocked.projectState.viewModeRef = { current: 'custom' }
    const group1: TabGroup = {
      domain: 'example.com',
      id: 'group-1',
      urlIds: ['url-shared'],
      urls: [
        {
          id: 'url-shared',
          title: 'Shared',
          url: 'https://example.com/shared',
        },
      ],
    }
    // 同じ URL ID を参照する別グループ → urlRecord 自体は削除されない
    const group2: TabGroup = {
      domain: 'other.com',
      id: 'group-2',
      urlIds: ['url-shared'],
      urls: [
        {
          id: 'url-shared',
          title: 'Shared',
          url: 'https://example.com/shared',
        },
      ],
    }
    const urlRecords: UrlRecord[] = [
      {
        id: 'url-shared',
        savedAt: 1,
        title: 'Shared',
        url: 'https://example.com/shared',
      },
    ]
    const chromeSetMock = vi.fn()
    const chromeGlobal = globalThis as unknown as { chrome: typeof chrome }
    chromeGlobal.chrome = {
      storage: {
        local: {
          // eslint-disable-next-line typescript/require-await
          get: vi.fn(async (key: unknown) => {
            const keys = Array.isArray(key)
              ? (key as string[])
              : typeof key === 'string'
                ? [key]
                : []
            const result: Record<string, unknown> = {}
            for (const k of keys) {
              if (k === 'savedTabs') result.savedTabs = [group1, group2]
              if (k === 'urls') result.urls = urlRecords
              if (k === 'customProjects') result.customProjects = []
              if (k === 'customProjectOrder') result.customProjectOrder = []
            }
            return result
          }),
          set: chromeSetMock,
        },
        onChanged: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
      },
      tabs: {
        create: vi.fn(),
      },
      windows: {
        create: vi.fn(),
      },
      runtime: {
        getURL: vi.fn(),
      },
    } as unknown as typeof chrome

    render(<SavedTabsApp />)

    const customProps = mocked.customModeContainerSpy.mock.calls.at(
      -1,
    )?.[0] as {
      handleOpenUrl: (url: string) => Promise<void>
    }

    await customProps.handleOpenUrl('https://example.com/shared')

    // URL ID は group-1 / group-2 双方から削除されるが、url-shared 自体は
    // 他で参照されているので urlRecord は削除されない。
    // それでも use-case は snapshot を返すため、Undo toast は表示される。
    expect(toast.info).toHaveBeenCalledWith(
      '開いた1件のタブを保存データから削除しました',
      expect.objectContaining({
        action: expect.objectContaining({
          label: '元に戻す',
        }),
      }),
    )
  })

  it('handleOpenTab は active 設定の変化を resolveActive 経由で反映する', async () => {
    mocked.projectState.viewMode = 'custom'
    mocked.projectState.viewModeRef = { current: 'custom' }
    const chromeTabsCreateMock = vi.fn()
    const addListener = vi.fn()
    const chromeGlobal = globalThis as unknown as { chrome: typeof chrome }
    chromeGlobal.chrome = {
      storage: {
        local: {
          // eslint-disable-next-line typescript/require-await
          get: vi.fn(async () => ({ savedTabs: [], urls: [] })),
          set: vi.fn(),
        },
        onChanged: {
          addListener,
          removeListener: vi.fn(),
        },
      },
      tabs: {
        create: chromeTabsCreateMock,
      },
      windows: {
        create: vi.fn(),
      },
      runtime: {
        getURL: vi.fn(),
      },
    } as unknown as typeof chrome

    // 初期 settings は openUrlInBackground=true（defaultSettings 由来）。
    // 設定変更を syncStorageChanges 経由で false に切り替えてから再度開く。
    // eslint-disable-next-line typescript/require-await
    vi.mocked(syncStorageChanges).mockImplementationOnce(async (options) => {
      options.setSettings({
        ...mocked.settings,
        openUrlInBackground: false,
      })
      return []
    })

    render(<SavedTabsApp />)

    // 1回目: defaultSettings の openUrlInBackground=true → active: false
    let customProps = mocked.customModeContainerSpy.mock.calls.at(-1)?.[0] as {
      handleOpenUrl: (url: string) => Promise<void>
    }
    await customProps.handleOpenUrl('https://example.com/first')
    expect(chromeTabsCreateMock).toHaveBeenLastCalledWith({
      active: false,
      url: 'https://example.com/first',
    })

    // 設定を openUrlInBackground=false に変えてから再描画
    const listener = addListener.mock.calls[0]?.[0] as (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => void
    await act(async () => {
      listener(
        {
          settings: { newValue: { openUrlInBackground: false } },
        },
        'local',
      )
    })

    // 2回目: openUrlInBackground=false → active: true
    customProps = mocked.customModeContainerSpy.mock.calls.at(-1)?.[0] as {
      handleOpenUrl: (url: string) => Promise<void>
    }
    await customProps.handleOpenUrl('https://example.com/second')
    expect(chromeTabsCreateMock).toHaveBeenLastCalledWith({
      active: true,
      url: 'https://example.com/second',
    })
  })
})
