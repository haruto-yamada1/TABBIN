// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

import type { CustomProjectCategoryProps } from '@/contexts/saved-tabs/presentation/types/CustomProjectCategory.types'
import type { UserSettings } from '@/types/storage'

const customProjectCategoryI18nState = vi.hoisted(() => ({
  language: 'ja' as 'en' | 'ja',
}))

const { useSortableMock, useDroppableMock, projectUrlItemSpy } = vi.hoisted(
  () => ({
    useSortableMock: vi.fn(),
    useDroppableMock: vi.fn(),
    projectUrlItemSpy: vi.fn(),
  }),
)

vi.mock('@dnd-kit/core', () => ({
  useDroppable: useDroppableMock,
}))

vi.mock('@dnd-kit/sortable', () => ({
  useSortable: useSortableMock,
  SortableContext: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='sortable-context'>{children}</div>
  ),
  verticalListSortingStrategy: 'verticalListSortingStrategy',
}))

vi.mock('@dnd-kit/utilities', () => ({
  CSS: {
    Transform: {
      toString: () => undefined,
    },
  },
}))

vi.mock('./ProjectUrlItem', () => ({
  ProjectUrlItem: (props: {
    item: { url: string; title?: string }
    projectId: string
  }) => {
    projectUrlItemSpy(props)
    return (
      <li data-testid='project-url-item'>
        {props.projectId}:{props.item.url}
      </li>
    )
  },
}))

vi.mock('@/components/ui/tooltip', () => ({
  // eslint-disable-next-line react/jsx-no-useless-fragment
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => (
    // eslint-disable-next-line react/jsx-no-useless-fragment
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

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({
    open,
    onOpenChange,
    children,
  }: {
    open: boolean
    onOpenChange?: (open: boolean) => void
    children: React.ReactNode
  }) => (
    <div data-testid='dialog-root'>
      {/* eslint-disable-next-line react-perf/jsx-no-new-function-as-prop */}
      <button onClick={() => onOpenChange?.(false)} type='button'>
        dialog-close
      </button>
      {open ? children : null}
    </div>
  ),
  DialogContent: ({
    children,
    ...props
  }: { children: React.ReactNode } & Record<string, unknown>) => (
    <div data-testid='dialog-content' {...props}>
      {children}
    </div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: React.ReactNode }) => (
    <h2>{children}</h2>
  ),
  DialogDescription: ({ children }: { children: React.ReactNode }) => (
    <p>{children}</p>
  ),
}))

vi.mock('@/components/ui/card', () => ({
  Card: ({
    children,
    ...props
  }: { children: React.ReactNode } & Record<string, unknown>) => (
    <div data-testid='card' {...props}>
      {children}
    </div>
  ),
  CardHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  CardContent: ({
    children,
    ...props
  }: { children: React.ReactNode } & Record<string, unknown>) => (
    <div data-testid='card-content' {...props}>
      {children}
    </div>
  ),
}))

vi.mock('@/features/i18n/context/I18nProvider', async () => {
  const { getMessages } = await vi.importActual<
    // eslint-disable-next-line typescript/consistent-type-imports
    typeof import('@/features/i18n/messages')
  >('@/features/i18n/messages')

  return {
    useI18n: () => ({
      language: customProjectCategoryI18nState.language,
      t: (key: string, fallback?: string, values?: Record<string, string>) => {
        const messages = getMessages(customProjectCategoryI18nState.language)
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

import { CustomProjectCategory } from './CustomProjectCategory'

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

const baseUrls = [
  { url: 'https://b.com', title: 'B', category: 'Work', savedAt: 2 },
  { url: 'https://a.com', title: 'A', category: 'Work', savedAt: 1 },
  { url: 'https://c.com', title: 'C', category: 'Work' },
]

const createProps = (
  overrides: Partial<CustomProjectCategoryProps> = {},
): CustomProjectCategoryProps => ({
  projectId: 'project-1',
  category: 'Work',
  urls: baseUrls,
  handleOpenUrl: vi.fn(),
  // eslint-disable-next-line typescript/no-misused-promises
  handleDeleteUrl: vi.fn(async () => {}),
  handleDeleteCategory: vi.fn(),
  handleSetUrlCategory: vi.fn(),
  handleAddCategory: vi.fn(),
  handleOpenAllUrls: vi.fn(),
  handleRenameCategory: vi.fn(),
  settings: defaultSettings,
  ...overrides,
})

describe('CustomProjectCategory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    customProjectCategoryI18nState.language = 'ja'
    useSortableMock.mockReturnValue({
      attributes: {},
      listeners: {},
      setNodeRef: vi.fn(),
      transform: null,
      transition: undefined,
    })
    useDroppableMock.mockReturnValue({
      setNodeRef: vi.fn(),
      isOver: false,
    })
    vi.spyOn(window, 'open').mockImplementation(vi.fn() as never)
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('カテゴリURLをフィルタして描画し、折りたたみ・ソート・即時一括操作を処理する', async () => {
    const handleOpenAllUrls = vi.fn()
    const handleDeleteUrl = vi.fn(async () => {})
    render(
      <CustomProjectCategory
        {...createProps({
          handleOpenAllUrls,
          // eslint-disable-next-line typescript/no-misused-promises
          handleDeleteUrl,
        })}
      />,
    )

    const card = screen.getByTestId('card')
    expect(card.getAttribute('id')).toBe('category-drop-project-1-Work')
    expect(card.getAttribute('data-category')).toBe('Work')
    expect(screen.getByText('Work')).toBeTruthy()
    expect(screen.getByText('3')).toBeTruthy()
    expect(screen.getAllByTestId('project-url-item').length).toBe(3)
    expect(screen.getAllByTestId('project-url-item')[0]?.textContent).toContain(
      'https://b.com',
    )

    const collapseButton = screen.getByRole('button', { name: '折りたたむ' })
    fireEvent.pointerDown(collapseButton)
    fireEvent.click(collapseButton)
    expect(screen.queryByTestId('card-content')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '展開' }))
    expect(screen.getByTestId('card-content')).toBeTruthy()

    const sortButton = screen.getByRole('button', { name: 'デフォルト' })
    fireEvent.pointerDown(sortButton)
    fireEvent.click(sortButton)
    expect(screen.getByRole('button', { name: '保存日時の昇順' })).toBeTruthy()
    expect(screen.getAllByTestId('project-url-item')[0]?.textContent).toContain(
      'https://c.com',
    )

    fireEvent.click(screen.getByRole('button', { name: '保存日時の昇順' }))
    expect(screen.getByRole('button', { name: '保存日時の降順' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '保存日時の降順' }))
    expect(screen.getByRole('button', { name: 'デフォルト' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'すべて開く' }))
    expect(handleOpenAllUrls).toHaveBeenCalledWith(
      expect.arrayContaining([
        { url: 'https://b.com', title: 'B', category: 'Work', savedAt: 2 },
      ]),
    )

    fireEvent.click(screen.getByRole('button', { name: 'すべて削除' }))
    await waitFor(() => {
      expect(handleDeleteUrl).toHaveBeenCalledTimes(3)
    })
    expect(screen.getAllByTestId('project-url-item').length).toBe(3)
  })

  it('カテゴリ並び替え中は自動で折りたたみ、終了後にユーザー状態へ戻す', () => {
    const { rerender } = render(<CustomProjectCategory {...createProps()} />)

    expect(screen.getByTestId('card-content')).toBeTruthy()

    rerender(
      <CustomProjectCategory
        {...createProps({
          isDraggingCategory: true,
          isCategoryReorder: true,
          draggedCategoryName: 'Other',
        })}
      />,
    )

    expect(screen.queryByTestId('card-content')).toBeNull()
    // eslint-disable-next-line typescript/TS2339
    expect(
      (screen.getByRole('button', { name: '展開' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)

    rerender(
      <CustomProjectCategory
        {...createProps({
          isDraggingCategory: false,
          isCategoryReorder: false,
          draggedCategoryName: null,
        })}
      />,
    )

    expect(screen.getByTestId('card-content')).toBeTruthy()
    // eslint-disable-next-line typescript/TS2339
    expect(
      (screen.getByRole('button', { name: '折りたたむ' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false)
  })

  it('10件以上の一括開く確認ダイアログで handleOpenAllUrls 未指定時は window.open にフォールバックする', async () => {
    using openSpy = vi.spyOn(window, 'open')
    render(
      <CustomProjectCategory
        {...createProps({
          handleOpenAllUrls: undefined,
          urls: Array.from({ length: 10 }, (_, i) => ({
            url: `https://example.com/${i}`,
            title: `${i}`,
            category: 'Work',
            savedAt: i,
          })),
        })}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'すべて開く' }))
    fireEvent.click(await screen.findByRole('button', { name: '開く' }))

    expect(openSpy).toHaveBeenCalledTimes(10)
    expect(openSpy).toHaveBeenCalledWith(
      'https://example.com/0',
      '_blank',
      'noopener,noreferrer',
    )
  })

  it('confirmDeleteAll=true では一括削除確認ダイアログを表示し未分類名も表示する', async () => {
    const handleDeleteUrl = vi.fn(async () => {})
    render(
      <CustomProjectCategory
        {...createProps({
          category: '__uncategorized',
          urls: [
            { url: 'https://u.com', title: 'U', category: '__uncategorized' },
          ],
          settings: { ...defaultSettings, confirmDeleteAll: true },
          // eslint-disable-next-line typescript/no-misused-promises
          handleDeleteUrl,
        })}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'すべて削除' }))
    expect(screen.getByText('タブをすべて削除しますか？')).toBeTruthy()
    expect(screen.getByText(/未分類/)).toBeTruthy()
    fireEvent.click(await screen.findByRole('button', { name: '削除' }))

    await waitFor(() => {
      expect(handleDeleteUrl).toHaveBeenCalledWith('project-1', 'https://u.com')
    })
  })

  it('カテゴリ管理ダイアログで rename / delete の分岐とイベント停止を処理する', () => {
    const handleRenameCategory = vi.fn()
    const handleDeleteCategory = vi.fn()
    render(
      <CustomProjectCategory
        {...createProps({
          handleRenameCategory,
          handleDeleteCategory,
        })}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'カテゴリ管理' }))
    expect(screen.getByRole('heading', { name: 'カテゴリ管理' })).toBeTruthy()

    const dialogContent = screen.getByTestId('dialog-content')
    const stopPropagation = vi.fn()
    fireEvent.keyDown(dialogContent, { key: 'Enter', stopPropagation })
    fireEvent.keyDown(dialogContent, { key: ' ', stopPropagation })

    const renameInput = screen.getByLabelText('カテゴリ名')
    fireEvent.change(renameInput, { target: { value: '   ' } })
    fireEvent.blur(renameInput)
    expect(screen.getByText('カテゴリ名を入力してください')).toBeTruthy()

    fireEvent.change(renameInput, { target: { value: 'Work' } })
    fireEvent.blur(renameInput)
    expect(handleRenameCategory).not.toHaveBeenCalled()

    fireEvent.change(renameInput, { target: { value: 'Work2' } })
    fireEvent.keyDown(renameInput, { key: 'Enter' })
    expect(handleRenameCategory).toHaveBeenCalledWith(
      'project-1',
      'Work',
      'Work2',
    )

    fireEvent.click(screen.getByRole('button', { name: 'カテゴリを削除' }))
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
    expect(screen.queryByRole('button', { name: '削除' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'カテゴリを削除' }))
    fireEvent.click(screen.getByRole('button', { name: '削除' }))
    expect(handleDeleteCategory).toHaveBeenCalledWith('project-1', 'Work')
    expect(screen.queryByRole('heading', { name: 'カテゴリ管理' })).toBeNull()
  })

  it('空カテゴリ時のメッセージ・ハイライト・並び替えターゲット表示を切り替える', () => {
    const { rerender } = render(
      <CustomProjectCategory
        {...createProps({
          urls: [],
          handleRenameCategory: undefined,
          handleDeleteCategory: undefined,
        })}
      />,
    )

    const emptyState = screen.getByTestId('card-content').querySelector('div')
    expect(emptyState).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'カテゴリ管理' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'すべて開く' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'すべて削除' })).toBeNull()

    rerender(
      <CustomProjectCategory
        {...createProps({
          urls: [],
          isHighlighted: true,
        })}
      />,
    )
    expect(
      screen.getByTestId('card').className.includes('border-primary'),
    ).toBe(true)

    rerender(
      <CustomProjectCategory
        {...createProps({
          urls: [],
          isHighlighted: true,
          isDraggingCategory: true,
          draggedCategoryName: 'Other',
          isCategoryReorder: true,
        })}
      />,
    )
    expect(screen.queryByTestId('card-content')).toBeNull()
  })

  it('urls 未指定フォールバック・self dragging・空状態の isOver スタイルを反映する', () => {
    useDroppableMock.mockReturnValueOnce({
      setNodeRef: vi.fn(),
      isOver: true,
    })

    render(
      <CustomProjectCategory
        {...createProps({
          urls: undefined as unknown as typeof baseUrls,
          isDraggingCategory: true,
          draggedCategoryName: 'Work',
        })}
      />,
    )

    const card = screen.getByTestId('card')
    expect(card.className.includes('opacity-50')).toBe(true)
    expect(screen.queryByTestId('card-content')).toBeNull()
    // eslint-disable-next-line typescript/TS2339
    expect(
      (screen.getByRole('button', { name: '展開' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)

    useDroppableMock.mockReturnValueOnce({
      setNodeRef: vi.fn(),
      isOver: true,
    })

    cleanup()

    render(
      <CustomProjectCategory
        {...createProps({
          urls: undefined as unknown as typeof baseUrls,
          isDraggingCategory: false,
          draggedCategoryName: null,
        })}
      />,
    )

    const emptyState = screen.getByTestId('card-content').querySelector('div')
    expect(emptyState).toBeTruthy()
    expect(
      // eslint-disable-next-line typescript/non-nullable-type-assertion-style
      (emptyState as HTMLDivElement).className.includes('border-primary'),
    ).toBe(true)
    expect(
      // eslint-disable-next-line typescript/non-nullable-type-assertion-style
      (emptyState as HTMLDivElement).className.includes('bg-primary/10'),
    ).toBe(true)
  })

  it('savedAt 未指定のソートと、管理ダイアログの未設定ハンドラ/イベント分岐を処理する', () => {
    const handleDeleteCategory = vi.fn()
    const { rerender } = render(
      <CustomProjectCategory
        {...createProps({
          urls: [
            { url: 'https://m1.com', title: 'M1', category: 'Work' },
            { url: 'https://m2.com', title: 'M2', category: 'Work' },
          ],
          handleRenameCategory: undefined,
          handleDeleteCategory,
        })}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'デフォルト' }))
    expect(screen.getByRole('button', { name: '保存日時の昇順' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'カテゴリ管理' }))
    const dialogContent = screen.getByTestId('dialog-content')
    const pointerStopPropagation = vi.fn()
    const pointerDownEvent = new Event('pointerdown', {
      bubbles: true,
    })
    Object.defineProperty(pointerDownEvent, 'stopPropagation', {
      value: pointerStopPropagation,
    })
    dialogContent.dispatchEvent(pointerDownEvent)
    expect(pointerStopPropagation).toHaveBeenCalled()

    const keyStopPropagation = vi.fn()
    const nonStopKeyEvent = new KeyboardEvent('keydown', {
      bubbles: true,
      key: 'Escape',
    })
    Object.defineProperty(nonStopKeyEvent, 'stopPropagation', {
      value: keyStopPropagation,
    })
    dialogContent.dispatchEvent(nonStopKeyEvent)
    expect(keyStopPropagation).not.toHaveBeenCalled()

    const renameInput = screen.getByLabelText('カテゴリ名')
    fireEvent.keyDown(renameInput, { key: 'Escape' })
    fireEvent.change(renameInput, { target: { value: 'Renamed' } })
    fireEvent.keyDown(renameInput, { key: 'Enter' })
    expect(handleDeleteCategory).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'カテゴリを削除' }))
    fireEvent.click(screen.getByRole('button', { name: '削除' }))
    expect(handleDeleteCategory).toHaveBeenCalledWith('project-1', 'Work')

    const handleRenameCategory = vi.fn()
    rerender(
      <CustomProjectCategory
        {...createProps({
          urls: [{ url: 'https://n1.com', title: 'N1', category: 'Work' }],
          handleRenameCategory,
          handleDeleteCategory: undefined,
        })}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'カテゴリ管理' }))
    const deleteCategoryButton = screen.queryByRole('button', {
      name: 'カテゴリを削除',
    })
    if (deleteCategoryButton) {
      fireEvent.click(deleteCategoryButton)
    }
    fireEvent.click(screen.getByRole('button', { name: '削除' }))
    expect(screen.queryByRole('heading', { name: 'カテゴリ管理' })).toBeNull()
  })

  it('useDroppable の isOver 状態とカテゴリ名変更 rerender を反映する', () => {
    useDroppableMock.mockReturnValueOnce({
      setNodeRef: vi.fn(),
      isOver: true,
    })
    const { rerender } = render(
      <CustomProjectCategory
        {...createProps({
          category: 'Work',
        })}
      />,
    )

    expect(screen.getByTestId('card').className.includes('border-2')).toBe(true)
    expect(
      document.querySelector('ul')?.className.includes('bg-primary/5'),
    ).toBe(true)

    rerender(
      <CustomProjectCategory
        {...createProps({
          category: 'Renamed',
          urls: [{ url: 'https://r.com', title: 'R', category: 'Renamed' }],
        })}
      />,
    )
    expect(screen.getByText('Renamed')).toBeTruthy()
  })
})
