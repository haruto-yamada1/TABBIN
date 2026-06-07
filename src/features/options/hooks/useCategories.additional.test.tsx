// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import type { KeyboardEvent } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

import { useCategories } from './useCategories'

vi.mock('@/lib/storage/categories', () => ({
  createParentCategory: vi.fn(),
  getParentCategories: vi.fn(),
}))

import {
  createParentCategory,
  getParentCategories,
} from '@/lib/storage/categories'

type StorageListener = (
  changes: Record<string, chrome.storage.StorageChange>,
  areaName: string,
) => void

const listeners: StorageListener[] = []

const createChromeMock = () =>
  ({
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

describe('useCategories の追加分岐', () => {
  beforeEach(() => {
    listeners.length = 0
    vi.clearAllMocks()
    vi.useRealTimers()
    ;(globalThis as unknown as { chrome: typeof chrome }).chrome =
      createChromeMock()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('カテゴリ読み込みエラーを適切に処理する', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    vi.mocked(getParentCategories).mockRejectedValue(new Error('load failed'))

    const { result } = renderHook(() => useCategories())

    await waitFor(() => {
      expect(getParentCategories).toHaveBeenCalledTimes(1)
    })

    expect(result.current.parentCategories).toStrictEqual([])
    expect(consoleErrorSpy).toHaveBeenCalled()
  })

  it('カテゴリ名が空白のとき false を返す', async () => {
    vi.mocked(getParentCategories).mockResolvedValue([])

    const { result } = renderHook(() => useCategories())

    await waitFor(() => {
      expect(result.current.parentCategories).toStrictEqual([])
    })

    let success = true
    await act(async () => {
      success = await result.current.handleAddCategory()
    })

    expect(success).toBe(false)
    expect(createParentCategory).not.toHaveBeenCalled()
  })

  it('作成エラーを表示しタイムアウト後にクリアする', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    vi.mocked(getParentCategories).mockResolvedValue([])
    vi.mocked(createParentCategory).mockRejectedValue(
      new Error('create failed'),
    )

    const { result } = renderHook(() => useCategories())

    await waitFor(() => {
      expect(result.current.parentCategories).toStrictEqual([])
    })

    act(() => {
      result.current.setNewCategoryName('Valid Category')
    })

    vi.useFakeTimers()

    let success = true
    await act(async () => {
      success = await result.current.handleAddCategory()
    })

    expect(success).toBe(false)
    expect(result.current.categoryError).toBe('カテゴリの追加に失敗しました。')
    expect(consoleErrorSpy).toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(3000)
    })

    expect(result.current.categoryError).toBeNull()
  })

  it('handleCategoryKeyDown はエラーがない場合 Enter でカテゴリを追加する', async () => {
    vi.mocked(getParentCategories).mockResolvedValue([])
    vi.mocked(createParentCategory).mockResolvedValue({
      id: 'new-id',
      name: 'Created by Enter',
      domains: [],
      domainNames: [],
    })

    const { result } = renderHook(() => useCategories())
    const preventDefault = vi.fn()

    await waitFor(() => {
      expect(result.current.parentCategories).toStrictEqual([])
    })

    act(() => {
      result.current.setNewCategoryName('Created by Enter')
    })

    // eslint-disable-next-line typescript/require-await
    await act(async () => {
      result.current.handleCategoryKeyDown({
        key: 'Enter',
        preventDefault,
      } as unknown as KeyboardEvent<HTMLInputElement>)
    })

    expect(preventDefault).toHaveBeenCalledTimes(1)
    await waitFor(() => {
      expect(createParentCategory).toHaveBeenCalledWith('Created by Enter')
    })
  })

  it('handleCategoryKeyDown は Enter 以外のキーでは何もしない', async () => {
    vi.mocked(getParentCategories).mockResolvedValue([])

    const { result } = renderHook(() => useCategories())
    const preventDefault = vi.fn()

    await waitFor(() => {
      expect(result.current.parentCategories).toStrictEqual([])
    })

    act(() => {
      result.current.setNewCategoryName('Should Not Run')
      result.current.handleCategoryKeyDown({
        key: 'Escape',
        preventDefault,
      } as unknown as KeyboardEvent<HTMLInputElement>)
    })

    expect(preventDefault).not.toHaveBeenCalled()
    expect(createParentCategory).not.toHaveBeenCalled()
  })

  it('handleCategoryKeyDown は既存エラーがあると追加をスキップする', async () => {
    vi.mocked(getParentCategories).mockResolvedValue([])

    const { result } = renderHook(() => useCategories())
    const preventDefault = vi.fn()

    await waitFor(() => {
      expect(result.current.parentCategories).toStrictEqual([])
    })

    act(() => {
      result.current.setCategoryError('already error')
    })

    act(() => {
      result.current.handleCategoryKeyDown({
        key: 'Enter',
        preventDefault,
      } as unknown as KeyboardEvent<HTMLInputElement>)
    })

    expect(preventDefault).toHaveBeenCalledTimes(1)
    expect(createParentCategory).not.toHaveBeenCalled()
  })

  it('parentCategories キーがない local storage 変更は無視する', async () => {
    vi.mocked(getParentCategories).mockResolvedValue([
      { id: 'cat-1', name: 'Initial', domains: [], domainNames: [] },
    ])

    const { result } = renderHook(() => useCategories())

    await waitFor(() => {
      expect(result.current.parentCategories).toStrictEqual([
        { id: 'cat-1', name: 'Initial', domains: [], domainNames: [] },
      ])
    })

    act(() => {
      listeners[0](
        {
          anotherKey: {
            oldValue: [],
            newValue: [{ id: 'cat-2', name: 'Ignored' }],
          },
        },
        'local',
      )
    })

    expect(result.current.parentCategories).toStrictEqual([
      { id: 'cat-1', name: 'Initial', domains: [], domainNames: [] },
    ])
  })

  it('local 以外の領域からのストレージ更新を無視する', async () => {
    vi.mocked(getParentCategories).mockResolvedValue([
      { id: 'cat-1', name: 'Initial', domains: [], domainNames: [] },
    ])

    const { result } = renderHook(() => useCategories())

    await waitFor(() => {
      expect(result.current.parentCategories).toStrictEqual([
        { id: 'cat-1', name: 'Initial', domains: [], domainNames: [] },
      ])
    })

    act(() => {
      listeners[0](
        {
          parentCategories: {
            oldValue: [
              { id: 'cat-1', name: 'Initial', domains: [], domainNames: [] },
            ],
            newValue: [
              { id: 'cat-2', name: 'Ignored', domains: [], domainNames: [] },
            ],
          },
        },
        'sync',
      )
    })

    expect(result.current.parentCategories).toStrictEqual([
      { id: 'cat-1', name: 'Initial', domains: [], domainNames: [] },
    ])
  })

  it('ストレージ変更 payload が配列でない場合は空カテゴリにフォールバックする', async () => {
    vi.mocked(getParentCategories).mockResolvedValue([
      { id: 'cat-1', name: 'Initial', domains: [], domainNames: [] },
    ])

    const { result } = renderHook(() => useCategories())

    await waitFor(() => {
      expect(result.current.parentCategories.length).toBe(1)
    })

    act(() => {
      listeners[0](
        {
          parentCategories: {
            oldValue: [
              { id: 'cat-1', name: 'Initial', domains: [], domainNames: [] },
            ],
            newValue: { invalid: true },
          },
        },
        'local',
      )
    })

    expect(result.current.parentCategories).toStrictEqual([])
  })

  it('userSettings のストレージ変更で表示言語を更新する', async () => {
    vi.mocked(getParentCategories).mockResolvedValue([])
    ;(globalThis as unknown as { chrome: typeof chrome }).chrome = {
      ...createChromeMock(),
      i18n: {
        getUILanguage: vi.fn(() => 'en-US'),
      },
    } as unknown as typeof chrome

    const { result } = renderHook(() => useCategories())

    await waitFor(() => {
      expect(result.current.parentCategories).toStrictEqual([])
    })

    act(() => {
      listeners[0](
        {
          userSettings: {
            oldValue: { language: 'ja' },
            newValue: { language: 'system' },
          },
        },
        'local',
      )
    })

    act(() => {
      result.current.setNewCategoryName('a'.repeat(26))
    })

    let success = true
    await act(async () => {
      success = await result.current.handleAddCategory()
    })

    expect(success).toBe(false)
    expect(result.current.categoryError).toBe(
      'Category names must be 25 characters or fewer',
    )
  })

  it('chrome.storage が利用できない環境でもクラッシュせず初期化できる', async () => {
    vi.mocked(getParentCategories).mockResolvedValue([])
    ;(globalThis as unknown as { chrome: typeof chrome }).chrome =
      {} as typeof chrome

    const { result } = renderHook(() => useCategories())

    await waitFor(() => {
      expect(result.current.parentCategories).toStrictEqual([])
    })
  })
})
