import type { ReviewReminderSettings } from './reviewReminderSettings'

const DAYS_PER_WEEK = 7

export const isReviewQuietHours = (
  settings: ReviewReminderSettings,
  now: number,
): boolean => {
  if (
    !settings.quietHoursEnabled ||
    settings.quietStartHour === settings.quietEndHour
  ) {
    return false
  }
  const hour = new Date(now).getHours()
  return settings.quietStartHour < settings.quietEndHour
    ? hour >= settings.quietStartHour && hour < settings.quietEndHour
    : hour >= settings.quietStartHour || hour < settings.quietEndHour
}

export const nextReviewQuietHoursEnd = (
  settings: ReviewReminderSettings,
  now: number,
): number => {
  if (!isReviewQuietHours(settings, now)) {
    return now
  }
  const end = new Date(now)
  if (
    settings.quietStartHour > settings.quietEndHour &&
    end.getHours() >= settings.quietStartHour
  ) {
    end.setDate(end.getDate() + 1)
  }
  end.setHours(settings.quietEndHour, 0, 0, 0)
  return end.getTime()
}

export const nextReviewTime = (
  settings: ReviewReminderSettings,
  now: number,
): number => {
  const lookbackDays = settings.frequency === 'weekly' ? DAYS_PER_WEEK : 1
  // A prior nominal occurrence can still be pending after quiet-hour deferral.
  for (let offset = -lookbackDays; offset <= lookbackDays; offset += 1) {
    const occurrence = new Date(now)
    occurrence.setDate(occurrence.getDate() + offset)
    occurrence.setHours(settings.hour, 0, 0, 0)
    if (
      settings.frequency === 'weekly' &&
      occurrence.getDay() !== settings.weekday
    ) {
      continue
    }
    const scheduledTime = nextReviewQuietHoursEnd(
      settings,
      occurrence.getTime(),
    )
    if (scheduledTime > now) {
      return scheduledTime
    }
  }
  throw new RangeError('A review schedule requires a valid local timestamp.')
}
