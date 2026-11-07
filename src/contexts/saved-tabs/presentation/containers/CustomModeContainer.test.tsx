// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  createSavedTabsPresentationPortsStub,
  createSavedTabsUseCasesStub,
} from '@/contexts/saved-tabs/application/testing/SavedTabsPresentationStubs'
import type { GetProjectUrlsUseCase } from '@/contexts/saved-tabs/application/use-cases/GetProjectUrlsUseCase'
import { SavedTabsUseCasesProvider } from '@/contexts/saved-tabs/presentation/controllers/SavedTabsUseCasesContext'
import type {
  SavedTabsCustomProjectDto as CustomProject,
  SavedTabsUserSettingsDto as UserSettingsDto,
} from '@/contexts/saved-tabs/presentation/types/SavedTabsCompatibilityViewModel'

vi.mock('@/features/i18n/context/I18nProvider', () => ({
  useI18n: () => ({
    t: (key: string) =>
      (
        {
          'common.loading': 'Loading...',
          'common.loadingLabel': 'Loading',
        } satisfies Record<string, string>
      )[key] ?? key,
  }),
}))

vi.mock(
  '@/contexts/saved-tabs/presentation/components/CustomProjectSection',
  () => ({
    CustomProjectSection: () => <div>custom-project-section</div>,
  }),
)

vi.mock(
  '@/contexts/saved-tabs/presentation/components/OpenTabsSection',
  () => ({
    OpenTabsSection: ({ rows }: { rows: { title: string }[] }) => (
      <div data-testid='open-tabs-section'>
        {rows.map((row) => row.title).join(',')}
      </div>
    ),
  }),
)

import { CustomModeContainer } from './CustomModeContainer'

const defaultSettings: UserSettingsDto = {
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

const renderContainer = (
  props: {
    openUrls?: string[]
  } & Parameters<typeof CustomModeContainer>[0],
) => {
  const { openUrls, ...containerProps } = props
  const port = {
    getSnapshot: () => false,
    subscribe: () => () => {},
    getOpenUrlsSnapshot: () => openUrls ?? [],
    subscribeOpenUrls: () => () => {},
  }
  return render(
    <SavedTabsUseCasesProvider
      value={{
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        deps: {
          ...createSavedTabsPresentationPortsStub(),
          openSavedTabsPort: port as never,
        },
        useCases: createSavedTabsUseCasesStub(),
      }}
    >
      <CustomModeContainer {...containerProps} />
    </SavedTabsUseCasesProvider>,
  )
}

const baseProps = {
  isLoading: false,
  projects: [] as CustomProject[],
  settings: defaultSettings,
  handleOpenUrl: vi.fn(),
  handleDeleteUrl: vi.fn(),
  handleDeleteUrlsFromProject: vi.fn(),
  handleAddUrl: vi.fn(),
  handleCreateProject: vi.fn(),
  handleDeleteProject: vi.fn(),
  handleRenameProject: vi.fn(),
  handleUpdateProjectKeywords: vi.fn(),
  handleAddCategory: vi.fn(),
  handleDeleteCategory: vi.fn(),
  handleSetUrlCategory: vi.fn(),
  handleUpdateCategoryOrder: vi.fn(),
  handleReorderUrls: vi.fn(),
  handleOpenAllUrls: vi.fn(),
  handleMoveUrlBetweenProjects: vi.fn(),
  handleMoveUrlsBetweenCategories: vi.fn(),
  handleReorderProjects: vi.fn(),
  handleRenameCategory: vi.fn(),
}

describe('CustomModeContainer', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('renders a spinner-only loading state', () => {
    renderContainer({
      ...baseProps,
      getProjectUrlsUseCase: vi.fn(async () => []),
      isLoading: true,
      searchQuery: '',
    })

    expect(screen.getByRole('status')).toBeTruthy()
    expect(screen.queryByText('Loading...')).toBeNull()
    expect(screen.queryByText('custom-project-section')).toBeNull()
  })

  it('renders the custom project section when loaded and no url is open', async () => {
    const getProjectUrlsUseCase: GetProjectUrlsUseCase = async () => []
    renderContainer({
      ...baseProps,
      getProjectUrlsUseCase: vi.fn(getProjectUrlsUseCase),
      projects: [
        {
          id: 'p1',
          name: 'p1',
          categories: [],
          createdAt: 1,
          updatedAt: 2,
        },
      ],
      searchQuery: '',
    })

    expect(await screen.findByText('custom-project-section')).toBeTruthy()
    await waitFor(() => {
      expect(screen.queryByTestId('open-tabs-section')).toBeNull()
    })
  })

  it.each([{}, { showOpenTabs: true }])(
    'renders the open tabs section above projects with %j',
    async (setting) => {
      const getProjectUrlsSpy = vi
        .fn<GetProjectUrlsUseCase>()
        .mockImplementation(async (project) =>
          project.id === 'project-1'
            ? [
                {
                  id: 'u1',
                  title: 'A',
                  url: 'https://example.com/a',
                  savedAt: 0,
                },
              ]
            : [],
        )
      renderContainer({
        ...baseProps,
        settings: { ...defaultSettings, ...setting },
        getProjectUrlsUseCase: getProjectUrlsSpy,
        openUrls: ['https://example.com/a'],
        projects: [
          {
            id: 'project-1',
            name: 'project-1',
            categories: [],
            createdAt: 1,
            updatedAt: 2,
            urls: [{ id: 'u1', title: 'A', url: 'https://example.com/a' }],
          },
        ],
        searchQuery: '',
      })

      await screen.findByText('A')
      const section = screen.getByTestId('open-tabs-section')
      const projectSection = screen.getByText('custom-project-section')
      const position = section.compareDocumentPosition(projectSection)
      expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    },
  )

  it('omits the open tabs section while searching', async () => {
    const getProjectUrlsSpy = vi
      .fn<GetProjectUrlsUseCase>()
      .mockImplementation(async (project) =>
        project.id === 'project-1'
          ? [
              {
                id: 'u1',
                title: 'A',
                url: 'https://example.com/a',
                savedAt: 0,
              },
            ]
          : [],
      )
    renderContainer({
      ...baseProps,
      settings: { ...defaultSettings, showOpenTabs: true },
      getProjectUrlsUseCase: getProjectUrlsSpy,
      openUrls: ['https://example.com/a'],
      searchQuery: 'a',
      projects: [
        {
          id: 'project-1',
          name: 'project-1',
          categories: [],
          createdAt: 1,
          updatedAt: 2,
          urls: [{ id: 'u1', title: 'A', url: 'https://example.com/a' }],
        },
      ],
    })

    expect(await screen.findByText('custom-project-section')).toBeTruthy()
    expect(screen.queryByTestId('open-tabs-section')).toBeNull()
  })

  it.each([{ showOpenTabs: false }])(
    '表示設定が明示OFFなら表示せず追加のURL読込をしない: %j',
    (setting) => {
      const getProjectUrlsUseCase = vi.fn(async () => [])
      renderContainer({
        ...baseProps,
        settings: { ...defaultSettings, ...setting },
        getProjectUrlsUseCase,
        openUrls: ['https://example.com/a'],
        projects: [
          {
            id: 'p1',
            name: 'p1',
            categories: [],
            createdAt: 1,
            updatedAt: 2,
          },
        ],
        searchQuery: '',
      })
      expect(screen.queryByTestId('open-tabs-section')).toBeNull()
      expect(getProjectUrlsUseCase).not.toHaveBeenCalled()
    },
  )
})
