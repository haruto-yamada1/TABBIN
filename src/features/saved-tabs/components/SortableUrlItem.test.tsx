// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { SortableUrlItemProps } from '@/types/saved-tabs'
import type { UserSettings } from '@/types/storage'

const sortableUrlItemI18nState = vi.hoisted(() => ({
  language: 'ja' as 'en' | 'ja',
}))

vi.mock('@dnd-kit/sortable', () => ({
  useSortable: vi.fn(() => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: undefined,
  })),
}))

vi.mock('@dnd-kit/utilities', () => ({
  CSS: {
    Transform: {
      toString: () => undefined,
    },
  },
}))

vi.mock('@/utils/datetime', () => ({
  formatDatetime: vi.fn((timestamp?: number) => `formatted:${timestamp}`),
  TimeRemaining: ({
    savedAt,
    autoDeletePeriod,
  }: {
    savedAt?: number
    autoDeletePeriod?: string
  }) => (
    <span data-testid='time-remaining'>
      remaining:{savedAt}:{autoDeletePeriod}
    </span>
  ),
}))

vi.mock('@/features/i18n/context/I18nProvider', async () => {
  const { getMessages } = await vi.importActual<
    typeof import('@/features/i18n/messages')
  >('@/features/i18n/messages')

  return {
    useI18n: () => ({
      language: sortableUrlItemI18nState.language,
      t: (key: string, fallback?: string, values?: Record<string, string>) => {
        const messages = getMessages(sortableUrlItemI18nState.language)
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

import { formatDatetime } from '@/utils/datetime'

import { SortableUrlItem } from './SortableUrlItem'

const sendMessageMock = vi.fn()

const defaultSettings: UserSettings = {
  removeTabAfterOpen: true,
  removeTabAfterExternalDrop: true,
  excludePatterns: ['chrome-extension://', 'chrome://'],
  enableCategories: true,
  autoDeletePeriod: 'never',
  showSavedTime: false,
  clickBehavior: 'saveSameDomainTabs',
  excludePinnedTabs: true,
  openUrlInBackground: true,
  openAllInNewWindow: false,
  confirmDeleteAll: false,
  confirmDeleteEach: false,
  colors: {},
}

const createProps = (
  overrides: Partial<SortableUrlItemProps> = {},
): SortableUrlItemProps => ({
  url: 'https://example.com',
  title: 'Example Tab',
  id: 'url-item-1',
  groupId: 'group-1',
  handleDeleteUrl: vi.fn(),
  handleOpenTab: vi.fn(),
  handleUpdateUrls: vi.fn(),
  settings: defaultSettings,
  ...overrides,
})

const getLink = () => screen.getByRole('button', { name: 'Example Tab' })

const getDeleteButton = () => screen.getByRole('button', { name: 'タブを削除' })

const getLatestWindowBlurHandler = (
  addEventListenerSpy: ReturnType<typeof vi.spyOn>,
) => {
  const call = [...addEventListenerSpy.mock.calls]
    .toReversed()
    .find(([eventName]) => eventName === 'blur')

  if (!call || !(call[1] instanceof Function)) {
    throw new Error('blur handler was not captured')
  }

  return call[1] as EventListener
}

describe('SortableUrlItem', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
    sortableUrlItemI18nState.language = 'ja'
    vi.spyOn(console, 'log').mockImplementation(() => {})

    sendMessageMock.mockImplementation(
      (_message: unknown, callback?: (response: { ok: boolean }) => void) => {
        callback?.({ ok: true })
      },
    )

    const chromeGlobal = globalThis as unknown as { chrome: typeof chrome }
    chromeGlobal.chrome = {
      runtime: {
        sendMessage: sendMessageMock,
      },
    } as unknown as typeof chrome
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('削除ボタンを初期描画時からDOMに保持し行hover/focus用クラスを持つ', () => {
    const { container } = render(<SortableUrlItem {...createProps()} />)

    const deleteButton = getDeleteButton()
    expect(deleteButton).toBeTruthy()
    expect(deleteButton.className).toContain('group-hover:visible')
    expect(deleteButton.className).toContain('group-focus-within:visible')
    expect(deleteButton.className).toContain('pointer-events-none')

    const row = getLink().closest('li')
    expect(row).toBeTruthy()
    expect(row?.className).toContain('group')

    const dragHandle = container.querySelector('svg')?.parentElement
    expect(dragHandle?.className).not.toContain('opacity-')
    expect(dragHandle?.className).not.toContain('/40')
    expect(dragHandle?.className).not.toContain('/60')
    expect(dragHandle?.className).not.toContain('/80')
  })

  it('confirmDeleteEachがfalseのとき削除ボタンで即時削除する', () => {
    const handleDeleteUrl = vi.fn()

    render(<SortableUrlItem {...createProps({ handleDeleteUrl })} />)

    fireEvent.click(getDeleteButton())

    expect(handleDeleteUrl).toHaveBeenCalledTimes(1)
    expect(handleDeleteUrl).toHaveBeenCalledWith(
      'group-1',
      'https://example.com',
    )
  })

  it('confirmDeleteEachがtrueのとき確認ダイアログを開き確定で削除する', async () => {
    const handleDeleteUrl = vi.fn()

    render(
      <SortableUrlItem
        {...createProps({
          handleDeleteUrl,
          settings: {
            ...defaultSettings,
            confirmDeleteEach: true,
          },
        })}
      />,
    )

    fireEvent.click(getDeleteButton())

    const confirmButton = await screen.findByRole('button', {
      name: '削除',
    })
    fireEvent.click(confirmButton)

    expect(handleDeleteUrl).toHaveBeenCalledTimes(1)
    expect(handleDeleteUrl).toHaveBeenCalledWith(
      'group-1',
      'https://example.com',
    )
  })

  it('リンククリックで handleOpenTab を呼ぶ', () => {
    const handleOpenTab = vi.fn()

    render(<SortableUrlItem {...createProps({ handleOpenTab })} />)

    fireEvent.click(getLink())

    expect(handleOpenTab).toHaveBeenCalledTimes(1)
    expect(handleOpenTab).toHaveBeenCalledWith('https://example.com')
  })

  it('renders English delete copy when the display language is en', async () => {
    sortableUrlItemI18nState.language = 'en'

    render(
      <SortableUrlItem
        {...createProps({
          settings: {
            ...defaultSettings,
            confirmDeleteEach: true,
          },
        })}
      />,
    )

    expect(screen.getByRole('button', { name: 'Delete tab' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Delete tab' }))
    expect(await screen.findByText('Delete this tab?')).toBeTruthy()
  })

  it('保存日時表示の各分岐を描画する', () => {
    const savedAt = 1700000000000
    const { rerender } = render(
      <SortableUrlItem
        {...createProps({
          savedAt,
          settings: {
            ...defaultSettings,
            showSavedTime: true,
          },
          autoDeletePeriod: 'never',
        })}
      />,
    )

    expect(vi.mocked(formatDatetime)).toHaveBeenCalledWith(savedAt)
    expect(screen.getByText(`formatted:${savedAt}`)).toBeTruthy()
    expect(screen.queryByTestId('time-remaining')).toBeNull()

    rerender(
      <SortableUrlItem
        {...createProps({
          savedAt,
          settings: {
            ...defaultSettings,
            showSavedTime: false,
          },
        })}
      />,
    )

    expect(screen.queryByText(`formatted:${savedAt}`)).toBeNull()
    expect(screen.queryByTestId('time-remaining')).toBeNull()

    rerender(
      <SortableUrlItem
        {...createProps({
          savedAt,
          settings: {
            ...defaultSettings,
            showSavedTime: false,
          },
          autoDeletePeriod: '1day',
        })}
      />,
    )

    expect(screen.getByTestId('time-remaining').textContent).toContain(
      `remaining:${savedAt}:1day`,
    )
  })

  it('ドラッグ開始でデータとメッセージを設定し、ドラッグ終了でクリーンアップする', () => {
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener')
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener')
    const dataTransfer = {
      setData: vi.fn(),
      dropEffect: 'move',
    }

    render(<SortableUrlItem {...createProps()} />)

    fireEvent.dragStart(getLink(), { dataTransfer })
    fireEvent.dragEnd(getLink(), { dataTransfer })

    expect(dataTransfer.setData).toHaveBeenNthCalledWith(
      1,
      'text/plain',
      'https://example.com',
    )
    expect(dataTransfer.setData).toHaveBeenNthCalledWith(
      2,
      'text/uri-list',
      'https://example.com',
    )
    expect(addEventListenerSpy).toHaveBeenCalledWith(
      'blur',
      expect.any(Function),
    )
    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      'blur',
      expect.any(Function),
    )
    expect(sendMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'urlDragStarted',
        url: 'https://example.com',
        groupId: 'group-1',
      }),
      expect.any(Function),
    )
  })

  it('blur済みかつdropEffect=linkのとき外部ドロップメッセージを送る', async () => {
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener')
    const dataTransfer = {
      setData: vi.fn(),
      dropEffect: 'link',
    }

    render(<SortableUrlItem {...createProps()} />)

    fireEvent.dragStart(getLink(), { dataTransfer })
    const blurHandler = getLatestWindowBlurHandler(addEventListenerSpy)
    await act(async () => {
      blurHandler(new Event('blur'))
    })

    fireEvent.dragEnd(getLink(), { dataTransfer })

    expect(sendMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'urlDropped',
        url: 'https://example.com',
        groupId: 'group-1',
        fromExternal: true,
      }),
      expect.any(Function),
    )
  })

  it('blurが発生しないときは外部ドロップメッセージを送らない', () => {
    const dataTransfer = {
      setData: vi.fn(),
      dropEffect: 'link',
    }

    render(<SortableUrlItem {...createProps()} />)

    fireEvent.dragStart(getLink(), { dataTransfer })
    fireEvent.dragEnd(getLink(), { dataTransfer })

    expect(sendMessageMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: 'urlDropped' }),
      expect.any(Function),
    )
  })

  it('dropEffectがlink以外のときは外部ドロップメッセージを送らない', async () => {
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener')
    const dataTransfer = {
      setData: vi.fn(),
      dropEffect: 'none',
    }

    render(<SortableUrlItem {...createProps()} />)

    fireEvent.dragStart(getLink(), { dataTransfer })
    const blurHandler = getLatestWindowBlurHandler(addEventListenerSpy)
    await act(async () => {
      blurHandler(new Event('blur'))
    })
    fireEvent.dragEnd(getLink(), { dataTransfer })

    expect(sendMessageMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: 'urlDropped' }),
      expect.any(Function),
    )
  })

  it('dropEffectがcopyならblurなしでも外部ドロップメッセージを送る', () => {
    const dataTransfer = {
      setData: vi.fn(),
      dropEffect: 'copy',
    }

    render(<SortableUrlItem {...createProps()} />)

    fireEvent.dragStart(getLink(), { dataTransfer })
    fireEvent.dragEnd(getLink(), { dataTransfer })

    expect(sendMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'urlDropped',
        url: 'https://example.com',
        groupId: 'group-1',
        fromExternal: true,
      }),
      expect.any(Function),
    )
  })

  it('ドラッグ終了後にblurイベントが来ても外部ドロップ扱いしない', async () => {
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener')
    const dataTransfer = {
      setData: vi.fn(),
      dropEffect: 'link',
    }

    render(<SortableUrlItem {...createProps()} />)

    fireEvent.dragStart(getLink(), { dataTransfer })
    const blurHandler = getLatestWindowBlurHandler(addEventListenerSpy)
    fireEvent.dragEnd(getLink(), { dataTransfer })

    await act(async () => {
      blurHandler(new Event('blur'))
    })

    expect(sendMessageMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: 'urlDropped' }),
      expect.any(Function),
    )
  })

  it('アンマウント時にwindow blurリスナーを解除する', () => {
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener')
    const { unmount } = render(<SortableUrlItem {...createProps()} />)

    unmount()

    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      'blur',
      expect.any(Function),
    )
  })
})
