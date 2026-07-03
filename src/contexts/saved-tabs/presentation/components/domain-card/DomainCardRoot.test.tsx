// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

import type { ReorderTabGroupUrlsUseCase } from '@/contexts/saved-tabs/application/use-cases/ReorderTabGroupUrlsUseCase'

import type { DomainCardContextType } from './DomainCardContext'

const { useDomainCardStateMock, useSortableMock, useDndMonitorMock } =
  vi.hoisted(() => ({
    useDomainCardStateMock: vi.fn(),
    useSortableMock: vi.fn(),
    useDndMonitorMock: vi.fn(),
  }))

vi.mock('@dnd-kit/core', () => ({
  useDndMonitor: (handlers: unknown) => useDndMonitorMock(handlers),
}))

vi.mock('@dnd-kit/sortable', () => ({
  useSortable: () => useSortableMock(),
}))

vi.mock('@dnd-kit/utilities', () => ({
  CSS: {
    Transform: {
      toString: () => undefined,
    },
  },
}))

vi.mock('../../hooks/useDomainCardState', () => ({
  useDomainCardState: () => useDomainCardStateMock(),
}))

import { useDomainCard } from './DomainCardContext'
import { DomainCardRoot } from './DomainCardRoot'

const defaultHandlers = {
  handleOpenAllTabs: vi.fn(),
  handleDeleteGroup: vi.fn(),
  handleDeleteUrl: vi.fn(),
  handleOpenTab: vi.fn(),
  handleUpdateUrls: vi.fn(),
}

const Consumer = () => {
  const { visibleSubCategoryCount } = useDomainCard()
  return <div>{visibleSubCategoryCount}</div>
}

const createState = (): DomainCardContextType['state'] => {
  const categorizedUrls: DomainCardContextType['state']['computed']['categorizedUrls'] =
    {
      news: [{ url: 'https://example.com/news', title: 'News' }],
      tech: [{ url: 'https://example.com/tech', title: 'Tech' }],
      empty: [],
    }
  categorizedUrls.__uncategorized = [
    { url: 'https://example.com', title: 'Root' },
  ]

  return {
    collapse: {
      isCollapsed: false,
      setIsCollapsed: vi.fn(),
      userCollapsedState: false,
      setUserCollapsedState: vi.fn(),
    },
    sort: {
      sortOrder: 'default',
      setSortOrder: vi.fn(),
    },
    categoryReorder: {
      isCategoryReorderMode: false,
      tempCategoryOrder: [],
      allCategoryIds: [],
      handleCategoryDragEnd: vi.fn(),
      handleConfirmCategoryReorder: vi.fn(),
      handleCancelCategoryReorder: vi.fn(),
    },
    computed: {
      categorizedUrls,
    },
    keywordModal: {
      showKeywordModal: false,
      setShowKeywordModal: vi.fn(),
      handleCloseKeywordModal: vi.fn(),
    },
    parentCategories: {
      categories: [],
      handleCreateParentCategory: vi.fn(),
      handleAssignToParentCategory: vi.fn(),
      handleUpdateParentCategories: vi.fn(),
    },
    categoryActions: {
      handleCategoryDelete: vi.fn(),
      handleDeleteAllTabsInCategory: vi.fn(),
    },
    dndMonitorHandlers: {
      onDragStart: vi.fn(),
      onDragEnd: vi.fn(),
      onDragCancel: vi.fn(),
    },
  }
}

describe('DomainCardRoot', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('親カテゴリ配下では表示中の子カテゴリ数だけをコンテキストに渡す', () => {
    useSortableMock.mockReturnValue({
      attributes: {},
      listeners: {},
      setNodeRef: vi.fn(),
      transform: null,
      transition: undefined,
    })
    useDomainCardStateMock.mockReturnValue(createState())

    render(
      <DomainCardRoot
        group={{
          id: 'group-1',
          domain: 'example.com',
          urls: [{ url: 'https://example.com', title: 'Example' }],
          subCategories: ['news', 'tech', 'empty'],
        }}
        settings={{
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
        }}
        categoryId='parent-1'
        handlers={defaultHandlers}
        reorderTabGroupUrlsUseCase={vi.fn<ReorderTabGroupUrlsUseCase>()}
      >
        <Consumer />
      </DomainCardRoot>,
    )

    const root = screen.getByTestId('domain-scroll-target')
    expect(root?.style.contentVisibility).toBe('auto')
    expect(root?.style.containIntrinsicSize).toBe('360px')
    expect(screen.getByText('2')).toBeTruthy()
  })

  it('親カテゴリ配下でない場合は子カテゴリ数を 0 にする', () => {
    useSortableMock.mockReturnValue({
      attributes: {},
      listeners: {},
      setNodeRef: vi.fn(),
      transform: null,
      transition: undefined,
    })
    useDomainCardStateMock.mockReturnValue(createState())

    render(
      <DomainCardRoot
        group={{
          id: 'group-1',
          domain: 'example.com',
          urls: [{ url: 'https://example.com', title: 'Example' }],
          subCategories: ['news', 'tech', 'empty'],
        }}
        settings={{
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
        }}
        handlers={defaultHandlers}
        reorderTabGroupUrlsUseCase={vi.fn<ReorderTabGroupUrlsUseCase>()}
      >
        <Consumer />
      </DomainCardRoot>,
    )

    expect(screen.getByText('0')).toBeTruthy()
  })
})
