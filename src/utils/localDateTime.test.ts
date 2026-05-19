import { describe, expect, it } from 'vitest'

import {
  formatFixedDatetime,
  formatLocaleDateTime,
  getDatePartsInTimeZone,
  getLocalDateKey,
  getLocalMonthKey,
  getLocalWeekStartKey,
  isTimestampInLocalDateRange,
  isTimestampInLocalMonth,
} from './localDateTime'

describe('localDateTime', () => {
  const timestamp = Date.UTC(2026, 1, 28, 15, 30, 45)

  it('指定したタイムゾーンで日付パーツとキーを返す', () => {
    expect(getDatePartsInTimeZone(timestamp, 'Asia/Tokyo')).toEqual({
      day: 1,
      month: 3,
      year: 2026,
    })
    expect(getLocalDateKey(timestamp, 'Asia/Tokyo')).toBe('2026-03-01')
    expect(getLocalMonthKey(timestamp, 'Asia/Tokyo')).toBe('2026-03')
    expect(formatFixedDatetime(timestamp, 'Asia/Tokyo')).toBe(
      '2026/03/01 00:30:45',
    )
  })

  it('週バケットの開始日をローカル週の月曜で返す', () => {
    expect(getLocalWeekStartKey(timestamp, 'Asia/Tokyo')).toBe('2026-02-23')
    expect(getLocalWeekStartKey(Date.UTC(2026, 2, 4, 12), 'UTC')).toBe(
      '2026-03-02',
    )
  })

  it('ローカル日付範囲を逆順指定でも判定する', () => {
    expect(
      isTimestampInLocalDateRange(
        timestamp,
        '2026-03-02',
        '2026-03-01',
        'Asia/Tokyo',
      ),
    ).toBe(true)
    expect(
      isTimestampInLocalDateRange(
        timestamp,
        '2026-03-02',
        '2026-03-02',
        'Asia/Tokyo',
      ),
    ).toBe(false)
  })

  it('無効な日付範囲は絞り込まない', () => {
    expect(
      isTimestampInLocalDateRange(timestamp, 'invalid-date', undefined),
    ).toBe(true)
  })

  it('ローカル月判定を行う', () => {
    expect(isTimestampInLocalMonth(timestamp, 2026, 3, 'Asia/Tokyo')).toBe(true)
    expect(isTimestampInLocalMonth(timestamp, 2026, 2, 'Asia/Tokyo')).toBe(
      false,
    )
  })

  it('timestamp が未指定ならフォーマットのフォールバックを返す', () => {
    expect(formatFixedDatetime()).toBe('-')
  })

  it('locale と timeZone を指定してローカル日時を返す', () => {
    expect(formatLocaleDateTime(timestamp, 'en-US', 'UTC')).toContain('2026')
  })

  it('空白の timeZone は実行環境の既定値へフォールバックする', () => {
    expect(getLocalDateKey(timestamp, '   ')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
