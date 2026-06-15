// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

import type { UserSettingsDto as UserSettings } from '@/contexts/saved-tabs/domain/dto/UserSettingsDto'
import type { CustomProjectCardProps } from '@/contexts/saved-tabs/presentation/types/CustomProjectCard.types'

const { projectCardRootSpy } = vi.hoisted(() => ({
  projectCardRootSpy: vi.fn(),
}))

vi.mock('./project-card/ProjectCardRoot', () => ({
  ProjectCardRoot: ({ children, ...props }: { children: React.ReactNode }) => {
    projectCardRootSpy(props)
    return <div data-testid='project-card-root'>{children}</div>
  },
}))

vi.mock('./project-card/ProjectCardCategoryList', () => ({
  ProjectCardCategoryList: () => (
    <div data-testid='project-card-category-list' />
  ),
}))

vi.mock('./project-card/ProjectCardUncategorizedArea', () => ({
  ProjectCardUncategorizedArea: () => (
    <div data-testid='project-card-uncategorized-area' />
  ),
}))

vi.mock('./project-card/ProjectCardDragOverlay', () => ({
  ProjectCardDragOverlay: () => <div data-testid='project-card-drag-overlay' />,
}))

import { CustomProjectCard } from './CustomProjectCard'

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
  overrides: Partial<CustomProjectCardProps> = {},
): CustomProjectCardProps => ({
  project: {
    id: 'project-1',
    name: 'Project A',
    categories: ['Backlog'],
    createdAt: 1,
    updatedAt: 2,
    urls: [],
  },
  handleOpenUrl: vi.fn(),
  handleDeleteUrl: vi.fn(),
  handleAddUrl: vi.fn(),
  handleDeleteProject: vi.fn(),
  handleRenameProject: vi.fn(),
  handleAddCategory: vi.fn(),
  handleDeleteCategory: vi.fn(),
  handleSetUrlCategory: vi.fn(),
  handleUpdateCategoryOrder: vi.fn(),
  handleReorderUrls: vi.fn(),
  handleOpenAllUrls: vi.fn(),
  settings: defaultSettings,
  ...overrides,
})

describe('CustomProjectCard', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('ProjectCardRoot に handlers/hookHandlers を渡し、isDropTarget はデフォルト false', () => {
    const props = createProps()

    render(<CustomProjectCard {...props} />)

    expect(projectCardRootSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        project: props.project,
        settings: props.settings,
        draggedItem: undefined,
        isDropTarget: false,
        handlers: expect.objectContaining({
          handleOpenUrl: props.handleOpenUrl,
          handleDeleteUrl: props.handleDeleteUrl,
          handleAddCategory: props.handleAddCategory,
          handleDeleteCategory: props.handleDeleteCategory,
          handleRenameCategory: props.handleRenameCategory,
          handleSetUrlCategory: props.handleSetUrlCategory,
          handleOpenAllUrls: props.handleOpenAllUrls,
        }),
        hookHandlers: expect.objectContaining({
          handleDeleteUrl: props.handleDeleteUrl,
          handleSetUrlCategory: props.handleSetUrlCategory,
          handleUpdateCategoryOrder: props.handleUpdateCategoryOrder,
          handleReorderUrls: props.handleReorderUrls,
        }),
      }),
    )

    expect(screen.getByTestId('project-card-root')).toBeTruthy()
    expect(screen.getByTestId('project-card-category-list')).toBeTruthy()
    expect(screen.getByTestId('project-card-uncategorized-area')).toBeTruthy()
    expect(screen.getByTestId('project-card-drag-overlay')).toBeTruthy()
  })

  it('isDropTarget と draggedItem と cross-project drag 状態の明示値を ProjectCardRoot に渡す', () => {
    const draggedItem = {
      url: 'https://example.com',
      projectId: 'project-1',
      title: 'Example',
    }

    render(
      <CustomProjectCard
        {...createProps({
          draggedItem,
          isDropTarget: true,
          isCrossProjectUrlDragActive: true,
        })}
      />,
    )

    expect(projectCardRootSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        draggedItem,
        isDropTarget: true,
        isCrossProjectUrlDragActive: true,
      }),
    )
  })
})
