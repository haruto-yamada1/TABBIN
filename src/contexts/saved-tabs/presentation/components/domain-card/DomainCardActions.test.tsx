// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

const { useDomainCardMock } = vi.hoisted(() => ({
  useDomainCardMock: vi.fn(),
}))

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
    CategoryKeywordModal: () => null,
  }),
)

vi.mock('@/contexts/saved-tabs/presentation/lib/category-keywords', () => ({
  handleSaveKeywords: vi.fn(),
}))

vi.mock('./DomainCardContext', () => ({
  useDomainCard: useDomainCardMock,
}))

import { DomainCardActions } from './DomainCardActions'

describe('DomainCardActions', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('検索中のすべて削除は表示中URLだけを削除する', async () => {
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

    fireEvent.click(
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

  it('未検索時のすべて削除は group 削除を使う', () => {
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

    fireEvent.click(
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
})
