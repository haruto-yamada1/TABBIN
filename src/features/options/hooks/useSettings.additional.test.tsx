// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ChangeEvent } from 'react'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

import { useSettings } from './useSettings'

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
  },
}))

vi.mock('@/lib/storage/settings', () => {
  const defaultSettings = {
    removeTabAfterOpen: true,
    removeTabAfterExternalDrop: true,
    excludePatterns: ['chrome-extension://', 'chrome://'],
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
  }

  return {
    defaultSettings,
    getUserSettings: vi.fn(),
    saveUserSettings: vi.fn(),
  }
})

import {
  defaultSettings,
  getUserSettings,
  saveUserSettings,
} from '@/lib/storage/settings'

type StorageListener = (
  changes: Record<string, chrome.storage.StorageChange>,
  areaName: string,
) => void

interface RetryToastOptions {
  action?: {
    label: string
    onClick: () => Promise<void> | void
  }
}

const listeners: StorageListener[] = []

const createChromeMock = () =>
  ({
    storage: {
      local: {
        set: vi.fn(),
      },
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

describe('useSettings の追加分岐', () => {
  beforeEach(() => {
    listeners.length = 0
    vi.clearAllMocks()
    ;(globalThis as unknown as { chrome: typeof chrome }).chrome =
      createChromeMock()
  })

  it('アンマウント時にストレージリスナーを解除する', async () => {
    vi.mocked(getUserSettings).mockResolvedValue(defaultSettings)

    const { result, unmount } = renderHook(() => useSettings())
// eslint-disable-next-line typescript/unbound-method
    const addListener = vi.mocked(chrome.storage.onChanged.addListener)

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

// eslint-disable-next-line typescript/unbound-method
    const removeListener = vi.mocked(chrome.storage.onChanged.removeListener)
    const listener = addListener.mock.calls[0]?.[0]

    expect(removeListener).toHaveBeenCalledTimes(0)

    unmount()

    expect(removeListener).toHaveBeenCalledTimes(1)
    expect(removeListener.mock.calls[0]?.[0]).toBe(listener)
    expect(removeListener.mock.calls[0]?.[0]).toStrictEqual(
      expect.any(Function),
    )
  })

  it('updateSetting の永続化に失敗したとき false を返す', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    vi.mocked(getUserSettings).mockResolvedValue(defaultSettings)
    vi.mocked(saveUserSettings).mockRejectedValue(new Error('persist failed'))

    const { result } = renderHook(() => useSettings())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    let success = true
    await act(async () => {
      success = await result.current.updateSetting('showSavedTime', true)
    })

    expect(success).toBe(false)
    expect(result.current.settings.showSavedTime).toBe(false)
    expect(toast.error).toHaveBeenCalledWith(
      '設定の保存に失敗しました',
      expect.objectContaining({
        action: expect.objectContaining({ label: '再試行' }),
      }),
    )
    expect(consoleErrorSpy).toHaveBeenCalled()

    const retryToast = vi.mocked(toast.error).mock.calls.at(-1)?.[1] as
      | RetryToastOptions
      | undefined
    vi.mocked(saveUserSettings).mockResolvedValueOnce(undefined)

    await act(async () => {
      await retryToast?.action?.onClick()
    })

    expect(result.current.settings.showSavedTime).toBe(true)
    expect(saveUserSettings).toHaveBeenLastCalledWith(
      expect.objectContaining({ showSavedTime: true }),
    )
  })

  it('再試行も失敗したときはロールバック状態を保って再通知する', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    vi.mocked(getUserSettings).mockResolvedValue(defaultSettings)
    vi.mocked(saveUserSettings).mockRejectedValue(new Error('persist failed'))

    const { result } = renderHook(() => useSettings())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    await act(async () => {
      await result.current.updateSetting('showSavedTime', true)
    })

    const retryToast = vi.mocked(toast.error).mock.calls.at(-1)?.[1] as
      | RetryToastOptions
      | undefined

    await act(async () => {
      await retryToast?.action?.onClick()
    })

    expect(result.current.settings.showSavedTime).toBe(false)
    expect(toast.error).toHaveBeenCalledTimes(2)
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '設定の再保存エラー:',
      expect.any(Error),
    )
  })

  it('handleSaveSettings で保存エラーを握りつぶす', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    vi.mocked(getUserSettings).mockResolvedValue(defaultSettings)
    vi.mocked(saveUserSettings).mockRejectedValue(new Error('save failed'))

    const { result } = renderHook(() => useSettings())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    act(() => {
      result.current.handleExcludePatternsChange({
        target: { value: 'first\n\nsecond' },
      } as ChangeEvent<HTMLTextAreaElement>)
    })

    await act(async () => {
      await result.current.handleSaveSettings()
    })

    expect(saveUserSettings).toHaveBeenCalled()
    expect(result.current.settings.excludePatterns).toStrictEqual(
      defaultSettings.excludePatterns,
    )
    expect(toast.error).toHaveBeenCalledWith(
      '設定の保存に失敗しました',
      expect.objectContaining({
        action: expect.objectContaining({ label: '再試行' }),
      }),
    )
    expect(consoleErrorSpy).toHaveBeenCalled()
  })

  it('handleExcludePatternsBlur 経由で保存を実行する', async () => {
    vi.mocked(getUserSettings).mockResolvedValue(defaultSettings)
    vi.mocked(saveUserSettings).mockResolvedValue(undefined)

    const { result } = renderHook(() => useSettings())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    act(() => {
      result.current.handleExcludePatternsChange({
        target: { value: 'a\n\nb' },
      } as ChangeEvent<HTMLTextAreaElement>)
    })

    act(() => {
      result.current.handleExcludePatternsBlur()
    })

    await waitFor(() => {
      expect(saveUserSettings).toHaveBeenCalledTimes(1)
    })
  })

  it('addExcludePattern は trim 後に重複する値を追加しない', async () => {
    vi.mocked(getUserSettings).mockResolvedValue(defaultSettings)
    vi.mocked(saveUserSettings).mockResolvedValue(undefined)

    const { result } = renderHook(() => useSettings())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    act(() => {
      result.current.handleExcludePatternInputChange({
        target: { value: ' chrome:// ' },
      } as ChangeEvent<HTMLInputElement>)
    })

    let success = true
    await act(async () => {
      success = await result.current.addExcludePattern()
    })

    expect(success).toBe(false)
    expect(result.current.excludePatternInput).toBe(' chrome:// ')
    expect(result.current.settings.excludePatterns).toStrictEqual(
      defaultSettings.excludePatterns,
    )
    expect(saveUserSettings).not.toHaveBeenCalled()
  })

  it('addExcludePattern は空白入力をクリアして false を返し、保存失敗も false を返す', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    vi.mocked(getUserSettings).mockResolvedValue(defaultSettings)
    vi.mocked(saveUserSettings).mockRejectedValueOnce(new Error('add failed'))

    const { result } = renderHook(() => useSettings())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    act(() => {
      result.current.handleExcludePatternInputChange({
        target: { value: '   ' },
      } as ChangeEvent<HTMLInputElement>)
    })

    let success = true
    await act(async () => {
      success = await result.current.addExcludePattern()
    })

    expect(success).toBe(false)
    expect(result.current.excludePatternInput).toBe('')

    act(() => {
      result.current.handleExcludePatternInputChange({
        target: { value: 'https://failed.example.com' },
      } as ChangeEvent<HTMLInputElement>)
    })

    await act(async () => {
      success = await result.current.addExcludePattern()
    })

    expect(success).toBe(false)
    expect(result.current.settings.excludePatterns).toStrictEqual(
      defaultSettings.excludePatterns,
    )
    expect(toast.error).toHaveBeenCalledWith(
      '設定の保存に失敗しました',
      expect.objectContaining({
        action: expect.objectContaining({ label: '再試行' }),
      }),
    )
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '除外パターンの追加エラー:',
      expect.any(Error),
    )
  })

  it('removeExcludePattern は対象のみ削除して保存する', async () => {
    vi.mocked(getUserSettings).mockResolvedValue(defaultSettings)
    vi.mocked(saveUserSettings).mockResolvedValue(undefined)

    const { result } = renderHook(() => useSettings())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    await act(async () => {
      await result.current.removeExcludePattern('chrome://')
    })

    expect(result.current.settings.excludePatterns).toStrictEqual([
      'chrome-extension://',
    ])
    expect(saveUserSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        excludePatterns: ['chrome-extension://'],
      }),
    )
  })

  it('removeExcludePattern は保存失敗をログに出す', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    vi.mocked(getUserSettings).mockResolvedValue(defaultSettings)
    vi.mocked(saveUserSettings).mockRejectedValue(new Error('remove failed'))

    const { result } = renderHook(() => useSettings())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    await act(async () => {
      await result.current.removeExcludePattern('chrome://')
    })

    expect(result.current.settings.excludePatterns).toStrictEqual(
      defaultSettings.excludePatterns,
    )
    expect(toast.error).toHaveBeenCalledWith(
      '設定の保存に失敗しました',
      expect.objectContaining({
        action: expect.objectContaining({ label: '再試行' }),
      }),
    )
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '除外パターンの削除エラー:',
      expect.any(Error),
    )
  })

  it('local 以外の領域からのストレージ更新を無視する', async () => {
    vi.mocked(getUserSettings).mockResolvedValue(defaultSettings)

    const { result } = renderHook(() => useSettings())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    const before = result.current.settings

    act(() => {
      listeners[0](
        {
          userSettings: {
            oldValue: defaultSettings,
            newValue: { ...defaultSettings, showSavedTime: true },
          },
        },
        'sync',
      )
    })

    expect(result.current.settings).toStrictEqual(before)
  })

  it('userSettings キーがない local storage 変更を無視する', async () => {
    vi.mocked(getUserSettings).mockResolvedValue(defaultSettings)

    const { result } = renderHook(() => useSettings())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    const before = result.current.settings

    act(() => {
      listeners[0](
        {
          unrelatedKey: {
            oldValue: false,
            newValue: true,
          },
        },
        'local',
      )
    })

    expect(result.current.settings).toStrictEqual(before)
  })

  it('chrome.storage が利用できない環境でもクラッシュせず初期化できる', async () => {
    vi.mocked(getUserSettings).mockResolvedValue(defaultSettings)
    ;(globalThis as unknown as { chrome: typeof chrome }).chrome =
      {} as typeof chrome

    const { result } = renderHook(() => useSettings())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.settings).toStrictEqual(defaultSettings)
  })
})
