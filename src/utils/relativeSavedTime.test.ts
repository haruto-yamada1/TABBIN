import { describe, expect, it } from 'vitest'

import { formatRelativeSavedTime } from './relativeSavedTime'

const now = Date.parse('2026-10-17T00:05:00Z')
const minute = 60_000
const hour = 60 * minute
const day = 24 * hour

describe('formatRelativeSavedTime', () => {
  it.each([
    ['ja', now, '今'],
    ['en', now, 'now'],
    ['ja', now - 3 * day, '3 日前'],
    ['en', now - 3 * day, '3 days ago'],
    ['ja', now - 2 * hour, '2 時間前'],
    ['en', now - 2 * hour, '2 hours ago'],
    ['ja', now - day, '昨日'],
    ['en', now - day, 'yesterday'],
    ['ja', now + day, '明日'],
    ['en', now + 2 * hour, 'in 2 hours'],
    ['ja', now + 2 * minute, '2 分後'],
    ['en', now - 10 * minute, '10 minutes ago'],
    ['en', now - hour + 1, '59 minutes ago'],
    ['en', now - day + 1, '23 hours ago'],
    ['en', now - minute + 1, 'now'],
    ['en', now + minute - 1, 'now'],
  ] as const)(
    '%s formats timestamp %s as %s',
    (language, timestamp, expected) => {
      expect(formatRelativeSavedTime(timestamp, language, now)).toBe(expected)
    },
  )

  it.each([undefined, Number.NaN, Infinity, -Infinity, 8.64e15 + 1])(
    '不正・未設定日時%sはハイフン',
    (timestamp) => {
      expect(formatRelativeSavedTime(timestamp, 'ja', now)).toBe('-')
    },
  )

  it('不正な現在時刻を拒否しepochは有効な日時として扱う', () => {
    expect(formatRelativeSavedTime(now, 'en', Number.NaN)).toBe('-')
    expect(formatRelativeSavedTime(0, 'en', day)).toBe('yesterday')
  })
})
