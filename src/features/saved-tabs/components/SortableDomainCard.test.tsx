// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

import type { SortableDomainCardProps } from '@/types/saved-tabs'
import type { TabGroup, UserSettings } from '@/types/storage'

const { domainCardRootSpy } = vi.hoisted(() => ({
  domainCardRootSpy: vi.fn(),
}))

vi.mock('./domain-card/DomainCardRoot', () => ({
  DomainCardRoot: ({ children, ...props }: { children: React.ReactNode }) => {
    domainCardRootSpy(props)
    return <div data-testid='domain-card-root'>{children}</div>
  },
}))

vi.mock('./domain-card/DomainCardHeader', () => ({
  DomainCardHeader: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='domain-card-header'>{children}</div>
  ),
}))

vi.mock('./domain-card/DomainCardControls', () => ({
  DomainCardCollapseControl: () => (
    <div data-testid='domain-card-collapse-button' />
  ),
  DomainCardSortControl: () => <div data-testid='domain-card-sort-button' />,
  DomainCardReorderControl: () => (
    <div data-testid='domain-card-reorder-controls' />
  ),
}))

vi.mock('./domain-card/DomainCardTitle', () => ({
  DomainCardTitle: () => <div data-testid='domain-card-title' />,
}))

vi.mock('./domain-card/DomainCardActions', () => ({
  DomainCardActions: () => <div data-testid='domain-card-actions' />,
}))

vi.mock('./domain-card/DomainCardContent', () => ({
  DomainCardContent: () => <div data-testid='domain-card-content' />,
}))

import { SortableDomainCard } from './SortableDomainCard'

type SortableDomainCardComponentProps = SortableDomainCardProps & {
  settings: UserSettings
}

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
  overrides: Partial<SortableDomainCardComponentProps> = {},
): SortableDomainCardComponentProps => {
  const group: TabGroup = {
    id: 'group-1',
    domain: 'example.com',
    urls: [],
  }

  return {
    group,
    handleOpenAllTabs: vi.fn(),
    handleDeleteGroup: vi.fn(),
    handleDeleteUrl: vi.fn(),
    handleOpenTab: vi.fn(),
    handleUpdateUrls: vi.fn(),
    handleDeleteCategory: vi.fn(),
    categoryId: 'parent-1',
    isDraggingOver: true,
    settings: defaultSettings,
    ...overrides,
  }
}

describe('SortableDomainCard', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('DomainCardRoot に handlers とデフォルト値を渡し、構成要素を描画する', () => {
    const props = createProps()

    render(<SortableDomainCard {...props} />)

    expect(domainCardRootSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        group: props.group,
        settings: props.settings,
        categoryId: props.categoryId,
        isReorderMode: false,
        searchQuery: '',
        handleDeleteCategory: props.handleDeleteCategory,
        handlers: expect.objectContaining({
          handleOpenAllTabs: props.handleOpenAllTabs,
          handleDeleteGroup: props.handleDeleteGroup,
          handleDeleteUrl: props.handleDeleteUrl,
          handleOpenTab: props.handleOpenTab,
          handleUpdateUrls: props.handleUpdateUrls,
        }),
      }),
    )

    expect(screen.getByTestId('domain-card-root')).toBeTruthy()
    expect(screen.getByTestId('domain-card-header')).toBeTruthy()
    expect(screen.getByTestId('domain-card-collapse-button')).toBeTruthy()
    expect(screen.getByTestId('domain-card-sort-button')).toBeTruthy()
    expect(screen.getByTestId('domain-card-title')).toBeTruthy()
    expect(screen.getByTestId('domain-card-reorder-controls')).toBeTruthy()
    expect(screen.getByTestId('domain-card-actions')).toBeTruthy()
    expect(screen.getByTestId('domain-card-content')).toBeTruthy()
  })

  it('isReorderMode と searchQuery の明示値を DomainCardRoot に渡す', () => {
    render(
      <SortableDomainCard
        {...createProps({
          isReorderMode: true,
          searchQuery: 'example',
        })}
      />,
    )

    expect(domainCardRootSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        isReorderMode: true,
        searchQuery: 'example',
      }),
    )
  })
})
