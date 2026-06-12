// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

const { cardGroupActionsSpy, useCategoryGroupMock } = vi.hoisted(() => ({
  cardGroupActionsSpy: vi.fn(),
  useCategoryGroupMock: vi.fn(),
}))

vi.mock('@/features/i18n/context/I18nProvider', () => ({
  useI18n: () => ({
    // eslint-disable-next-line eslint/complexity
    t: (key: string, _fallback?: string, values?: Record<string, string>) => {
      if (key === 'savedTabs.deleteAll') {
        return 'すべて削除'
      }
      if (key === 'savedTabs.openAll') {
        return 'すべて開く'
      }
      if (key === 'savedTabs.manageParentCategories') {
        return '親カテゴリ管理'
      }
      if (key === 'savedTabs.category.deleteAllItemName') {
        return '親カテゴリ'
      }
      if (key === 'savedTabs.category.deleteAllWarning') {
        return 'カテゴリ配下を削除します'
      }
      if (key === 'savedTabs.openAllTabs') {
        return 'すべてのタブを開く'
      }
      if (key === 'savedTabs.deleteAllTabs') {
        return 'すべてのタブを削除'
      }
      if (key === 'savedTabs.accessibility.nounAction') {
        return `「${values?.target ?? ''}」の${values?.action ?? ''}`
      }
      if (key === 'savedTabs.openAllConfirmDescriptionWithName') {
        return `「${values?.name ?? ''}」のタブ${values?.count ?? ''}件を開きます。続行しますか？`
      }
      if (key === 'savedTabs.deleteAllConfirmDescriptionWithCount') {
        return `「${values?.categoryName ?? ''}」のタブ${values?.count ?? ''}件をすべて削除します。この操作は元に戻せません。`
      }
      return key
    },
  }),
}))

vi.mock('../shared/CardGroupActions', () => ({
  CardGroupActions: (props: Record<string, unknown>) => {
    cardGroupActionsSpy(props)
    return (
      <button
        // eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
        onClick={() => {
          ;(props.onDeleteAll as (() => void) | undefined)?.()
        }}
        type='button'
      >
        すべて削除
      </button>
    )
  },
}))

vi.mock('./CategoryGroupContext', () => ({
  useCategoryGroup: useCategoryGroupMock,
}))

import { CategoryGroupActions } from './CategoryGroupActions'

describe('CategoryGroupActions', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('検索中のすべて削除は表示中URLだけを group ごとに削除する', async () => {
    const handleDeleteUrls = vi.fn().mockResolvedValue(undefined)
    const handleDeleteGroup = vi.fn()
    const handleDeleteGroups = vi.fn()

    useCategoryGroupMock.mockReturnValue({
      state: {
        modal: { setIsModalOpen: vi.fn() },
        reorder: { isReorderMode: false, tempDomainOrder: [] },
      },
      category: { id: 'category-1', name: 'Work' },
      domains: [
        {
          id: 'group-1',
          domain: 'example.com',
          urls: [{ url: 'https://example.com/docs', title: 'Docs' }],
        },
        {
          id: 'group-2',
          domain: 'sample.com',
          urls: [{ url: 'https://sample.com/guide', title: 'Guide' }],
        },
      ],
      settings: { confirmDeleteAll: false },
      searchQuery: 'docs',
      handlers: {
        handleOpenAllTabs: vi.fn(),
        handleDeleteGroup,
        handleDeleteGroups,
        handleDeleteUrl: vi.fn(),
        handleDeleteUrls,
        handleOpenTab: vi.fn(),
        handleUpdateUrls: vi.fn(),
        handleUpdateDomainsOrder: vi.fn(),
        handleMoveDomainToCategory: vi.fn(),
        handleDeleteCategory: vi.fn(),
      },
    })

    render(<CategoryGroupActions />)

    fireEvent.click(screen.getByRole('button', { name: 'すべて削除' }))

    await waitFor(() => {
      expect(handleDeleteUrls).toHaveBeenNthCalledWith(1, 'group-1', [
        'https://example.com/docs',
      ])
      expect(handleDeleteUrls).toHaveBeenNthCalledWith(2, 'group-2', [
        'https://sample.com/guide',
      ])
    })

    expect(handleDeleteGroup).not.toHaveBeenCalled()
    expect(handleDeleteGroups).not.toHaveBeenCalled()
  })

  it('未検索時のすべて削除は既存の group 削除を使う', async () => {
    const handleDeleteUrls = vi.fn().mockResolvedValue(undefined)
    const handleDeleteGroups = vi.fn().mockResolvedValue(undefined)

    useCategoryGroupMock.mockReturnValue({
      state: {
        modal: { setIsModalOpen: vi.fn() },
        reorder: { isReorderMode: false, tempDomainOrder: [] },
      },
      category: { id: 'category-1', name: 'Work' },
      domains: [
        { id: 'group-1', domain: 'example.com', urls: [] },
        { id: 'group-2', domain: 'sample.com', urls: [] },
      ],
      settings: { confirmDeleteAll: false },
      searchQuery: '',
      handlers: {
        handleOpenAllTabs: vi.fn(),
        handleDeleteGroup: vi.fn(),
        handleDeleteGroups,
        handleDeleteUrl: vi.fn(),
        handleDeleteUrls,
        handleOpenTab: vi.fn(),
        handleUpdateUrls: vi.fn(),
        handleUpdateDomainsOrder: vi.fn(),
        handleMoveDomainToCategory: vi.fn(),
        handleDeleteCategory: vi.fn(),
      },
    })

    render(<CategoryGroupActions />)

    fireEvent.click(screen.getByRole('button', { name: 'すべて削除' }))

    await waitFor(() => {
      expect(handleDeleteGroups).toHaveBeenCalledWith(['group-1', 'group-2'])
    })

    expect(handleDeleteUrls).not.toHaveBeenCalled()
  })

  it('対象名付きの操作ラベルと確認文言を CardGroupActions に渡す', () => {
    useCategoryGroupMock.mockReturnValue({
      state: {
        modal: { setIsModalOpen: vi.fn() },
        reorder: { isReorderMode: false, tempDomainOrder: [] },
      },
      category: { id: 'category-1', name: 'Work' },
      domains: [
        {
          id: 'group-1',
          domain: 'example.com',
          urls: [{ url: 'https://example.com/docs', title: 'Docs' }],
        },
      ],
      settings: { confirmDeleteAll: true },
      searchQuery: '',
      handlers: {
        handleOpenAllTabs: vi.fn(),
        handleDeleteGroup: vi.fn(),
        handleDeleteGroups: vi.fn(),
        handleDeleteUrl: vi.fn(),
        handleDeleteUrls: vi.fn(),
        handleOpenTab: vi.fn(),
        handleUpdateUrls: vi.fn(),
        handleUpdateDomainsOrder: vi.fn(),
        handleMoveDomainToCategory: vi.fn(),
        handleDeleteCategory: vi.fn(),
      },
    })

    render(<CategoryGroupActions />)

    expect(cardGroupActionsSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        manageAriaLabel: '「Work」の親カテゴリ管理',
        openAllAriaLabel: '「Work」のすべてのタブを開く',
        deleteAllAriaLabel: '「Work」のすべてのタブを削除',
        openAllConfirmDescription:
          '「Work」のタブ1件を開きます。続行しますか？',
        deleteAllConfirmDescription:
          '「Work」のタブ1件をすべて削除します。この操作は元に戻せません。',
      }),
    )
  })
})
