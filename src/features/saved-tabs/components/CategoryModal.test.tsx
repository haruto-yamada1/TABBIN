// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

import type { TabGroup } from '@/types/storage'

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
    // eslint-disable-next-line react-perf/jsx-no-new-array-as-prop
    const tabGroups: TabGroup[] = [
      { id: 'group-1', domain: 'example.com', urls: [] },
      { id: 'group-2', domain: 'example.org', urls: [] },
    ]

    render(<CategoryModal onClose={onClose} tabGroups={tabGroups} />)

    expect(categoryModalRootSpy).toHaveBeenCalledTimes(1)
    expect(categoryModalRootSpy).toHaveBeenCalledWith(
      expect.objectContaining({
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
