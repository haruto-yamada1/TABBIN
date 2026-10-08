import { beforeEach, describe, expect, it, vi } from 'vitest'

import { defaultReviewReminderSettings } from '@/features/review-reminders/lib/reviewReminderSettings'

import {
  readReviewReminderAlarmTimeZone,
  saveReviewReminderAlarmTimeZone,
  readReviewReminderSettings,
  saveReviewReminderSettings,
  readReviewReminderNotification,
  saveReviewReminderNotification,
  clearReviewReminderNotification,
} from './review-reminders'

const mocks = vi.hoisted(() => ({ getChromeStorageLocal: vi.fn() }))
vi.mock('@/lib/browser/chrome-storage', () => mocks)

describe('review reminder settings storage', () => {
  it('persists the alarm timezone without saving URLs or changing reminder settings', async () => {
    const values: Record<string, unknown> = {}
    mocks.getChromeStorageLocal.mockReturnValue({
      get: vi.fn(async () => values),
      set: vi.fn(async (next: Record<string, unknown>) =>
        Object.assign(values, next),
      ),
    })
    await expect(readReviewReminderAlarmTimeZone()).resolves.toBeNull()
    await saveReviewReminderAlarmTimeZone('Asia/Tokyo')
    await expect(readReviewReminderAlarmTimeZone()).resolves.toBe('Asia/Tokyo')
    expect(values).toEqual({ reviewReminderAlarmTimeZone: 'Asia/Tokyo' })
  })
  beforeEach(() => vi.clearAllMocks())

  it('reads an enabled schedule without mutating saved data', async () => {
    const settings = {
      ...defaultReviewReminderSettings,
      enabled: true,
      hour: 15,
    }
    const set = vi.fn()
    mocks.getChromeStorageLocal.mockReturnValue({
      get: vi.fn(async () => ({ reviewReminderSettings: settings })),
      set,
    })
    await expect(readReviewReminderSettings()).resolves.toEqual(settings)
    expect(set).not.toHaveBeenCalled()
  })

  it('persists settings and notification criteria across a reload, and clears only notification state', async () => {
    const values: Record<string, unknown> = {
      userSettings: { autoDeletePeriod: 'never' },
      savedTabs: ['legacy'],
    }
    mocks.getChromeStorageLocal.mockReturnValue({
      get: vi.fn(async () => values),
      set: vi.fn(async (next: Record<string, unknown>) =>
        Object.assign(values, next),
      ),
      remove: vi.fn(async (key: string) => {
        delete values[key]
      }),
    })
    const settings = {
      ...defaultReviewReminderSettings,
      enabled: true,
      target: 'older' as const,
      olderThanDays: 14,
    }
    await saveReviewReminderSettings(settings)
    await expect(readReviewReminderSettings()).resolves.toEqual(settings)
    const notification = { settings, reviewAt: 1000 }
    await saveReviewReminderNotification(notification)
    await expect(readReviewReminderNotification()).resolves.toEqual(
      notification,
    )
    await clearReviewReminderNotification()
    await expect(readReviewReminderNotification()).resolves.toBeNull()
    expect(values.userSettings).toEqual({ autoDeletePeriod: 'never' })
    expect(values.savedTabs).toEqual(['legacy'])
  })

  it('fails closed for invalid stored schedules and invalid notification metadata', async () => {
    mocks.getChromeStorageLocal.mockReturnValue({
      get: vi.fn(async () => ({
        reviewReminderSettings: { enabled: true, hour: 40 },
        reviewReminderNotification: {
          settings: defaultReviewReminderSettings,
          reviewAt: -1,
        },
      })),
    })
    await expect(readReviewReminderSettings()).resolves.toEqual(
      defaultReviewReminderSettings,
    )
    await expect(readReviewReminderNotification()).resolves.toBeNull()
  })

  it('rejects invalid writes and propagates failed writes', async () => {
    const set = vi.fn().mockRejectedValue(new Error('write failed'))
    mocks.getChromeStorageLocal.mockReturnValue({ set })
    await expect(
      saveReviewReminderSettings({
        ...defaultReviewReminderSettings,
        hour: 40,
      }),
    ).rejects.toThrow(/Too big/)
    expect(set).not.toHaveBeenCalled()
    await expect(
      saveReviewReminderSettings(defaultReviewReminderSettings),
    ).rejects.toThrow('write failed')
  })

  it('defaults to disabled without storage and never claims a successful save', async () => {
    mocks.getChromeStorageLocal.mockReturnValue(null)
    await expect(readReviewReminderSettings()).resolves.toEqual(
      defaultReviewReminderSettings,
    )
    await expect(
      saveReviewReminderSettings(defaultReviewReminderSettings),
    ).rejects.toThrow('storage unavailable')
  })

  it('does not hide read failures or authorize a disabled notification', async () => {
    mocks.getChromeStorageLocal.mockReturnValue({
      get: vi.fn().mockRejectedValue(new Error('read failed')),
    })
    await expect(readReviewReminderSettings()).rejects.toThrow('read failed')
    mocks.getChromeStorageLocal.mockReturnValue({
      get: vi.fn(async () => ({
        reviewReminderNotification: {
          settings: defaultReviewReminderSettings,
          reviewAt: 1000,
        },
      })),
    })
    await expect(readReviewReminderNotification()).resolves.toBeNull()
  })
})
