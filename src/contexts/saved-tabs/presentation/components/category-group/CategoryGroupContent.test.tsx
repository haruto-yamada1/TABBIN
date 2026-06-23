// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

import type { SavedTabsUserSettingsDto as UserSettingsDto } from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDto'
import type { TabGroup } from '@/types/storage'

const {
  sortableDomainCardSpy,
  useCategoryGroupMock,
  useSensorsMock,
  useSensorMock,
} = vi.hoisted(() => ({
  sortableDomainCardSpy: vi.fn(),
  useCategoryGroupMock: vi.fn(),
  useSensorsMock: vi.fn((...sensors: unknown[]) => sensors),
  useSensorMock: vi.fn(() => ({})),
}))

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  KeyboardSensor: class KeyboardSensor {},
  PointerSensor: class PointerSensor {},
  closestCenter: vi.fn(),
  useSensor: useSensorMock,
  useSensors: useSensorsMock,
}))

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  sortableKeyboardCoordinates: vi.fn(),
  verticalListSortingStrategy: vi.fn(),
}))

vi.mock('@/components/ui/card', () => ({
  CardContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}))

vi.mock(
  '@/contexts/saved-tabs/presentation/components/SortableDomainCard',
  () => ({
    SortableDomainCard: (props: Record<string, unknown>) => {
      sortableDomainCardSpy(props)
      return <div data-testid='sortable-domain-card' />
    },
  }),
)

vi.mock('./CategoryGroupContext', () => ({
  useCategoryGroup: useCategoryGroupMock,
}))

import { CategoryGroupContent } from './CategoryGroupContent'

const settings: UserSettingsDto = {
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

const domains: TabGroup[] = [
  {
    id: 'group-1',
    domain: 'example.com',
    urls: [{ id: 'url-1', url: 'https://example.com/a', title: 'A' }],
  },
]

describe('CategoryGroupContent', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('親カテゴリ配下のドメインカードにも handleDeleteUrls を渡す', () => {
    const handleDeleteUrls = vi.fn().mockResolvedValue(undefined)

    useCategoryGroupMock.mockReturnValue({
      state: {
        collapse: { isCollapsed: false },
        sort: { sortedDomains: domains },
        reorder: {
          isReorderMode: false,
          tempDomainOrder: [],
          isDraggingDomains: false,
          handleDragStart: vi.fn(),
          handleDragEnd: vi.fn(),
          handleDeleteSingleDomain: vi.fn(),
        },
      },
      category: { id: 'category-1', name: 'Work' },
      settings,
      searchQuery: '',
      handlers: {
        handleOpenAllTabs: vi.fn(),
        handleDeleteUrl: vi.fn(),
        handleDeleteUrls,
        handleOpenTab: vi.fn(),
        handleUpdateUrls: vi.fn(),
        handleDeleteCategory: vi.fn(),
      },
    })

    render(<CategoryGroupContent />)

    expect(sortableDomainCardSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        group: domains[0],
        handleDeleteUrls,
      }),
    )
  })
})
