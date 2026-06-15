// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

import type { UserSettingsDto as UserSettings } from '@/contexts/saved-tabs/domain/dto/UserSettingsDto'

const { dndContextHandlersRef, reorderTabGroupUrlsUseCaseMock } = vi.hoisted(
  () => ({
    dndContextHandlersRef: {
      current: {} as {
        onDragEnd?: (event: {
          active: { id: string }
          over: { id: string } | null
        }) => void | Promise<void>
      },
    },
    reorderTabGroupUrlsUseCaseMock: vi.fn(),
  }),
)

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({
    children,
    onDragEnd,
  }: {
    children: React.ReactNode
    onDragEnd?: (event: {
      active: { id: string }
      over: { id: string } | null
    }) => void | Promise<void>
  }) => {
    dndContextHandlersRef.current.onDragEnd = onDragEnd
    return <div data-testid='dnd-context'>{children}</div>
  },
  KeyboardSensor: vi.fn(),
  PointerSensor: vi.fn(),
  closestCenter: 'closestCenter',
  useSensor: vi.fn(() => 'sensor'),
  useSensors: vi.fn(() => ['sensor']),
}))

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='sortable-context'>{children}</div>
  ),
  arrayMove: <T,>(array: T[], from: number, to: number) => {
    const next = [...array]
    const [removed] = next.splice(from, 1)
    if (removed !== undefined) {
      next.splice(to, 0, removed)
    }
    return next
  },
  sortableKeyboardCoordinates: vi.fn(),
  verticalListSortingStrategy: 'verticalListSortingStrategy',
}))

vi.mock('./SortableUrlItem', () => ({
  SortableUrlItem: ({ url }: { url: string }) => (
    <li data-testid='sortable-url-item'>{url}</li>
  ),
}))

import { CategorySection } from './TimeRemaining'

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
  categoryName: 'Work',
  groupId: 'group-1',
  urls: [
    { url: 'https://a.com', title: 'A' },
    { url: 'https://b.com', title: 'B' },
    { url: 'https://c.com', title: 'C' },
  ],
  handleDeleteUrl: vi.fn(),
  handleOpenTab: vi.fn(),
  handleUpdateUrls: vi.fn(),
  settings: defaultSettings,
  reorderTabGroupUrlsUseCase:
    reorderTabGroupUrlsUseCaseMock as unknown as Parameters<
      typeof CategorySection
    >[0]['reorderTabGroupUrlsUseCase'],
})

describe('CategorySection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dndContextHandlersRef.current = {}
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('ドロップ後に先に表示順を更新し、保存完了後に親更新を通知する', async () => {
    let resolvePersist: (() => void) | null = null
    reorderTabGroupUrlsUseCaseMock.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolvePersist = resolve
        }),
    )
    const props = createProps()
    render(<CategorySection {...props} />)

    expect(
      screen
        .getAllByTestId('sortable-url-item')
        .map((node) => node.textContent),
    ).toStrictEqual(['https://a.com', 'https://b.com', 'https://c.com'])

    act(() => {
      void dndContextHandlersRef.current.onDragEnd?.({
        active: { id: 'https://a.com' },
        over: { id: 'https://b.com' },
      })
    })

    expect(
      screen
        .getAllByTestId('sortable-url-item')
        .map((node) => node.textContent),
    ).toStrictEqual(['https://b.com', 'https://a.com', 'https://c.com'])
    expect(props.handleUpdateUrls).not.toHaveBeenCalled()

    act(() => {
      resolvePersist?.()
    })

    await waitFor(() => {
      expect(props.handleUpdateUrls).toHaveBeenCalledWith('group-1', [
        { url: 'https://b.com', title: 'B' },
        { url: 'https://a.com', title: 'A' },
        { url: 'https://c.com', title: 'C' },
      ])
    })
  })

  it('保存に失敗した場合は表示順を元に戻して親更新を呼ばない', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    reorderTabGroupUrlsUseCaseMock.mockRejectedValueOnce(
      new Error('save failed'),
    )
    const props = createProps()
    render(<CategorySection {...props} />)

    act(() => {
      void dndContextHandlersRef.current.onDragEnd?.({
        active: { id: 'https://a.com' },
        over: { id: 'https://b.com' },
      })
    })

    await waitFor(() => {
      expect(
        screen
          .getAllByTestId('sortable-url-item')
          .map((node) => node.textContent),
      ).toStrictEqual(['https://a.com', 'https://b.com', 'https://c.com'])
    })
    expect(props.handleUpdateUrls).not.toHaveBeenCalled()
  })

  it('overがない場合と同一IDドロップでは並び替えを実行しない', () => {
    const props = createProps()
    render(<CategorySection {...props} />)

    act(() => {
      void dndContextHandlersRef.current.onDragEnd?.({
        active: { id: 'https://a.com' },
        over: null,
      })
    })
    act(() => {
      void dndContextHandlersRef.current.onDragEnd?.({
        active: { id: 'https://a.com' },
        over: { id: 'https://a.com' },
      })
    })

    expect(reorderTabGroupUrlsUseCaseMock).not.toHaveBeenCalled()
    expect(props.handleUpdateUrls).not.toHaveBeenCalled()
    expect(
      screen
        .getAllByTestId('sortable-url-item')
        .map((node) => node.textContent),
    ).toStrictEqual(['https://a.com', 'https://b.com', 'https://c.com'])
  })
})
