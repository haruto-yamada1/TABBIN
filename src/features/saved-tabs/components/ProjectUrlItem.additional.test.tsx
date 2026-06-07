// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

import type { UserSettings } from '@/types/storage'

import type { ProjectUrlItemProps } from './ProjectUrlItem'

const projectUrlItemAdditionalI18nState = vi.hoisted(() => ({
  language: 'ja' as 'en' | 'ja',
}))

vi.mock('@dnd-kit/sortable', () => ({
  useSortable: vi.fn(() => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: undefined,
    isDragging: false,
  })),
}))

vi.mock('@dnd-kit/utilities', () => ({
  CSS: {
    Transform: {
      toString: () => undefined,
    },
  },
}))

vi.mock('@/features/i18n/context/I18nProvider', async () => {
  const { getMessages } = await vi.importActual<
    // eslint-disable-next-line typescript/consistent-type-imports
    typeof import('@/features/i18n/messages')
  >('@/features/i18n/messages')

  return {
    useI18n: () => ({
      language: projectUrlItemAdditionalI18nState.language,
      t: (key: string, fallback?: string, values?: Record<string, string>) => {
        const messages = getMessages(projectUrlItemAdditionalI18nState.language)
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

import { ProjectUrlItem } from './ProjectUrlItem'

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

const createProps = (): ProjectUrlItemProps => ({
  item: {
    url: 'https://example.com/doc',
    title: 'Doc',
  },
  projectId: 'project-1',
  handleOpenUrl: vi.fn(),
  handleDeleteUrl: vi.fn(),
  settings: defaultSettings,
})

describe('ProjectUrlItem additional', () => {
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
  })

  it('window 内 drop 済みなら urlDropped を送らない', () => {
    render(<ProjectUrlItem {...createProps()} />)

    const link = screen.getByRole('button', { name: 'Doc' })
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
