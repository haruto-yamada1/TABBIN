// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

import type { UserSettingsDto } from '@/contexts/saved-tabs/domain/dto/UserSettingsDto'
import type { CustomProject } from '@/types/storage'

vi.mock('@/features/i18n/context/I18nProvider', () => ({
  useI18n: () => ({
    t: (key: string) =>
      (
        ({
          'common.loading': 'Loading...',
          'common.loadingLabel': 'Loading',
        }) satisfies Record<string, string>
      )[key] ?? key,
  }),
}))

vi.mock(
  '@/contexts/saved-tabs/presentation/components/CustomProjectSection',
  () => ({
    CustomProjectSection: () => <div>custom-project-section</div>,
  }),
)

import { CustomModeContainer } from './CustomModeContainer'

const defaultSettings: UserSettingsDto = {
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
  getProjectUrlsUseCase: vi.fn(async () => []),
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
})

describe('CustomModeContainer', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('renders a spinner-only loading state', () => {
    render(<CustomModeContainer {...createProps()} isLoading />)

    expect(screen.getByRole('status')).toBeTruthy()
    expect(screen.queryByText('Loading...')).toBeNull()
    expect(screen.queryByText('custom-project-section')).toBeNull()
  })

  it('renders the custom project section when loaded', () => {
    render(<CustomModeContainer {...createProps()} />)

    expect(screen.getByText('custom-project-section')).toBeTruthy()
  })
})
