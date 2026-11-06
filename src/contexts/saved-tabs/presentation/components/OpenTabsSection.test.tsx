// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

import type { OpenTabsRow } from '@/contexts/saved-tabs/presentation/lib/open-tabs-display'
import { buildOpenTabsRowId } from '@/contexts/saved-tabs/presentation/lib/open-tabs-display'
import type { SavedTabsUserSettingsDto as UserSettings } from '@/contexts/saved-tabs/presentation/types/SavedTabsCompatibilityViewModel'

vi.mock('@/features/i18n/context/I18nProvider', () => ({
  useI18n: () => ({
    language: 'ja',
    t: (key: string, _fallback?: string, values?: Record<string, string>) => {
      const messages = {
        'common.cancel': 'キャンセル',
        'common.delete': '削除',
        'common.open': '開く',
        'savedTabs.accessibility.nounAction': '「{{target}}」の{{action}}',
        'savedTabs.collapse': '折りたたむ',
        'savedTabs.expand': '展開',
        'savedTabs.openAll': 'すべて開く',
        'savedTabs.openAllTabs': 'すべてのタブを開く',
        'savedTabs.deleteAll': 'すべて削除',
        'savedTabs.deleteAllTabs': 'すべてのタブを削除',
        'savedTabs.deletingAll': '削除中...',
        'savedTabs.openAllConfirmDescriptionWithName':
          '「{{name}}」のタブ{{count}}件を開きます。続行しますか？',
        'savedTabs.openTabs.deleteAllWarning':
          '保存リストから今開いているタブをすべて削除します。この操作は取り消せません。',
        'savedTabs.openTabs.title': '今開いているタブ',
        'savedTabs.sortableCategory.bulkOpenTitle': '複数タブを開く',
        'savedTabs.sortableCategory.bulkDeleteTitle': 'タブを削除',
        'savedTabs.sortableCategory.tabCountLabel': 'タブ数',
        'savedTabs.url.deleteAria': 'タブを削除',
      } satisfies Record<string, string>
      const template = messages[key as keyof typeof messages] ?? key
      return template.replaceAll(
        /\{\{(\w+)\}\}/g,
        (_, token) => values?.[token] ?? '',
      )
    },
  }),
}))

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  useSensor: (sensor: unknown, options: unknown) => ({ sensor, options }),
  useSensors: (...sensors: unknown[]) => sensors,
  closestCenter: 'closestCenter',
  KeyboardSensor: {},
  PointerSensor: {},
}))

vi.mock('@dnd-kit/sortable', async () => {
  const actual = await vi.importActual('@dnd-kit/sortable')
  return {
    ...(actual as object),
    useSortable: () => ({
      attributes: {},
      listeners: {},
      setNodeRef: vi.fn(),
      setActivatorNodeRef: vi.fn(),
      transform: null,
      transition: undefined,
      isDragging: false,
    }),
  }
})

vi.mock('@dnd-kit/utilities', () => ({
  CSS: {
    Transform: {
      toString: () => undefined,
    },
  },
}))

vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
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

import { OpenTabsSection } from './OpenTabsSection'

const defaultSettings: UserSettings = {
  removeTabAfterOpen: true,
  removeTabAfterExternalDrop: true,
  excludePatterns: [],
  enableCategories: true,
  autoDeletePeriod: 'never',
  showRelativeSavedTime: false,
  showSavedTime: false,
  clickBehavior: 'saveSameDomainTabs',
  excludePinnedTabs: false,
  openUrlInBackground: true,
  openAllInNewWindow: false,
  confirmDeleteAll: false,
  confirmDeleteEach: false,
  colors: {},
}

const makeRow = (
  groupId: string,
  url: string,
  overrides: Partial<OpenTabsRow> = {},
): OpenTabsRow => ({
  id: buildOpenTabsRowId(groupId, url),
  groupId,
  isFavorite: false,
  title: `Title ${url}`,
  url,
  ...overrides,
})

const baseProps = (
  overrides: {
    rows?: OpenTabsRow[]
  } = {},
) => ({
  rows: [
    makeRow('group-1', 'https://example.com/a'),
    makeRow('group-1', 'https://example.com/b'),
    makeRow('group-2', 'https://sample.com/c'),
  ],
  settings: defaultSettings,
  handleOpenAllTabs: vi.fn(),
  handleOpenTab: vi.fn(),
  handleDeleteUrl: vi.fn(),
  handleDeleteUrls: vi.fn(),
  ...overrides,
})

describe('OpenTabsSection', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  it.each(['domain', 'custom'] as const)(
    '%s renders the section heading, count badge and one row per occurrence',
    (mode) => {
      const props = baseProps()
      render(<OpenTabsSection {...props} mode={mode} />)
      expect(screen.getByTestId('open-tabs-section')).toBeVisible()
      expect(screen.getByText('今開いているタブ')).toBeVisible()
      const heading = screen.getByRole('heading', {
        name: '今開いているタブ',
        level: 2,
      })
      expect(heading).toBeVisible()
      expect(screen.getByText('3')).toBeVisible()
      for (const url of [
        'https://example.com/a',
        'https://example.com/b',
        'https://sample.com/c',
      ]) {
        expect(screen.getByRole('link', { name: `Title ${url}` })).toBeVisible()
      }
    },
  )

  it('hides rows when collapsed and keeps the count badge visible', async () => {
    const props = baseProps()
    const user = userEvent.setup()
    render(<OpenTabsSection {...props} />)
    await user.click(screen.getByRole('button', { name: '折りたたむ' }))
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.getByText('3')).toBeVisible()
    await user.click(screen.getByRole('button', { name: '展開' }))
    expect(screen.getAllByTestId('sortable-url-item')).toHaveLength(3)
  })

  it('marks rows with the open-tabs category context', () => {
    const props = baseProps()
    render(<OpenTabsSection {...props} />)
    for (const row of screen.getAllByTestId('sortable-url-item')) {
      expect(row).toHaveAttribute('data-category-context', 'open-tabs')
    }
  })

  it('deletes a single row through the row delete handler', async () => {
    const props = baseProps()
    const user = userEvent.setup()
    render(<OpenTabsSection {...props} />)
    const rows = screen.getAllByTestId('sortable-url-item')
    const target = rows.find((item) =>
      item.textContent?.includes('Title https://sample.com/c'),
    )
    if (!target) {
      throw new Error('row for https://sample.com/c must exist')
    }
    const deleteButton = within(target).getByTitle('タブを削除')
    expect(deleteButton).toBeVisible()
    await user.click(deleteButton)
    expect(props.handleDeleteUrl).toHaveBeenCalledTimes(1)
    expect(props.handleDeleteUrl).toHaveBeenCalledWith(
      'group-2',
      'https://sample.com/c',
    )
  })

  it('opens all rows directly when below the bulk threshold', async () => {
    const props = baseProps()
    const user = userEvent.setup()
    render(<OpenTabsSection {...props} />)
    await user.click(
      screen.getByRole('button', {
        name: '「今開いているタブ」のすべてのタブを開く',
      }),
    )
    expect(props.handleOpenAllTabs).toHaveBeenCalledTimes(1)
    const called = props.handleOpenAllTabs.mock.calls[0]?.[0] ?? []
    expect(called.map((item: { url: string }) => item.url)).toEqual([
      'https://example.com/a',
      'https://example.com/b',
      'https://sample.com/c',
    ])
  })

  it('confirms before opening many rows', async () => {
    const props = baseProps({
      rows: Array.from({ length: 10 }, (_, index) =>
        makeRow('group-1', `https://example.com/p${index}`),
      ),
    })
    const user = userEvent.setup()
    render(<OpenTabsSection {...props} />)
    await user.click(
      screen.getByRole('button', {
        name: '「今開いているタブ」のすべてのタブを開く',
      }),
    )
    expect(props.handleOpenAllTabs).not.toHaveBeenCalled()
    expect(screen.getAllByTestId('alert-dialog')).toHaveLength(1)
    expect(screen.getByText('複数タブを開く')).toBeVisible()
    await user.click(screen.getByRole('button', { name: '開く' }))
    expect(props.handleOpenAllTabs).toHaveBeenCalledTimes(1)
    expect(props.handleOpenAllTabs.mock.calls[0]?.[0]).toHaveLength(10)
  })

  it('deletes all rows grouped per tab group without confirmation', async () => {
    const props = baseProps()
    const user = userEvent.setup()
    render(<OpenTabsSection {...props} />)
    await user.click(
      screen.getByRole('button', {
        name: '「今開いているタブ」のすべてのタブを削除',
      }),
    )
    expect(props.handleDeleteUrls).toHaveBeenCalledTimes(2)
    expect(props.handleDeleteUrls.mock.calls[0]?.[0]).toBe('group-1')
    expect(props.handleDeleteUrls.mock.calls[0]?.[1]).toEqual([
      'https://example.com/a',
      'https://example.com/b',
    ])
    expect(props.handleDeleteUrls.mock.calls[1]?.[0]).toBe('group-2')
    expect(props.handleDeleteUrl).not.toHaveBeenCalled()
  })

  it('asks for confirmation before deleting all rows', async () => {
    const props = baseProps()
    const user = userEvent.setup()
    render(
      <OpenTabsSection
        {...props}
        settings={{ ...defaultSettings, confirmDeleteAll: true }}
      />,
    )
    await user.click(
      screen.getByRole('button', {
        name: '「今開いているタブ」のすべてのタブを削除',
      }),
    )
    expect(props.handleDeleteUrls).not.toHaveBeenCalled()
    expect(screen.getByTestId('alert-dialog')).toBeVisible()
    expect(
      screen.getByText(
        '保存リストから今開いているタブをすべて削除します。この操作は取り消せません。',
      ),
    ).toBeVisible()
    await user.click(screen.getByRole('button', { name: '削除' }))
    expect(props.handleDeleteUrls).toHaveBeenCalledTimes(2)
  })

  it('falls back to per-row deletion when the bulk handler is missing', async () => {
    const withBulk = baseProps()
    const props = {
      rows: withBulk.rows,
      settings: withBulk.settings,
      handleOpenAllTabs: withBulk.handleOpenAllTabs,
      handleOpenTab: withBulk.handleOpenTab,
      handleDeleteUrl: withBulk.handleDeleteUrl,
    }
    const user = userEvent.setup()
    render(<OpenTabsSection {...props} />)
    await user.click(
      screen.getByRole('button', {
        name: '「今開いているタブ」のすべてのタブを削除',
      }),
    )
    expect(props.handleDeleteUrl).toHaveBeenCalledTimes(3)
    expect(props.handleDeleteUrl.mock.calls.map((call) => call[1])).toEqual([
      'https://example.com/a',
      'https://example.com/b',
      'https://sample.com/c',
    ])
  })
})
