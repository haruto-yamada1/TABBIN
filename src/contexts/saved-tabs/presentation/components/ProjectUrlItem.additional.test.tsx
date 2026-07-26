// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

import type { SavedTabsUserSettingsDto as UserSettings } from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDto'
import type { MessagingPort } from '@/contexts/saved-tabs/application/ports/MessagingPort'

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

import { SavedTabsUseCasesProvider } from '@/contexts/saved-tabs/presentation/controllers/SavedTabsUseCasesContext'

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

describe('ProjectUrlItem additional', () => {
  const sendMessageMock = vi.fn()

  beforeEach(() => {
    sendMessageMock.mockResolvedValue(undefined)
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('window 内 drop 済みなら MessagingPort.send を urlDropped で呼ばない', () => {
    renderWithMessagingPort(<ProjectUrlItem {...createProps()} />, {
      send: sendMessageMock,
    })

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
    )
  })
})
