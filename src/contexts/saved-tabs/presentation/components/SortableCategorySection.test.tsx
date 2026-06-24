// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

import type { SavedTabsUserSettingsDto as UserSettings } from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDto'
import type { SortableCategorySectionProps } from '@/contexts/saved-tabs/presentation/types/SavedTabsComponentProps'

const { useSortableMock, dndMonitorHandlers, categorySectionSpy } = vi.hoisted(
  () => ({
    useSortableMock: vi.fn(),
    dndMonitorHandlers: {
      current: {} as {
        onDragStart?: () => void
        onDragEnd?: () => void
        onDragCancel?: () => void
      },
    },
    categorySectionSpy: vi.fn(),
  }),
)

vi.mock('@/features/i18n/context/I18nProvider', () => ({
  useI18n: () => ({
    language: 'ja',
    t: (key: string, _fallback?: string, values?: Record<string, string>) => {
      const messages = {
        'savedTabs.accessibility.nounAction': '「{{target}}」の{{action}}',
        'savedTabs.accessibility.objectAction': '「{{target}}」を{{action}}',
        'savedTabs.accessibility.sortState': '「{{target}}」の並び順: {{sort}}',
        'common.cancel': 'キャンセル',
        'common.confirm': '確定',
        'common.delete': '削除',
        'common.open': '開く',
        'savedTabs.uncategorized': '未分類',
        'savedTabs.collapse': '折りたたむ',
        'savedTabs.expand': '展開',
        'savedTabs.reorder.disabled': '並び替えモード中',
        'savedTabs.sort.default': 'デフォルト',
        'savedTabs.sort.asc': '保存日時の昇順',
        'savedTabs.sort.desc': '保存日時の降順',
        'savedTabs.openAll': 'すべて開く',
        'savedTabs.openAllTabs': 'すべてのタブを開く',
        'savedTabs.openAllConfirmDescription':
          '10件以上のタブを開こうとしています。続行しますか？',
        'savedTabs.openAllConfirmDescriptionWithName':
          '「{{name}}」のタブ{{count}}件を開きます。続行しますか？',
        'savedTabs.deleteAll': 'すべて削除',
        'savedTabs.deleteAllTabs': 'すべてのタブを削除',
        'savedTabs.deletingAll': '削除中...',
        'savedTabs.sortableCategory.bulkOpenTitle': '複数タブを開く',
        'savedTabs.sortableCategory.bulkDeleteTitle': 'タブを削除',
        'savedTabs.sortableCategory.bulkDeleteDescription':
          '「{{name}}」のタブをすべて削除しますか？',
        'savedTabs.sortableCategory.tabCountLabel': 'タブ数',
      } satisfies Record<string, string>
      const template = messages[key as keyof typeof messages] ?? key
      return template.replaceAll(
        /\{\{(\w+)\}\}/g,
        (_, token) => values?.[token] ?? '',
      )
    },
  }),
}))

vi.mock('@dnd-kit/sortable', () => ({
  useSortable: useSortableMock,
}))

vi.mock('@dnd-kit/core', () => ({
  useDndMonitor: (handlers: {
    onDragStart?: () => void
    onDragEnd?: () => void
    onDragCancel?: () => void
  }) => {
    dndMonitorHandlers.current = handlers
  },
}))

vi.mock('@dnd-kit/utilities', () => ({
  CSS: {
    Transform: {
      toString: () => undefined,
    },
  },
}))

vi.mock('./TimeRemaining', () => ({
  CategorySection: (props: {
    categoryName: string
    urls?: { url: string; savedAt?: number }[]
  }) => {
    categorySectionSpy(props)
    return (
      <div data-testid='category-section'>
        {(props.urls ?? []).map((url) => url.url).join(',')}
      </div>
    )
  },
}))

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => children,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => children,
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
  }) => (open ? <div data-testid='alert-dialog'>{children}</div> : null),
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => (
    <h2>{children}</h2>
  ),
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => (
    <p>{children}</p>
  ),
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogCancel: ({
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

import { SortableCategorySection } from './SortableCategorySection'

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

const createProps = (
  overrides: Partial<
    SortableCategorySectionProps & {
      settings: UserSettings
      handleDeleteAllTabs?: (urls: { url: string }[]) => Promise<void> | void
    }
  > = {},
) => ({
  id: 'cat-1',
  categoryName: '__uncategorized',
  urls: [
    { url: 'https://b.com', title: 'B', savedAt: 2 },
    { url: 'https://a.com', title: 'A', savedAt: 1 },
    { url: 'https://c.com', title: 'C' },
  ],
  groupId: 'group-1',
  handleDeleteUrl: vi.fn(),
  handleOpenTab: vi.fn(),
  handleUpdateUrls: vi.fn(),
  handleOpenAllTabs: vi.fn(),
  settings: defaultSettings,
  ...overrides,
})

describe('SortableCategorySection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dndMonitorHandlers.current = {}
    useSortableMock.mockReturnValue({
      attributes: {},
      listeners: {},
      setNodeRef: vi.fn(),
      transform: null,
      transition: undefined,
      isDragging: false,
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('カテゴリ名表示・折りたたみ・ソート切替・即時でのすべて開くを処理する', () => {
    const handleOpenAllTabs = vi.fn()
    render(
      <SortableCategorySection
        {...createProps({
          handleOpenAllTabs,
        })}
      />,
    )

    expect(screen.getByText('未分類')).toBeTruthy()
    expect(
      screen.getByRole('button', { name: '「未分類」を折りたたむ' }),
    ).toBeTruthy()
    expect(screen.getByTestId('category-section').textContent).toBe(
      'https://b.com,https://a.com,https://c.com',
    )

    fireEvent.click(
      screen.getByRole('button', { name: '「未分類」の並び順: デフォルト' }),
    )
    expect(
      screen.getByRole('button', {
        name: '「未分類」の並び順: 保存日時の昇順',
      }),
    ).toBeTruthy()
    expect(screen.getByTestId('category-section').textContent).toBe(
      'https://c.com,https://a.com,https://b.com',
    )

    fireEvent.click(
      screen.getByRole('button', {
        name: '「未分類」の並び順: 保存日時の昇順',
      }),
    )
    expect(
      screen.getByRole('button', {
        name: '「未分類」の並び順: 保存日時の降順',
      }),
    ).toBeTruthy()
    expect(screen.getByTestId('category-section').textContent).toBe(
      'https://b.com,https://a.com,https://c.com',
    )

    fireEvent.click(
      screen.getByRole('button', {
        name: '「未分類」の並び順: 保存日時の降順',
      }),
    )
    expect(
      screen.getByRole('button', { name: '「未分類」の並び順: デフォルト' }),
    ).toBeTruthy()

    fireEvent.click(
      screen.getByRole('button', { name: '「未分類」を折りたたむ' }),
    )
    expect(screen.queryByTestId('category-section')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '「未分類」を展開' }))
    expect(screen.getByTestId('category-section')).toBeTruthy()

    fireEvent.click(
      screen.getByRole('button', {
        name: '「未分類」のすべてのタブを開く',
      }),
    )
    expect(handleOpenAllTabs).toHaveBeenCalledWith(
      expect.arrayContaining([
        { url: 'https://b.com', title: 'B', savedAt: 2 },
      ]),
    )
  })

  it('10件以上は開く確認ダイアログを経由する', async () => {
    const handleOpenAllTabs = vi.fn()
    render(
      <SortableCategorySection
        {...createProps({
          handleOpenAllTabs,
          urls: Array.from({ length: 10 }, (_, i) => ({
            url: `https://example.com/${i}`,
            title: `${i}`,
            savedAt: i,
          })),
        })}
      />,
    )

    fireEvent.click(
      screen.getByRole('button', {
        name: '「未分類」のすべてのタブを開く',
      }),
    )
    fireEvent.click(await screen.findByRole('button', { name: '開く' }))

    expect(handleOpenAllTabs).toHaveBeenCalledWith(
      expect.arrayContaining([
        { url: 'https://example.com/0', title: '0', savedAt: 0 },
      ]),
    )
  })

  it('urls 未指定時の件数/一括開くフォールバックと savedAt 未指定ソートを処理する', () => {
    const handleOpenAllTabs = vi.fn()
    const { rerender } = render(
      <SortableCategorySection
        {...createProps({
          urls: undefined as unknown as { url: string; title: string }[],
          handleOpenAllTabs,
        })}
      />,
    )

    expect(screen.getByText('0')).toBeTruthy()
    fireEvent.click(
      screen.getByRole('button', {
        name: '「未分類」のすべてのタブを開く',
      }),
    )
    expect(handleOpenAllTabs).toHaveBeenCalledWith([])

    rerender(
      <SortableCategorySection
        {...createProps({
          urls: [
            { url: 'https://m1.com', title: 'M1' },
            { url: 'https://m2.com', title: 'M2' },
          ],
        })}
      />,
    )
    fireEvent.click(
      screen.getByRole('button', { name: '「未分類」の並び順: デフォルト' }),
    )
    expect(
      screen.getByRole('button', {
        name: '「未分類」の並び順: 保存日時の昇順',
      }),
    ).toBeTruthy()
  })

  it('削除ボタンは handler がある時のみ描画され、confirmDeleteAll=false では即時削除し二重実行を防ぐ', async () => {
    const handleDeleteAllTabs = vi.fn(
      async () =>
        new Promise<void>((resolve) => {
          setTimeout(resolve, 0)
        }),
    )
    const { rerender } = render(<SortableCategorySection {...createProps()} />)

    expect(
      screen.queryByRole('button', { name: '「未分類」のすべてのタブを削除' }),
    ).toBeNull()

    rerender(
      <SortableCategorySection
        {...createProps({
          handleDeleteAllTabs,
        })}
      />,
    )

    const deleteButton = screen.getByRole('button', {
      name: '「未分類」のすべてのタブを削除',
    })
    fireEvent.click(deleteButton)
    expect(handleDeleteAllTabs).toHaveBeenCalledTimes(1)
    expect(screen.getByText('削除中...')).toBeTruthy()
    expect(
      screen
        .getByRole('button', {
          name: '「未分類」のすべてのタブを削除',
        })
        .hasAttribute('disabled'),
    ).toBe(true)

    fireEvent.click(
      screen.getByRole('button', {
        name: '「未分類」のすべてのタブを削除',
      }),
    )
    expect(handleDeleteAllTabs).toHaveBeenCalledTimes(1)

    await waitFor(() => {
      expect(
        screen.getByRole('button', {
          name: '「未分類」のすべてのタブを削除',
        }),
      ).toBeTruthy()
    })
  })

  it('confirmDeleteAll=true の削除確認ダイアログとエラーハンドリングを処理する', async () => {
    const handleDeleteAllTabs = vi.fn(async () => {
      throw new Error('boom')
    })

    render(
      <SortableCategorySection
        {...createProps({
          categoryName: 'news',
          settings: { ...defaultSettings, confirmDeleteAll: true },
          handleDeleteAllTabs,
        })}
      />,
    )

    fireEvent.click(
      screen.getByRole('button', {
        name: '「news」のすべてのタブを削除',
      }),
    )
    expect(screen.getByText('タブを削除')).toBeTruthy()
    fireEvent.click(await screen.findByRole('button', { name: '削除' }))

    await waitFor(() => {
      expect(handleDeleteAllTabs).toHaveBeenCalledWith(
        expect.arrayContaining([
          { url: 'https://b.com', title: 'B', savedAt: 2 },
        ]),
      )
      expect(console.error).toHaveBeenCalled()
    })
  })

  it('DnD monitor によるドラッグ中の自動折りたたみと復元を処理する', async () => {
    render(<SortableCategorySection {...createProps()} />)

    expect(screen.getByTestId('category-section')).toBeTruthy()

    fireEvent.click(
      screen.getByRole('button', { name: '「未分類」を折りたたむ' }),
    )
    expect(screen.queryByTestId('category-section')).toBeNull()

    await act(async () => {
      dndMonitorHandlers.current.onDragStart?.()
    })
    expect(screen.queryByTestId('category-section')).toBeNull()

    await act(async () => {
      dndMonitorHandlers.current.onDragEnd?.()
    })
    expect(screen.queryByTestId('category-section')).toBeNull()

    await act(async () => {
      dndMonitorHandlers.current.onDragStart?.()
    })

    await act(async () => {
      dndMonitorHandlers.current.onDragCancel?.()
    })
    expect(screen.queryByTestId('category-section')).toBeNull()
  })

  it('並び替えモード中は折りたたみボタン無効・自動折りたたみ、isDragging スタイルも適用される', async () => {
    useSortableMock.mockReturnValue({
      attributes: {},
      listeners: {},
      setNodeRef: vi.fn(),
      transform: null,
      transition: 'all 1s',
      isDragging: true,
    })

    const { rerender, container } = render(
      <SortableCategorySection
        {...createProps({
          isReorderMode: true,
          stickyTop: 'top-20',
        })}
      />,
    )

    const collapseButton = screen.getByRole('button', {
      name: '「未分類」を展開',
    })
    expect(collapseButton.hasAttribute('disabled')).toBe(true)
    expect(screen.queryByTestId('category-section')).toBeNull()
    expect(container.querySelector('.top-20')).toBeTruthy()
    expect(container.innerHTML.includes('shadow-lg')).toBe(true)

    fireEvent.click(
      screen.getByRole('button', { name: '「未分類」の並び順: デフォルト' }),
    )
    expect(
      screen.getByRole('button', {
        name: '「未分類」の並び順: 保存日時の昇順',
      }),
    ).toBeTruthy()

    await act(async () => {
      dndMonitorHandlers.current.onDragStart?.()
    })

    await act(async () => {
      dndMonitorHandlers.current.onDragEnd?.()
    })

    await act(async () => {
      dndMonitorHandlers.current.onDragStart?.()
    })

    await act(async () => {
      dndMonitorHandlers.current.onDragCancel?.()
    })
    expect(screen.queryByTestId('category-section')).toBeNull()

    rerender(
      <SortableCategorySection {...createProps({ isReorderMode: false })} />,
    )
    await waitFor(() => {
      expect(screen.getByTestId('category-section')).toBeTruthy()
    })
  })
})
