import { describe, expect, it } from 'vitest' // eslint-disable-line

import { getMessages } from '@/features/i18n/messages'

/**
 * ja / en の message key parity と placeholder token parity を検証する。
 * fallback があるからといって欠落を見逃さないための安全網。
 */

const extractTokens = (message: string): string[] =>
  Array.from(
    message.matchAll(/\{\{(\w+)\}\}/g),
    ([, token]) => token,
  ).toSorted()

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
})
