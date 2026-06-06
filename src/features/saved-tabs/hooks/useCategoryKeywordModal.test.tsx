// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import type { ChangeEvent } from 'react'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ParentCategory, TabGroup } from '@/types/storage'

import {
  renameCategoryInTab,
  resolveSelectedParentCategoryId,
  useCategoryKeywordModal,
} from './useCategoryKeywordModal'

const categoryKeywordModalI18nState = vi.hoisted(() => ({
  language: 'ja' as 'en' | 'ja',
}))

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

vi.mock('@/features/i18n/context/I18nProvider', async () => {
  const { getMessages } = await vi.importActual<
    typeof import('@/features/i18n/messages')
  >('@/features/i18n/messages')

  return {
    useI18n: () => ({
      language: categoryKeywordModalI18nState.language,
      t: (key: string, fallback?: string, values?: Record<string, string>) => {
        const messages = getMessages(categoryKeywordModalI18nState.language)
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

interface StorageState {
  parentCategories?: ParentCategory[]
  savedTabs?: TabGroup[]
}

const createGroup = (overrides: Partial<TabGroup> = {}): TabGroup => ({
  domain: 'example.com',
  id: 'group-1',
  urls: overrides.urls ?? [],
  subCategories: overrides.subCategories ?? ['Existing subcategory'],
  categoryKeywords: overrides.categoryKeywords ?? [],
  ...overrides,
})

const createParentCategories = (): ParentCategory[] => [
  {
    domainNames: ['example.com'],
    domains: ['group-1'],
    id: 'parent-1',
    name: 'Parent category',
  },
]

const createChangeEvent = (value: string) =>
  ({
    target: { value },
  }) as ChangeEvent<HTMLInputElement>

const setupChromeStorage = (state: StorageState = {}) => {
  const listeners = new Set<
    (changes: Record<string, chrome.storage.StorageChange>) => void
  >()
  const local = {
    get: vi.fn(async (keys?: string | string[]) => {
      if (!keys) {
        return state
      }

      if (Array.isArray(keys)) {
        return Object.fromEntries(
          keys.map((key) => [key, state[key as keyof StorageState]]),
        )
      }

      return {
        [keys]: state[keys as keyof StorageState],
      }
    }),
    set: vi.fn(async (value: Partial<StorageState>) => {
      Object.assign(state, value)
    }),
  }
  const onChanged = {
    addListener: vi.fn(
      (
        listener: (
          changes: Record<string, chrome.storage.StorageChange>,
        ) => void,
      ) => {
        listeners.add(listener)
      },
    ),
    removeListener: vi.fn(
      (
        listener: (
          changes: Record<string, chrome.storage.StorageChange>,
        ) => void,
      ) => {
        listeners.delete(listener)
      },
    ),
  }

  globalThis.chrome = {
    storage: {
      local,
      onChanged,
    },
  } as unknown as typeof chrome

  return {
    emitParentCategoriesChanged: () => {
      for (const listener of listeners) {
        listener({
          parentCategories: {
            newValue: state.parentCategories,
            oldValue: [],
          },
        })
      }
    },
    emitUnrelatedChanged: () => {
      for (const listener of listeners) {
        listener({})
      }
    },
    local,
    onChanged,
    state,
  }
}

const renderModalHook = (
  overrides: Partial<Parameters<typeof useCategoryKeywordModal>[0]> = {},
) => {
  const props = {
    group: createGroup(),
    initialParentCategories: createParentCategories(),
    isOpen: true,
    onDeleteCategory: vi.fn(),
    onSave: vi.fn(),
    ...overrides,
  }

  const hook = renderHook(() => useCategoryKeywordModal(props))

  return {
    ...hook,
    props,
  }
}

describe('useCategoryKeywordModal', () => {
  beforeEach(() => {
    setupChromeStorage({
      parentCategories: createParentCategories(),
      savedTabs: [createGroup()],
    })
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
  })

  afterEach(() => {
    cleanup()
    document.body.replaceChildren()
    vi.clearAllMocks()
    vi.unstubAllGlobals()
    categoryKeywordModalI18nState.language = 'ja'
  })

  it('uses English validation copy when the new subcategory name is blank', () => {
    categoryKeywordModalI18nState.language = 'en'

    const { result } = renderHook(() =>
      useCategoryKeywordModal({
        group: createGroup(),
        initialParentCategories: createParentCategories(),
        isOpen: false,
        onDeleteCategory: vi.fn(),
        onSave: vi.fn(),
      }),
    )

    act(() => {
      result.current.subcategory.handleSubCategoryNameChange(
        createChangeEvent(' '),
      )
    })

    expect(result.current.subcategory.subCategoryNameError).toBe(
      'Enter a new parent category name',
    )
  })

  it('helper は legacy tab のリネーム fallback と親カテゴリ解決を扱う', () => {
    const legacyGroup = createGroup({
      categoryKeywords: undefined,
      subCategories: undefined,
      subCategoryOrder: undefined,
      subCategoryOrderWithUncategorized: undefined,
      urls: undefined,
    })
    const otherGroup = createGroup({
      id: 'other-group',
      subCategories: ['Old'],
    })

    expect(renameCategoryInTab(otherGroup, 'group-1', 'Old', 'New')).toBe(
      otherGroup,
    )
    expect(
      renameCategoryInTab(legacyGroup, 'group-1', 'Old', 'New'),
    ).toStrictEqual(
      expect.objectContaining({
        categoryKeywords: [],
        subCategories: [],
        subCategoryOrder: [],
        subCategoryOrderWithUncategorized: [],
        urls: [],
      }),
    )
    expect(
      renameCategoryInTab(
        createGroup({
          categoryKeywords: [
            {
              categoryName: 'Other',
              keywords: ['other'],
            },
          ],
          subCategories: ['Other'],
          subCategoryOrder: ['Other'],
          subCategoryOrderWithUncategorized: ['Other', 'uncategorized'],
          urls: [
            {
              subCategory: 'Other',
              title: 'Other',
              url: 'https://example.com/other',
            },
          ],
        }),
        'group-1',
        'Old',
        'New',
      ),
    ).toStrictEqual(
      expect.objectContaining({
        categoryKeywords: [
          {
            categoryName: 'Other',
            keywords: ['other'],
          },
        ],
        subCategories: ['Other'],
        subCategoryOrder: ['Other'],
        subCategoryOrderWithUncategorized: ['Other', 'uncategorized'],
        urls: [
          {
            subCategory: 'Other',
            title: 'Other',
            url: 'https://example.com/other',
          },
        ],
      }),
    )
    expect(
      resolveSelectedParentCategoryId(createParentCategories(), {
        ...createGroup(),
        parentCategoryId: 'explicit-parent',
      }),
    ).toBe('explicit-parent')
    expect(
      resolveSelectedParentCategoryId(
        [
          {
            domainNames: ['matched.example.com'],
            domains: [],
            id: 'matched-parent',
            name: 'Matched',
          },
        ],
        createGroup({ domain: 'matched.example.com' }),
      ),
    ).toBe('matched-parent')
    expect(
      resolveSelectedParentCategoryId([], createGroup({ domain: 'missing' })),
    ).toBe('none')
  })

  it('uses English validation copy when the rename exceeds 25 characters', () => {
    categoryKeywordModalI18nState.language = 'en'

    const { result } = renderHook(() =>
      useCategoryKeywordModal({
        group: createGroup(),
        initialParentCategories: createParentCategories(),
        isOpen: false,
        onDeleteCategory: vi.fn(),
        onSave: vi.fn(),
      }),
    )

    act(() => {
      result.current.rename.handleRenameCategoryNameChange(
        createChangeEvent('a'.repeat(26)),
      )
    })

    expect(result.current.rename.categoryRenameError).toBe(
      'Parent category names must be within 25 characters.',
    )
  })

  it('open 中に親カテゴリを読み込み storage 変更時にも再同期する', async () => {
    const onUpdateParentCategories = vi.fn()
    const storage = setupChromeStorage({
      parentCategories: createParentCategories(),
      savedTabs: [createGroup()],
    })

    const { result, unmount } = renderModalHook({
      onUpdateParentCategories,
    })

    await waitFor(() => {
      expect(result.current.parentCategory.selectedParentCategory).toBe(
        'parent-1',
      )
    })
    expect(onUpdateParentCategories).toHaveBeenCalledWith(
      createParentCategories(),
    )
    expect(storage.onChanged.addListener).toHaveBeenCalled()

    storage.state.parentCategories = [
      {
        domainNames: ['example.com'],
        domains: [],
        id: 'parent-2',
        name: 'Updated parent',
      },
    ]

    await act(async () => {
      storage.emitUnrelatedChanged()
      storage.emitParentCategoriesChanged()
    })

    await waitFor(() => {
      expect(result.current.parentCategory.selectedParentCategory).toBe(
        'parent-2',
      )
    })

    unmount()

    expect(storage.onChanged.removeListener).toHaveBeenCalled()
  })

  it('親カテゴリ読み込みに失敗した場合はエラートーストを表示する', async () => {
    const storage = setupChromeStorage()
    storage.local.get.mockRejectedValueOnce(new Error('storage failed'))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    renderModalHook()

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'カテゴリの読み込みに失敗しました',
      )
    })

    consoleError.mockRestore()
  })

  it('キーワードを追加し重複と空白入力は保存しない', async () => {
    const onSave = vi.fn()
    const { result } = renderModalHook({
      group: createGroup({
        categoryKeywords: [
          {
            categoryName: 'Existing subcategory',
            keywords: ['Alpha'],
          },
        ],
      }),
      onSave,
    })

    await waitFor(() => {
      expect(result.current.keywords.keywords).toStrictEqual(['Alpha'])
    })

    act(() => {
      result.current.keywords.setNewKeyword(' beta ')
    })

    await waitFor(() => {
      expect(result.current.keywords.newKeyword).toBe(' beta ')
    })

    act(() => {
      result.current.keywords.handleAddKeyword()
    })

    expect(onSave).toHaveBeenCalledWith('group-1', 'Existing subcategory', [
      'Alpha',
      'beta',
    ])
    expect(result.current.keywords.newKeyword).toBe('')

    act(() => {
      result.current.keywords.setNewKeyword('ALPHA')
    })

    await waitFor(() => {
      expect(result.current.keywords.newKeyword).toBe('ALPHA')
    })

    act(() => {
      result.current.keywords.handleAddKeyword()
    })

    expect(toast.error).toHaveBeenCalledWith(
      'このキーワードは既に追加されています',
    )

    act(() => {
      result.current.keywords.setNewKeyword(' ')
    })

    await waitFor(() => {
      expect(result.current.keywords.newKeyword).toBe(' ')
    })

    act(() => {
      result.current.keywords.handleAddKeyword()
    })

    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it('親カテゴリIDあり・閉じた状態・空カテゴリの初期値を扱う', async () => {
    const { result } = renderModalHook({
      group: createGroup({
        parentCategoryId: 'parent-explicit',
        subCategories: [],
      }),
      isOpen: false,
    })

    await waitFor(() => {
      expect(result.current.parentCategory.selectedParentCategory).toBe(
        'parent-explicit',
      )
    })
    expect(result.current.subcategory.activeCategory).toBe('')
  })

  it('open 中でも親カテゴリIDが明示されていればその値を優先する', async () => {
    const { result } = renderModalHook({
      group: createGroup({
        parentCategoryId: 'parent-explicit',
      }),
    })

    await waitFor(() => {
      expect(result.current.parentCategory.selectedParentCategory).toBe(
        'parent-explicit',
      )
    })
  })

  it('閉じている間は親カテゴリを storage から読み込まない', () => {
    const storage = setupChromeStorage({
      parentCategories: createParentCategories(),
      savedTabs: [createGroup()],
    })

    renderModalHook({ isOpen: false })

    expect(storage.local.get).not.toHaveBeenCalledWith('parentCategories')
  })

  it('キーワード削除時に保存済みタブの categoryKeywords と URL subCategory を更新する', async () => {
    const group = createGroup({
      categoryKeywords: [
        {
          categoryName: 'Other subcategory',
          keywords: ['Other'],
        },
        {
          categoryName: 'Existing subcategory',
          keywords: ['Alpha', 'Beta'],
        },
      ],
      urls: [
        {
          subCategory: 'Other subcategory',
          title: 'Other',
          url: 'https://example.com/other',
        },
        {
          subCategory: 'Existing subcategory',
          title: 'A',
          url: 'https://example.com/a',
        },
      ],
    })
    const storage = setupChromeStorage({
      parentCategories: createParentCategories(),
      savedTabs: [
        group,
        createGroup({
          domain: 'other.example.com',
          id: 'group-2',
        }),
      ],
    })
    const { result } = renderModalHook({ group })

    await waitFor(() => {
      expect(result.current.keywords.keywords).toStrictEqual(['Alpha', 'Beta'])
    })

    await act(async () => {
      await result.current.keywords.handleRemoveKeyword('Alpha')
    })

    expect(storage.local.set).toHaveBeenCalledWith({
      savedTabs: [
        expect.objectContaining({
          categoryKeywords: [
            {
              categoryName: 'Other subcategory',
              keywords: ['Other'],
            },
            {
              categoryName: 'Existing subcategory',
              keywords: ['Beta'],
            },
          ],
          urls: [
            {
              subCategory: 'Other subcategory',
              title: 'Other',
              url: 'https://example.com/other',
            },
            {
              subCategory: undefined,
              title: 'A',
              url: 'https://example.com/a',
            },
          ],
        }),
        expect.objectContaining({ id: 'group-2' }),
      ],
    })
  })

  it('キーワード削除の保存に失敗しても hook 状態は更新する', async () => {
    const storage = setupChromeStorage({
      parentCategories: createParentCategories(),
      savedTabs: [
        createGroup(),
        createGroup({
          id: 'group-2',
          subCategories: ['Other subcategory'],
        }),
      ],
    })
    storage.local.set.mockRejectedValueOnce(new Error('set failed'))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { result } = renderModalHook({
      group: createGroup({
        categoryKeywords: [
          {
            categoryName: 'Existing subcategory',
            keywords: ['Alpha'],
          },
        ],
      }),
    })

    await waitFor(() => {
      expect(result.current.keywords.keywords).toStrictEqual(['Alpha'])
    })

    await act(async () => {
      await result.current.keywords.handleRemoveKeyword('Alpha')
    })

    expect(result.current.keywords.keywords).toStrictEqual([])
    expect(consoleError).toHaveBeenCalledWith(
      'キーワード削除に伴う保存処理に失敗しました:',
      expect.any(Error),
    )

    consoleError.mockRestore()
  })

  it('キーワード削除は legacy group の欠損配列を空として保存する', async () => {
    const storage = setupChromeStorage({
      parentCategories: createParentCategories(),
      savedTabs: [
        createGroup({
          categoryKeywords: undefined,
          urls: undefined,
        }),
      ],
    })
    const { result } = renderModalHook({
      group: createGroup({
        categoryKeywords: [
          {
            categoryName: 'Existing subcategory',
            keywords: ['Alpha'],
          },
        ],
      }),
    })

    await waitFor(() => {
      expect(result.current.keywords.keywords).toStrictEqual(['Alpha'])
    })

    await act(async () => {
      await result.current.keywords.handleRemoveKeyword('Alpha')
    })

    expect(storage.local.set).toHaveBeenCalledWith({
      savedTabs: [
        expect.objectContaining({
          categoryKeywords: [],
          urls: [],
        }),
      ],
    })
  })

  it('サブカテゴリを追加し重複名と保存失敗を通知する', async () => {
    const storage = setupChromeStorage({
      parentCategories: createParentCategories(),
      savedTabs: [createGroup()],
    })
    const { result } = renderModalHook()

    await act(async () => {
      result.current.subcategory.handleSubCategoryNameChange(
        createChangeEvent(' New subcategory '),
      )
    })

    await waitFor(() => {
      expect(result.current.subcategory.newSubCategory).toBe(
        ' New subcategory ',
      )
    })

    await act(async () => {
      await result.current.subcategory.handleAddSubCategory()
    })

    expect(storage.local.set).toHaveBeenCalledWith({
      savedTabs: [
        expect.objectContaining({
          subCategories: ['Existing subcategory', 'New subcategory'],
        }),
      ],
    })
    expect(result.current.subcategory.activeCategory).toBe('New subcategory')
    expect(toast.success).toHaveBeenCalledWith(
      '新しいカテゴリ「New subcategory」を追加しました',
    )

    await act(async () => {
      result.current.subcategory.handleSubCategoryNameChange(
        createChangeEvent('Existing subcategory'),
      )
    })

    await waitFor(() => {
      expect(result.current.subcategory.newSubCategory).toBe(
        'Existing subcategory',
      )
    })

    await act(async () => {
      await result.current.subcategory.handleAddSubCategory()
    })

    expect(toast.error).toHaveBeenCalledWith(
      'このカテゴリ名は既に存在しています',
    )

    await act(async () => {
      result.current.subcategory.handleSubCategoryNameChange(
        createChangeEvent('a'.repeat(26)),
      )
    })

    await waitFor(() => {
      expect(result.current.subcategory.subCategoryNameError).toBe(
        '新規親カテゴリ名は25文字以下にしてください',
      )
    })

    await act(async () => {
      await result.current.subcategory.handleAddSubCategory()
    })

    expect(storage.local.set).toHaveBeenCalledTimes(1)

    storage.local.set.mockRejectedValueOnce(new Error('save failed'))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    await act(async () => {
      result.current.subcategory.handleSubCategoryNameChange(
        createChangeEvent('Error subcategory'),
      )
    })

    await waitFor(() => {
      expect(result.current.subcategory.newSubCategory).toBe(
        'Error subcategory',
      )
    })

    await act(async () => {
      await result.current.subcategory.handleAddSubCategory()
    })

    expect(toast.error).toHaveBeenCalledWith('カテゴリの追加に失敗しました')
    expect(consoleError).toHaveBeenCalledWith(
      '子カテゴリ追加エラー:',
      expect.any(Error),
    )

    consoleError.mockRestore()
  })

  it('サブカテゴリ追加は空入力を無視し対象外タブはそのまま残す', async () => {
    const storage = setupChromeStorage({
      parentCategories: createParentCategories(),
      savedTabs: [
        createGroup(),
        createGroup({
          id: 'group-2',
          subCategories: ['Other'],
        }),
      ],
    })
    const { result } = renderModalHook()

    await act(async () => {
      await result.current.subcategory.handleAddSubCategory()
    })

    expect(storage.local.set).not.toHaveBeenCalled()

    await act(async () => {
      result.current.subcategory.handleSubCategoryNameChange(
        createChangeEvent('Fresh subcategory'),
      )
    })

    await act(async () => {
      await result.current.subcategory.handleAddSubCategory()
    })

    expect(storage.local.set).toHaveBeenCalledWith({
      savedTabs: [
        expect.objectContaining({
          id: 'group-1',
          subCategories: ['Existing subcategory', 'Fresh subcategory'],
        }),
        expect.objectContaining({
          id: 'group-2',
          subCategories: ['Other'],
        }),
      ],
    })
  })

  it('サブカテゴリ追加は legacy tab の subCategories 欠損を空配列として扱う', async () => {
    const storage = setupChromeStorage({
      parentCategories: createParentCategories(),
      savedTabs: [
        createGroup({
          subCategories: undefined,
        }),
      ],
    })
    const { result } = renderModalHook({
      group: createGroup({
        subCategories: undefined,
      }),
    })

    await act(async () => {
      result.current.subcategory.handleSubCategoryNameChange(
        createChangeEvent('Fresh subcategory'),
      )
    })

    await act(async () => {
      await result.current.subcategory.handleAddSubCategory()
    })

    expect(storage.local.set).toHaveBeenCalledWith({
      savedTabs: [
        expect.objectContaining({
          subCategories: ['Fresh subcategory'],
        }),
      ],
    })
  })

  it('カテゴリ削除は次のカテゴリへ移動し削除確認を閉じる', async () => {
    const onDeleteCategory = vi.fn()
    const { result } = renderModalHook({
      group: createGroup({
        subCategories: ['Existing subcategory', 'Other subcategory'],
      }),
      onDeleteCategory,
    })

    act(() => {
      result.current.deletion.setShowDeleteConfirm(true)
    })

    await act(async () => {
      await result.current.deletion.handleDeleteCategory()
    })

    expect(onDeleteCategory).toHaveBeenCalledWith(
      'group-1',
      'Existing subcategory',
    )
    expect(result.current.subcategory.activeCategory).toBe('Other subcategory')
    expect(result.current.deletion.showDeleteConfirm).toBe(false)
  })

  it('カテゴリ削除は削除関数なし・削除失敗・最後のカテゴリを扱う', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { result: missingDeleteResult } = renderModalHook({
      onDeleteCategory: undefined as unknown as Parameters<
        typeof useCategoryKeywordModal
      >[0]['onDeleteCategory'],
    })

    await act(async () => {
      await missingDeleteResult.current.deletion.handleDeleteCategory()
    })

    expect(consoleError).toHaveBeenCalledWith('削除関数が定義されていません')

    const failingDelete = vi.fn(async () => {
      throw new Error('delete failed')
    })
    const { result: failingDeleteResult } = renderModalHook({
      onDeleteCategory: failingDelete,
    })

    await act(async () => {
      await failingDeleteResult.current.deletion.handleDeleteCategory()
    })

    expect(consoleError).toHaveBeenCalledWith(
      'カテゴリ削除エラー:',
      expect.any(Error),
    )

    const { result: singleCategoryResult } = renderModalHook({
      group: createGroup({ subCategories: ['Only category'] }),
    })

    await act(async () => {
      await singleCategoryResult.current.deletion.handleDeleteCategory()
    })

    expect(singleCategoryResult.current.subcategory.activeCategory).toBe('')

    const { result: duplicateCategoryResult } = renderModalHook({
      group: createGroup({
        subCategories: ['Duplicated category', 'Duplicated category'],
      }),
    })

    await act(async () => {
      await duplicateCategoryResult.current.deletion.handleDeleteCategory()
    })

    expect(duplicateCategoryResult.current.subcategory.activeCategory).toBe('')

    const { result: emptyCategoryResult } = renderModalHook({
      group: createGroup({ subCategories: [] }),
    })

    await act(async () => {
      await emptyCategoryResult.current.deletion.handleDeleteCategory()
    })

    expect(emptyCategoryResult.current.subcategory.activeCategory).toBe('')

    consoleError.mockRestore()
  })

  it('リネーム開始・キャンセル・同名保存を処理する', async () => {
    const input = document.createElement('input')
    input.dataset.renameInput = ''
    vi.spyOn(input, 'focus')
    const select = vi.spyOn(input, 'select')
    document.body.append(input)
    const { result } = renderModalHook()

    act(() => {
      result.current.rename.handleStartRenaming()
    })

    expect(result.current.rename.isRenaming).toBe(true)
    expect(result.current.rename.newCategoryName).toBe('Existing subcategory')
    expect(select).toHaveBeenCalled()

    act(() => {
      result.current.rename.handleCancelRenaming()
    })

    expect(result.current.rename.isRenaming).toBe(false)

    await act(async () => {
      result.current.rename.handleStartRenaming()
      await result.current.rename.handleSaveRenaming()
    })

    expect(result.current.rename.isRenaming).toBe(false)
  })

  it('リネーム開始と入力エラーは rename input が無くても処理する', async () => {
    const { result } = renderModalHook()

    act(() => {
      result.current.rename.handleStartRenaming()
    })

    expect(result.current.rename.isRenaming).toBe(true)

    await act(async () => {
      result.current.rename.handleRenameCategoryNameChange(
        createChangeEvent('a'.repeat(26)),
      )
    })

    await act(async () => {
      await result.current.rename.handleSaveRenaming()
    })

    expect(result.current.rename.categoryRenameError).toBe(
      '新規親カテゴリ名は25文字以下にしてください',
    )
  })

  it('リネーム保存でタブ、URL、並び順、キーワードを更新する', async () => {
    const group = createGroup({
      categoryKeywords: [
        {
          categoryName: 'Existing subcategory',
          keywords: ['Alpha'],
        },
      ],
      subCategoryOrder: ['Existing subcategory'],
      subCategoryOrderWithUncategorized: ['Existing subcategory', ''],
      urls: [
        {
          subCategory: 'Existing subcategory',
          title: 'A',
          url: 'https://example.com/a',
        },
      ],
    })
    const storage = setupChromeStorage({
      parentCategories: createParentCategories(),
      savedTabs: [
        group,
        createGroup({
          domain: 'other.example.com',
          id: 'group-2',
          subCategories: ['Existing subcategory'],
        }),
      ],
    })
    const { result } = renderModalHook({ group })

    await act(async () => {
      result.current.rename.handleRenameCategoryNameChange(
        createChangeEvent('Renamed subcategory'),
      )
    })

    await waitFor(() => {
      expect(result.current.rename.newCategoryName).toBe('Renamed subcategory')
    })

    await act(async () => {
      await result.current.rename.handleSaveRenaming()
    })

    expect(storage.local.set).toHaveBeenCalledWith({
      savedTabs: [
        expect.objectContaining({
          categoryKeywords: [
            {
              categoryName: 'Renamed subcategory',
              keywords: ['Alpha'],
            },
          ],
          subCategories: ['Renamed subcategory'],
          subCategoryOrder: ['Renamed subcategory'],
          subCategoryOrderWithUncategorized: ['Renamed subcategory', ''],
          urls: [
            {
              subCategory: 'Renamed subcategory',
              title: 'A',
              url: 'https://example.com/a',
            },
          ],
        }),
        expect.objectContaining({
          id: 'group-2',
          subCategories: ['Existing subcategory'],
        }),
      ],
    })
    expect(result.current.subcategory.activeCategory).toBe(
      'Renamed subcategory',
    )
    expect(toast.success).toHaveBeenCalledWith(
      'カテゴリ名を「Existing subcategory」から「Renamed subcategory」に変更しました',
    )
  })

  it('リネーム保存は入力エラー、重複名、保存失敗を通知する', async () => {
    const input = document.createElement('input')
    input.dataset.renameInput = ''
    vi.spyOn(input, 'focus')
    document.body.append(input)
    const storage = setupChromeStorage({
      parentCategories: createParentCategories(),
      savedTabs: [createGroup()],
    })
    const { result } = renderModalHook({
      group: createGroup({
        subCategories: ['Existing subcategory', 'Other subcategory'],
      }),
    })

    await act(async () => {
      result.current.rename.handleRenameCategoryNameChange(
        createChangeEvent('a'.repeat(26)),
      )
    })

    await waitFor(() => {
      expect(result.current.rename.newCategoryName).toBe('a'.repeat(26))
    })

    await act(async () => {
      await result.current.rename.handleSaveRenaming()
    })

    expect(result.current.rename.categoryRenameError).toBe(
      '新規親カテゴリ名は25文字以下にしてください',
    )

    await act(async () => {
      result.current.rename.handleRenameCategoryNameChange(
        createChangeEvent('Other subcategory'),
      )
    })

    await waitFor(() => {
      expect(result.current.rename.newCategoryName).toBe('Other subcategory')
    })

    await act(async () => {
      await result.current.rename.handleSaveRenaming()
    })

    expect(toast.error).toHaveBeenCalledWith(
      'このカテゴリ名は既に存在しています',
    )

    storage.local.set.mockRejectedValueOnce(new Error('rename failed'))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    await act(async () => {
      result.current.rename.handleRenameCategoryNameChange(
        createChangeEvent('Renamed after error'),
      )
    })

    await waitFor(() => {
      expect(result.current.rename.newCategoryName).toBe('Renamed after error')
    })

    await act(async () => {
      await result.current.rename.handleSaveRenaming()
    })

    expect(toast.error).toHaveBeenCalledWith('カテゴリ名の変更に失敗しました')
    expect(consoleError).toHaveBeenCalledWith(
      'カテゴリ名の変更中にエラーが発生しました:',
      expect.any(Error),
    )

    consoleError.mockRestore()
  })

  it('リネーム重複名は rename input が無くても通知する', async () => {
    const { result } = renderModalHook({
      group: createGroup({
        subCategories: ['Existing subcategory', 'Other subcategory'],
      }),
    })

    await act(async () => {
      result.current.rename.handleRenameCategoryNameChange(
        createChangeEvent('Other subcategory'),
      )
    })

    await waitFor(() => {
      expect(result.current.rename.newCategoryName).toBe('Other subcategory')
    })

    await act(async () => {
      await result.current.rename.handleSaveRenaming()
    })

    expect(toast.error).toHaveBeenCalledWith(
      'このカテゴリ名は既に存在しています',
    )
  })

  it('リネーム保存中の再実行は無視する', async () => {
    let resolveSet: (() => void) | undefined
    const storage = setupChromeStorage({
      parentCategories: createParentCategories(),
      savedTabs: [createGroup()],
    })
    storage.local.set.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveSet = resolve
        }),
    )
    const { result } = renderModalHook()

    await act(async () => {
      result.current.rename.handleRenameCategoryNameChange(
        createChangeEvent('Processing rename'),
      )
    })

    let firstSave: Promise<void>
    await act(async () => {
      firstSave = result.current.rename.handleSaveRenaming()
    })
    await waitFor(() => {
      expect(result.current.isProcessing).toBe(true)
    })

    await act(async () => {
      await result.current.rename.handleSaveRenaming()
    })

    expect(storage.local.set).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveSet?.()
      await firstSave!
    })
  })
})
