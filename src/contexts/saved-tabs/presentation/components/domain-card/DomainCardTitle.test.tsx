// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

const { useDomainCardMock } = vi.hoisted(() => ({
  useDomainCardMock: vi.fn(),
}))

vi.mock('@/components/ui/badge', () => ({
  Badge: ({
    children,
    ...props
  }: React.ComponentPropsWithoutRef<'span'> & {
    variant?: string
  }) => <span {...props}>{children}</span>,
}))

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}))

vi.mock('../shared/SavedTabsResponsive', () => ({
  SavedTabsResponsiveTooltipContent: ({
    children,
  }: {
    children: React.ReactNode
    side?: string
  }) => <span>{children}</span>,
}))

vi.mock('./DomainCardContext', () => ({
  useDomainCard: () => useDomainCardMock(),
}))

import { DomainCardTitle } from './DomainCardTitle'

describe('DomainCardTitle', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('親カテゴリ配下ではタブ数の右に子カテゴリ数を表示する', () => {
    useDomainCardMock.mockReturnValue({
      group: {
        id: 'group-1',
        domain: 'example.com',
        urls: [{ url: 'https://example.com/a', title: 'A' }],
      },
      categoryId: 'parent-1',
      visibleSubCategoryCount: 2,
      sortable: {
        attributes: {},
        listeners: {},
      },
    })

    render(<DomainCardTitle />)

    expect(screen.getByText('example.com')).toBeTruthy()
    const dragHandle = screen.getByTestId('drag-handle')
    expect(dragHandle).not.toHaveClass('text-muted-foreground/80')
    expect(screen.getByText('1')).toBeTruthy()
    expect(screen.getByText('タブ数')).toBeTruthy()
    expect(screen.getByText('2')).toBeTruthy()
    expect(screen.getByText('子カテゴリ数')).toBeTruthy()
  })

  it('親カテゴリ配下でない場合は子カテゴリ数を表示しない', () => {
    useDomainCardMock.mockReturnValue({
      group: {
        id: 'group-1',
        domain: 'example.com',
        urls: [{ url: 'https://example.com/a', title: 'A' }],
      },
      categoryId: undefined,
      visibleSubCategoryCount: 2,
      sortable: {
        attributes: {},
        listeners: {},
      },
    })

    render(<DomainCardTitle />)

    expect(screen.queryByText('子カテゴリ数')).toBeNull()
  })
})
