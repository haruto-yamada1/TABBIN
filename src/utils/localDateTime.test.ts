import { afterEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

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

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('指定したタイムゾーンで日付パーツとキーを返す', () => {
    expect(getDatePartsInTimeZone(timestamp, 'Asia/Tokyo')).toStrictEqual({
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
    expect(getLocalWeekStartKey(Date.UTC(2026, 2, 2, 12), 'UTC')).toBe(
      '2026-03-02',
    )
    expect(getLocalWeekStartKey(Date.UTC(2026, 2, 1, 12), 'UTC')).toBe(
      '2026-02-23',
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
    expect(isTimestampInLocalDateRange(timestamp, undefined, undefined)).toBe(
      true,
    )
    expect(isTimestampInLocalDateRange(timestamp, '   ', '   ')).toBe(true)
  })

  it('日付範囲は from/to 片側指定でも同じ日だけを判定する', () => {
    expect(
      isTimestampInLocalDateRange(
        timestamp,
        undefined,
        '2026-03-01',
        'Asia/Tokyo',
      ),
    ).toBe(true)
    expect(
      isTimestampInLocalDateRange(
        timestamp,
        '2026-03-02',
        undefined,
        'Asia/Tokyo',
      ),
    ).toBe(false)
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

  it('実行環境の timeZone が空なら UTC にフォールバックする', () => {
    const resolvedOptionsSpy = vi.spyOn(
      Intl.DateTimeFormat.prototype,
      'resolvedOptions',
    )
    resolvedOptionsSpy.mockReturnValue({
      calendar: 'gregory',
      locale: 'en-US',
      numberingSystem: 'latn',
      timeZone: '',
    })

    expect(getLocalDateKey(timestamp, '')).toBe('2026-02-28')
  })

  it('Intl の日付パーツと曜日が欠ける場合は数値 fallback を使う', () => {
    using formatToPartsSpy = vi.spyOn(
      Intl.DateTimeFormat.prototype,
      'formatToParts',
    )
    formatToPartsSpy.mockReturnValue([])

    expect(getDatePartsInTimeZone(timestamp, 'UTC')).toStrictEqual({
      day: 0,
      month: 0,
      year: 0,
    })

    formatToPartsSpy.mockRestore()
    const originalFormatDescriptor = Object.getOwnPropertyDescriptor(
      Intl.DateTimeFormat.prototype,
      'format',
    )
    Object.defineProperty(Intl.DateTimeFormat.prototype, 'format', {
      configurable: true,
      get: () => () => 'Funday',
    })
    try {
      expect(getLocalWeekStartKey(timestamp, 'UTC')).toBe('2026-02-22')
    } finally {
      Object.defineProperty(
        Intl.DateTimeFormat.prototype,
        'format',
        // eslint-disable-next-line typescript/no-non-null-assertion
        originalFormatDescriptor!,
      )
    }
  })
})
