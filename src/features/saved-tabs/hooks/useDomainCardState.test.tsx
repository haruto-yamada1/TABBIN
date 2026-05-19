// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { TabGroup } from '@/types/storage'

import { useDomainCardState } from './useDomainCardState'

const useDomainCardStateI18nState = vi.hoisted(() => ({
  language: 'ja' as 'en' | 'ja',
}))

vi.mock('@/lib/storage/categories', () => ({
  createParentCategory: vi.fn(),
  getParentCategories: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/lib/storage/migration', () => ({
  assignDomainToCategory: vi.fn(),
}))

vi.mock('@/lib/storage/tabs', () => ({
  removeUrlFromTabGroup: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  },
}))

vi.mock('@/features/i18n/context/I18nProvider', async () => {
  const { getMessages } = await vi.importActual<
    typeof import('@/features/i18n/messages')
  >('@/features/i18n/messages')

  return {
    useI18n: () => ({
      language: useDomainCardStateI18nState.language,
      t: (key: string, fallback?: string, values?: Record<string, string>) => {
        const messages = getMessages(useDomainCardStateI18nState.language)
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

import { toast } from 'sonner'

import {
  createParentCategory,
  getParentCategories,
} from '@/lib/storage/categories'
import { assignDomainToCategory } from '@/lib/storage/migration'
import { removeUrlFromTabGroup } from '@/lib/storage/tabs'

const createGroup = (): TabGroup => ({
  id: 'group-1',
  domain: 'example.com',
  subCategories: ['news', 'tech'],
  urls: [
    { url: 'https://example.com/news-1', title: 'News 1', subCategory: 'news' },
    { url: 'https://example.com/news-2', title: 'News 2', subCategory: 'news' },
    { url: 'https://example.com/tech-1', title: 'Tech 1', subCategory: 'tech' },
  ],
})

describe('useDomainCardState', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    vi.mocked(getParentCategories).mockResolvedValue([])
    vi.mocked(createParentCategory).mockReset()
    vi.mocked(assignDomainToCategory).mockReset()
    vi.mocked(removeUrlFromTabGroup).mockReset()
    vi.mocked(removeUrlFromTabGroup).mockResolvedValue(undefined)
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
    globalThis.chrome = {
      storage: {
        local: {
          get: vi.fn(async () => ({
            savedTabs: [createGroup()],
          })),
          set: vi.fn(),
        },
      },
    } as unknown as typeof chrome
  })

  it('bulk delete handler があるときは子カテゴリ一括削除でそれを 1 回だけ使う', async () => {
    const handleDeleteUrls = vi.fn().mockResolvedValue(undefined)

    const { result } = renderHook(() =>
      useDomainCardState({
        group: createGroup(),
        handleDeleteCategory: vi.fn(),
        handleDeleteUrls,
        isReorderMode: false,
      } as never),
    )

    await waitFor(() => {
      expect(getParentCategories).toHaveBeenCalledTimes(1)
    })

    await act(async () => {
      await result.current.categoryActions.handleDeleteAllTabsInCategory(
        'news',
        [
          { url: 'https://example.com/news-1' },
          { url: 'https://example.com/news-2' },
        ],
      )
    })

    expect(handleDeleteUrls).toHaveBeenCalledTimes(1)
    expect(handleDeleteUrls).toHaveBeenCalledWith('group-1', [
      'https://example.com/news-1',
      'https://example.com/news-2',
    ])
    expect(removeUrlFromTabGroup).not.toHaveBeenCalled()
  })

  it('bulk delete handler がないときは個別削除にフォールバックする', async () => {
    const { result } = renderHook(() =>
      useDomainCardState({
        group: createGroup(),
        handleDeleteCategory: vi.fn(),
        isReorderMode: false,
      }),
    )

    await waitFor(() => {
      expect(getParentCategories).toHaveBeenCalledTimes(1)
    })

    await act(async () => {
      await result.current.categoryActions.handleDeleteAllTabsInCategory(
        'news',
        [
          { url: 'https://example.com/news-1' },
          { url: 'https://example.com/news-2' },
        ],
      )
    })

    expect(removeUrlFromTabGroup).toHaveBeenCalledTimes(2)
    expect(removeUrlFromTabGroup).toHaveBeenNthCalledWith(
      1,
      'group-1',
      'https://example.com/news-1',
    )
    expect(removeUrlFromTabGroup).toHaveBeenNthCalledWith(
      2,
      'group-1',
      'https://example.com/news-2',
    )
  })

  it('削除対象 URL が空なら何もしない', async () => {
    const handleDeleteUrls = vi.fn().mockResolvedValue(undefined)

    const { result } = renderHook(() =>
      useDomainCardState({
        group: createGroup(),
        handleDeleteCategory: vi.fn(),
        handleDeleteUrls,
        isReorderMode: false,
      }),
    )

    await waitFor(() => {
      expect(getParentCategories).toHaveBeenCalledTimes(1)
    })

    await act(async () => {
      await result.current.categoryActions.handleDeleteAllTabsInCategory(
        'news',
        [],
      )
    })

    expect(handleDeleteUrls).not.toHaveBeenCalled()
    expect(removeUrlFromTabGroup).not.toHaveBeenCalled()
  })

  it('URLを保存時刻で昇順/降順に並べてカテゴリ別に返す', async () => {
    const group: TabGroup = {
      ...createGroup(),
      subCategories: ['news'],
      urls: [
        {
          savedAt: 30,
          subCategory: 'news',
          title: 'Newer',
          url: 'https://example.com/newer',
        },
        {
          savedAt: 10,
          subCategory: 'news',
          title: 'Older',
          url: 'https://example.com/older',
        },
        {
          savedAt: 20,
          title: 'Uncategorized',
          url: 'https://example.com/uncategorized',
        },
      ],
    }

    const { result } = renderHook(() =>
      useDomainCardState({
        group,
        handleDeleteCategory: vi.fn(),
        isReorderMode: false,
      }),
    )

    await waitFor(() => {
      expect(getParentCategories).toHaveBeenCalledTimes(1)
    })

    act(() => {
      result.current.sort.setSortOrder('asc')
    })
    expect(
      result.current.computed.categorizedUrls.news.map((item) => item.title),
    ).toEqual(['Older', 'Newer'])

    act(() => {
      result.current.sort.setSortOrder('desc')
    })
    expect(
      result.current.computed.categorizedUrls.news.map((item) => item.title),
    ).toEqual(['Newer', 'Older'])
    expect(result.current.computed.categorizedUrls.__uncategorized).toEqual([
      expect.objectContaining({
        title: 'Uncategorized',
      }),
    ])
  })

  it('保存済みカテゴリ順を読み込みドラッグ確定/キャンセルを処理する', async () => {
    const group: TabGroup = {
      ...createGroup(),
      subCategoryOrderWithUncategorized: ['tech', 'news'],
    }
    const otherGroup: TabGroup = {
      ...createGroup(),
      id: 'other-group',
      domain: 'other.example.com',
    }
    const setStorage = vi.fn()
    globalThis.chrome = {
      storage: {
        local: {
          get: vi.fn(async () => ({
            savedTabs: [group, otherGroup],
          })),
          set: setStorage,
        },
      },
    } as unknown as typeof chrome

    const { result } = renderHook(() =>
      useDomainCardState({
        group,
        handleDeleteCategory: vi.fn(),
        isReorderMode: false,
      }),
    )

    await waitFor(() => {
      expect(result.current.categoryReorder.allCategoryIds).toEqual([
        'tech',
        'news',
      ])
    })

    act(() => {
      result.current.categoryReorder.handleCategoryDragEnd({
        active: { id: 'tech' },
        over: { id: 'news' },
      })
    })
    expect(result.current.categoryReorder.tempCategoryOrder).toEqual([
      'news',
      'tech',
    ])

    await act(async () => {
      await result.current.categoryReorder.handleConfirmCategoryReorder()
    })
    expect(setStorage).toHaveBeenCalledWith({
      savedTabs: [
        expect.objectContaining({
          id: 'group-1',
          subCategoryOrder: ['news', 'tech'],
          subCategoryOrderWithUncategorized: ['news', 'tech'],
        }),
        otherGroup,
      ],
    })
    expect(toast.success).toHaveBeenCalled()

    act(() => {
      result.current.categoryReorder.handleCategoryDragEnd({
        active: { id: 'news' },
        over: { id: 'tech' },
      })
    })
    act(() => {
      result.current.categoryReorder.handleCancelCategoryReorder()
    })
    expect(result.current.categoryReorder.isCategoryReorderMode).toBe(false)
    expect(toast.info).toHaveBeenCalled()
  })

  it('保存済みカテゴリ順は存在するカテゴリと未分類だけに正規化する', async () => {
    const group: TabGroup = {
      ...createGroup(),
      subCategories: ['news', 'tech'],
      subCategoryOrderWithUncategorized: ['missing', 'news'],
      urls: [
        {
          subCategory: 'news',
          title: 'News',
          url: 'https://example.com/news',
        },
        {
          title: 'Uncategorized',
          url: 'https://example.com/uncategorized',
        },
      ],
    }

    const { result } = renderHook(() =>
      useDomainCardState({
        group,
        handleDeleteCategory: vi.fn(),
        isReorderMode: false,
      }),
    )

    await waitFor(() => {
      expect(result.current.categoryReorder.allCategoryIds).toEqual([
        'news',
        '__uncategorized',
      ])
    })
  })

  it('保存済みカテゴリ順から不要な未分類を除き不足カテゴリを末尾に補う', async () => {
    const group: TabGroup = {
      ...createGroup(),
      subCategories: ['news', 'tech'],
      subCategoryOrderWithUncategorized: ['__uncategorized', 'news'],
      urls: [
        {
          subCategory: 'news',
          title: 'News',
          url: 'https://example.com/news',
        },
      ],
    }

    const { result } = renderHook(() =>
      useDomainCardState({
        group,
        handleDeleteCategory: vi.fn(),
        isReorderMode: false,
      }),
    )

    await waitFor(() => {
      expect(result.current.categoryReorder.allCategoryIds).toEqual(['news'])
    })
  })

  it('並び替えモード中の追加ドラッグは一時順序を更新する', async () => {
    const group: TabGroup = {
      ...createGroup(),
      subCategoryOrderWithUncategorized: ['news', 'tech'],
    }

    const { result } = renderHook(() =>
      useDomainCardState({
        group,
        handleDeleteCategory: vi.fn(),
        isReorderMode: false,
      }),
    )

    await waitFor(() => {
      expect(result.current.categoryReorder.allCategoryIds).toEqual([
        'news',
        'tech',
      ])
    })

    act(() => {
      result.current.categoryReorder.handleCategoryDragEnd({
        active: { id: 'news' },
        over: { id: 'tech' },
      })
    })
    act(() => {
      result.current.categoryReorder.handleCategoryDragEnd({
        active: { id: 'tech' },
        over: { id: 'news' },
      })
    })

    expect(result.current.categoryReorder.tempCategoryOrder).toEqual([
      'news',
      'tech',
    ])
  })

  it('カテゴリ順序保存失敗・未開始の確定/取消を扱う', async () => {
    const group: TabGroup = {
      ...createGroup(),
      subCategoryOrderWithUncategorized: ['news', 'tech'],
    }
    vi.mocked(chrome.storage.local.set).mockRejectedValueOnce(
      new Error('write failed'),
    )

    const { result } = renderHook(() =>
      useDomainCardState({
        group,
        handleDeleteCategory: vi.fn(),
        isReorderMode: false,
      }),
    )

    await waitFor(() => {
      expect(result.current.categoryReorder.allCategoryIds).toEqual([
        'news',
        'tech',
      ])
    })

    await act(async () => {
      await result.current.categoryReorder.handleConfirmCategoryReorder()
    })
    act(() => {
      result.current.categoryReorder.handleCancelCategoryReorder()
    })

    expect(toast.success).not.toHaveBeenCalled()
    expect(toast.info).not.toHaveBeenCalled()

    act(() => {
      result.current.categoryReorder.handleCategoryDragEnd({
        active: { id: 'news' },
        over: { id: 'tech' },
      })
    })

    await act(async () => {
      await result.current.categoryReorder.handleConfirmCategoryReorder()
    })

    expect(console.error).toHaveBeenCalledWith(
      'カテゴリ順序の更新に失敗しました:',
      expect.any(Error),
    )
  })

  it('カテゴリ設定とタブの変更を検知して表示順を更新する', async () => {
    const { result, rerender } = renderHook(
      ({ group }) =>
        useDomainCardState({
          group,
          handleDeleteCategory: vi.fn(),
          isReorderMode: false,
        }),
      {
        initialProps: {
          group: createGroup(),
        },
      },
    )

    await waitFor(() => {
      expect(result.current.categoryReorder.allCategoryIds).toEqual([
        'news',
        'tech',
      ])
    })

    await act(async () => {
      result.current.keywordModal.handleCloseKeywordModal()
      await Promise.resolve()
    })

    rerender({
      group: {
        ...createGroup(),
        subCategories: ['news', 'tech', 'later'],
        urls: [
          ...(createGroup().urls ?? []),
          {
            subCategory: 'later',
            title: 'Later',
            url: 'https://example.com/later',
          },
        ],
      },
    })

    await waitFor(() => {
      expect(result.current.categoryReorder.allCategoryIds).toEqual([
        'news',
        'tech',
        'later',
      ])
    })

    rerender({
      group: {
        ...createGroup(),
        urls: [
          {
            subCategory: 'tech',
            title: 'Moved',
            url: 'https://example.com/news-1',
          },
        ],
      },
    })

    await waitFor(() => {
      expect(result.current.categoryReorder.allCategoryIds).toEqual(['tech'])
    })
  })

  it('カテゴリ変更・モーダル close・親カテゴリ操作をハンドラへ反映する', async () => {
    const handleDeleteCategory = vi.fn()
    vi.mocked(createParentCategory).mockResolvedValue({
      domains: [],
      domainNames: [],
      id: 'parent-1',
      name: 'Parent',
    })
    vi.mocked(assignDomainToCategory).mockResolvedValue(undefined)

    const { result } = renderHook(() =>
      useDomainCardState({
        group: createGroup(),
        handleDeleteCategory,
        isReorderMode: false,
      }),
    )

    await waitFor(() => {
      expect(getParentCategories).toHaveBeenCalledTimes(1)
    })

    act(() => {
      result.current.keywordModal.setShowKeywordModal(true)
    })
    expect(result.current.keywordModal.showKeywordModal).toBe(true)

    await act(async () => {
      result.current.keywordModal.handleCloseKeywordModal()
      await Promise.resolve()
    })
    expect(result.current.keywordModal.showKeywordModal).toBe(false)

    act(() => {
      result.current.categoryActions.handleCategoryDelete('group-1', 'news')
    })
    expect(handleDeleteCategory).toHaveBeenCalledWith('group-1', 'news')

    await act(async () => {
      await expect(
        result.current.parentCategories.handleCreateParentCategory('Parent'),
      ).resolves.toEqual(
        expect.objectContaining({
          id: 'parent-1',
        }),
      )
    })
    expect(result.current.parentCategories.categories).toEqual([
      expect.objectContaining({
        id: 'parent-1',
      }),
    ])

    await act(async () => {
      await result.current.parentCategories.handleAssignToParentCategory(
        'group-1',
        'parent-1',
      )
    })
    expect(assignDomainToCategory).toHaveBeenCalledWith('group-1', 'parent-1')

    act(() => {
      result.current.parentCategories.handleUpdateParentCategories([
        {
          domains: [],
          domainNames: [],
          id: 'parent-2',
          name: 'Manual',
        },
      ])
    })
    expect(result.current.parentCategories.categories).toEqual([
      expect.objectContaining({
        id: 'parent-2',
      }),
    ])
  })

  it('カテゴリ削除ハンドラがない場合と各種失敗を扱う', async () => {
    vi.mocked(getParentCategories).mockRejectedValueOnce(
      new Error('load failed'),
    )
    vi.mocked(createParentCategory).mockRejectedValueOnce(
      new Error('create failed'),
    )
    vi.mocked(assignDomainToCategory).mockRejectedValueOnce(
      new Error('assign failed'),
    )
    vi.mocked(removeUrlFromTabGroup).mockRejectedValueOnce(
      new Error('delete failed'),
    )

    const { result } = renderHook(() =>
      useDomainCardState({
        group: createGroup(),
        isReorderMode: false,
      }),
    )

    await waitFor(() => {
      expect(console.error).toHaveBeenCalledWith(
        '親カテゴリの読み込みに失敗しました:',
        expect.any(Error),
      )
    })

    act(() => {
      result.current.categoryActions.handleCategoryDelete('group-1', 'news')
    })

    await act(async () => {
      await result.current.categoryActions.handleDeleteAllTabsInCategory(
        'news',
        [{ url: 'https://example.com/news-1' }],
      )
    })
    expect(console.error).toHaveBeenCalledWith(
      'カテゴリ内タブ削除エラー:',
      expect.any(Error),
    )

    await act(async () => {
      await expect(
        result.current.parentCategories.handleCreateParentCategory('Parent'),
      ).rejects.toThrow('create failed')
    })
    await act(async () => {
      await expect(
        result.current.parentCategories.handleAssignToParentCategory(
          'group-1',
          'parent-1',
        ),
      ).rejects.toThrow('assign failed')
    })

    expect(console.error).toHaveBeenCalledWith(
      '親カテゴリ作成エラー:',
      expect.any(Error),
    )
    expect(console.error).toHaveBeenCalledWith(
      'ドメイン割り当てエラー:',
      expect.any(Error),
    )
  })

  it('drag monitor はドラッグ中に折りたたみ、通常終了時にユーザー状態へ戻す', async () => {
    const { result, rerender } = renderHook(
      ({ isReorderMode }) =>
        useDomainCardState({
          group: createGroup(),
          handleDeleteCategory: vi.fn(),
          isReorderMode,
        }),
      {
        initialProps: {
          isReorderMode: false,
        },
      },
    )

    await waitFor(() => {
      expect(getParentCategories).toHaveBeenCalledTimes(1)
    })

    act(() => {
      result.current.collapse.setUserCollapsedState(true)
    })
    expect(result.current.collapse.isCollapsed).toBe(true)

    act(() => {
      result.current.dndMonitorHandlers.onDragStart()
    })
    expect(result.current.collapse.isCollapsed).toBe(true)

    act(() => {
      result.current.dndMonitorHandlers.onDragEnd()
    })
    expect(result.current.collapse.isCollapsed).toBe(true)

    rerender({
      isReorderMode: true,
    })
    expect(result.current.collapse.isCollapsed).toBe(true)

    act(() => {
      result.current.dndMonitorHandlers.onDragCancel()
    })
    expect(result.current.collapse.isCollapsed).toBe(true)
  })

  it('drag monitor はユーザーが畳んでいなければ通常終了時に展開する', async () => {
    const { result } = renderHook(() =>
      useDomainCardState({
        group: createGroup(),
        handleDeleteCategory: vi.fn(),
        isReorderMode: false,
      }),
    )

    await waitFor(() => {
      expect(getParentCategories).toHaveBeenCalledTimes(1)
    })

    act(() => {
      result.current.dndMonitorHandlers.onDragStart()
    })
    expect(result.current.collapse.isCollapsed).toBe(true)

    act(() => {
      result.current.dndMonitorHandlers.onDragEnd()
    })
    expect(result.current.collapse.isCollapsed).toBe(false)

    act(() => {
      result.current.dndMonitorHandlers.onDragStart()
    })
    expect(result.current.collapse.isCollapsed).toBe(true)

    act(() => {
      result.current.dndMonitorHandlers.onDragCancel()
    })
    expect(result.current.collapse.isCollapsed).toBe(false)
  })
})
