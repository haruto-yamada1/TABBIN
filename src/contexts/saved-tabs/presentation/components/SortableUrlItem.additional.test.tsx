// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

import type { SavedTabsUserSettingsDto as UserSettings } from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDto'
import type { MessagingPort } from '@/contexts/saved-tabs/application/ports/MessagingPort'
import type { SortableUrlItemProps } from '@/types/saved-tabs'

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
    // eslint-disable-next-line typescript/consistent-type-imports
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
          (_, token) => values?.[token] ?? '', // eslint-disable-line
        )
      },
    }),
  }
})

import { SavedTabsUseCasesProvider } from '@/contexts/saved-tabs/presentation/controllers/SavedTabsUseCasesContext'

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

describe('SortableUrlItem additional', () => {
  const sendMessageMock = vi.fn()

  beforeEach(() => {
    sendMessageMock.mockResolvedValue(undefined)
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    sortableUrlItemAdditionalI18nState.language = 'ja'
  })

  it('window 内 drop 済みなら外部ドロップ扱いしない', () => {
    renderWithMessagingPort(<SortableUrlItem {...createProps()} />, {
      send: sendMessageMock,
    })

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
    )
  })

  it('Provider 外では外部 drop 判定でも messaging port 通知を no-op にする', () => {
    renderWithMessagingPort(<SortableUrlItem {...createProps()} />)

    const link = screen.getByRole('button', { name: 'Example Tab' })
    const dataTransfer = {
      setData: vi.fn(),
      dropEffect: 'copy',
    }

    expect(() => {
      fireEvent.dragStart(link, { dataTransfer })
      fireEvent.dragEnd(link, { dataTransfer })
    }).not.toThrow()
    expect(dataTransfer.setData).toHaveBeenCalledWith(
      'text/plain',
      'https://example.com',
    )
    expect(dataTransfer.setData).toHaveBeenCalledWith(
      'text/uri-list',
      'https://example.com',
    )
  })

  it('drag 中に window blur して link drop した場合は外部 drop として通知する', () => {
    renderWithMessagingPort(<SortableUrlItem {...createProps()} />, {
      send: sendMessageMock,
    })

    const link = screen.getByRole('button', { name: 'Example Tab' })
    const dataTransfer = {
      setData: vi.fn(),
      dropEffect: 'link',
    }

    fireEvent.dragStart(link, { dataTransfer })
    window.dispatchEvent(new Event('blur'))
    fireEvent.dragEnd(link, { dataTransfer })

    expect(sendMessageMock).toHaveBeenCalledWith({
      action: 'urlDragStarted',
      groupId: 'group-1',
      url: 'https://example.com',
    })
    expect(sendMessageMock).toHaveBeenCalledWith({
      action: 'urlDropped',
      fromExternal: true,
      groupId: 'group-1',
      url: 'https://example.com',
    })
  })

  it('confirmDeleteEach が true の場合は確認後に削除する', () => {
    const props = createProps()
    const handleDeleteUrl = vi.fn()
    renderWithMessagingPort(
      <SortableUrlItem
        {...props}
        handleDeleteUrl={handleDeleteUrl}
        settings={{ ...defaultSettings, confirmDeleteEach: true }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'タブを削除' }))
    expect(handleDeleteUrl).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '削除' }))
    expect(handleDeleteUrl).toHaveBeenCalledWith(
      'group-1',
      'https://example.com',
    )
  })

  it('保存時刻非表示かつ自動削除なしなら補助行を表示しない', () => {
    renderWithMessagingPort(
      <SortableUrlItem
        {...createProps()}
        savedAt={Date.parse('2026-06-02T12:34:56.000Z')}
        autoDeletePeriod='never'
        settings={{
          ...defaultSettings,
          showSavedTime: false,
        }}
      />,
    )

    const link = screen.getByRole('button', { name: 'Example Tab' })
    expect(link.textContent).not.toContain('2026/06/02')
  })
})
