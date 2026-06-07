// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { CustomProjectCategoryProps } from '@/features/saved-tabs/types/CustomProjectCategory.types'
import type { UserSettings } from '@/types/storage'

const customProjectCategoryAdditionalI18nState = vi.hoisted(() => ({
  language: 'ja' as 'en' | 'ja',
}))

vi.mock('@dnd-kit/core', () => ({
  useDroppable: vi.fn(() => ({
    setNodeRef: vi.fn(),
    isOver: false,
  })),
}))

vi.mock('@dnd-kit/sortable', () => ({
  useSortable: vi.fn(() => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: undefined,
  })),
  SortableContext: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  verticalListSortingStrategy: 'verticalListSortingStrategy',
}))

vi.mock('@dnd-kit/utilities', () => ({
  CSS: {
    Transform: {
      toString: () => undefined,
    },
  },
}))

vi.mock('./ProjectUrlItem', () => ({
  ProjectUrlItem: ({ item }: { item: { url: string } }) => (
    <div>{item.url}</div>
  ),
}))

vi.mock('@/components/ui/tooltip', () => ({
// eslint-disable-next-line react/jsx-no-useless-fragment
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => (
// eslint-disable-next-line react/jsx-no-useless-fragment
    <>{children}</>
  ),
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}))

vi.mock('@/features/i18n/context/I18nProvider', async () => {
  const { getMessages } = await vi.importActual<
// eslint-disable-next-line typescript/consistent-type-imports
    typeof import('@/features/i18n/messages')
  >('@/features/i18n/messages')

  return {
    useI18n: () => ({
      language: customProjectCategoryAdditionalI18nState.language,
      t: (key: string, fallback?: string, values?: Record<string, string>) => {
        const messages = getMessages(
          customProjectCategoryAdditionalI18nState.language,
        )
        const template =
          messages[key as keyof typeof messages] ?? fallback ?? key
        return template.replaceAll(
          /\{\{(\w+)\}\}/g,
          (_, token) => values?.[token] ?? '',
        )
      },
    }),
  }
})

import { CustomProjectCategory } from './CustomProjectCategory'

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
  overrides: Partial<CustomProjectCategoryProps> = {},
): CustomProjectCategoryProps => ({
  projectId: 'project-1',
  category: 'Work',
  urls: [
    { url: 'https://a.com', title: 'A', category: 'Work', savedAt: 1 },
    { url: 'https://b.com', title: 'B', category: 'Work', savedAt: 2 },
  ],
  handleOpenUrl: vi.fn(),
// eslint-disable-next-line typescript/no-misused-promises
  handleDeleteUrl: vi.fn(async () => {}),
  handleDeleteCategory: vi.fn(),
  handleSetUrlCategory: vi.fn(),
  handleAddCategory: vi.fn(),
  handleOpenAllUrls: vi.fn(),
  handleRenameCategory: vi.fn(),
  settings: defaultSettings,
  ...overrides,
})

describe('CustomProjectCategory additional', () => {
  beforeEach(() => {
    vi.spyOn(window, 'open').mockImplementation(vi.fn() as never)
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('handleDeleteUrlsFromProject があれば一括削除でそちらを使う', async () => {
    const handleDeleteUrlsFromProject = vi.fn().mockResolvedValue(undefined)

    render(
      <CustomProjectCategory
        {...createProps({
          handleDeleteUrlsFromProject,
        })}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'すべて削除' }))

    await waitFor(() => {
      expect(handleDeleteUrlsFromProject).toHaveBeenCalledWith('project-1', [
        'https://a.com',
        'https://b.com',
      ])
    })
  })
})
