/* eslint-disable max-lines-per-function, typescript/no-misused-promises */
// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

import type { TabGroup } from '@/types/storage'

import { SubCategoryKeywordManager } from './SubCategoryKeywordManager'
import {
  getCategoryKeywordsForName,
  getRenameDraftName,
  replaceTabGroup,
  shouldSkipRename,
  updateTabGroup,
} from './subCategoryKeywordManager.helpers'

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

vi.mock('@/lib/storage/tabs', () => ({
  setCategoryKeywords: vi.fn(),
}))

vi.mock('@/features/i18n/context/I18nProvider', () => ({
  useI18n: () => ({
    t: (key: string, _fallback?: string, values?: Record<string, string>) => {
      const messages: Record<string, string> = {
        'savedTabs.keywords.activeCategoryLabel': `Keywords for ${values?.name ?? ''}`,
        'savedTabs.keywords.addAria': 'Add keyword',
        'savedTabs.keywords.autoAssignHint': 'Auto assign',
        'savedTabs.keywords.deleteAriaWithName': `Delete keyword ${values?.name ?? ''}`,
        'savedTabs.keywords.duplicate': 'Duplicate keyword',
        'savedTabs.keywords.empty': 'No keywords',
        'savedTabs.keywords.placeholder': 'Enter keyword',
        'savedTabs.projectManagement.renameAction': 'Rename',
        'savedTabs.subCategory.addPlaceholder': 'Enter subcategory',
        'savedTabs.subCategory.addTitle': 'Subcategory name',
        'savedTabs.subCategory.createError': 'Failed to update keywords',
        'savedTabs.subCategory.deleteAria': `Delete ${values?.name ?? ''}`,
        'savedTabs.subCategory.deleted': `Deleted ${values?.name ?? ''}`,
        'savedTabs.subCategory.deleteError': 'Failed to delete subcategory',
        'savedTabs.subCategory.duplicateName': 'Duplicate subcategory',
        'savedTabs.subCategory.empty': 'No subcategories',
        'savedTabs.subCategory.keywordManagerTitle': 'Keyword manager',
        'savedTabs.subCategory.rename': 'Rename subcategory',
        'savedTabs.subCategory.renameError': 'Failed to rename subcategory',
        'savedTabs.subCategory.renameHint': 'Press Enter to save',
        'savedTabs.subCategory.titleKeywords': `${values?.name ?? ''} keywords`,
      }

      return messages[key] ?? key
    },
  }),
}))

import { toast } from 'sonner'

import { setCategoryKeywords } from '@/lib/storage/tabs'

const createTabGroup = (override: Partial<TabGroup> = {}): TabGroup => ({
  categoryKeywords: [
    { categoryName: 'Docs', keywords: ['Guide'] },
    { categoryName: 'Guides', keywords: ['Article'] },
  ],
  domain: 'example.com',
  id: 'group-1',
  subCategories: ['Docs', 'Guides'],
  subCategoryOrder: ['Docs', 'Guides'],
  subCategoryOrderWithUncategorized: ['Uncategorized', 'Docs', 'Guides'],
  urls: [
    {
      id: 'url-1',
      subCategory: 'Docs',
      title: 'Guide',
      url: 'https://example.com/guide',
    },
  ],
  ...override,
})

let storageLocalGet: ReturnType<typeof vi.fn>
let storageLocalSet: ReturnType<typeof vi.fn>

const renderManager = (
  tabGroup: TabGroup,
  savedTabs: TabGroup[] = [structuredClone(tabGroup)],
) => {
  storageLocalGet.mockResolvedValue({
    savedTabs,
  })

  return render(<SubCategoryKeywordManager tabGroup={tabGroup} />)
}

const selectCategory = (name: string) => {
  fireEvent.click(screen.getByRole('button', { name }))
}

const getLastSavedTab = () =>
  storageLocalSet.mock.calls.at(-1)?.[0]?.savedTabs?.[0] as TabGroup | undefined

describe('SubCategoryKeywordManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
    storageLocalGet = vi.fn()
    storageLocalSet = vi.fn().mockResolvedValue(undefined)

    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: storageLocalGet,
          set: storageLocalSet,
        },
      },
    })

    vi.mocked(setCategoryKeywords).mockResolvedValue(undefined)
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('helper は tab 差し替え、keyword fallback、rename no-op を扱う', async () => {
    const tabGroup = createTabGroup()
    const otherGroup = createTabGroup({
      id: 'other-group',
      subCategories: ['Other'],
    })
    storageLocalGet.mockResolvedValue({
      savedTabs: [otherGroup, tabGroup],
    })

    expect(replaceTabGroup([otherGroup, tabGroup], tabGroup)).toStrictEqual([
      otherGroup,
      tabGroup,
    ])
    expect(getCategoryKeywordsForName(tabGroup, 'Docs')).toStrictEqual([
      'Guide',
    ])
    expect(
      getCategoryKeywordsForName(
        createTabGroup({ categoryKeywords: undefined }),
        'Docs',
      ),
    ).toStrictEqual([])
    expect(getRenameDraftName(null)).toBe('')
    expect(getRenameDraftName('Docs')).toBe('Docs')
    expect(shouldSkipRename('', 'Docs')).toBe(true)
    expect(shouldSkipRename('Docs', '')).toBe(true)
    expect(shouldSkipRename('Docs', 'Docs')).toBe(true)
    expect(shouldSkipRename('Docs', 'Guides')).toBe(false)
    await expect(updateTabGroup(tabGroup)).resolves.toBe(true)
    expect(storageLocalSet).toHaveBeenCalledWith({
      savedTabs: [otherGroup, tabGroup],
    })
    storageLocalGet.mockRejectedValueOnce(new Error('read failed'))
    await expect(updateTabGroup(tabGroup)).resolves.toBe(false)
  })

  it('重複したキーワード追加では toast.error を表示する', () => {
    renderManager(
      createTabGroup({
        categoryKeywords: [{ categoryName: 'Docs', keywords: ['Guide'] }],
        subCategories: ['Docs'],
        subCategoryOrder: ['Docs'],
        subCategoryOrderWithUncategorized: ['Uncategorized', 'Docs'],
      }),
    )

    selectCategory('Docs')

    fireEvent.change(screen.getByPlaceholderText('Enter keyword'), {
      target: { value: 'guide' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add keyword' }))

    expect(toast.error).toHaveBeenCalledWith('Duplicate keyword')
    expect(setCategoryKeywords).not.toHaveBeenCalled()
  })

  it('サブカテゴリがない場合は空状態を表示する', () => {
    renderManager(
      createTabGroup({
        categoryKeywords: [],
        subCategories: [],
        subCategoryOrder: [],
        subCategoryOrderWithUncategorized: ['Uncategorized'],
        urls: [],
      }),
    )

    expect(screen.getByText('No subcategories')).not.toBeNull()
    expect(screen.queryByText('Keyword manager')).toBeNull()
  })

  it('カテゴリにキーワード設定がない場合は空のキーワード一覧を表示する', () => {
    renderManager(
      createTabGroup({
        categoryKeywords: undefined,
        subCategories: ['Docs'],
      }),
    )

    selectCategory('Docs')

    expect(screen.getByText('No keywords')).not.toBeNull()
  })

  it('キーワード追加で setCategoryKeywords に保存する', async () => {
    renderManager(
      createTabGroup({
        categoryKeywords: [{ categoryName: 'Docs', keywords: ['Guide'] }],
        subCategories: ['Docs'],
        subCategoryOrder: ['Docs'],
        subCategoryOrderWithUncategorized: ['Uncategorized', 'Docs'],
      }),
    )

    selectCategory('Docs')

    fireEvent.change(screen.getByPlaceholderText('Enter keyword'), {
      target: { value: 'API' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add keyword' }))

    await waitFor(() => {
      expect(setCategoryKeywords).toHaveBeenCalledWith('group-1', 'Docs', [
        'Guide',
        'API',
      ])
    })
  })

  it('キーワード入力で Enter を押すと追加処理を実行する', async () => {
    renderManager(
      createTabGroup({
        categoryKeywords: [{ categoryName: 'Docs', keywords: ['Guide'] }],
        subCategories: ['Docs'],
        subCategoryOrder: ['Docs'],
        subCategoryOrderWithUncategorized: ['Uncategorized', 'Docs'],
      }),
    )

    selectCategory('Docs')

    fireEvent.change(screen.getByPlaceholderText('Enter keyword'), {
      target: { value: 'API' },
    })
    fireEvent.keyDown(screen.getByPlaceholderText('Enter keyword'), {
      key: 'Enter',
    })

    await waitFor(() => {
      expect(setCategoryKeywords).toHaveBeenCalledWith('group-1', 'Docs', [
        'Guide',
        'API',
      ])
    })
  })

  it('キーワード追加の保存失敗ではエラーを記録する', async () => {
    vi.mocked(setCategoryKeywords).mockRejectedValueOnce(
      new Error('save failed'),
    )

    renderManager(
      createTabGroup({
        categoryKeywords: [{ categoryName: 'Docs', keywords: ['Guide'] }],
        subCategories: ['Docs'],
        subCategoryOrder: ['Docs'],
        subCategoryOrderWithUncategorized: ['Uncategorized', 'Docs'],
      }),
    )

    selectCategory('Docs')

    fireEvent.change(screen.getByPlaceholderText('Enter keyword'), {
      target: { value: 'API' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add keyword' }))

    await waitFor(() => {
      expect(console.error).toHaveBeenCalledWith(
        'キーワード保存エラー:',
        expect.any(Error),
      )
    })
  })

  it('キーワード削除で setCategoryKeywords に保存する', async () => {
    renderManager(
      createTabGroup({
        categoryKeywords: [{ categoryName: 'Docs', keywords: ['Guide'] }],
        subCategories: ['Docs'],
        subCategoryOrder: ['Docs'],
        subCategoryOrderWithUncategorized: ['Uncategorized', 'Docs'],
      }),
    )

    selectCategory('Docs')

    fireEvent.click(screen.getByLabelText('Delete keyword Guide'))

    await waitFor(() => {
      expect(setCategoryKeywords).toHaveBeenCalledWith('group-1', 'Docs', [])
    })
  })

  it('キーワード削除の保存失敗では toast.error を表示する', async () => {
    vi.mocked(setCategoryKeywords).mockRejectedValueOnce(
      new Error('save failed'),
    )

    renderManager(
      createTabGroup({
        categoryKeywords: [{ categoryName: 'Docs', keywords: ['Guide'] }],
        subCategories: ['Docs'],
        subCategoryOrder: ['Docs'],
        subCategoryOrderWithUncategorized: ['Uncategorized', 'Docs'],
      }),
    )

    selectCategory('Docs')
    fireEvent.click(screen.getByLabelText('Delete keyword Guide'))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to update keywords')
    })
  })

  it('サブカテゴリ作成で savedTabs を更新する', async () => {
    renderManager(
      createTabGroup({
        categoryKeywords: [{ categoryName: 'Docs', keywords: ['Guide'] }],
        subCategories: ['Docs'],
        subCategoryOrder: ['Docs'],
        subCategoryOrderWithUncategorized: ['Uncategorized', 'Docs'],
      }),
    )

    fireEvent.change(screen.getByLabelText('Subcategory name'), {
      target: { value: 'News' },
    })
    fireEvent.keyDown(screen.getByLabelText('Subcategory name'), {
      key: 'Enter',
    })

    await waitFor(() => {
      expect(getLastSavedTab()?.subCategories).toStrictEqual(['Docs', 'News'])
      expect(getLastSavedTab()?.categoryKeywords).toStrictEqual([
        { categoryName: 'Docs', keywords: ['Guide'] },
        { categoryName: 'News', keywords: [] },
      ])
    })
  })

  it('対象外キーと空入力では追加・rename を実行しない', () => {
    renderManager(createTabGroup())

    fireEvent.keyDown(screen.getByLabelText('Subcategory name'), {
      key: 'Tab',
    })
    fireEvent.blur(screen.getByLabelText('Subcategory name'))
    expect(storageLocalSet).not.toHaveBeenCalled()

    selectCategory('Docs')
    fireEvent.keyDown(screen.getByPlaceholderText('Enter keyword'), {
      key: 'Tab',
    })
    fireEvent.keyDown(screen.getByPlaceholderText('Enter keyword'), {
      key: 'Enter',
    })
    expect(setCategoryKeywords).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Rename' }))
    fireEvent.keyDown(screen.getByLabelText('Rename subcategory'), {
      key: 'Tab',
    })
    expect(screen.getByLabelText('Rename subcategory')).not.toBeNull()
  })

  it('空状態の blur でもサブカテゴリを作成し不足配列を補完する', async () => {
    const tabGroup = createTabGroup({
      categoryKeywords: undefined,
      subCategories: undefined,
      subCategoryOrder: undefined,
      subCategoryOrderWithUncategorized: undefined,
      urls: [],
    })

    renderManager(tabGroup, [structuredClone(tabGroup)])

    fireEvent.change(screen.getByLabelText('Subcategory name'), {
      target: { value: 'News' },
    })
    fireEvent.blur(screen.getByLabelText('Subcategory name'))

    await waitFor(() => {
      expect(getLastSavedTab()?.subCategories).toStrictEqual(['News'])
      expect(getLastSavedTab()?.categoryKeywords).toStrictEqual([
        { categoryName: 'News', keywords: [] },
      ])
    })
  })

  it('サブカテゴリ作成の保存失敗ではエラーを記録して保存しない', async () => {
    renderManager(
      createTabGroup({
        categoryKeywords: [{ categoryName: 'Docs', keywords: ['Guide'] }],
        subCategories: ['Docs'],
        subCategoryOrder: ['Docs'],
        subCategoryOrderWithUncategorized: ['Uncategorized', 'Docs'],
      }),
    )
    storageLocalGet.mockRejectedValueOnce(new Error('storage failed'))

    fireEvent.change(screen.getByLabelText('Subcategory name'), {
      target: { value: 'News' },
    })
    fireEvent.keyDown(screen.getByLabelText('Subcategory name'), {
      key: 'Enter',
    })

    await waitFor(() => {
      expect(console.error).toHaveBeenCalledWith(
        'タブグループ更新エラー:',
        expect.any(Error),
      )
    })
    expect(storageLocalSet).not.toHaveBeenCalled()
  })

  it('重複したサブカテゴリ作成では toast.error を表示する', () => {
    renderManager(
      createTabGroup({
        categoryKeywords: [{ categoryName: 'Docs', keywords: ['Guide'] }],
        subCategories: ['Docs'],
        subCategoryOrder: ['Docs'],
        subCategoryOrderWithUncategorized: ['Uncategorized', 'Docs'],
      }),
    )

    fireEvent.change(screen.getByLabelText('Subcategory name'), {
      target: { value: 'Docs' },
    })
    fireEvent.keyDown(screen.getByLabelText('Subcategory name'), {
      key: 'Enter',
    })

    expect(toast.error).toHaveBeenCalledWith('Duplicate subcategory')
    expect(storageLocalSet).not.toHaveBeenCalled()
  })

  it('サブカテゴリ削除で savedTabs を更新し toast.success を表示する', async () => {
    renderManager(createTabGroup())

    fireEvent.click(screen.getByLabelText('Delete Guides'))

    await waitFor(() => {
      expect(getLastSavedTab()?.subCategories).toStrictEqual(['Docs'])
      expect(getLastSavedTab()?.categoryKeywords).toStrictEqual([
        { categoryName: 'Docs', keywords: ['Guide'] },
      ])
    })

    expect(toast.success).toHaveBeenCalledWith('Deleted Guides')
  })

  it('選択中のサブカテゴリを削除するとキーワード表示をクリアする', async () => {
    renderManager(createTabGroup())

    selectCategory('Guides')
    expect(screen.getByText('Article')).not.toBeNull()

    fireEvent.click(screen.getByLabelText('Delete Guides'))

    await waitFor(() => {
      expect(screen.queryByText('Guides keywords')).toBeNull()
      expect(screen.queryByText('Article')).toBeNull()
    })
  })

  it('削除対象のタブグループが見つからない場合は保存しない', async () => {
    const tabGroup = createTabGroup()
    renderManager(tabGroup, [])

    fireEvent.click(screen.getByLabelText('Delete Guides'))

    await waitFor(() => {
      expect(console.error).toHaveBeenCalledWith('タブグループが見つかりません')
    })
    expect(storageLocalSet).not.toHaveBeenCalled()
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('サブカテゴリ削除は保存データの不足配列を空配列として扱う', async () => {
    const tabGroup = createTabGroup({
      categoryKeywords: undefined,
      subCategories: ['Docs'],
    })
    const savedTab = createTabGroup({
      categoryKeywords: undefined,
      subCategories: undefined,
      urls: undefined,
    })

    renderManager(tabGroup, [savedTab])

    fireEvent.click(screen.getByLabelText('Delete Docs'))

    await waitFor(() => {
      expect(getLastSavedTab()).toStrictEqual(
        expect.objectContaining({
          categoryKeywords: [],
          subCategories: [],
        }),
      )
    })
  })

  it('サブカテゴリ削除の保存失敗では toast.error を表示する', async () => {
    renderManager(createTabGroup())
    storageLocalGet.mockRejectedValueOnce(new Error('storage failed'))

    fireEvent.click(screen.getByLabelText('Delete Guides'))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to delete subcategory')
    })
  })

  it('サブカテゴリ名変更で savedTabs の関連フィールドを更新する', async () => {
    const tabGroup = createTabGroup({
      urls: [
        {
          id: 'url-1',
          subCategory: 'Docs',
          title: 'Guide',
          url: 'https://example.com/guide',
        },
        {
          id: 'url-2',
          subCategory: 'Guides',
          title: 'Article',
          url: 'https://example.com/article',
        },
      ],
    })
    const untouchedTab = createTabGroup({
      categoryKeywords: [{ categoryName: 'Other', keywords: ['Keep'] }],
      domain: 'other.example.com',
      id: 'group-2',
      subCategories: ['Other'],
      subCategoryOrder: ['Other'],
      subCategoryOrderWithUncategorized: ['Uncategorized', 'Other'],
      urls: [
        {
          id: 'url-3',
          subCategory: 'Other',
          title: 'Keep',
          url: 'https://other.example.com',
        },
      ],
    })

    renderManager(tabGroup, [structuredClone(tabGroup), untouchedTab])

    selectCategory('Docs')
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }))
    fireEvent.change(screen.getByLabelText('Rename subcategory'), {
      target: { value: 'Reference' },
    })
    fireEvent.keyDown(screen.getByLabelText('Rename subcategory'), {
      key: 'Enter',
    })

    await waitFor(() => {
      expect(getLastSavedTab()?.subCategories).toStrictEqual([
        'Reference',
        'Guides',
      ])
      expect(getLastSavedTab()?.categoryKeywords).toStrictEqual([
        { categoryName: 'Reference', keywords: ['Guide'] },
        { categoryName: 'Guides', keywords: ['Article'] },
      ])
      expect(getLastSavedTab()?.urls).toStrictEqual([
        {
          id: 'url-1',
          subCategory: 'Reference',
          title: 'Guide',
          url: 'https://example.com/guide',
        },
        {
          id: 'url-2',
          subCategory: 'Guides',
          title: 'Article',
          url: 'https://example.com/article',
        },
      ])
      expect(getLastSavedTab()?.subCategoryOrder).toStrictEqual([
        'Reference',
        'Guides',
      ])
      expect(
        getLastSavedTab()?.subCategoryOrderWithUncategorized,
      ).toStrictEqual(['Uncategorized', 'Reference', 'Guides'])
      expect(
        storageLocalSet.mock.calls.at(-1)?.[0]?.savedTabs?.[1],
      ).toStrictEqual(untouchedTab)
    })
  })

  it('サブカテゴリ名変更は保存データの不足配列を空配列として扱う', async () => {
    const tabGroup = createTabGroup({
      categoryKeywords: [{ categoryName: 'Docs', keywords: ['Guide'] }],
      subCategories: ['Docs'],
    })
    const savedTab = createTabGroup({
      categoryKeywords: undefined,
      subCategories: undefined,
      subCategoryOrder: undefined,
      subCategoryOrderWithUncategorized: undefined,
      urls: undefined,
    })

    renderManager(tabGroup, [savedTab])

    selectCategory('Docs')
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }))
    fireEvent.change(screen.getByLabelText('Rename subcategory'), {
      target: { value: 'Reference' },
    })
    fireEvent.keyDown(screen.getByLabelText('Rename subcategory'), {
      key: 'Enter',
    })

    await waitFor(() => {
      expect(getLastSavedTab()).toStrictEqual(
        expect.objectContaining({
          categoryKeywords: [],
          subCategories: [],
          subCategoryOrder: [],
          subCategoryOrderWithUncategorized: [],
          urls: [],
        }),
      )
    })
  })

  it('サブカテゴリ名変更中に Escape を押すと rename をキャンセルする', () => {
    renderManager(createTabGroup())

    selectCategory('Docs')
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }))
    fireEvent.change(screen.getByLabelText('Rename subcategory'), {
      target: { value: 'Reference' },
    })
    fireEvent.keyDown(screen.getByLabelText('Rename subcategory'), {
      key: 'Escape',
    })

    expect(screen.queryByLabelText('Rename subcategory')).toBeNull()
    expect(screen.getByText('Docs keywords')).not.toBeNull()
  })

  it('rename 中に別カテゴリを選ぶと rename モードを終了する', () => {
    renderManager(createTabGroup())

    selectCategory('Docs')
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }))
    selectCategory('Guides')

    expect(screen.queryByLabelText('Rename subcategory')).toBeNull()
    expect(screen.getByText('Guides keywords')).not.toBeNull()
  })

  it('空のサブカテゴリ名で確定すると rename モードを閉じる', () => {
    renderManager(createTabGroup())

    selectCategory('Docs')
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }))
    fireEvent.change(screen.getByLabelText('Rename subcategory'), {
      target: { value: '   ' },
    })
    fireEvent.keyDown(screen.getByLabelText('Rename subcategory'), {
      key: 'Enter',
    })

    expect(screen.queryByLabelText('Rename subcategory')).toBeNull()
    expect(storageLocalSet).not.toHaveBeenCalled()
  })

  it('同じサブカテゴリ名で確定すると保存せず rename モードを閉じる', () => {
    renderManager(createTabGroup())

    selectCategory('Docs')
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }))
    fireEvent.keyDown(screen.getByLabelText('Rename subcategory'), {
      key: 'Enter',
    })

    expect(screen.queryByLabelText('Rename subcategory')).toBeNull()
    expect(storageLocalSet).not.toHaveBeenCalled()
  })

  it('重複したサブカテゴリ名変更では toast.error を表示する', () => {
    renderManager(createTabGroup())

    selectCategory('Docs')
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }))
    fireEvent.change(screen.getByLabelText('Rename subcategory'), {
      target: { value: 'Guides' },
    })
    fireEvent.keyDown(screen.getByLabelText('Rename subcategory'), {
      key: 'Enter',
    })

    expect(toast.error).toHaveBeenCalledWith('Duplicate subcategory')
    expect(storageLocalSet).not.toHaveBeenCalled()
  })

  it('サブカテゴリ名変更の保存失敗では toast.error を表示する', async () => {
    renderManager(createTabGroup())
    storageLocalSet.mockRejectedValueOnce(new Error('save failed'))

    selectCategory('Docs')
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }))
    fireEvent.change(screen.getByLabelText('Rename subcategory'), {
      target: { value: 'Reference' },
    })
    fireEvent.keyDown(screen.getByLabelText('Rename subcategory'), {
      key: 'Enter',
    })

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to rename subcategory')
    })
  })
})
