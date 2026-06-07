// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
          (_, token) => values?.[token] ?? '',
        )
      },
    }),
  }
})

vi.mock('@/features/saved-tabs/components/Footer', () => ({
  CategoryReorderFooter: () => null,
}))

vi.mock('@/features/saved-tabs/components/Header', () => ({
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
          onChange={(event) => {
            onSearchChange(event.target.value)
          }}
          value={searchQuery}
        />
      </label>
    )
  },
}))

vi.mock('@/features/saved-tabs/custom/CustomModeContainer', () => ({
  CustomModeContainer: (props: { projects: CustomProject[] }) => {
    const { projects } = props
    mocked.customModeContainerSpy(props)
    return (
      <div data-testid='custom-projects'>
        {projects.map((project) => (
          <section data-testid={`project-${project.id}`} key={project.id}>
            <div>{`project:${project.name}`}</div>
            {(project.urls || []).map((url) => (
              <div key={url.url}>{`url:${url.title}:${url.url}`}</div>
            ))}
          </section>
        ))}
      </div>
    )
  },
}))

vi.mock('@/features/saved-tabs/domain/DomainModeContainer', () => ({
  DomainModeContainer: (props: Record<string, unknown>) => {
    mocked.domainModeContainerSpy(props)
    return <div>domain-mode</div>
  },
}))

vi.mock('@/features/saved-tabs/lib/custom-project-move', () => ({
  moveCustomProjectUrlAndSyncState: vi.fn(),
}))

vi.mock('@/features/saved-tabs/lib/tab-operations', () => ({
  handleTabGroupRemoval: vi.fn(),
}))

vi.mock('@/features/saved-tabs/lib/uncategorized-display', () => ({
  shouldShowUncategorizedHeader: vi.fn(() => false),
}))

vi.mock('@/features/saved-tabs/hooks/useCategoryManagement', () => ({
  useCategoryManagement: () => mocked.categoryState,
}))

vi.mock('@/features/saved-tabs/hooks/useTabData', () => ({
  useTabData: () => mocked.tabDataState,
}))

vi.mock('@/features/saved-tabs/hooks/useProjectManagement', () => ({
  useProjectManagement: () => mocked.projectState,
}))

vi.mock('@/features/saved-tabs/shared/services/modeSyncService', () => ({
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
  removeUrlFromTabGroup: vi.fn(),
  removeUrlIdsFromTabGroup: vi.fn(),
  removeUrlsFromTabGroup: vi.fn(),
}))

vi.mock('@/lib/storage/urls', () => ({
// eslint-disable-next-line typescript/require-await
  getUrlRecords: vi.fn(async () => []),
}))

import { moveCustomProjectUrlAndSyncState } from '@/features/saved-tabs/lib/custom-project-move'
import { handleTabGroupRemoval } from '@/features/saved-tabs/lib/tab-operations'
import { syncStorageChanges } from '@/features/saved-tabs/shared/services/modeSyncService'
import { saveParentCategories } from '@/lib/storage/categories'
import {
  removeUrlFromAllCustomProjects,
  removeUrlIdsFromAllCustomProjects,
  removeUrlsFromAllCustomProjects,
} from '@/lib/storage/projects'
import {
  getTabGroupUrls,
  removeUrlFromTabGroup,
  removeUrlIdsFromTabGroup,
  removeUrlsFromTabGroup,
} from '@/lib/storage/tabs'
import { getUrlRecords } from '@/lib/storage/urls'

import {
  buildCategoryLookup,
  buildDisplayTabGroup,
  buildUpdatedGroupAfterUrlIdRemoval,
  buildUrlIdsToRemove,
  countTabGroupUrls,
  createFilterGroupsByExcludedIdsUpdater,
  filterGroupByQuery,
  filterGroupsByExcludedIds,
  getDisplayUrlCount,
  notifyDeleteFailure,
  removeUrlsFromCustomProjectsForGroup,
  removeUrlsFromCustomProjectsForGroups,
  restoreOpenedUrlsSnapshot,
  SavedTabsApp,
  sortCategorizedGroups,
  syncGroupCategoryAssignment,
} from './SavedTabsApp'

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
    vi.mocked(getUrlRecords).mockResolvedValue([])
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

    const categoryLookup = buildCategoryLookup([
      {
        domainNames: ['extra.example.com'],
        domains: ['group-ordered'],
        id: 'category-1',
        name: 'Ordered',
      },
    ])
    const categorized = {
      'category-1': [
        { domain: 'extra.example.com', id: 'group-extra', urlIds: ['url-b'] },
        {
          domain: 'ordered.example.com',
          id: 'group-ordered',
          urlIds: ['url-a'],
        },
      ],
    }

    sortCategorizedGroups(categorized, categoryLookup)

    expect(categorized['category-1']).toStrictEqual([
      expect.objectContaining({ id: 'group-ordered' }),
      expect.objectContaining({ id: 'group-extra' }),
    ])

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
// eslint-disable-next-line typescript/require-await
    const refreshTabGroupsWithUrls = vi.fn(async () => {
      throw new Error('restore failed')
    })

    await notifyDeleteFailure({
      refreshTabGroupsWithUrls,
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

    await restoreOpenedUrlsSnapshot({
      refreshTabGroupsWithUrls,
      setCustomProjects,
      snapshot: {},
    })

    expect(chromeSetMock).toHaveBeenCalledWith({
      savedTabs: [],
    })
    expect(setCustomProjects).not.toHaveBeenCalled()
    expect(refreshTabGroupsWithUrls).toHaveBeenCalledWith([])

    const groupWithoutUrls: TabGroup = {
      domain: 'empty.example.com',
      id: 'group-empty',
    }
    expect(
      filterGroupByQuery(groupWithoutUrls, 'reading', buildCategoryLookup([])),
    ).toBe(groupWithoutUrls)

    const duplicateLookup = buildCategoryLookup([
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
    expect(
      filterGroupByQuery(
        {
          domain: 'other.example.com',
          id: 'duplicate-group',
          parentCategoryId: 'category-a',
          urls: [{ title: 'Other', url: 'https://other.example.com' }],
        },
        'nomatch',
        duplicateLookup,
      ),
    ).toStrictEqual(
      expect.objectContaining({
        urls: [],
      }),
    )

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
      buildCategoryLookup(state.updatedCategories),
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
    vi.mocked(getTabGroupUrls).mockResolvedValueOnce([
      {
        id: 'legacy-url',
        savedAt: 1,
        title: 'Legacy',
        url: 'https://legacy.example.com/a',
      },
    ])

    await removeUrlsFromCustomProjectsForGroups([
      {
        domain: 'ids.example.com',
        id: 'group-with-ids',
        urlIds: ['url-a'],
      },
      {
        domain: 'legacy.example.com',
        id: 'legacy-group',
      },
    ])

    expect(removeUrlIdsFromAllCustomProjects).toHaveBeenCalledWith(['url-a'], {
      throwOnError: true,
    })
    expect(removeUrlsFromAllCustomProjects).toHaveBeenCalledWith(
      ['https://legacy.example.com/a'],
      { throwOnError: true },
    )
  })

  it('helper は legacy URL 取得が undefined を返しても同期削除をスキップする', async () => {
    vi.mocked(getTabGroupUrls).mockResolvedValueOnce(
      undefined as unknown as Awaited<ReturnType<typeof getTabGroupUrls>>,
    )

    await removeUrlsFromCustomProjectsForGroups([
      {
        domain: 'legacy.example.com',
        id: 'legacy-group',
      },
    ])

    expect(removeUrlsFromAllCustomProjects).not.toHaveBeenCalled()
  })

  it('helper は legacy URL 取得が空配列なら同期削除をスキップする', async () => {
    vi.mocked(getTabGroupUrls).mockResolvedValueOnce([])

    await removeUrlsFromCustomProjectsForGroup({
      domain: 'empty.example.com',
      id: 'empty-group',
    })

    expect(removeUrlsFromAllCustomProjects).not.toHaveBeenCalled()
  })

  it('helper はカテゴリ順序にない先頭グループを末尾へ送る', () => {
    const categoryLookup = buildCategoryLookup([
      {
        domainNames: [],
        domains: ['group-a', 'group-b'],
        id: 'category-1',
        name: 'Ordered',
      },
    ])
    const categorized = {
      'category-1': [
        { domain: 'unknown.example.com', id: 'group-unknown', urlIds: ['u'] },
        { domain: 'b.example.com', id: 'group-b', urlIds: ['b'] },
        { domain: 'a.example.com', id: 'group-a', urlIds: ['a'] },
      ],
    }

    sortCategorizedGroups(categorized, categoryLookup)

    expect(categorized['category-1'].map((group) => group.id)).toStrictEqual([
      'group-a',
      'group-b',
      'group-unknown',
    ])

    const categorizedWithUnknownLast = {
      'category-1': [
        { domain: 'a.example.com', id: 'group-a', urlIds: ['a'] },
        { domain: 'unknown.example.com', id: 'group-unknown', urlIds: ['u'] },
      ],
    }
    sortCategorizedGroups(categorizedWithUnknownLast, categoryLookup)
    expect(
      categorizedWithUnknownLast['category-1'].map((group) => group.id),
    ).toStrictEqual(['group-a', 'group-unknown'])

    expect(
      filterGroupsByExcludedIds(
        categorized['category-1'],
        new Set(['group-b']),
      ).map((group) => group.id),
    ).toStrictEqual(['group-a', 'group-unknown'])
    expect(
      createFilterGroupsByExcludedIdsUpdater(new Set(['group-a']))(
        categorized['category-1'],
      ).map((group) => group.id),
    ).toStrictEqual(['group-b', 'group-unknown'])
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
      options.setSettings({
        ...mocked.settings,
        enableCategories: false,
      })
      return []
    })

    render(<SavedTabsApp initialViewMode='domain' />)

    const listener = addListener.mock.calls[0]?.[0] as (
      changes: Record<string, chrome.storage.StorageChange>,
    ) => Promise<void>
    await act(async () => {
      await listener({
        settings: {
          newValue: {
            enableCategories: false,
          },
        },
      })
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
    mocked.projectState.viewMode = 'domain'
    mocked.projectState.viewModeRef = { current: 'domain' }
    mocked.categoryState.categories = [
      {
        id: 'category-1',
        name: 'Reading',
        domains: ['group-1'],
        domainNames: ['example.com'],
      },
    ]
    mocked.categoryState.categoryOrder = ['category-1']
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

    expect(chromeSetMock).toHaveBeenLastCalledWith({
      customProjectOrder: ['project-1'],
      customProjects: customProjectsSnapshot,
      parentCategories: mocked.categoryState.categories,
      savedTabs: [group],
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

    const chromeGlobal = globalThis as unknown as { chrome: typeof chrome }
    chromeGlobal.chrome = {
      storage: {
        local: {
// eslint-disable-next-line typescript/require-await
          get: vi.fn(async () => ({ savedTabs: [group] })),
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

    expect(removeUrlIdsFromTabGroup).toHaveBeenCalledWith(
      'group-1',
      ['url-a', 'url-b'],
      { throwOnSyncError: true },
    )
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

    render(<SavedTabsApp initialViewMode='domain' />)

    const domainProps = mocked.domainModeContainerSpy.mock.calls.at(
      -1,
    )?.[0] as {
      handleDeleteUrls: (groupId: string, urls: string[]) => Promise<void>
    }

    await domainProps.handleDeleteUrls('missing-group', [
      'https://example.com/missing',
    ])

    expect(removeUrlsFromTabGroup).toHaveBeenCalledWith(
      'missing-group',
      ['https://example.com/missing'],
      { throwOnSyncError: true },
    )

    vi.mocked(removeUrlsFromTabGroup).mockRejectedValueOnce(
      new Error('delete failed'),
    )
    await domainProps.handleDeleteUrls('missing-group', [
      'https://example.com/missing-2',
    ])

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
        (
          mocked.domainModeContainerSpy.mock.calls.at(-1)![0] as {
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
        (
          mocked.domainModeContainerSpy.mock.calls.at(-1)![0] as {
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
      (
        mocked.domainModeContainerSpy.mock.calls.at(-1)![0] as {
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

    expect(removeUrlFromTabGroup).toHaveBeenCalledWith(
      'group-1',
      'https://example.com/a',
      { throwOnSyncError: true },
    )
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

    expect(chromeSetMock).toHaveBeenLastCalledWith({
      customProjectOrder: ['project-1'],
      customProjects: customProjectsSnapshot,
      savedTabs: [group],
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
    vi.mocked(removeUrlFromTabGroup).mockRejectedValueOnce(
      new Error('delete failed'),
    )

    render(<SavedTabsApp initialViewMode='domain' />)

    const domainProps = mocked.domainModeContainerSpy.mock.calls.at(
      -1,
    )?.[0] as {
      handleDeleteUrl: (groupId: string, url: string) => Promise<void>
    }

    await domainProps.handleDeleteUrl('group-1', 'https://example.com/a')

    expect(chromeSetMock).toHaveBeenCalledWith({
      customProjectOrder: ['project-1'],
      customProjects: customProjectsSnapshot,
      savedTabs: [group],
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
    const chromeTabsCreateMock = vi.fn()
    const chromeGlobal = globalThis as unknown as { chrome: typeof chrome }
    chromeGlobal.chrome = {
      storage: {
        local: {
// eslint-disable-next-line typescript/require-await
          get: vi.fn(async () => ({
            customProjectOrder: ['project-1'],
            customProjects: customProjectsSnapshot,
            savedTabs: [group1, group2],
          })),
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

    vi.mocked(getUrlRecords).mockResolvedValue([
      { id: 'url-a', url: 'https://example.com/a', title: 'A', savedAt: 1 },
      { id: 'url-b', url: 'https://example.com/b', title: 'B', savedAt: 2 },
      { id: 'url-c', url: 'https://other.com/c', title: 'C', savedAt: 3 },
    ] satisfies UrlRecord[])

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

    expect(chromeTabsCreateMock).toHaveBeenCalledTimes(2)
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

    expect(chromeSetMock).toHaveBeenLastCalledWith({
      customProjectOrder: ['project-1'],
      customProjects: customProjectsSnapshot,
      savedTabs: [group1, group2],
    })
    expect(mocked.projectState.setCustomProjects).toHaveBeenCalledWith(
      customProjectsSnapshot,
    )
    expect(toast.success).toHaveBeenCalledWith('保存データを復元しました')
    expect(removeUrlIdsFromAllCustomProjects).toHaveBeenCalledTimes(1)
    expect(removeUrlIdsFromAllCustomProjects).toHaveBeenCalledWith([
      'url-a',
      'url-b',
    ])
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

    const chromeSetMock = vi.fn()
    const chromeGlobal = globalThis as unknown as { chrome: typeof chrome }
    chromeGlobal.chrome = {
      storage: {
        local: {
// eslint-disable-next-line typescript/require-await
          get: vi.fn(async () => ({
            savedTabs: [groupWithoutIds, unchangedGroup, partialGroup],
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
    vi.mocked(getUrlRecords)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'url-remove',
          savedAt: 1,
          title: 'Remove',
          url: 'https://partial.example.com/remove',
        },
      ])

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
    vi.mocked(getUrlRecords).mockResolvedValue([
      {
        id: 'url-1',
        savedAt: 1,
        title: 'Doc',
        url: 'https://example.com/doc',
      },
    ])
    vi.mocked(moveCustomProjectUrlAndSyncState).mockResolvedValue(undefined)

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
          get: vi.fn(async () => ({
            customProjectOrder: ['project-1'],
            customProjects: customProjectsSnapshot,
            savedTabs: [groupWithIds, legacyGroup],
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
      {
        id: 'legacy-url',
        savedAt: 1,
        title: 'Legacy',
        url: 'https://legacy.example.com/a',
      },
    ])

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
    expect(removeUrlIdsFromAllCustomProjects).toHaveBeenCalledWith(['url-a'], {
      throwOnError: true,
    })
    expect(removeUrlsFromAllCustomProjects).toHaveBeenCalledWith(
      ['https://legacy.example.com/a'],
      { throwOnError: true },
    )
    expect(chromeSetMock).toHaveBeenCalledWith({
      savedTabs: [],
    })
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

    expect(chromeSetMock).toHaveBeenLastCalledWith({
      customProjectOrder: ['project-1'],
      customProjects: customProjectsSnapshot,
      parentCategories: [],
      savedTabs: [groupWithIds, legacyGroup],
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

    expect(removeUrlsFromTabGroup).toHaveBeenCalledWith(
      'group-1',
      ['https://example.com/a', 'https://example.com/no-id'],
      { throwOnSyncError: true },
    )
  })

  it('複数ドメイン削除で legacy URL 取得に失敗しても削除処理は継続する', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const legacyGroup: TabGroup = {
      domain: 'legacy.example.com',
      id: 'legacy-group',
      urls: [
        {
          title: 'Legacy',
          url: 'https://legacy.example.com/a',
        },
      ],
    }
    mocked.projectState.viewMode = 'domain'
    mocked.projectState.viewModeRef = { current: 'domain' }
    mocked.tabDataState.tabGroups = [legacyGroup]
    mocked.tabDataState.tabGroupsWithUrls = [legacyGroup]
    vi.mocked(getTabGroupUrls).mockRejectedValueOnce(new Error('read failed'))

    const chromeSetMock = vi.fn()
    const chromeGlobal = globalThis as unknown as { chrome: typeof chrome }
    chromeGlobal.chrome = {
      storage: {
        local: {
// eslint-disable-next-line typescript/require-await
          get: vi.fn(async () => ({ savedTabs: [legacyGroup] })),
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

    await domainProps.handleDeleteGroups(['legacy-group'])

    expect(consoleError).toHaveBeenCalledWith(
      '複数グループのURL取得エラー:',
      expect.any(Error),
    )
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
        (
          mocked.domainModeContainerSpy.mock.calls.at(-1)![0] as {
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
        (
          mocked.domainModeContainerSpy.mock.calls.at(-1)![0] as {
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
        (
          mocked.domainModeContainerSpy.mock.calls.at(-1)![0] as {
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
    ) => Promise<void>

    await listener({
      savedTabs: {
        newValue: [],
        oldValue: [],
      },
    })
    unmount()

    expect(syncStorageChanges).toHaveBeenCalledWith(
      expect.objectContaining({
        changes: {
          savedTabs: {
            newValue: [],
            oldValue: [],
          },
        },
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

    await waitFor(() => {
      expect(saveParentCategories).toHaveBeenCalledWith([
        expect.objectContaining({
          domains: ['group-1'],
          id: 'category-1',
        }),
      ])
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
    vi.mocked(getUrlRecords).mockResolvedValue([])

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
    ) => Promise<void>
    await act(async () => {
      await listener({
        settings: {
          newValue: {
            openAllInNewWindow: true,
          },
        },
      })
    })

    await waitFor(() => {
      expect(
        (
          mocked.domainModeContainerSpy.mock.calls.at(-1)![0] as {
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
    const chromeSetMock = vi
      .fn()
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
        (
          mocked.domainModeContainerSpy.mock.calls.at(-1)![0] as {
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
    mocked.tabDataState.tabGroups = [
      {
        domain: 'example.com',
        id: 'group-1',
        urlIds: ['url-a'],
      },
    ]
    mocked.tabDataState.tabGroupsWithUrls = mocked.tabDataState.tabGroups

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

    vi.mocked(removeUrlFromTabGroup).mockRejectedValueOnce(
      new Error('delete url failed'),
    )
    vi.mocked(handleTabGroupRemoval).mockRejectedValueOnce(
      new Error('delete group failed'),
    )

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

    await domainProps.handleDeleteUrl('group-1', 'https://example.com/a')
    await domainProps.handleDeleteUrls('group-1', [])
    await domainProps.handleDeleteGroup('group-1')
    await domainProps.handleDeleteGroups(['missing'])
    domainProps.handleCancelUncategorizedReorder()

    expect(removeUrlFromTabGroup).toHaveBeenCalledWith(
      'group-1',
      'https://example.com/a',
      { throwOnSyncError: true },
    )
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
    const chromeTabsCreateMock = vi.fn()
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
        create: chromeTabsCreateMock,
      },
      windows: {
        create: vi.fn(),
      },
      runtime: {
        getURL: vi.fn(),
      },
    } as unknown as typeof chrome
    vi.mocked(getUrlRecords).mockResolvedValue([
      {
        id: 'url-remove',
        savedAt: 1,
        title: 'Remove',
        url: 'https://example.com/remove',
      },
    ])

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
          urlSubCategories: undefined,
        }),
      ],
    })
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
    ) => Promise<void>
    await act(async () => {
      await listener({
        settings: {
          newValue: {
            removeTabAfterOpen: false,
          },
        },
      })
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
    vi.mocked(getUrlRecords).mockResolvedValue([
      {
        id: 'url-remove',
        savedAt: 1,
        title: 'Remove',
        url: 'https://example.com/remove',
      },
    ])
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
    const chromeGlobal = globalThis as unknown as { chrome: typeof chrome }
    chromeGlobal.chrome = {
      storage: {
        local: {
// eslint-disable-next-line typescript/require-await
          get: vi.fn(async () => ({ savedTabs: [group] })),
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
    vi.mocked(getTabGroupUrls).mockResolvedValueOnce([
      {
        id: 'legacy-url',
        savedAt: 1,
        title: 'Legacy',
        url: 'https://legacy.example.com/a',
      },
    ])

    render(<SavedTabsApp initialViewMode='domain' />)

    const domainProps = mocked.domainModeContainerSpy.mock.calls.at(
      -1,
    )?.[0] as {
      handleDeleteGroup: (id: string) => Promise<void>
    }

    await domainProps.handleDeleteGroup('group-1')

    expect(removeUrlsFromAllCustomProjects).toHaveBeenCalledWith(
      ['https://legacy.example.com/a'],
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
          get: vi.fn(async () => ({
            savedTabs: [groupWithIds, legacyGroup],
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
    vi.mocked(removeUrlIdsFromAllCustomProjects).mockRejectedValueOnce(
      new Error('id sync failed'),
    )
    vi.mocked(removeUrlsFromAllCustomProjects).mockRejectedValueOnce(
      new Error('url sync failed'),
    )
    vi.mocked(getTabGroupUrls).mockResolvedValueOnce([
      {
        id: 'legacy-url',
        savedAt: 1,
        title: 'Legacy',
        url: 'https://legacy.example.com/a',
      },
    ])

    render(<SavedTabsApp initialViewMode='domain' />)

    const domainProps = mocked.domainModeContainerSpy.mock.calls.at(
      -1,
    )?.[0] as {
      handleDeleteGroups: (ids: string[]) => Promise<void>
    }

    await domainProps.handleDeleteGroups(['group-1', 'group-2'])

    expect(chromeSetMock).toHaveBeenCalledWith({
      parentCategories: [],
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
        (
          mocked.domainModeContainerSpy.mock.calls.at(-1)![0] as {
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
})
