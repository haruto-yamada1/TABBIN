// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

import type { SavedTabsUserSettingsDto as UserSettings } from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDto'
import type { MessagingPort } from '@/contexts/saved-tabs/application/ports/MessagingPort'

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

import { SavedTabsUseCasesProvider } from '@/contexts/saved-tabs/presentation/controllers/SavedTabsUseCasesContext'

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

/**
 * `ProjectUrlItem` は `useSavedTabsUseCases()` 経由で `messagingPort` を
 * 取り出す (issue #531)。テストではモック port を context 経由で注入する。
 * 渡さない (provider なし) のときは messagingPort が undefined になり、
 * 内部で `void port.send(...)` を呼ぶ経路が no-op になる。
 */
const renderWithMessagingPort = (
  ui: React.ReactElement,
  messagingPort?: MessagingPort,
) => {
  if (!messagingPort) {
    return render(ui)
  }
  const deps = {
    browserTabPort: { open: vi.fn() },
    browserWindowPort: { openWithUrls: vi.fn() },
    categoryAssignmentPort: {
      saveParentCategories: vi.fn(),
      saveTabGroups: vi.fn(),
    },
    categoriesCommandService: { updateDomainCategorySettings: vi.fn() },
    customProjectsCommandService: {
      addCategoryToProject: vi.fn(),
      addUrlToCustomProject: vi.fn(),
      moveUrlBetweenCustomProjects: vi.fn(),
      removeCategoryFromProject: vi.fn(),
      removeUrlFromCustomProject: vi.fn(),
      removeUrlIdsFromAllCustomProjects: vi.fn(),
      removeUrlsFromAllCustomProjects: vi.fn(),
      removeUrlsFromCustomProject: vi.fn(),
      renameCategoryInProject: vi.fn(),
      reorderProjectUrls: vi.fn(),
      setUrlCategory: vi.fn(),
      updateCategoryOrder: vi.fn(),
      updateProjectKeywords: vi.fn(),
    },
    customProjectRepository: {} as never,
    domainCategoryMappingRepository: {} as never,
    domainCategorySettingsRepository: {} as never,
    migrationPort: {} as never,
    messagingPort,
    notificationPort: { error: vi.fn(), info: vi.fn(), success: vi.fn() },
    parentCategoryRepository: {} as never,
    removeSubCategoryFromTabGroupPort: {
      removeSubCategoryFromTabGroup: vi.fn(),
    },
    setCategoryKeywordsPort: { setCategoryKeywords: vi.fn() },
    storageChangePort: { subscribe: () => () => {} },
    tabGroupRepository: {} as never,
    urlRecordRepository: {} as never,
    userSettingsRepository: {} as never,
  } as never
  return render(
    <SavedTabsUseCasesProvider value={{ deps, useCases: {} as never }}>
      {ui}
    </SavedTabsUseCasesProvider>,
  )
}

describe('ProjectUrlItem', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sendMessageMock.mockResolvedValue(undefined)
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
  it('未分類URLを描画しリンククリックと即時削除を処理する', async () => {
    const user = userEvent.setup()
    const handleOpenUrl = vi.fn()
    const handleDeleteUrl = vi.fn()
    const item = {
      url: 'https://example.com/long/path',
      title: '',
      notes: 'memo',
    }

    renderWithMessagingPort(
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
    await user.click(link)
    expect(handleOpenUrl).toHaveBeenCalledWith(item.url)

    await user.click(screen.getByRole('button', { name: 'タブを削除' }))
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
    const user = userEvent.setup()
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

    renderWithMessagingPort(
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

    await user.click(screen.getByRole('button', { name: 'タブを削除' }))
    const confirmButton = await screen.findByRole('button', {
      name: '削除',
    })
    await user.click(confirmButton)

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

  it('外部D&D成立時に MessagingPort.send を urlDropped メッセージで呼ぶ', () => {
    using addEventListenerSpy = vi.spyOn(window, 'addEventListener')
    const item = {
      url: 'https://example.com/doc',
      title: 'Doc',
      category: undefined,
    }

    renderWithMessagingPort(<ProjectUrlItem {...createProps({ item })} />, {
      send: sendMessageMock,
    })

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
    )
  })

  it('dropEffectがlink以外なら MessagingPort.send を urlDropped で呼ばない', () => {
    using addEventListenerSpy = vi.spyOn(window, 'addEventListener')
    const item = {
      url: 'https://example.com/doc',
      title: 'Doc',
      category: undefined,
    }

    renderWithMessagingPort(<ProjectUrlItem {...createProps({ item })} />, {
      send: sendMessageMock,
    })

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
    )
  })

  it('ドラッグ終了後にblurが発生しても MessagingPort.send を urlDropped で呼ばない', () => {
    using addEventListenerSpy = vi.spyOn(window, 'addEventListener')
    const item = {
      url: 'https://example.com/doc',
      title: 'Doc',
      category: undefined,
    }

    renderWithMessagingPort(<ProjectUrlItem {...createProps({ item })} />, {
      send: sendMessageMock,
    })

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
    )
  })

  it('dropEffectがcopyならblurなしでも MessagingPort.send を urlDropped で呼ぶ', () => {
    const item = {
      url: 'https://example.com/doc',
      title: 'Doc',
      category: undefined,
    }

    renderWithMessagingPort(<ProjectUrlItem {...createProps({ item })} />, {
      send: sendMessageMock,
    })

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
    )
  })

  it('dragStart で MessagingPort.send を urlDragStarted メッセージで呼ぶ', () => {
    const item = {
      url: 'https://example.com/doc',
      title: 'Doc',
      category: undefined,
    }

    renderWithMessagingPort(<ProjectUrlItem {...createProps({ item })} />, {
      send: sendMessageMock,
    })

    const link = screen.getByRole('button', { name: 'Doc' })
    const dataTransfer = {
      setData: vi.fn(),
      dropEffect: 'none',
    }

    fireEvent.dragStart(link, { dataTransfer })

    expect(sendMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'urlDragStarted',
        url: item.url,
        groupId: 'project-1',
      }),
    )
  })
})
