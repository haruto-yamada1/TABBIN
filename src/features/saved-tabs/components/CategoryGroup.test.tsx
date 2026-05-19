// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { CategoryGroupProps } from '@/types/saved-tabs'
import type { ParentCategory, TabGroup, UserSettings } from '@/types/storage'

const { categoryGroupRootSpy } = vi.hoisted(() => ({
  categoryGroupRootSpy: vi.fn(),
}))

vi.mock('./category-group/CategoryGroupRoot', () => ({
  CategoryGroupRoot: ({
    children,
    ...props
  }: {
    children: React.ReactNode
  }) => {
    categoryGroupRootSpy(props)
    return <div data-testid='category-group-root'>{children}</div>
  },
}))

vi.mock('./category-group/CategoryGroupHeader', () => ({
  CategoryGroupHeader: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='category-group-header'>{children}</div>
  ),
}))

vi.mock('./category-group/CategoryGroupControls', () => ({
  CategoryGroupCollapseControl: () => (
    <div data-testid='category-group-collapse-button' />
  ),
  CategoryGroupSortControl: () => (
    <div data-testid='category-group-sort-button' />
  ),
  CategoryGroupReorderControl: () => (
    <div data-testid='category-group-reorder-controls' />
  ),
}))

vi.mock('./category-group/CategoryGroupTitle', () => ({
  CategoryGroupTitle: () => <div data-testid='category-group-title' />,
}))

vi.mock('./category-group/CategoryGroupActions', () => ({
  CategoryGroupActions: () => <div data-testid='category-group-actions' />,
}))

vi.mock('./category-group/CategoryGroupContent', () => ({
  CategoryGroupContent: () => <div data-testid='category-group-content' />,
}))

import { CategoryGroup } from './CategoryGroup'

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
  overrides: Partial<CategoryGroupProps> = {},
): CategoryGroupProps => {
  const category: ParentCategory = {
    id: 'parent-1',
    name: 'Work',
    domains: ['group-1'],
    domainNames: ['example.com'],
  }
  const domains: TabGroup[] = [
    { id: 'group-1', domain: 'example.com', urls: [] },
  ]

  return {
    category,
    domains,
    handleOpenAllTabs: vi.fn(),
    handleDeleteGroup: vi.fn(),
    handleDeleteUrl: vi.fn(),
    handleOpenTab: vi.fn(),
    handleUpdateUrls: vi.fn(),
    handleUpdateDomainsOrder: vi.fn(),
    handleMoveDomainToCategory: vi.fn(),
    handleDeleteCategory: vi.fn(),
    settings: defaultSettings,
    ...overrides,
  }
}

describe('CategoryGroup', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('CategoryGroupRoot に handlers とデフォルト値を渡し、構成要素を描画する', () => {
    const props = createProps()

    render(<CategoryGroup {...props} />)

    expect(categoryGroupRootSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        category: props.category,
        domains: props.domains,
        settings: props.settings,
        isCategoryReorderMode: false,
        searchQuery: '',
        handlers: expect.objectContaining({
          handleOpenAllTabs: props.handleOpenAllTabs,
          handleDeleteGroup: props.handleDeleteGroup,
          handleDeleteUrl: props.handleDeleteUrl,
          handleOpenTab: props.handleOpenTab,
          handleUpdateUrls: props.handleUpdateUrls,
          handleUpdateDomainsOrder: props.handleUpdateDomainsOrder,
          handleMoveDomainToCategory: props.handleMoveDomainToCategory,
          handleDeleteCategory: props.handleDeleteCategory,
        }),
      }),
    )

    expect(screen.getByTestId('category-group-root')).toBeTruthy()
    expect(screen.getByTestId('category-group-header')).toBeTruthy()
    expect(screen.getByTestId('category-group-collapse-button')).toBeTruthy()
    expect(screen.getByTestId('category-group-sort-button')).toBeTruthy()
    expect(screen.getByTestId('category-group-title')).toBeTruthy()
    expect(screen.getByTestId('category-group-reorder-controls')).toBeTruthy()
    expect(screen.getByTestId('category-group-actions')).toBeTruthy()
    expect(screen.getByTestId('category-group-content')).toBeTruthy()
  })

  it('isCategoryReorderMode と searchQuery の明示値を CategoryGroupRoot に渡す', () => {
    render(
      <CategoryGroup
        {...createProps({
          isCategoryReorderMode: true,
          searchQuery: 'example',
        })}
      />,
    )

    expect(categoryGroupRootSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        isCategoryReorderMode: true,
        searchQuery: 'example',
      }),
    )
  })
})
