import { assert, describe, expect, it } from 'vitest'

import { getMessages } from '@/features/i18n/messages'

/**
 * ja / en の message key parity と placeholder token parity を検証する。
 * fallback があるからといって欠落を見逃さないための安全網。
 */

const extractTokens = (message: string): string[] =>
  Array.from(message.matchAll(/\{\{(\w+)\}\}/g), ([, token]) => {
    assert.isDefined(token)
    return token
  }).toSorted((left, right) => left.localeCompare(right))

// 意図的に片方にのみ存在させる key がある場合はここに記録する
const ALLOWED_MISSING_IN_JA = new Set<string>()
const ALLOWED_MISSING_IN_EN = new Set<string>()

// 意図的に placeholder token 差分を許容する key がある場合はここに記録する
const ALLOWED_TOKEN_MISMATCH = new Set<string>()

describe('i18n message parity', () => {
  it('ja と en の key set が一致する', () => {
    const enKeys = Object.keys(getMessages('en')).toSorted()
    const jaKeys = Object.keys(getMessages('ja')).toSorted()

    const enSet = new Set(enKeys)
    const jaSet = new Set(jaKeys)

    const missingInJa = enKeys.filter((k) => !jaSet.has(k))
    const missingInEn = jaKeys.filter((k) => !enSet.has(k))

    const unexpectedMissingInJa = missingInJa.filter(
      (k) => !ALLOWED_MISSING_IN_JA.has(k),
    )
    const unexpectedMissingInEn = missingInEn.filter(
      (k) => !ALLOWED_MISSING_IN_EN.has(k),
    )

    if (unexpectedMissingInJa.length > 0 || unexpectedMissingInEn.length > 0) {
      let msg = 'Message key parity mismatch detected:\n'
      if (unexpectedMissingInJa.length > 0) {
        msg += `  Missing in ja: ${JSON.stringify(unexpectedMissingInJa)}\n`
      }
      if (unexpectedMissingInEn.length > 0) {
        msg += `  Missing in en: ${JSON.stringify(unexpectedMissingInEn)}\n`
      }
      msg +=
        '  Add the missing translation or add the key to the allowlist if intentional.'
      throw new Error(msg)
    }

    expect(unexpectedMissingInJa).toEqual([])
    expect(unexpectedMissingInEn).toEqual([])
  })

  it('ja と en の placeholder token が一致する', () => {
    const enMessages = getMessages('en') as Record<string, string>
    const jaMessages = getMessages('ja') as Record<string, string>
    const keys = Object.keys(enMessages)

    const mismatches: string[] = []

    for (const key of keys) {
      if (ALLOWED_TOKEN_MISMATCH.has(key)) {
        continue
      }

      const enValue = enMessages[key]
      const jaValue = jaMessages[key]

      // key parity test で検出されるため、片方にない key は skip
      if (enValue === undefined || jaValue === undefined) {
        continue
      }

      const enTokens = extractTokens(enValue)
      const jaTokens = extractTokens(jaValue)

      if (JSON.stringify(enTokens) !== JSON.stringify(jaTokens)) {
        mismatches.push(
          `  ${key}: en=${JSON.stringify(enTokens)} ja=${JSON.stringify(jaTokens)}`,
        )
      }
    }

    if (mismatches.length > 0) {
      throw new Error(
        `Placeholder token mismatch detected:\n${mismatches.join('\n')}`,
      )
    }

    expect(mismatches).toEqual([])
  })

  it('obsolete backup keys and cutoff dates are absent from ja/en', () => {
    const en = getMessages('en') as Record<string, string>
    const ja = getMessages('ja') as Record<string, string>

    for (const messages of [en, ja]) {
      const keys = Object.keys(messages)
      expect(keys.some((key) => key.includes('legacyPreview'))).toBe(false)
      expect(
        keys.some((key) => key.startsWith('options.importExport.merge')),
      ).toBe(false)
      expect(messages).not.toHaveProperty('persistenceMigrationNotice.message')
      expect(JSON.stringify(messages)).not.toContain('2026-09-30')
      expect(JSON.stringify(messages)).not.toContain('2026-10-01')
    }
  })
})

/**
 * #1126: parity 対象外だった辞書系統（Academy UI / ガイド / 実習 / 画面案内 /
 * リンクキャプチャ）にも同じ key / placeholder parity を適用する。
 * プレースホルダ記法は本体辞書と同じ {{token}} 形式に統一されていること
 * （{token} 形式の混在がないこと）もここで固定する。
 */
import { ACADEMY_MESSAGES } from '@/features/academy/domain/academyCatalog'
import { academyGuides } from '@/features/academy/presentation/academyLessonGuide'
import { academyUiMessages } from '@/features/academy/presentation/academyUiMessages'
import { practiceMessages } from '@/features/academy/presentation/practiceMessages'
import { screenGuideMessages } from '@/features/academy/presentation/screenGuideMessages'
import { linkCaptureMessages } from '@/features/i18n/linkCaptureMessages'

type BilingualDictionary = {
  en: Record<string, string>
  ja: Record<string, string>
}

const extractSingleBraceTokens = (message: string): string[] =>
  Array.from(
    message.replaceAll(/\{\{\w+\}\}/g, '').matchAll(/\{(\w+)\}/g),
    ([, token]) => {
      assert.isDefined(token)
      return token
    },
  )

const expectDictionaryParity = (name: string, dict: BilingualDictionary) => {
  const enKeys = Object.keys(dict.en).toSorted()
  assert.isNotEmpty(enKeys)
  const jaKeys = Object.keys(dict.ja).toSorted()
  expect(jaKeys, `${name}: ja/en key set`).toEqual(enKeys)

  for (const key of enKeys) {
    const enValue = dict.en[key]
    const jaValue = dict.ja[key]
    assert.isDefined(enValue)
    assert.isDefined(jaValue)
    expect(
      extractTokens(jaValue),
      `${name}.${key}: placeholder tokens`,
    ).toEqual(extractTokens(enValue))
    expect(
      extractSingleBraceTokens(enValue),
      `${name}.${key}: single-brace placeholders are not allowed (en)`,
    ).toEqual([])
    expect(
      extractSingleBraceTokens(jaValue),
      `${name}.${key}: single-brace placeholders are not allowed (ja)`,
    ).toEqual([])
  }
  return enKeys.length
}

describe('i18n parity for satellite dictionaries (#1126)', () => {
  it('Academy UI 辞書の ja/en parity が一致する', () => {
    expect(
      expectDictionaryParity('academyUiMessages', academyUiMessages),
    ).toBeGreaterThan(0)
  })

  it('Academy カタログ辞書の ja/en parity が一致する', () => {
    expect(
      expectDictionaryParity('ACADEMY_MESSAGES', ACADEMY_MESSAGES),
    ).toBeGreaterThan(0)
  })

  it('Academy 実習辞書の ja/en parity が一致する', () => {
    expect(
      expectDictionaryParity('practiceMessages', practiceMessages),
    ).toBeGreaterThan(0)
  })

  it('Academy 画面案内辞書の ja/en parity が一致する', () => {
    expect(
      expectDictionaryParity('screenGuideMessages', screenGuideMessages),
    ).toBeGreaterThan(0)
  })

  it('リンクキャプチャ辞書の ja/en parity が一致する', () => {
    expect(
      expectDictionaryParity('linkCaptureMessages', linkCaptureMessages),
    ).toBeGreaterThan(0)
  })

  it('Academy ガイドは全レッスンで ja/en のステップ数とプレースホルダーが一致する', () => {
    const lessonIds = Object.keys(academyGuides).toSorted()
    expect(lessonIds.length).toBeGreaterThan(0)
    for (const lessonId of lessonIds) {
      const guide = academyGuides[lessonId]
      assert.isDefined(guide)
      expect(guide.ja.length, `${lessonId}: step count`).toBe(guide.en.length)
      expect(guide.en.length, `${lessonId}: non-empty`).toBeGreaterThan(0)
      for (const [index, enStep] of guide.en.entries()) {
        const jaStep = guide.ja[index]
        assert.isDefined(jaStep)
        expect(
          extractTokens(jaStep),
          `${lessonId}[${index}]: placeholder tokens`,
        ).toEqual(extractTokens(enStep))
        expect(
          extractSingleBraceTokens(enStep),
          `${lessonId}[${index}]: single-brace placeholders are not allowed (en)`,
        ).toEqual([])
        expect(
          extractSingleBraceTokens(jaStep),
          `${lessonId}[${index}]: single-brace placeholders are not allowed (ja)`,
        ).toEqual([])
      }
    }
  })
})
