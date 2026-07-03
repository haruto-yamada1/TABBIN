// @vitest-environment jsdom
import {
  cleanup,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

const { handleSaveKeywordsMock, useDomainCardMock, useSavedTabsUseCasesMock } =
  vi.hoisted(() => ({
    handleSaveKeywordsMock: vi.fn(),
    useDomainCardMock: vi.fn(),
    useSavedTabsUseCasesMock: vi.fn(),
  }))

vi.mock(
  '@/contexts/saved-tabs/presentation/controllers/SavedTabsUseCasesContext',
  () => ({
    useSavedTabsUseCases: useSavedTabsUseCasesMock,
  }),
)

const createContext = (
  options: {
    confirmDeleteAll?: boolean
    isReorderMode?: boolean
    searchQuery?: string
    showKeywordModal?: boolean
    urls?: { title: string; url: string }[]
    handleDeleteGroup?: ReturnType<typeof vi.fn>
    handleDeleteUrls?: ReturnType<typeof vi.fn>
    handleOpenAllTabs?: ReturnType<typeof vi.fn>
    setShowKeywordModal?: ReturnType<typeof vi.fn>
  } = {},
) => ({
  state: {
    keywordModal: {
      showKeywordModal: options.showKeywordModal ?? false,
      setShowKeywordModal: options.setShowKeywordModal ?? vi.fn(),
      handleCloseKeywordModal: vi.fn(),
    },
    parentCategories: {
      categories: [],
      handleCreateParentCategory: vi.fn(),
      handleAssignToParentCategory: vi.fn(),
      handleUpdateParentCategories: vi.fn(),
    },
    categoryActions: { handleCategoryDelete: vi.fn() },
  },
  group: {
    id: 'group-1',
    domain: 'example.com',
    urls: options.urls,
  },
  settings: { confirmDeleteAll: options.confirmDeleteAll ?? false },
  isReorderMode: options.isReorderMode ?? false,
  searchQuery: options.searchQuery ?? '',
  handlers: {
    handleOpenAllTabs: options.handleOpenAllTabs ?? vi.fn(),
    handleDeleteGroup: options.handleDeleteGroup ?? vi.fn(),
    handleDeleteUrls: options.handleDeleteUrls,
  },
})

const domainCardMessages: Record<string, string> = {
  'savedTabs.accessibility.nounAction': '「{{target}}」の{{action}}',
  'savedTabs.manageSubcategories': '子カテゴリ管理',
  'savedTabs.openAll': 'すべて開く',
  'savedTabs.openAllTabs': 'すべてのタブを開く',
  'savedTabs.deleteAll': 'すべて削除',
  'savedTabs.deleteAllTabs': 'すべてのタブを削除',
  'savedTabs.openAllConfirmTitle': '開く確認',
  'savedTabs.openAllConfirmDescriptionWithName':
    '「{{name}}」のタブ{{count}}件を開きます。続行しますか？',
  'savedTabs.deleteAllConfirmTitle': '削除確認',
  'savedTabs.deleteAllConfirmDescriptionWithCount':
    '「{{categoryName}}」のタブ{{count}}件をすべて削除します。この操作は元に戻せません。',
  'common.cancel': 'キャンセル',
  'common.open': '開く',
  'common.delete': '削除',
}

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}))

vi.mock('@/components/ui/alert-dialog', () => ({
  AlertDialog: ({
    open,
    children,
  }: {
    open: boolean
    children: React.ReactNode
  }) => (open ? <div>{children}</div> : null),
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogCancel: ({ children }: { children: React.ReactNode }) => (
    <button type='button'>{children}</button>
  ),
  AlertDialogAction: ({
    children,
    onClick,
  }: {
    children: React.ReactNode
    onClick?: () => void
  }) => (
    <button onClick={onClick} type='button'>
      {children}
    </button>
  ),
}))

vi.mock('@/features/i18n/context/I18nProvider', () => ({
  useI18n: () => ({
    t: (key: string, _fallback?: string, values?: Record<string, string>) => {
      const template = domainCardMessages[key] ?? key
      return template.replaceAll(
        /\{\{(\w+)\}\}/g,
        (_, token) => values?.[token] ?? '',
      )
    },
  }),
}))

vi.mock(
  '@/contexts/saved-tabs/presentation/components/CategoryKeywordModal',
  () => ({
    CategoryKeywordModal: ({
      onSave,
    }: {
      onSave: (domain: string, category: string, keywords: string[]) => void
    }) => (
      <button
        onClick={() => onSave('example.com', 'Docs', ['guide'])}
        type='button'
      >
        save keywords
      </button>
    ),
  }),
)

vi.mock('@/contexts/saved-tabs/presentation/lib/category-keywords', () => ({
  handleSaveKeywords: handleSaveKeywordsMock,
}))

vi.mock('./DomainCardContext', () => ({
  useDomainCard: useDomainCardMock,
}))

import { DomainCardActions } from './DomainCardActions'

describe('DomainCardActions', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    useSavedTabsUseCasesMock.mockReturnValue(null)
  })

  it('検索中のすべて削除は表示中URLだけを削除する', async () => {
    const user = userEvent.setup()
    const handleDeleteUrls = vi.fn().mockResolvedValue(undefined)
    const handleDeleteGroup = vi.fn()

    useDomainCardMock.mockReturnValue({
      state: {
        keywordModal: {
          showKeywordModal: false,
          setShowKeywordModal: vi.fn(),
          handleCloseKeywordModal: vi.fn(),
        },
        parentCategories: {
          categories: [],
          handleCreateParentCategory: vi.fn(),
          handleAssignToParentCategory: vi.fn(),
          handleUpdateParentCategories: vi.fn(),
        },
        categoryActions: {
          handleCategoryDelete: vi.fn(),
        },
      },
      group: {
        id: 'group-1',
        domain: 'example.com',
        urls: [{ url: 'https://example.com/docs', title: 'Docs' }],
      },
      settings: { confirmDeleteAll: false },
      isReorderMode: false,
      searchQuery: 'docs',
      handlers: {
        handleOpenAllTabs: vi.fn(),
        handleDeleteGroup,
        handleDeleteUrls,
      },
    })

    render(<DomainCardActions />)

    await user.click(
      screen.getByRole('button', {
        name: '「example.com」のすべてのタブを削除',
      }),
    )

    await waitFor(() => {
      expect(handleDeleteUrls).toHaveBeenCalledWith('group-1', [
        'https://example.com/docs',
      ])
    })

    expect(handleDeleteGroup).not.toHaveBeenCalled()
  })

  it('未検索時のすべて削除は group 削除を使う', async () => {
    const user = userEvent.setup()
    const handleDeleteUrls = vi.fn().mockResolvedValue(undefined)
    const handleDeleteGroup = vi.fn()

    useDomainCardMock.mockReturnValue({
      state: {
        keywordModal: {
          showKeywordModal: false,
          setShowKeywordModal: vi.fn(),
          handleCloseKeywordModal: vi.fn(),
        },
        parentCategories: {
          categories: [],
          handleCreateParentCategory: vi.fn(),
          handleAssignToParentCategory: vi.fn(),
          handleUpdateParentCategories: vi.fn(),
        },
        categoryActions: {
          handleCategoryDelete: vi.fn(),
        },
      },
      group: {
        id: 'group-1',
        domain: 'example.com',
        urls: [{ url: 'https://example.com/docs', title: 'Docs' }],
      },
      settings: { confirmDeleteAll: false },
      isReorderMode: false,
      searchQuery: '',
      handlers: {
        handleOpenAllTabs: vi.fn(),
        handleDeleteGroup,
        handleDeleteUrls,
      },
    })

    render(<DomainCardActions />)

    await user.click(
      screen.getByRole('button', {
        name: '「example.com」のすべてのタブを削除',
      }),
    )

    expect(handleDeleteGroup).toHaveBeenCalledWith('group-1')
    expect(handleDeleteUrls).not.toHaveBeenCalled()
  })

  it('対象名付きの aria-label を各操作ボタンへ付与する', () => {
    useDomainCardMock.mockReturnValue({
      state: {
        keywordModal: {
          showKeywordModal: false,
          setShowKeywordModal: vi.fn(),
          handleCloseKeywordModal: vi.fn(),
        },
        parentCategories: {
          categories: [],
          handleCreateParentCategory: vi.fn(),
          handleAssignToParentCategory: vi.fn(),
          handleUpdateParentCategories: vi.fn(),
        },
        categoryActions: {
          handleCategoryDelete: vi.fn(),
        },
      },
      group: {
        id: 'group-1',
        domain: 'example.com',
        urls: [{ url: 'https://example.com/docs', title: 'Docs' }],
      },
      settings: { confirmDeleteAll: false },
      isReorderMode: false,
      searchQuery: '',
      handlers: {
        handleOpenAllTabs: vi.fn(),
        handleDeleteGroup: vi.fn(),
        handleDeleteUrls: vi.fn(),
      },
    })

    render(<DomainCardActions />)

    expect(
      screen.getByRole('button', {
        name: '「example.com」の子カテゴリ管理',
      }),
    ).toBeTruthy()
    expect(
      screen.getByRole('button', {
        name: '「example.com」のすべてのタブを開く',
      }),
    ).toBeTruthy()
    expect(
      screen.getByRole('button', {
        name: '「example.com」のすべてのタブを削除',
      }),
    ).toBeTruthy()
  })

  it('子カテゴリ管理ボタンで keyword modal を toggle する', async () => {
    const user = userEvent.setup()
    const setShowKeywordModal = vi.fn()
    useDomainCardMock.mockReturnValue(
      createContext({
        setShowKeywordModal,
        urls: [{ title: 'Docs', url: 'https://example.com/docs' }],
      }),
    )

    render(<DomainCardActions />)
    await user.click(
      screen.getByRole('button', { name: '「example.com」の子カテゴリ管理' }),
    )

    expect(setShowKeywordModal).toHaveBeenCalledWith(true)
  })

  it('少数 URL は即時に開き、並び替えモードではログを残す', async () => {
    const user = userEvent.setup()
    const handleOpenAllTabs = vi.fn()
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const urls = [{ title: 'Docs', url: 'https://example.com/docs' }]
    useDomainCardMock.mockReturnValue(
      createContext({ handleOpenAllTabs, isReorderMode: true, urls }),
    )

    render(<DomainCardActions />)
    await user.click(
      screen.getByRole('button', {
        name: '「example.com」のすべてのタブを開く',
      }),
    )

    expect(handleOpenAllTabs).toHaveBeenCalledWith(urls)
    expect(log).toHaveBeenCalled()
  })

  it('大量 URL は確認後に開く', async () => {
    const user = userEvent.setup()
    const handleOpenAllTabs = vi.fn()
    const urls = Array.from({ length: 10 }, (_, index) => ({
      title: `Tab ${index}`,
      url: `https://example.com/${index}`,
    }))
    useDomainCardMock.mockReturnValue(
      createContext({ handleOpenAllTabs, isReorderMode: true, urls }),
    )
    vi.spyOn(console, 'log').mockImplementation(() => undefined)

    render(<DomainCardActions />)
    await user.click(
      screen.getByRole('button', {
        name: '「example.com」のすべてのタブを開く',
      }),
    )
    await user.click(screen.getByRole('button', { name: '開く' }))

    expect(handleOpenAllTabs).toHaveBeenCalledWith(urls)
  })

  it('削除確認後に group を削除し、並び替えモードではログを残す', async () => {
    const user = userEvent.setup()
    const handleDeleteGroup = vi.fn()
    useDomainCardMock.mockReturnValue(
      createContext({
        confirmDeleteAll: true,
        handleDeleteGroup,
        isReorderMode: true,
        urls: [],
      }),
    )
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)

    render(<DomainCardActions />)
    await user.click(
      screen.getByRole('button', {
        name: '「example.com」のすべてのタブを削除',
      }),
    )
    await user.click(screen.getByRole('button', { name: '削除' }))

    expect(handleDeleteGroup).toHaveBeenCalledWith('group-1')
    expect(log).toHaveBeenCalled()
  })

  it('検索中でも URL が無ければ group 削除へ fallback する', async () => {
    const user = userEvent.setup()
    const handleDeleteGroup = vi.fn()
    useDomainCardMock.mockReturnValue(
      createContext({ handleDeleteGroup, searchQuery: 'docs', urls: [] }),
    )

    render(<DomainCardActions />)
    await user.click(
      screen.getByRole('button', {
        name: '「example.com」のすべてのタブを削除',
      }),
    )

    expect(handleDeleteGroup).toHaveBeenCalledWith('group-1')
  })

  it('use-case context がある場合だけ keyword 保存を委譲する', async () => {
    const user = userEvent.setup()
    const useCases = { getSavedTabsPageData: vi.fn() }
    useSavedTabsUseCasesMock.mockReturnValue({
      deps: { categoryAssignmentPort: {} },
      useCases,
    })
    useDomainCardMock.mockReturnValue(
      createContext({ showKeywordModal: true, urls: [] }),
    )

    render(<DomainCardActions />)
    await user.click(screen.getByRole('button', { name: 'save keywords' }))

    expect(handleSaveKeywordsMock).toHaveBeenCalledWith(
      useCases,
      'example.com',
      'Docs',
      ['guide'],
    )
  })
})
