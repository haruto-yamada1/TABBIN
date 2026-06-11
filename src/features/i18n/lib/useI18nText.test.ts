import { beforeEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

import { getFallbackText } from './useI18nText'

vi.mock('@/features/i18n/context/I18nProvider', () => ({
  useI18n: () => {
    throw new Error('provider missing')
  },
}))

describe('useI18nText fallback helpers', () => {
  beforeEach(() => {
    vi.stubGlobal('chrome', {
      i18n: {
        getUILanguage: vi.fn(() => 'en-US'),
      },
    })
  })

  it('chrome i18n の UI 言語から fallback text を返す', () => {
    expect(getFallbackText('savedTabs.emptyTitle')).toBe('No saved tabs')
    expect(chrome.i18n.getUILanguage).toHaveBeenCalledOnce()
  })

  it('chrome i18n がない場合は navigator の言語へフォールバックする', () => {
    vi.stubGlobal('chrome', undefined)
    vi.stubGlobal('navigator', { language: 'ja-JP' })

    expect(getFallbackText('savedTabs.emptyTitle')).toBe(
      '保存されたタブはありません',
    )
  })

  it('navigator もない場合は既定言語へフォールバックする', () => {
    vi.stubGlobal('chrome', undefined)
    vi.stubGlobal('navigator', undefined)

    expect(getFallbackText('savedTabs.emptyTitle')).toBe('No saved tabs')
  })
})
