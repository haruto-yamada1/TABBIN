// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const toastSuccess = vi.fn()
vi.mock('sonner', () => ({
  toast: { success: (...args: unknown[]) => toastSuccess(...args) },
}))

vi.mock('@/features/i18n/context/I18nProvider', () => ({
  useI18n: () => ({
    t: (key: string, _fallback?: string, vars?: Record<string, string>) =>
      vars?.count ? `${key}:${vars.count}` : key,
  }),
}))

import { useSavedTabsMarkdownCopyHandler } from './SavedTabsSelectionProvider'

const writeText = vi.fn(async () => {})
Object.defineProperty(navigator, 'clipboard', {
  configurable: true,
  value: { writeText },
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('useSavedTabsMarkdownCopyHandler', () => {
  it('選択アイテムを Markdown リストとしてコピーし件数を通知する', async () => {
    const { result } = renderHook(() => useSavedTabsMarkdownCopyHandler())

    await result.current([
      { groupId: 'g1', title: 'Alpha', url: 'https://example.com/a' },
      { groupId: 'g1', title: 'Beta', url: 'https://example.com/b' },
    ])

    expect(writeText).toHaveBeenCalledExactlyOnceWith(
      '- [Alpha](https://example.com/a)\n- [Beta](https://example.com/b)',
    )
    expect(toastSuccess).toHaveBeenCalledExactlyOnceWith(
      'savedTabs.selection.copySuccess.other:2',
    )
  })

  it('クリップボード書き込みに失敗したら throw する', async () => {
    writeText.mockRejectedValueOnce(new Error('denied'))
    const { result } = renderHook(() => useSavedTabsMarkdownCopyHandler())

    await expect(
      result.current([
        { groupId: 'g1', title: 'Alpha', url: 'https://example.com/a' },
      ]),
    ).rejects.toThrow('denied')
    expect(toastSuccess).not.toHaveBeenCalled()
  })
})
