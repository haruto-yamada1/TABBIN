// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { SortableUrlItemProps } from '@/types/saved-tabs'
import type { UserSettings } from '@/types/storage'

const sortableUrlItemAdditionalI18nState = vi.hoisted(() => ({
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
  TimeRemaining: () => null,
}))

vi.mock('@/utils/localDateTime', () => ({
  formatFixedDatetime: vi.fn(),
}))

vi.mock('@/features/i18n/context/I18nProvider', async () => {
  const { getMessages } = await vi.importActual<
    typeof import('@/features/i18n/messages')
  >('@/features/i18n/messages')

  return {
    useI18n: () => ({
      language: sortableUrlItemAdditionalI18nState.language,
      t: (key: string, fallback?: string, values?: Record<string, string>) => {
        const messages = getMessages(
          sortableUrlItemAdditionalI18nState.language,
        )
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

import { SortableUrlItem } from './SortableUrlItem'

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

const createProps = (): SortableUrlItemProps => ({
  url: 'https://example.com',
  title: 'Example Tab',
  id: 'url-item-1',
  groupId: 'group-1',
  handleDeleteUrl: vi.fn(),
  handleOpenTab: vi.fn(),
  handleUpdateUrls: vi.fn(),
  settings: defaultSettings,
})

describe('SortableUrlItem additional', () => {
  const sendMessageMock = vi.fn()

  beforeEach(() => {
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
    vi.clearAllMocks()
    sortableUrlItemAdditionalI18nState.language = 'ja'
  })

  it('window 内 drop 済みなら外部ドロップ扱いしない', () => {
    render(<SortableUrlItem {...createProps()} />)

    const link = screen.getByRole('button', { name: 'Example Tab' })
    const dataTransfer = {
      setData: vi.fn(),
      dropEffect: 'copy',
    }

    fireEvent.dragStart(link, { dataTransfer })
    window.dispatchEvent(new Event('drop'))
    fireEvent.dragEnd(link, { dataTransfer })

    expect(sendMessageMock).not.toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'urlDropped',
      }),
      expect.any(Function),
    )
  })
})
