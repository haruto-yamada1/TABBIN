import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

// @vitest-environment jsdom
import type {
  SavedTabsParentCategoryDto as ParentCategory,
  SavedTabsTabGroupDto as TabGroup,
} from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDto'
import type { CategoryKeywordModalProps } from '@/contexts/saved-tabs/presentation/types/SavedTabsComponentProps'

const { keywordModalRootSpy } = vi.hoisted(() => ({
  keywordModalRootSpy: vi.fn(),
}))

vi.mock('./keyword-modal/KeywordModalRoot', () => ({
  KeywordModalRoot: ({
    children,
    ...props
  }: {
    children: React.ReactNode
    group: TabGroup
    isOpen: boolean
    onClose: () => void
    onSave: CategoryKeywordModalProps['onSave']
    onDeleteCategory: CategoryKeywordModalProps['onDeleteCategory']
    initialParentCategories: ParentCategory[]
    onUpdateParentCategories?: CategoryKeywordModalProps['onUpdateParentCategories']
    deps: {
      categoryAssignmentPort: unknown
      getSavedTabsPageDataQuery: unknown
    }
  }) => {
    keywordModalRootSpy(props)
    return <div data-testid='keyword-modal-root'>{children}</div>
  },
}))

vi.mock('./keyword-modal/SubCategoryAddSection', () => ({
  SubCategoryAddSection: () => <div data-testid='sub-category-add-section' />,
}))

vi.mock('./keyword-modal/SubCategorySelector', () => ({
  SubCategorySelector: () => <div data-testid='sub-category-selector' />,
}))

vi.mock('./keyword-modal/KeywordEditor', () => ({
  KeywordEditor: () => <div data-testid='keyword-editor' />,
}))

import { CategoryKeywordModal } from './CategoryKeywordModal'

const createMockDeps = () => ({
  categoryAssignmentPort: {} as never,
  getSavedTabsPageDataQuery: {} as never,
})

const createProps = (
  overrides: Partial<CategoryKeywordModalProps> = {},
): CategoryKeywordModalProps & {
  deps: ReturnType<typeof createMockDeps>
} => ({
  deps: createMockDeps(),
  group: { id: 'group-1', domain: 'example.com', urls: [] },
  isOpen: true,
  onClose: vi.fn(),
  onSave: vi.fn(),
  onDeleteCategory: vi.fn(),
  parentCategories: [
    { id: 'parent-1', name: 'Work', domains: [], domainNames: [] },
  ],

  onCreateParentCategory: vi.fn(async (name: string) => ({
    id: 'created',
    name,
    domains: [],
    domainNames: [],
  })),
  onAssignToParentCategory: vi.fn(async () => {}),
  ...overrides,
})

describe('CategoryKeywordModal', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('parentCategories 未指定時に空配列を KeywordModalRoot に渡す', () => {
    render(
      <CategoryKeywordModal
        {...createProps({
          parentCategories: undefined as unknown as ParentCategory[],
        })}
      />,
    )

    expect(keywordModalRootSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        initialParentCategories: [],
        onUpdateParentCategories: undefined,
      }),
    )
    expect(screen.getByTestId('keyword-modal-root')).toBeTruthy()
    expect(screen.getByTestId('sub-category-add-section')).toBeTruthy()
    expect(screen.getByTestId('sub-category-selector')).toBeTruthy()
    expect(screen.getByTestId('keyword-editor')).toBeTruthy()
  })

  it('parentCategories と onUpdateParentCategories を KeywordModalRoot に引き継ぐ', () => {
    const parentCategories: ParentCategory[] = [
      { id: 'parent-2', name: 'Private', domains: [], domainNames: [] },
    ]
    const onUpdateParentCategories = vi.fn()

    render(
      <CategoryKeywordModal
        {...createProps({
          parentCategories,
          onUpdateParentCategories,
        })}
      />,
    )

    expect(keywordModalRootSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        initialParentCategories: parentCategories,
        onUpdateParentCategories,
      }),
    )
  })
})
