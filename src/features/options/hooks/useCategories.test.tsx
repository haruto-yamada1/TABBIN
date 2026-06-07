// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

import { useCategories } from './useCategories'

vi.mock('@/lib/storage/categories', () => ({
  createParentCategory: vi.fn(),
  getParentCategories: vi.fn(),
}))

vi.mock('@/lib/storage/settings', () => ({
  getUserSettings: vi.fn(),
}))

import {
  createParentCategory,
  getParentCategories,
} from '@/lib/storage/categories'
import { getUserSettings } from '@/lib/storage/settings'
import type { UserSettings } from '@/types/storage'

type StorageListener = (
  changes: Record<string, chrome.storage.StorageChange>,
  areaName: string,
) => void

const listeners: StorageListener[] = []

const userSettings: UserSettings = {
  removeTabAfterOpen: true,
  removeTabAfterExternalDrop: true,
  excludePatterns: [],
  enableCategories: true,
  autoDeletePeriod: 'never',
  showSavedTime: false,
  clickBehavior: 'saveSameDomainTabs',
  excludePinnedTabs: true,
  openUrlInBackground: true,
  openAllInNewWindow: false,
  confirmDeleteAll: false,
  confirmDeleteEach: false,
  colors: {},
  ollamaModel: '',
}

const createChromeMock = () =>
  ({
    i18n: {
      getUILanguage: () => 'ja',
    },
    storage: {
      onChanged: {
        addListener: vi.fn((listener: StorageListener) => {
          listeners.push(listener)
        }),
        removeListener: vi.fn((listener: StorageListener) => {
          const index = listeners.indexOf(listener)
          if (index >= 0) {
            listeners.splice(index, 1)
          }
        }),
      },
    },
  }) as unknown as typeof chrome

describe('useCategoriesフック', () => {
  beforeEach(() => {
    listeners.length = 0
    vi.useRealTimers()
    vi.clearAllMocks()
    vi.mocked(getUserSettings).mockResolvedValue(userSettings)
    ;(globalThis as unknown as { chrome: typeof chrome }).chrome =
      createChromeMock()
  })

  it('マウント時にカテゴリを読み込む', async () => {
    const categories = [
      { id: '1', name: 'Work', domains: [], domainNames: [] },
      { id: '2', name: 'Private', domains: [], domainNames: [] },
    ]
    vi.mocked(getParentCategories).mockResolvedValue(categories)

    const { result } = renderHook(() => useCategories())

    await waitFor(() => {
      expect(result.current.parentCategories).toStrictEqual(categories)
    })
  })

  it('カテゴリ読み込み失敗時にエラーをログ出力する', async () => {
    const error = new Error('load failed')
    vi.mocked(getParentCategories).mockRejectedValue(error)
    using consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    renderHook(() => useCategories())

    await waitFor(() => {
      expect(consoleError).toHaveBeenCalledWith(
        'カテゴリの読み込みエラー:',
        error,
      )
    })
  })

  it('カテゴリ名の重複追加を防ぐ（大文字小文字を区別しない）', async () => {
    vi.mocked(getParentCategories).mockResolvedValue([
      { id: '1', name: 'Work', domains: [], domainNames: [] },
    ])

    const { result } = renderHook(() => useCategories())

    await waitFor(() => {
      expect(result.current.parentCategories.length).toBe(1)
    })

    vi.useFakeTimers()
    try {
      act(() => {
        result.current.setNewCategoryName('work')
      })

      let success = true
      await act(async () => {
        success = await result.current.handleAddCategory()
      })

      expect(success).toBe(false)
      expect(createParentCategory).not.toHaveBeenCalled()
      expect(result.current.categoryError).toBe(
        '同じ名前のカテゴリがすでに存在します。',
      )

      act(() => {
        vi.advanceTimersByTime(3000)
      })

      expect(result.current.categoryError).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('25文字を超えるカテゴリ名を拒否する', async () => {
    vi.mocked(getParentCategories).mockResolvedValue([])

    const { result } = renderHook(() => useCategories())

    await waitFor(() => {
      expect(result.current.parentCategories).toStrictEqual([])
    })

    vi.useFakeTimers()
    try {
      act(() => {
        result.current.setNewCategoryName('a'.repeat(26))
      })

      let success = true
      await act(async () => {
        success = await result.current.handleAddCategory()
      })

      expect(success).toBe(false)
      expect(createParentCategory).not.toHaveBeenCalled()
      expect(result.current.categoryError).toBe(
        'カテゴリ名は25文字以下にしてください',
      )

      act(() => {
        vi.advanceTimersByTime(3000)
      })

      expect(result.current.categoryError).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('トリム後にカテゴリ名が空なら false を返す', async () => {
    vi.mocked(getParentCategories).mockResolvedValue([])

    const { result } = renderHook(() => useCategories())

    await waitFor(() => {
      expect(result.current.parentCategories).toStrictEqual([])
    })

    act(() => {
      result.current.setNewCategoryName('   ')
    })

    let success = true
    await act(async () => {
      success = await result.current.handleAddCategory()
    })

    expect(success).toBe(false)
    expect(createParentCategory).not.toHaveBeenCalled()
  })

  it('入力が有効かつ一意ならカテゴリを追加する', async () => {
    vi.mocked(getParentCategories).mockResolvedValue([])
    vi.mocked(createParentCategory).mockResolvedValue({
      id: 'new-id',
      name: 'New Category',
      domains: [],
      domainNames: [],
    })

    const { result } = renderHook(() => useCategories())

    await waitFor(() => {
      expect(result.current.parentCategories).toStrictEqual([])
    })

    act(() => {
      result.current.setNewCategoryName('  New Category  ')
    })

    let success = false
    await act(async () => {
      success = await result.current.handleAddCategory()
    })

    expect(success).toBe(true)
    expect(createParentCategory).toHaveBeenCalledWith('New Category')
    expect(result.current.newCategoryName).toBe('')
    expect(result.current.categoryError).toBeNull()
  })

  it('カテゴリ作成エラーを処理する', async () => {
    const error = new Error('create failed')
    vi.mocked(getParentCategories).mockResolvedValue([])
    vi.mocked(createParentCategory).mockRejectedValue(error)
    using consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { result } = renderHook(() => useCategories())

    await waitFor(() => {
      expect(result.current.parentCategories).toStrictEqual([])
    })

    vi.useFakeTimers()
    try {
      act(() => {
        result.current.setNewCategoryName('Work')
      })

      let success = true
      await act(async () => {
        success = await result.current.handleAddCategory()
      })

      expect(success).toBe(false)
      expect(consoleError).toHaveBeenCalledWith('カテゴリ追加エラー:', error)
      expect(result.current.categoryError).toBe(
        'カテゴリの追加に失敗しました。',
      )

      act(() => {
        vi.advanceTimersByTime(3000)
      })

      expect(result.current.categoryError).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('chrome.storage の変更からカテゴリ更新を反映する', async () => {
    vi.mocked(getParentCategories).mockResolvedValue([])

    const { result } = renderHook(() => useCategories())

    await waitFor(() => {
      expect(result.current.parentCategories).toStrictEqual([])
    })

    const updatedCategories = [
      { id: '10', name: 'Updated', domains: [], domainNames: [] },
    ]

    act(() => {
      listeners[0](
        {
          parentCategories: {
            oldValue: [],
            newValue: updatedCategories,
          },
        },
        'local',
      )
    })

    expect(result.current.parentCategories).toStrictEqual(updatedCategories)
  })

  it('無関係なストレージ変更を無視し不正な parentCategories payload をリセットする', async () => {
    vi.mocked(getParentCategories).mockResolvedValue([])

    const { result } = renderHook(() => useCategories())

    await waitFor(() => {
      expect(result.current.parentCategories).toStrictEqual([])
    })

    const syncCategories = [
      { id: '20', name: 'Sync', domains: [], domainNames: [] },
    ]

    act(() => {
      listeners[0](
        {
          parentCategories: {
            oldValue: [],
            newValue: syncCategories,
          },
        },
        'sync',
      )
    })

    expect(result.current.parentCategories).toStrictEqual([])

    const localCategories = [
      { id: '21', name: 'Local', domains: [], domainNames: [] },
    ]

    act(() => {
      listeners[0](
        {
          parentCategories: {
            oldValue: [],
            newValue: localCategories,
          },
        },
        'local',
      )
    })

    expect(result.current.parentCategories).toStrictEqual(localCategories)

    act(() => {
      listeners[0]({}, 'local')
    })

    expect(result.current.parentCategories).toStrictEqual(localCategories)

    act(() => {
      listeners[0](
        {
          parentCategories: {
            oldValue: localCategories,
            newValue: 'invalid',
          },
        },
        'local',
      )
    })

    expect(result.current.parentCategories).toStrictEqual([])
  })

  it('userSettings の language が欠損した storage change では UI locale にフォールバックする', async () => {
    vi.mocked(getParentCategories).mockResolvedValue([
      { id: '1', name: 'Work', domains: [], domainNames: [] },
    ])

    const { result } = renderHook(() => useCategories())

    await waitFor(() => {
      expect(result.current.parentCategories).toHaveLength(1)
    })

    act(() => {
      listeners[0](
        {
          userSettings: {
            oldValue: { language: 'en' },
            newValue: {},
          },
        },
        'local',
      )
    })

    act(() => {
      result.current.setNewCategoryName('work')
    })

    let success = true
    await act(async () => {
      success = await result.current.handleAddCategory()
    })

    expect(success).toBe(false)
    expect(result.current.categoryError).toBe(
      '同じ名前のカテゴリがすでに存在します。',
    )
  })

  it('エラーがない場合 Enter キーでカテゴリを追加する', async () => {
    vi.mocked(getParentCategories).mockResolvedValue([])
    vi.mocked(createParentCategory).mockResolvedValue({
      id: 'enter-id',
      name: 'Enter Add',
      domains: [],
      domainNames: [],
    })

    const { result } = renderHook(() => useCategories())

    await waitFor(() => {
      expect(result.current.parentCategories).toStrictEqual([])
    })

    act(() => {
      result.current.setNewCategoryName('Enter Add')
    })

    const event = {
      key: 'Enter',
      preventDefault: vi.fn(),
    } as unknown as React.KeyboardEvent<HTMLInputElement>

    act(() => {
      result.current.handleCategoryKeyDown(event)
    })

// eslint-disable-next-line typescript/unbound-method
    expect(event.preventDefault).toHaveBeenCalledTimes(1)
    await waitFor(() => {
      expect(createParentCategory).toHaveBeenCalledWith('Enter Add')
    })
  })

  it('エラーがある場合 Enter キーでカテゴリを追加しない', async () => {
    vi.mocked(getParentCategories).mockResolvedValue([])

    const { result } = renderHook(() => useCategories())

    await waitFor(() => {
      expect(result.current.parentCategories).toStrictEqual([])
    })

    act(() => {
      result.current.setNewCategoryName('Blocked')
      result.current.setCategoryError('already has error')
    })

    const event = {
      key: 'Enter',
      preventDefault: vi.fn(),
    } as unknown as React.KeyboardEvent<HTMLInputElement>

    act(() => {
      result.current.handleCategoryKeyDown(event)
    })

// eslint-disable-next-line typescript/unbound-method
    expect(event.preventDefault).toHaveBeenCalledTimes(1)
    expect(createParentCategory).not.toHaveBeenCalled()
  })

  it('keydown ハンドラで Enter 以外のキーを無視する', async () => {
    vi.mocked(getParentCategories).mockResolvedValue([])

    const { result } = renderHook(() => useCategories())

    await waitFor(() => {
      expect(result.current.parentCategories).toStrictEqual([])
    })

    const event = {
      key: 'Tab',
      preventDefault: vi.fn(),
    } as unknown as React.KeyboardEvent<HTMLInputElement>

    act(() => {
      result.current.handleCategoryKeyDown(event)
    })

// eslint-disable-next-line typescript/unbound-method
    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(createParentCategory).not.toHaveBeenCalled()
  })

  it('アンマウント時にストレージリスナーを解除する', async () => {
    vi.mocked(getParentCategories).mockResolvedValue([])

    const { unmount } = renderHook(() => useCategories())
// eslint-disable-next-line typescript/unbound-method
    const addListener = vi.mocked(chrome.storage.onChanged.addListener)
// eslint-disable-next-line typescript/unbound-method
    const removeListener = vi.mocked(chrome.storage.onChanged.removeListener)

    await waitFor(() => {
      expect(addListener).toHaveBeenCalledTimes(1)
    })

    const listener = addListener.mock.calls[0]?.[0]
    unmount()

    expect(removeListener).toHaveBeenCalledTimes(1)
    expect(removeListener.mock.calls[0]?.[0]).toBe(listener)
  })
})
