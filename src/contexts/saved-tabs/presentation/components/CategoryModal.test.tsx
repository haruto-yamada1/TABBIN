import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

// @vitest-environment jsdom
import type { SavedTabsTabGroupDto as TabGroup } from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDto'

const { categoryModalRootSpy } = vi.hoisted(() => ({
  categoryModalRootSpy: vi.fn(),
}))

vi.mock('./category-modal/CategoryModalRoot', () => ({
  CategoryModalRoot: ({
    children,
    ...props
  }: {
    children: React.ReactNode
    onClose: () => void
    tabGroups: TabGroup[]
  }) => {
    categoryModalRootSpy(props)
    return <div data-testid='category-modal-root'>{children}</div>
  },
}))

vi.mock('./category-modal/CategoryCreateSection', () => ({
  CategoryCreateSection: () => <div data-testid='category-create-section' />,
}))

vi.mock('./category-modal/CategorySelector', () => ({
  CategorySelector: () => <div data-testid='category-selector' />,
}))

vi.mock('./category-modal/DomainSelectionList', () => ({
  DomainSelectionList: () => <div data-testid='domain-selection-list' />,
}))

import { CategoryModal } from './CategoryModal'

describe('CategoryModal', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('CategoryModalRoot に props を渡し、子セクションを描画する', () => {
    const onClose = vi.fn()
    const tabGroups: TabGroup[] = [
      { id: 'group-1', domain: 'example.com', urls: [] },
      { id: 'group-2', domain: 'example.org', urls: [] },
    ]

    const getSavedTabsPageDataQuery = vi.fn(async () => ({
      tabGroups: [],
      parentCategories: [],
      userSettings: {} as never,
    }))

    render(
      <CategoryModal
        getSavedTabsPageDataQuery={getSavedTabsPageDataQuery}
        onClose={onClose}
        tabGroups={tabGroups}
      />,
    )

    expect(categoryModalRootSpy).toHaveBeenCalledTimes(1)
    expect(categoryModalRootSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        getSavedTabsPageDataQuery,
        onClose,
        tabGroups,
      }),
    )

    expect(screen.getByTestId('category-modal-root')).toBeTruthy()
    expect(screen.getByTestId('category-create-section')).toBeTruthy()
    expect(screen.getByTestId('category-selector')).toBeTruthy()
    expect(screen.getByTestId('domain-selection-list')).toBeTruthy()
  })
})
