// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { sendRuntimeMessage } from '@/lib/browser/runtime'
import { defaultSettings } from '@/lib/storage/settings'

import { useAutoDeletePeriod } from './useAutoDeletePeriod'

vi.mock('@/features/i18n/context/I18nProvider', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))
vi.mock('@/lib/browser/runtime', () => ({ sendRuntimeMessage: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

describe('自動削除期間の安全な保存', () => {
  beforeEach(() => vi.clearAllMocks())

  it.each(['invalid', 'unavailable'] as const)(
    '%s では設定もタイムスタンプも変更しない',
    async (failure) => {
      using consoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => undefined)
      const get =
        failure === 'invalid'
          ? vi.fn().mockResolvedValue({
              userSettings: { excludePinnedTabs: 'broken' },
            })
          : vi.fn().mockRejectedValue(new Error('read failed'))
      const set = vi.fn()
      vi.stubGlobal('chrome', { storage: { local: { get, set } } })
      const setSettings = vi.fn()
      const { result } = renderHook(() =>
        useAutoDeletePeriod(defaultSettings, setSettings),
      )
      act(() => result.current.handleAutoDeletePeriodChange('30sec'))
      await act(async () => result.current.applyAutoDeletePeriod())
      expect(consoleError).toHaveBeenCalledWith(
        '自動削除期間を保存できませんでした',
      )
      expect(set).not.toHaveBeenCalled()
      expect(setSettings).not.toHaveBeenCalled()
      expect(sendRuntimeMessage).not.toHaveBeenCalled()
    },
  )

  it('読めた最新設定を保持して期間だけを保存する', async () => {
    const persisted = { ...defaultSettings, removeTabAfterOpen: false }
    const get = vi.fn().mockResolvedValue({ userSettings: persisted })
    const set = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('chrome', { storage: { local: { get, set } } })
    const { result } = renderHook(() =>
      useAutoDeletePeriod(defaultSettings, vi.fn()),
    )
    act(() => result.current.handleAutoDeletePeriodChange('1day'))
    await act(async () => result.current.applyAutoDeletePeriod())
    expect(set).toHaveBeenCalledWith({
      userSettings: expect.objectContaining({
        removeTabAfterOpen: false,
        autoDeletePeriod: '1day',
      }),
    })
    expect(sendRuntimeMessage).toHaveBeenCalledWith(
      expect.objectContaining({ updateTimestamps: false }),
    )
  })
})
