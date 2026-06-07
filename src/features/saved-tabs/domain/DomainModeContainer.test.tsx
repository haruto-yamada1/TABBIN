// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ParentCategory, TabGroup, UserSettings } from '@/types/storage'

const domainModeI18nState = vi.hoisted(() => ({
  language: 'ja' as 'en' | 'ja',
}))

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  closestCenter: 'closestCenter',
}))

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  verticalListSortingStrategy: 'verticalListSortingStrategy',
}))

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}))

vi.mock('@/features/i18n/context/I18nProvider', async () => {
  const { getMessages } = await vi.importActual<
// eslint-disable-next-line typescript/consistent-type-imports
    typeof import('@/features/i18n/messages')
  >('@/features/i18n/messages')

  return {
    useI18n: () => ({
      language: domainModeI18nState.language,
      t: (key: string, fallback?: string, values?: Record<string, string>) => {
        const messages = getMessages(domainModeI18nState.language)
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

vi.mock('@/features/saved-tabs/components/CategoryGroup', () => ({
  CategoryGroup: ({
    category,
    domains,
    handleMoveDomainToCategory,
  }: {
    category: ParentCategory
    domains: TabGroup[]
    handleMoveDomainToCategory: (
      domainId: string,
      fromCategoryId: string | null,
      toCategoryId: string,
    ) => Promise<void>
  }) => (
    <div>
      <span>category-group:{category.name}</span>
      <span>domain-count:{domains.length}</span>
      <button
        type='button'
        onClick={() =>
          void handleMoveDomainToCategory('domain-1', category.id, 'target')
        }
      >
        move-domain
      </button>
    </div>
  ),
}))

vi.mock('@/features/saved-tabs/components/SortableDomainCard', () => ({
  SortableDomainCard: ({ group }: { group: TabGroup }) => (
    <div>sortable-domain-card:{group.domain}</div>
  ),
}))

import { DomainModeContainer } from './DomainModeContainer'

const defaultSettings: UserSettings = {
  removeTabAfterOpen: true,
  removeTabAfterExternalDrop: true,
  excludePatterns: [],
  enableCategories: true,
  autoDeletePeriod: 'never',
  showSavedTime: false,
  clickBehavior: 'saveSameDomainTabs',
  excludePinnedTabs: false,
  openUrlInBackground: true,
  openAllInNewWindow: false,
  confirmDeleteAll: false,
  confirmDeleteEach: false,
  colors: {},
}

const createProps = () => ({
  state: {
    hasVisibleCategoryGroups: false,
    isCategoryReorderMode: false,
    isLoading: false,
    isUncategorizedReorderMode: false,
    shouldShowUncategorizedList: false,
    shouldShowUncategorizedSectionHeader: false,
  },
  settings: defaultSettings,
  categories: [] as ParentCategory[],
  categorized: {} as Record<string, TabGroup[]>,
  categoryOrderForDisplay: [] as string[],
  tabGroups: [] as TabGroup[],
  searchQuery: '',
  sensors: [],
  handleCategoryDragEnd: vi.fn(),
  handleOpenAllTabs: vi.fn(),
  handleDeleteGroup: vi.fn(),
  handleDeleteGroups: vi.fn(),
  handleDeleteUrl: vi.fn(),
  handleDeleteUrls: vi.fn(),
  handleOpenTab: vi.fn(),
  handleUpdateUrls: vi.fn(),
  handleUpdateDomainsOrder: vi.fn(),
  handleMoveDomainToCategory: vi.fn(),
  handleDeleteCategory: vi.fn(),
  handleCancelUncategorizedReorder: vi.fn(),
  handleConfirmUncategorizedReorder: vi.fn(),
  uncategorizedForDisplay: [] as TabGroup[],
  handleUncategorizedDragEnd: vi.fn(),
  hasContentTabGroupsCount: 0,
})

const uncategorizedGroups: TabGroup[] = [
  {
    id: 'group-1',
    domain: 'example.com',
    urls: [
      { url: 'https://example.com/a', title: 'A' },
      { url: 'https://example.com/b', title: 'B' },
    ],
  },
  {
    id: 'group-2',
    domain: 'sample.com',
    urls: [{ url: 'https://sample.com/a', title: 'C' }],
  },
]

describe('DomainModeContainer', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    domainModeI18nState.language = 'ja'
  })

  it('renders English empty-state copy when the display language is en', () => {
    domainModeI18nState.language = 'en'

    render(<DomainModeContainer {...createProps()} />)

    expect(screen.getByText('No saved tabs')).toBeTruthy()
    expect(
      screen.getByText(
        'Right-click a tab to save it, or click the extension icon.',
      ),
    ).toBeTruthy()
  })

  it('renders a spinner-only loading state', () => {
    const props = createProps()

    render(
      <DomainModeContainer
        {...props}
        state={{ ...props.state, isLoading: true }}
      />,
    )

    expect(screen.getByRole('status')).toBeTruthy()
    expect(screen.queryByText('No saved tabs')).toBeNull()
  })

  it('未分類ヘッダーに表示中のタブ数とドメイン数を表示する', () => {
    render(
      <DomainModeContainer
        {...createProps()}
        state={{
          ...createProps().state,
          shouldShowUncategorizedList: true,
          shouldShowUncategorizedSectionHeader: true,
        }}
        uncategorizedForDisplay={uncategorizedGroups}
        hasContentTabGroupsCount={uncategorizedGroups.length}
      />,
    )

    const tabCount = screen.getByText('3')
    const domainCount = screen.getByText('2')

    expect(screen.getByText('未分類のドメイン')).toBeTruthy()
    expect(tabCount).toBeTruthy()
    expect(domainCount).toBeTruthy()
    expect(screen.getByText('タブ数')).toBeTruthy()
    expect(screen.getByText('ドメイン数')).toBeTruthy()
    expect(tabCount.className).toContain('inline-flex')
    expect(tabCount.className).toContain('bg-secondary')
    expect(domainCount.className).toContain('inline-flex')
    expect(domainCount.className).toContain('bg-secondary')
    expect(
      screen.getByRole('button', {
        name: '「未分類のドメイン」のすべてのタブを開く',
      }),
    ).toBeTruthy()
    expect(
      screen.getByRole('button', {
        name: '「未分類のドメイン」のすべてのタブを削除',
      }),
    ).toBeTruthy()
  })

  it('未分類ヘッダーのすべて開くは表示中の未分類タブだけを開く', () => {
    const handleOpenAllTabs = vi.fn()

    render(
      <DomainModeContainer
        {...createProps()}
        handleOpenAllTabs={handleOpenAllTabs}
        state={{
          ...createProps().state,
          shouldShowUncategorizedList: true,
          shouldShowUncategorizedSectionHeader: true,
        }}
        uncategorizedForDisplay={uncategorizedGroups}
        hasContentTabGroupsCount={uncategorizedGroups.length}
      />,
    )

    fireEvent.click(
      screen.getByRole('button', {
        name: '「未分類のドメイン」のすべてのタブを開く',
      }),
    )

    expect(handleOpenAllTabs).toHaveBeenCalledWith([
      { url: 'https://example.com/a', title: 'A' },
      { url: 'https://example.com/b', title: 'B' },
      { url: 'https://sample.com/a', title: 'C' },
    ])
  })

  it('未分類ヘッダーのすべて削除は一括削除ハンドラがなければ単体削除にフォールバックする', async () => {
    const handleDeleteGroup = vi.fn()

    render(
      <DomainModeContainer
        {...createProps()}
        handleDeleteGroup={handleDeleteGroup}
        handleDeleteGroups={undefined}
        state={{
          ...createProps().state,
          shouldShowUncategorizedList: true,
          shouldShowUncategorizedSectionHeader: true,
        }}
        uncategorizedForDisplay={uncategorizedGroups}
        hasContentTabGroupsCount={uncategorizedGroups.length}
      />,
    )

    fireEvent.click(
      screen.getByRole('button', {
        name: '「未分類のドメイン」のすべてのタブを削除',
      }),
    )

    await waitFor(() => {
      expect(handleDeleteGroup).toHaveBeenNthCalledWith(1, 'group-1')
      expect(handleDeleteGroup).toHaveBeenNthCalledWith(2, 'group-2')
    })
  })

  it('検索中の未分類ヘッダーのすべて削除は表示中URLだけを group 単位で削除する', async () => {
    const handleDeleteUrls = vi.fn().mockResolvedValue(undefined)
    const handleDeleteGroup = vi.fn()
    const handleDeleteGroups = vi.fn()

    render(
      <DomainModeContainer
        {...createProps()}
        searchQuery='docs'
        handleDeleteUrls={handleDeleteUrls}
        handleDeleteGroup={handleDeleteGroup}
        handleDeleteGroups={handleDeleteGroups}
        state={{
          ...createProps().state,
          shouldShowUncategorizedList: true,
          shouldShowUncategorizedSectionHeader: true,
        }}
        uncategorizedForDisplay={[
          {
            id: 'group-1',
            domain: 'example.com',
            urls: [{ url: 'https://example.com/docs', title: 'Docs' }],
          },
          {
            id: 'group-2',
            domain: 'sample.com',
            urls: [{ url: 'https://sample.com/docs', title: 'Guide' }],
          },
        ]}
        hasContentTabGroupsCount={2}
      />,
    )

    fireEvent.click(
      screen.getByRole('button', {
        name: '「未分類のドメイン」のすべてのタブを削除',
      }),
    )

    await waitFor(() => {
      expect(handleDeleteUrls).toHaveBeenNthCalledWith(1, 'group-1', [
        'https://example.com/docs',
      ])
      expect(handleDeleteUrls).toHaveBeenNthCalledWith(2, 'group-2', [
        'https://sample.com/docs',
      ])
    })

    expect(handleDeleteGroup).not.toHaveBeenCalled()
    expect(handleDeleteGroups).not.toHaveBeenCalled()
  })

  it('検索中の未分類一括削除は URL がない group をスキップする', async () => {
    const handleDeleteUrls = vi.fn().mockResolvedValue(undefined)

    render(
      <DomainModeContainer
        {...createProps()}
        searchQuery='docs'
        handleDeleteUrls={handleDeleteUrls}
        state={{
          ...createProps().state,
          shouldShowUncategorizedList: true,
          shouldShowUncategorizedSectionHeader: true,
        }}
        uncategorizedForDisplay={[
          {
            id: 'empty-group',
            domain: 'empty.example.com',
          },
          {
            id: 'group-1',
            domain: 'example.com',
            urls: [{ url: 'https://example.com/docs', title: 'Docs' }],
          },
        ]}
        hasContentTabGroupsCount={2}
      />,
    )

    fireEvent.click(
      screen.getByRole('button', {
        name: '「未分類のドメイン」のすべてのタブを削除',
      }),
    )

    await waitFor(() => {
      expect(handleDeleteUrls).toHaveBeenCalledOnce()
    })
    expect(handleDeleteUrls).toHaveBeenCalledWith('group-1', [
      'https://example.com/docs',
    ])
  })

// eslint-disable-next-line typescript/require-await
  it('未分類が空の一括削除は削除ハンドラを呼ばない', async () => {
    const handleDeleteGroup = vi.fn()
    const handleDeleteGroups = vi.fn()

    render(
      <DomainModeContainer
        {...createProps()}
        handleDeleteGroup={handleDeleteGroup}
        handleDeleteGroups={handleDeleteGroups}
        state={{
          ...createProps().state,
          hasVisibleCategoryGroups: true,
          shouldShowUncategorizedList: false,
          shouldShowUncategorizedSectionHeader: true,
        }}
        uncategorizedForDisplay={[]}
        hasContentTabGroupsCount={1}
      />,
    )

    const header = screen
      .getByText('未分類のドメイン')
      .closest('[data-saved-tabs-scroll-target="parent"]')
    expect(header?.className).toContain('mt-6')

    expect(
      screen.queryByRole('button', {
        name: '「未分類のドメイン」のすべてのタブを削除',
      }),
    ).toBeNull()
    expect(handleDeleteGroup).not.toHaveBeenCalled()
    expect(handleDeleteGroups).not.toHaveBeenCalled()
  })

  it('未分類ヘッダーのすべて削除は一括削除ハンドラを優先する', async () => {
    const handleDeleteGroups = vi.fn().mockResolvedValue(undefined)
    const handleDeleteGroup = vi.fn()

    render(
      <DomainModeContainer
        {...createProps()}
        handleDeleteGroup={handleDeleteGroup}
        handleDeleteGroups={handleDeleteGroups}
        state={{
          ...createProps().state,
          shouldShowUncategorizedList: true,
          shouldShowUncategorizedSectionHeader: true,
        }}
        uncategorizedForDisplay={uncategorizedGroups}
        hasContentTabGroupsCount={2}
      />,
    )

    fireEvent.click(
      screen.getByRole('button', {
        name: '「未分類のドメイン」のすべてのタブを削除',
      }),
    )

    await waitFor(() => {
      expect(handleDeleteGroups).toHaveBeenCalledWith(['group-1', 'group-2'])
    })
    expect(handleDeleteGroup).not.toHaveBeenCalled()
  })

// eslint-disable-next-line typescript/require-await
  it('カテゴリあり表示では空カテゴリを飛ばし、移動ハンドラに tabGroups を渡す', async () => {
    const handleMoveDomainToCategory = vi.fn()
    const domainGroups: TabGroup[] = [
      {
        id: 'domain-1',
        domain: 'example.com',
      },
    ]

    render(
      <DomainModeContainer
        {...createProps()}
        categories={[
          {
            id: 'category-1',
            name: 'Category 1',
            domains: [],
            domainNames: [],
          },
          {
            id: 'empty-category',
            name: 'Empty',
            domains: [],
            domainNames: [],
          },
          {
            id: 'missing-groups-category',
            name: 'Missing Groups',
            domains: [],
            domainNames: [],
          },
        ]}
        categorized={{
          'category-1': domainGroups,
          'empty-category': [],
        }}
        categoryOrderForDisplay={[
          '',
          'missing-category',
          'empty-category',
          'missing-groups-category',
          'category-1',
        ]}
        handleMoveDomainToCategory={handleMoveDomainToCategory}
        state={{
          ...createProps().state,
          hasVisibleCategoryGroups: true,
        }}
        tabGroups={domainGroups}
      />,
    )

    expect(screen.getByText('category-group:Category 1')).toBeTruthy()
    expect(screen.queryByText('category-group:Empty')).toBeNull()

    fireEvent.click(screen.getByText('move-domain'))

    expect(handleMoveDomainToCategory).toHaveBeenCalledWith(
      'domain-1',
      'category-1',
      'target',
      domainGroups,
    )
  })

// eslint-disable-next-line typescript/require-await
  it('未分類リストと並び替え確定/取消ボタンを表示して操作できる', async () => {
    const handleCancelUncategorizedReorder = vi.fn()
    const handleConfirmUncategorizedReorder = vi.fn()

    render(
      <DomainModeContainer
        {...createProps()}
        handleCancelUncategorizedReorder={handleCancelUncategorizedReorder}
        handleConfirmUncategorizedReorder={handleConfirmUncategorizedReorder}
        state={{
          ...createProps().state,
          isUncategorizedReorderMode: true,
          shouldShowUncategorizedList: true,
          shouldShowUncategorizedSectionHeader: true,
        }}
        uncategorizedForDisplay={uncategorizedGroups}
        hasContentTabGroupsCount={2}
      />,
    )

    expect(screen.getByText('sortable-domain-card:example.com')).toBeTruthy()
    expect(screen.getByText('sortable-domain-card:sample.com')).toBeTruthy()

    fireEvent.click(
      screen.getByRole('button', {
        name: '親カテゴリの並び替えをキャンセル',
      }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: '親カテゴリの並び替えを確定' }),
    )

    expect(handleCancelUncategorizedReorder).toHaveBeenCalledOnce()
    expect(handleConfirmUncategorizedReorder).toHaveBeenCalledOnce()
  })
})
