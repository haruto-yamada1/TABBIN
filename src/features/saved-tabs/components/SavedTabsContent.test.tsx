// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { SortableCategorySectionProps } from '@/types/saved-tabs'
import type { UserSettings } from '@/types/storage'

const { useSortableMock, removeUrlFromTabGroupMock } = vi.hoisted(() => ({
  useSortableMock: vi.fn(),
  removeUrlFromTabGroupMock: vi.fn(),
}))

const savedTabsContentI18nState = vi.hoisted(() => ({
  language: 'ja' as 'en' | 'ja',
}))

vi.mock('@dnd-kit/sortable', () => ({
  useSortable: useSortableMock,
}))

vi.mock('@dnd-kit/utilities', () => ({
  CSS: {
    Transform: {
      toString: () => undefined,
    },
  },
}))

vi.mock('@/lib/storage/tabs', () => ({
  removeUrlFromTabGroup: removeUrlFromTabGroupMock,
}))

vi.mock('@/features/i18n/context/I18nProvider', async () => {
  const { getMessage } = await vi.importActual<
    typeof import('@/features/i18n/lib/language')
  >('@/features/i18n/lib/language')

  return {
    useI18n: () => ({
      language: savedTabsContentI18nState.language,
      t: (key: string, fallback?: string, values?: Record<string, string>) =>
        getMessage(savedTabsContentI18nState.language, key, fallback, values),
    }),
  }
})

vi.mock('./TimeRemaining', () => ({
  CategorySection: (props: {
    categoryName: string
    urls?: Array<{ url: string }>
  }) => (
    <div data-testid='category-section'>
      section:{props.categoryName}:{props.urls?.length ?? 0}
    </div>
  ),
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

import { SortableCategorySection as SavedTabsContentComponent } from './SavedTabsContent'

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
      handleDeleteAllTabs?: (urls: Array<{ url: string }>) => void
    }
  > = {},
) => ({
  id: 'cat-1',
  categoryName: 'news',
  urls: [
    { url: 'https://a.com', title: 'A' },
    { url: 'https://b.com', title: 'B' },
  ],
  groupId: 'group-1',
  handleOpenAllTabs: vi.fn(),
  handleDeleteUrl: vi.fn(),
  handleOpenTab: vi.fn(),
  handleUpdateUrls: vi.fn(),
  settings: defaultSettings,
  ...overrides,
})

describe('SavedTabsContent.tsx (legacy SortableCategorySection)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    savedTabsContentI18nState.language = 'ja'
    useSortableMock.mockReturnValue({
      attributes: {},
      listeners: {},
      setNodeRef: vi.fn(),
      transform: null,
      transition: undefined,
      isDragging: false,
    })
    removeUrlFromTabGroupMock.mockResolvedValue(undefined)

    const chromeGlobal = globalThis as unknown as { chrome: typeof chrome }
    chromeGlobal.chrome = {
      storage: {
        local: {
          get: vi.fn(async () => ({
            savedTabs: [
              {
                id: 'group-1',
                urls: [
                  { url: 'https://a.com', title: 'A' },
                  { url: 'https://b.com', title: 'B' },
                  { url: 'https://c.com', title: 'C' },
                ],
              },
            ],
          })),
        },
      },
    } as unknown as typeof chrome
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('カテゴリ表示名と件数を描画し、CategorySection に props を渡す', () => {
    render(
      <SavedTabsContentComponent
        {...createProps({ categoryName: '__uncategorized' })}
      />,
    )

    expect(screen.getByText(/未分類/)).toBeTruthy()
    expect(screen.getByText('(2)')).toBeTruthy()
    expect(screen.getByTestId('category-section').textContent).toContain(
      'section:__uncategorized:2',
    )
  })

  it('renders English category controls when the display language is en', async () => {
    savedTabsContentI18nState.language = 'en'

    render(
      <SavedTabsContentComponent
        {...createProps({
          categoryName: '__uncategorized',
          handleDeleteAllTabs: vi.fn(),
        })}
      />,
    )

    expect(screen.getByText(/Uncategorized/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /Open all/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Delete all/ }))
    expect(await screen.findByText('Delete all tabs?')).toBeTruthy()
  })

  it('isDragging スタイルと urls 未指定時のフォールバックを処理する', () => {
    useSortableMock.mockReturnValue({
      attributes: {},
      listeners: {},
      setNodeRef: vi.fn(),
      transform: null,
      transition: 'all 1s',
      isDragging: true,
    })
    const handleOpenAllTabs = vi.fn()
    const { container } = render(
      <SavedTabsContentComponent
        {...createProps({
          urls: undefined as unknown as Array<{ url: string; title: string }>,
          handleOpenAllTabs,
          handleDeleteAllTabs: vi.fn(),
        })}
      />,
    )

    expect(screen.getByText('(0)')).toBeTruthy()
    expect(container.innerHTML.includes('shadow-lg')).toBe(true)
    expect(container.innerHTML.includes('cursor-grabbing')).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: /すべて開く/ }))
    expect(handleOpenAllTabs).toHaveBeenCalledWith([])
  })

  it('すべて開くボタンは件数が少ない場合に即時実行し、多い場合は確認ダイアログを経由する', async () => {
    const handleOpenAllTabs = vi.fn()
    const { rerender } = render(
      <SavedTabsContentComponent
        {...createProps({
          handleOpenAllTabs,
          urls: [{ url: 'https://a.com', title: 'A' }],
        })}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /すべて開く/ }))
    expect(handleOpenAllTabs).toHaveBeenCalledWith([
      { url: 'https://a.com', title: 'A' },
    ])

    rerender(
      <SavedTabsContentComponent
        {...createProps({
          handleOpenAllTabs,
          urls: Array.from({ length: 10 }, (_, i) => ({
            url: `https://example.com/${i}`,
            title: `${i}`,
          })),
        })}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /すべて開く/ }))
    expect(
      await screen.findByText(
        '10個以上のタブを開こうとしています。続行しますか？',
      ),
    ).toBeTruthy()
    const openButton = await screen.findByRole('button', { name: '開く' })
    fireEvent.click(openButton)

    expect(handleOpenAllTabs).toHaveBeenCalledWith(
      expect.arrayContaining([{ url: 'https://example.com/0', title: '0' }]),
    )
  })

  it('削除ボタンがない場合は描画せず、ある場合は確認ダイアログを開く', async () => {
    const { rerender } = render(
      <SavedTabsContentComponent {...createProps()} />,
    )
    expect(screen.queryByRole('button', { name: /すべて削除/ })).toBeNull()

    rerender(
      <SavedTabsContentComponent
        {...createProps({
          handleDeleteAllTabs: vi.fn(),
        })}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /すべて削除/ }))
    expect(await screen.findByRole('button', { name: '削除' })).toBeTruthy()
  })

  it('カテゴリ全削除確認で handleDeleteAllTabs を 1 回だけ呼ぶ', async () => {
    const handleDeleteAllTabs = vi.fn().mockResolvedValue(undefined)

    render(
      <SavedTabsContentComponent
        {...createProps({
          handleDeleteAllTabs,
        })}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /すべて削除/ }))
    fireEvent.click(await screen.findByRole('button', { name: '削除' }))

    await waitFor(() => {
      expect(handleDeleteAllTabs).toHaveBeenCalledWith([
        { url: 'https://a.com', title: 'A' },
        { url: 'https://b.com', title: 'B' },
      ])
    })

    expect(removeUrlFromTabGroupMock).not.toHaveBeenCalled()
    expect(console.log).toHaveBeenCalled()
  })

  it('削除処理で例外時でも落ちずに終了する', async () => {
    const handleDeleteAllTabs = vi.fn().mockRejectedValueOnce(new Error('boom'))

    const { rerender } = render(
      <SavedTabsContentComponent
        {...createProps({
          handleDeleteAllTabs,
        })}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /すべて削除/ }))
    fireEvent.click(await screen.findByRole('button', { name: '削除' }))

    await screen.findByRole('button', { name: /すべて削除/ })

    rerender(
      <SavedTabsContentComponent
        {...createProps({
          handleDeleteAllTabs,
          categoryName: 'error-case',
        })}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /すべて削除/ }))
    fireEvent.click(await screen.findByRole('button', { name: '削除' }))

    await waitFor(() => {
      expect(console.error).toHaveBeenCalled()
    })
  })

  it('削除確認の二重実行を防ぐ', async () => {
    let resolveUpdate: (() => void) | undefined
    const handleDeleteAllTabs = vi.fn().mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveUpdate = resolve
        }),
    )

    render(
      <SavedTabsContentComponent
        {...createProps({
          handleDeleteAllTabs,
        })}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /すべて削除/ }))
    const confirmButton = await screen.findByRole('button', {
      name: '削除',
    })
    fireEvent.click(confirmButton)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /削除中/ })).toBeTruthy()
    })
    fireEvent.click(confirmButton)

    await waitFor(() => {
      expect(handleDeleteAllTabs).toHaveBeenCalledTimes(1)
    })

    resolveUpdate?.()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /すべて削除/ })).toBeTruthy()
    })
  })
})
