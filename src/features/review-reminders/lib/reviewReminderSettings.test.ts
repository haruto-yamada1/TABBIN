import { describe, expect, it } from 'vitest'

import {
  defaultReviewReminderSettings,
  ReviewReminderSettingsSchema,
} from './reviewReminderSettings'

describe('review reminder settings', () => {
  it('defaults to opt-in weekly reviews with overnight quiet hours', () => {
    expect(ReviewReminderSettingsSchema.parse({})).toEqual(
      defaultReviewReminderSettings,
    )
    expect(defaultReviewReminderSettings.enabled).toBe(false)
    expect(defaultReviewReminderSettings.frequency).toBe('weekly')
  })

  it('preserves explicitly selected review and schedule settings', () => {
    const settings = {
      ...defaultReviewReminderSettings,
      enabled: true,
      target: 'category',
      categoryId: 'project:reading',
      frequency: 'daily',
      hour: 17,
      weekday: 0,
      quietHoursEnabled: false,
    }
    expect(ReviewReminderSettingsSchema.parse(settings)).toEqual(settings)
  })

  it.each([
    { enabled: 'true' },
    { target: 'unread' },
    { categoryId: 2 },
    { olderThanDays: 0 },
    { olderThanDays: -1 },
    { olderThanDays: 2.5 },
    { olderThanDays: Number.POSITIVE_INFINITY },
    { frequency: 'hourly' },
    { hour: 24 },
    { hour: -1 },
    { hour: 2.5 },
    { weekday: 7 },
    { weekday: -1 },
    { quietHoursEnabled: 'false' },
    { quietStartHour: 24 },
    { quietEndHour: -1 },
  ])('rejects malformed setting %j', (settings) => {
    expect(ReviewReminderSettingsSchema.safeParse(settings).success).toBe(false)
  })
})
