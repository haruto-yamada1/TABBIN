import { describe, expect, it } from 'vitest'

import { defaultReviewReminderSettings } from './reviewReminderSettings'
import {
  isReviewQuietHours,
  nextReviewQuietHoursEnd,
  nextReviewTime,
} from './reviewSchedule'

const at = (day: number, hour: number, minute = 0) =>
  new Date(2026, 9, day, hour, minute).getTime()

describe('review schedule', () => {
  it('uses the next local daily hour and does not repeat the current occurrence', () => {
    const settings = {
      ...defaultReviewReminderSettings,
      frequency: 'daily' as const,
    }
    expect(nextReviewTime(settings, at(8, 8))).toBe(at(8, 9))
    expect(nextReviewTime(settings, at(8, 9))).toBe(at(9, 9))
    expect(nextReviewTime(settings, at(8, 18))).toBe(at(9, 9))
  })

  it('uses the selected local weekday for a weekly reminder', () => {
    expect(nextReviewTime(defaultReviewReminderSettings, at(8, 12))).toBe(
      at(10, 9),
    )
    expect(nextReviewTime(defaultReviewReminderSettings, at(10, 9))).toBe(
      at(17, 9),
    )
  })

  it('defers overnight quiet-hour occurrences and preserves them across restarts', () => {
    const settings = {
      ...defaultReviewReminderSettings,
      frequency: 'daily' as const,
      hour: 23,
    }
    expect(nextReviewTime(settings, at(8, 20))).toBe(at(9, 8))
    expect(nextReviewTime(settings, at(8, 23, 30))).toBe(at(9, 8))
    expect(nextReviewTime(settings, at(9, 1))).toBe(at(9, 8))
    expect(nextReviewTime(settings, at(9, 8))).toBe(at(10, 8))
  })

  it('preserves a weekly quiet-hour deferral on the following weekday', () => {
    const settings = { ...defaultReviewReminderSettings, hour: 23 }
    expect(nextReviewTime(settings, at(11, 1))).toBe(at(11, 8))
    expect(nextReviewTime(settings, at(11, 8))).toBe(at(18, 8))
  })

  it('defers same-day quiet hours and treats the end hour as available', () => {
    const settings = {
      ...defaultReviewReminderSettings,
      frequency: 'daily' as const,
      hour: 13,
      quietStartHour: 12,
      quietEndHour: 15,
    }
    expect(nextReviewTime(settings, at(8, 10))).toBe(at(8, 15))
    expect(nextReviewTime({ ...settings, hour: 15 }, at(8, 10))).toBe(at(8, 15))
  })

  it('permits the configured hour when quiet hours are disabled or empty', () => {
    const settings = {
      ...defaultReviewReminderSettings,
      frequency: 'daily' as const,
      hour: 23,
    }
    expect(
      nextReviewTime({ ...settings, quietHoursEnabled: false }, at(8, 20)),
    ).toBe(at(8, 23))
    expect(
      nextReviewTime(
        { ...settings, quietStartHour: 8, quietEndHour: 8 },
        at(8, 20),
      ),
    ).toBe(at(8, 23))
  })

  it('identifies quiet boundaries and defers delayed alarms to their local end', () => {
    expect(isReviewQuietHours(defaultReviewReminderSettings, at(8, 22))).toBe(
      true,
    )
    expect(
      isReviewQuietHours(defaultReviewReminderSettings, at(9, 7, 59)),
    ).toBe(true)
    expect(isReviewQuietHours(defaultReviewReminderSettings, at(9, 8))).toBe(
      false,
    )
    expect(
      nextReviewQuietHoursEnd(defaultReviewReminderSettings, at(8, 22)),
    ).toBe(at(9, 8))
    expect(
      nextReviewQuietHoursEnd(defaultReviewReminderSettings, at(9, 7, 59)),
    ).toBe(at(9, 8))
    expect(
      nextReviewQuietHoursEnd(defaultReviewReminderSettings, at(9, 8)),
    ).toBe(at(9, 8))
  })

  it('uses same-day quiet end for a delayed afternoon alarm', () => {
    const settings = {
      ...defaultReviewReminderSettings,
      quietStartHour: 12,
      quietEndHour: 15,
    }
    expect(isReviewQuietHours(settings, at(8, 11, 59))).toBe(false)
    expect(isReviewQuietHours(settings, at(8, 12))).toBe(true)
    expect(isReviewQuietHours(settings, at(8, 15))).toBe(false)
    expect(nextReviewQuietHoursEnd(settings, at(8, 13))).toBe(at(8, 15))
  })

  it('keeps the chosen local hour when daylight saving changes day length', () => {
    const before = new Date(2026, 2, 7, 10).getTime()
    const after = new Date(2026, 2, 8, 9).getTime()
    const settings = {
      ...defaultReviewReminderSettings,
      frequency: 'daily' as const,
    }
    expect(nextReviewTime(settings, before)).toBe(after)
  })

  it('rejects an invalid timestamp instead of scheduling an invalid alarm', () => {
    expect(() =>
      nextReviewTime(defaultReviewReminderSettings, Number.NaN),
    ).toThrow(RangeError)
  })
})
