import { z } from 'zod'

import {
  defaultReviewReminderSettings,
  ReviewReminderSettingsSchema,
} from '@/features/review-reminders/lib/reviewReminderSettings'
import type { ReviewReminderSettings } from '@/features/review-reminders/lib/reviewReminderSettings'
import { getChromeStorageLocal } from '@/lib/browser/chrome-storage'

export const REVIEW_REMINDER_SETTINGS_KEY = 'reviewReminderSettings'
const NOTIFICATION_KEY = 'reviewReminderNotification'
const ALARM_TIME_ZONE_KEY = 'reviewReminderAlarmTimeZone'
const MAX_TIME_ZONE_LENGTH = 100
const TimeZoneSchema = z.string().min(1).max(MAX_TIME_ZONE_LENGTH)
const NotificationSchema = z.object({
  settings: ReviewReminderSettingsSchema,
  reviewAt: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
})
export type ReviewReminderNotification = z.infer<typeof NotificationSchema>

const requireStorage = () => {
  const storage = getChromeStorageLocal()
  if (!storage) {
    throw new Error('Review reminder storage unavailable')
  }
  return storage
}

const writeControlValue = async (
  key: string,
  value: unknown,
): Promise<void> => {
  const storageLocal = getChromeStorageLocal()
  if (!storageLocal) {
    throw new Error('Review reminder storage unavailable')
  }
  await storageLocal.set({ [key]: value })
}

export const readReviewReminderSettings =
  async (): Promise<ReviewReminderSettings> => {
    const storage = getChromeStorageLocal()
    if (!storage) {
      return { ...defaultReviewReminderSettings }
    }
    const data = await storage.get([REVIEW_REMINDER_SETTINGS_KEY])
    const parsed = ReviewReminderSettingsSchema.safeParse(
      data[REVIEW_REMINDER_SETTINGS_KEY],
    )
    return parsed.success ? parsed.data : { ...defaultReviewReminderSettings }
  }

export const saveReviewReminderSettings = async (
  settings: ReviewReminderSettings,
): Promise<void> => {
  const validated = ReviewReminderSettingsSchema.parse(settings)
  await writeControlValue(REVIEW_REMINDER_SETTINGS_KEY, validated)
}

export const readReviewReminderNotification =
  async (): Promise<ReviewReminderNotification | null> => {
    const data = await requireStorage().get([NOTIFICATION_KEY])
    const parsed = NotificationSchema.safeParse(data[NOTIFICATION_KEY])
    return parsed.success && parsed.data.settings.enabled ? parsed.data : null
  }

export const saveReviewReminderNotification = async (
  value: ReviewReminderNotification,
): Promise<void> => {
  await writeControlValue(NOTIFICATION_KEY, NotificationSchema.parse(value))
}

export const clearReviewReminderNotification = async (): Promise<void> => {
  const storageLocal = getChromeStorageLocal()
  if (!storageLocal) {
    throw new Error('Review reminder storage unavailable')
  }
  await storageLocal.remove(NOTIFICATION_KEY)
}

export const readReviewReminderAlarmTimeZone = async (): Promise<
  string | null
> => {
  const data = await requireStorage().get([ALARM_TIME_ZONE_KEY])
  const parsed = TimeZoneSchema.safeParse(data[ALARM_TIME_ZONE_KEY])
  return parsed.success ? parsed.data : null
}

export const saveReviewReminderAlarmTimeZone = async (
  timeZone: string,
): Promise<void> => {
  await writeControlValue(ALARM_TIME_ZONE_KEY, TimeZoneSchema.parse(timeZone))
}
