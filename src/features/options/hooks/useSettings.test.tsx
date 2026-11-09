// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ChangeEvent } from 'react'
import { assert, beforeEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

import { useSettings } from './useSettings'

vi.mock('@/lib/storage/settings', () => {
  const defaultSettings = {
    removeTabAfterOpen: true,
    removeTabAfterExternalDrop: true,
    excludePatterns: ['chrome-extension://', 'chrome://'],
    enableCategories: true,
    autoDeletePeriod: 'never',
    showRelativeSavedTime: false,
    showSavedTime: false,
    clickBehavior: 'saveSameDomainTabs',
    excludePinnedTabs: true,
    openUrlInBackground: true,
    openAllInNewWindow: false,
    confirmDeleteAll: false,
    confirmDeleteEach: false,
    colors: {},
  }

  const getUserSettings = vi.fn()
  return {
    defaultSettings,
    getUserSettings,
    readUserSettingsStrict: vi.fn(async () => ({
      status: 'available',
      settings: await getUserSettings(),
    })),
    resetInvalidUserSettings: vi.fn(),
    saveUserSettings: vi.fn(),
  }
})

import {
  defaultSettings,
  getUserSettings,
  readUserSettingsStrict,
  resetInvalidUserSettings,
  saveUserSettings,
} from '@/lib/storage/settings'

type StorageListener = (
  changes: Record<string, chrome.storage.StorageChange>,
  areaName: string,
) => void

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

describe('useSettingsフック', () => {
  beforeEach(() => {
    listeners.length = 0
    vi.clearAllMocks()
    ;(globalThis as unknown as { chrome: typeof chrome }).chrome =
      createChromeMock()
  })

  it('マウント時に設定を読み込む', async () => {
    const loadedSettings = {
      ...defaultSettings,
      showSavedTime: true,
      excludePatterns: ['https://example.com/*'],
    }
    vi.mocked(getUserSettings).mockResolvedValue(loadedSettings)

    const { result } = renderHook(() => useSettings())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(getUserSettings).toHaveBeenCalledTimes(1)
    expect(result.current.settings).toStrictEqual(loadedSettings)
  })

  it('読み込み失敗時はデフォルト設定にフォールバックする', async () => {
    using consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    vi.mocked(getUserSettings).mockRejectedValue(new Error('load failed'))

    const { result } = renderHook(() => useSettings())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.settings).toStrictEqual(defaultSettings)
    expect(consoleErrorSpy).toHaveBeenCalledWith('設定の読み込みに失敗しました')
  })

  it('読み込み失敗後はデフォルト値で保存しない', async () => {
    using consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    const pending =
      Promise.withResolvers<Awaited<ReturnType<typeof getUserSettings>>>()
    vi.mocked(getUserSettings).mockReturnValue(pending.promise)
    vi.mocked(saveUserSettings).mockResolvedValue(undefined)
    const { result } = renderHook(() => useSettings())

    act(() => {
      result.current.setSettings({ ...defaultSettings, showSavedTime: true })
    })
    await act(async () => {
      pending.reject(new Error('load failed'))
      await pending.promise.catch(() => undefined)
    })
    expect(result.current.settings).toStrictEqual(defaultSettings)

    expect(consoleErrorSpy).toHaveBeenCalledWith('設定の読み込みに失敗しました')

    await act(async () => {
      await result.current.updateSetting('openUrlInBackground', false)
    })
    expect(saveUserSettings).not.toHaveBeenCalled()
  })

  it('不正な設定では全保存経路を止め、再読込成功後に保存できる', async () => {
    vi.mocked(readUserSettingsStrict).mockResolvedValueOnce({
      status: 'invalid',
    })
    vi.mocked(getUserSettings).mockResolvedValue(defaultSettings)
    const { result } = renderHook(() => useSettings())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.loadError).toBe('invalid')
    act(() => result.current.setExcludePatternInput('example.com'))
    await act(async () => {
      expect(await result.current.updateSetting('showSavedTime', true)).toBe(
        false,
      )
      expect(await result.current.handleSaveSettings()).toBe(false)
      expect(await result.current.addExcludePattern()).toBe(false)
      expect(await result.current.removeExcludePattern('chrome://')).toBe(false)
    })
    expect(saveUserSettings).not.toHaveBeenCalled()
    await act(async () => result.current.retryLoadSettings())
    expect(result.current.loadError).toBeNull()
    await act(async () => {
      await result.current.updateSetting('showSavedTime', true)
    })
    expect(saveUserSettings).toHaveBeenCalledExactlyOnceWith({
      ...defaultSettings,
      showSavedTime: true,
    })
  })

  it('不正設定の明示リセット後に読み直して復旧する', async () => {
    vi.mocked(readUserSettingsStrict).mockResolvedValueOnce({
      status: 'invalid',
    })
    vi.mocked(getUserSettings).mockResolvedValue(defaultSettings)
    const { result } = renderHook(() => useSettings())
    await waitFor(() => expect(result.current.loadError).toBe('invalid'))
    await act(async () => result.current.resetInvalidSettings())
    expect(resetInvalidUserSettings).toHaveBeenCalledTimes(1)
    expect(result.current.loadError).toBeNull()
  })

  it('読込不能時には明示リセットも実行しない', async () => {
    vi.mocked(readUserSettingsStrict).mockResolvedValueOnce({
      status: 'unavailable',
    })
    const { result } = renderHook(() => useSettings())
    await waitFor(() => expect(result.current.loadError).toBe('unavailable'))
    await act(async () => result.current.resetInvalidSettings())
    expect(resetInvalidUserSettings).toHaveBeenCalledTimes(0)
  })

  it('updateSetting はローカル状態を更新し設定を永続化する', async () => {
    vi.mocked(getUserSettings).mockResolvedValue(defaultSettings)
    vi.mocked(saveUserSettings).mockResolvedValue(undefined)

    const { result } = renderHook(() => useSettings())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    let success = false
    await act(async () => {
      success = await result.current.updateSetting('showSavedTime', true)
    })

    expect(success).toBe(true)
    expect(result.current.settings.showSavedTime).toBe(true)
    expect(saveUserSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        showSavedTime: true,
      }),
    )
  })

  it('連続した updateSetting 呼び出しでも前の変更を失わない', async () => {
    vi.mocked(getUserSettings).mockResolvedValue(defaultSettings)
    vi.mocked(saveUserSettings).mockResolvedValue(undefined)

    const { result } = renderHook(() => useSettings())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    await act(async () => {
      await result.current.updateSetting('showSavedTime', true)
      await result.current.updateSetting('openUrlInBackground', false)
    })

    expect(result.current.settings).toStrictEqual(
      expect.objectContaining({
        openUrlInBackground: false,
        showSavedTime: true,
      }),
    )
    expect(saveUserSettings).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        openUrlInBackground: false,
        showSavedTime: true,
      }),
    )
  })

  it('handleExcludePatternsBlur は空でない行のみ保存する', async () => {
    vi.mocked(getUserSettings).mockResolvedValue(defaultSettings)
    vi.mocked(saveUserSettings).mockResolvedValue(undefined)

    const { result } = renderHook(() => useSettings())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    act(() => {
      result.current.handleExcludePatternsChange({
        target: { value: 'first-pattern\n\nsecond-pattern' },
      } as ChangeEvent<HTMLTextAreaElement>)
    })

    await act(async () => {
      await result.current.handleSaveSettings()
    })

    expect(saveUserSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        excludePatterns: ['first-pattern', 'second-pattern'],
      }),
    )
  })

  it('addExcludePattern は trim 後の新規値を追加して保存し入力を空にする', async () => {
    vi.mocked(getUserSettings).mockResolvedValue(defaultSettings)
    vi.mocked(saveUserSettings).mockResolvedValue(undefined)

    const { result } = renderHook(() => useSettings())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    act(() => {
      result.current.handleExcludePatternInputChange({
        target: { value: '  https://example.com  ' },
      } as ChangeEvent<HTMLInputElement>)
    })

    let success = false
    await act(async () => {
      success = await result.current.addExcludePattern()
    })

    expect(success).toBe(true)
    expect(result.current.excludePatternInput).toBe('')
    expect(result.current.settings.excludePatterns).toStrictEqual([
      'chrome-extension://',
      'chrome://',
      'https://example.com',
    ])
    expect(saveUserSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        excludePatterns: [
          'chrome-extension://',
          'chrome://',
          'https://example.com',
        ],
      }),
    )
  })

  it('保存値nullへの変更通知を未保存と混同せず復旧状態にする', async () => {
    vi.mocked(getUserSettings).mockResolvedValue(defaultSettings)
    const { result } = renderHook(() => useSettings())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    vi.mocked(readUserSettingsStrict).mockResolvedValueOnce({
      status: 'invalid',
    })
    act(() => {
      const listener = listeners[0]
      assert.isDefined(listener)
      listener({ userSettings: { newValue: null } }, 'local')
    })
    await waitFor(() => expect(result.current.loadError).toBe('invalid'))
    await act(async () => {
      expect(
        await result.current.updateSetting('removeTabAfterOpen', true),
      ).toBe(false)
    })
    expect(saveUserSettings).not.toHaveBeenCalled()
  })

  it('chrome.storage.onChanged イベントから状態を更新する', async () => {
    vi.mocked(getUserSettings).mockResolvedValue(defaultSettings)

    const { result } = renderHook(() => useSettings())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    const updatedSettings = {
      ...defaultSettings,
      autoDeletePeriod: '7days',
      removeTabAfterOpen: false,
      removeTabAfterExternalDrop: true,
    }

    act(() => {
      const listener = listeners[0]
      assert.isDefined(listener)
      listener(
        {
          userSettings: {
            oldValue: defaultSettings,
            newValue: updatedSettings,
          },
        },
        'local',
      )
    })

    expect(result.current.settings).toStrictEqual(updatedSettings)

    act(() => {
      const listener = listeners[0]
      assert.isDefined(listener)
      listener(
        {
          userSettings: {
            oldValue: updatedSettings,
            newValue: undefined,
          },
        },
        'local',
      )
    })

    expect(result.current.settings).toStrictEqual(defaultSettings)
  })
})
