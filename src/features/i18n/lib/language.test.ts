import { afterEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

import * as messagesModule from '@/features/i18n/messages'

import { getMessage, resolveLanguage, resolveUiLanguage } from './language'

describe('language helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('system 設定時は日本語ロケールを ja に解決する', () => {
    expect(resolveLanguage('system', 'ja')).toBe('ja')
    expect(resolveLanguage('system', 'ja-JP')).toBe('ja')
  })

  it.each(['en', 'en-US', 'en-GB'])(
    'system 設定時は %s を en に解決する',
    (locale) => {
      expect(resolveLanguage('system', locale)).toBe('en')
    },
  )

  it.each(['fr', 'fr-FR', 'ko', 'ko-KR', 'zh', 'zh-CN', '', '  ', undefined])(
    '未対応または空のロケール %s は en にフォールバックする',
    (locale) => {
      expect(resolveUiLanguage(locale)).toBe('en')
      expect(resolveLanguage('system', locale)).toBe('en')
    },
  )

  it('明示設定があればその言語を優先する', () => {
    expect(resolveLanguage('en', 'ja')).toBe('en')
    expect(resolveLanguage('ja', 'en-US')).toBe('ja')
  })

  it('UI locale 文字列を対応言語へ正規化する', () => {
    expect(resolveUiLanguage('en-US')).toBe('en')
    expect(resolveUiLanguage('ja-JP')).toBe('ja')
  })

  it('辞書にないキーは fallback を返す', () => {
    expect(getMessage('en', 'missing.key', 'fallback text')).toBe(
      'fallback text',
    )
  })

  it('未解決のプレースホルダは空文字にせず保持する', () => {
    expect(getMessage('ja', 'analytics.summary')).toBe(
      '{{count}} 件の保存データから「{{title}}」を作成しました。',
    )
  })

  it('日本語に未翻訳のキーがあれば英語へフォールバックする', () => {
    vi.spyOn(messagesModule, 'getMessages').mockImplementation((language) => {
      // eslint-disable-line
      if (language === 'ja') {
        return {} as ReturnType<typeof messagesModule.getMessages>
      }

      return {
        'fallback.only.in.english': 'English fallback value',
      } as unknown as ReturnType<typeof messagesModule.getMessages>
    })

    expect(getMessage('ja', 'fallback.only.in.english')).toBe(
      'English fallback value',
    )
  })
})
