import { z } from 'zod'

export type ReviewReminderSettings = {
  enabled: boolean
  target: 'all' | 'uncategorized' | 'older' | 'category'
  categoryId: string
  olderThanDays: number
  frequency: 'daily' | 'weekly'
  hour: number
  weekday: number
  quietHoursEnabled: boolean
  quietStartHour: number
  quietEndHour: number
}

export const defaultReviewReminderSettings: ReviewReminderSettings = {
  enabled: false,
  target: 'all',
  categoryId: '',
  olderThanDays: 30,
  frequency: 'weekly',
  hour: 9,
  weekday: 6,
  quietHoursEnabled: true,
  quietStartHour: 22,
  quietEndHour: 8,
}

const LAST_HOUR_OF_DAY = 23
const LAST_WEEKDAY = 6
const hourSchema = z.number().int().min(0).max(LAST_HOUR_OF_DAY)

export const ReviewReminderSettingsSchema = z.object({
  enabled: z.boolean().default(defaultReviewReminderSettings.enabled),
  target: z
    .enum(['all', 'uncategorized', 'older', 'category'])
    .default(defaultReviewReminderSettings.target),
  categoryId: z.string().default(defaultReviewReminderSettings.categoryId),
  olderThanDays: z
    .number()
    .int()
    .positive()
    .default(defaultReviewReminderSettings.olderThanDays),
  frequency: z
    .enum(['daily', 'weekly'])
    .default(defaultReviewReminderSettings.frequency),
  hour: hourSchema.default(defaultReviewReminderSettings.hour),
  weekday: z
    .number()
    .int()
    .min(0)
    .max(LAST_WEEKDAY)
    .default(defaultReviewReminderSettings.weekday),
  quietHoursEnabled: z
    .boolean()
    .default(defaultReviewReminderSettings.quietHoursEnabled),
  quietStartHour: hourSchema.default(
    defaultReviewReminderSettings.quietStartHour,
  ),
  quietEndHour: hourSchema.default(defaultReviewReminderSettings.quietEndHour),
})
