// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

import type { UserSettings } from '@/types/storage'

import type { ProjectUrlItemProps } from './ProjectUrlItem'

const { useSortableMock } = vi.hoisted(() => ({
  useSortableMock: vi.fn(),
}))

const projectUrlItemI18nState = vi.hoisted(() => ({
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

vi.mock('@/features/i18n/context/I18nProvider', async () => {
  const { getMessages } = await vi.importActual<
    // eslint-disable-next-line typescript/consistent-type-imports
    typeof import('@/features/i18n/messages')
  >('@/features/i18n/messages')

  return {
    useI18n: () => ({
      language: projectUrlItemI18nState.language,
      t: (key: string, fallback?: string, values?: Record<string, string>) => {
        const messages = getMessages(projectUrlItemI18nState.language)
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
import { getCategoryDisplayName } from './projectUrlItemHelpers'

const sendMessageMock = vi.fn()

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
  overrides: Partial<ProjectUrlItemProps> = {},
): ProjectUrlItemProps => ({
  item: {
    url: 'https://example.com/path',
    title: 'Example',
    category: undefined,
  },
  projectId: 'project-1',
  handleOpenUrl: vi.fn(),
  handleDeleteUrl: vi.fn(),
  handleSetCategory: vi.fn(),
  availableCategories: ['A', 'B'],
  isInUncategorizedArea: false,
  parentType: undefined,
  settings: defaultSettings,
  ...overrides,
})

describe('ProjectUrlItem', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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

    useSortableMock.mockReturnValue({
      attributes: {},
      listeners: {},
      setNodeRef: vi.fn(),
      transform: null,
      transition: undefined,
      isDragging: false,
    })
  })

  afterEach(() => {
    cleanup()
  })

  // eslint-disable-next-line eslint/complexity
  it('未分類URLを描画しリンククリックと即時削除を処理する', () => {
    const handleOpenUrl = vi.fn()
    const handleDeleteUrl = vi.fn()
    const item = {
      url: 'https://example.com/long/path',
      title: '',
      notes: 'memo',
    }

    render(
      <ProjectUrlItem
        {...createProps({
          item,
          handleOpenUrl,
          handleDeleteUrl,
          settings: { ...defaultSettings, confirmDeleteEach: false },
        })}
      />,
    )

    const listItem = document.querySelector('li')
    expect(listItem).toBeTruthy()
    expect(listItem?.getAttribute('data-url')).toBe(item.url)
    expect(listItem?.getAttribute('data-project-id')).toBe('project-1')
    expect(listItem?.getAttribute('data-category')).toBeNull()
    expect(listItem?.getAttribute('data-has-category')).toBe('false')
    expect(listItem?.getAttribute('data-category-level')).toBe('0')
    expect(listItem?.getAttribute('data-parent-type')).toBe('')
    expect(listItem?.getAttribute('data-in-uncategorized')).toBe('false')
    expect(listItem?.className).not.toContain('pl-2')
    expect(listItem?.className).not.toContain('border-l-2')
    const dragHandle = listItem?.querySelector('svg')?.parentElement
    expect(dragHandle?.className).not.toContain('opacity-')
    const actionBar = screen.getByRole('button', {
      name: 'タブを削除',
    }).parentElement
    expect(actionBar?.className).toContain('group-focus-within:opacity-100')

    const link = screen.getByRole('button', { name: item.url })
    expect(link.className).toContain('min-w-0')
    const titleLabel = link.querySelector('span')
    expect(titleLabel?.className).toContain('min-w-0')
    expect(titleLabel?.className).toContain('truncate')
    fireEvent.click(link)
    expect(handleOpenUrl).toHaveBeenCalledWith(item.url)

    fireEvent.click(screen.getByRole('button', { name: 'タブを削除' }))
    expect(handleDeleteUrl).toHaveBeenCalledWith('project-1', item.url)

    expect(useSortableMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: item.url,
        data: expect.objectContaining({
          type: 'url',
          url: item.url,
          projectId: 'project-1',
          title: item.url.substring(0, 30),
          isUncategorized: true,
          category: undefined,
          notes: item.notes,
          isCategory: false,
          canMoveToUncategorized: true,
          originalCategory: undefined,
          hasCategory: false,
          parent: undefined,
          isInUncategorizedArea: false,
        }),
      }),
    )
  })

  it('サブカテゴリ付きURLを描画し確認ダイアログ経由で削除する', async () => {
    useSortableMock.mockReturnValueOnce({
      attributes: { 'data-attr': 'x' },
      listeners: { onPointerDown: vi.fn() },
      setNodeRef: vi.fn(),
      transform: null,
      transition: undefined,
      isDragging: true,
    })

    const handleDeleteUrl = vi.fn()
    const item = {
      url: 'https://example.com/doc',
      title: 'Doc',
      category: 'Parent/Child',
    }

    render(
      <ProjectUrlItem
        {...createProps({
          item,
          handleDeleteUrl,
          parentType: 'category',
          isInUncategorizedArea: true,
          settings: { ...defaultSettings, confirmDeleteEach: true },
        })}
      />,
    )

    const listItem = document.querySelector('li')
    expect(listItem?.className).toContain('bg-secondary/50')
    expect(listItem?.className).toContain('opacity-50')
    expect(listItem?.className).toContain('pl-2')
    expect(listItem?.className).toContain('border-l-2')
    expect(listItem?.getAttribute('data-category')).toBe('Parent/Child')
    expect(listItem?.getAttribute('data-has-category')).toBe('true')
    expect(listItem?.getAttribute('data-category-level')).toBe('1')
    expect(listItem?.getAttribute('data-parent-type')).toBe('category')
    expect(listItem?.getAttribute('data-in-uncategorized')).toBe('true')

    expect(screen.getByText('Child')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Doc/ })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'タブを削除' }))
    const confirmButton = await screen.findByRole('button', {
      name: '削除',
    })
    fireEvent.click(confirmButton)

    expect(handleDeleteUrl).toHaveBeenCalledWith('project-1', item.url)

    expect(useSortableMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          parent: { type: 'category', id: 'category-project-1' },
          originalCategory: 'Parent/Child',
          hasCategory: true,
          isInUncategorizedArea: true,
        }),
      }),
    )
  })

  it('カテゴリ表示名ヘルパーは未指定時に空文字を返す', () => {
    expect(getCategoryDisplayName()).toBe('')
  })

  it('外部D&D成立時にurlDroppedメッセージを送る', () => {
    using addEventListenerSpy = vi.spyOn(window, 'addEventListener')
    const item = {
      url: 'https://example.com/doc',
      title: 'Doc',
      category: undefined,
    }

    render(<ProjectUrlItem {...createProps({ item })} />)

    const link = screen.getByRole('button', { name: 'Doc' })
    const dataTransfer = {
      setData: vi.fn(),
      dropEffect: 'link',
    }

    fireEvent.dragStart(link, { dataTransfer })
    const blurCall = [...addEventListenerSpy.mock.calls]
      .toReversed()
      .find(([eventName]) => eventName === 'blur')
    if (!blurCall || !(blurCall[1] instanceof Function)) {
      throw new Error('blur handler was not captured')
    }
    blurCall[1](new Event('blur'))
    fireEvent.dragEnd(link, { dataTransfer })

    expect(sendMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'urlDropped',
        url: item.url,
        groupId: 'project-1',
        fromExternal: true,
      }),
      expect.any(Function),
    )
  })

  it('dropEffectがlink以外ならurlDroppedメッセージを送らない', () => {
    using addEventListenerSpy = vi.spyOn(window, 'addEventListener')
    const item = {
      url: 'https://example.com/doc',
      title: 'Doc',
      category: undefined,
    }

    render(<ProjectUrlItem {...createProps({ item })} />)

    const link = screen.getByRole('button', { name: 'Doc' })
    const dataTransfer = {
      setData: vi.fn(),
      dropEffect: 'none',
    }

    fireEvent.dragStart(link, { dataTransfer })
    const blurCall = [...addEventListenerSpy.mock.calls]
      .toReversed()
      .find(([eventName]) => eventName === 'blur')
    if (!blurCall || !(blurCall[1] instanceof Function)) {
      throw new Error('blur handler was not captured')
    }
    blurCall[1](new Event('blur'))
    fireEvent.dragEnd(link, { dataTransfer })

    expect(sendMessageMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: 'urlDropped' }),
      expect.any(Function),
    )
  })

  it('ドラッグ終了後にblurが発生してもurlDroppedメッセージを送らない', () => {
    using addEventListenerSpy = vi.spyOn(window, 'addEventListener')
    const item = {
      url: 'https://example.com/doc',
      title: 'Doc',
      category: undefined,
    }

    render(<ProjectUrlItem {...createProps({ item })} />)

    const link = screen.getByRole('button', { name: 'Doc' })
    const dataTransfer = {
      setData: vi.fn(),
      dropEffect: 'link',
    }

    fireEvent.dragStart(link, { dataTransfer })
    const blurCall = [...addEventListenerSpy.mock.calls]
      .toReversed()
      .find(([eventName]) => eventName === 'blur')
    if (!blurCall || !(blurCall[1] instanceof Function)) {
      throw new Error('blur handler was not captured')
    }
    fireEvent.dragEnd(link, { dataTransfer })
    blurCall[1](new Event('blur'))

    expect(sendMessageMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: 'urlDropped' }),
      expect.any(Function),
    )
  })

  it('dropEffectがcopyならblurなしでもurlDroppedメッセージを送る', () => {
    const item = {
      url: 'https://example.com/doc',
      title: 'Doc',
      category: undefined,
    }

    render(<ProjectUrlItem {...createProps({ item })} />)

    const link = screen.getByRole('button', { name: 'Doc' })
    const dataTransfer = {
      setData: vi.fn(),
      dropEffect: 'copy',
    }

    fireEvent.dragStart(link, { dataTransfer })
    fireEvent.dragEnd(link, { dataTransfer })

    expect(sendMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'urlDropped',
        url: item.url,
        groupId: 'project-1',
        fromExternal: true,
      }),
      expect.any(Function),
    )
  })
})
