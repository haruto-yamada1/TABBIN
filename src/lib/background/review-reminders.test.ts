import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

const mocked = vi.hoisted(() => ({
  readSettings: vi.fn(),
  readNotification: vi.fn(),
  saveNotification: vi.fn(),
  clearNotification: vi.fn(),
  readAlarmTimeZone: vi.fn(),
  saveAlarmTimeZone: vi.fn(),
  getCandidates: vi.fn(),
  buildUrl: vi.fn(),
  nextReviewTime: vi.fn(),
  isQuietHours: vi.fn(),
  quietHoursEnd: vi.fn(),
  getMessage: vi.fn(),
  logger: { error: vi.fn() },
}))

vi.mock('@/lib/storage/review-reminders', () => ({
  REVIEW_REMINDER_SETTINGS_KEY: 'reviewReminderSettings',
  readReviewReminderSettings: mocked.readSettings,
  readReviewReminderNotification: mocked.readNotification,
  saveReviewReminderNotification: mocked.saveNotification,
  clearReviewReminderNotification: mocked.clearNotification,
  readReviewReminderAlarmTimeZone: mocked.readAlarmTimeZone,
  saveReviewReminderAlarmTimeZone: mocked.saveAlarmTimeZone,
}))
vi.mock('@/app/composition/reviewReminders', () => ({
  getReviewCandidates: mocked.getCandidates,
  buildReviewReminderUrl: mocked.buildUrl,
}))
vi.mock('@/features/review-reminders/lib/reviewSchedule', () => ({
  nextReviewTime: mocked.nextReviewTime,
  isReviewQuietHours: mocked.isQuietHours,
  nextReviewQuietHoursEnd: mocked.quietHoursEnd,
}))
vi.mock('@/lib/background/i18n', () => ({
  getBackgroundMessage: mocked.getMessage,
}))
vi.mock('@/lib/logging/logger', () => ({ logger: mocked.logger }))
vi.mock('wxt/browser', () => ({
  get browser() {
    const namespace: unknown = Reflect.get(globalThis, 'browser')
    const runtime: unknown =
      typeof namespace === 'object' && namespace !== null
        ? Reflect.get(namespace, 'runtime')
        : undefined
    const id: unknown =
      typeof runtime === 'object' && runtime !== null
        ? Reflect.get(runtime, 'id')
        : undefined
    return id ? namespace : globalThis.chrome
  },
}))

const NOW = new Date(2026, 9, 8, 9).getTime()
const NEXT_REVIEW = NOW + 86_400_000
const ALARM_NAME = 'reviewSavedTabs'
const NOTIFICATION_ID = 'tabbin-review-reminder'
const enabledSettings = {
  enabled: true,
  target: 'all',
  categoryId: '',
  olderThanDays: 30,
  frequency: 'daily',
  hour: 9,
  weekday: 6,
  quietHoursEnabled: true,
  quietStartHour: 22,
  quietEndHour: 8,
}

type AlarmListener = (alarm: { name: string; scheduledTime?: number }) => void
type ChangeListener = (
  changes: Record<string, { newValue?: unknown }>,
  area: string,
) => void
type ClickListener = (id: string) => void
const createChromeHarness = () => {
  const alarmListeners: AlarmListener[] = []
  const changeListeners: ChangeListener[] = []
  const clickListeners: ClickListener[] = []
  const alarmsGet = vi.fn(
    async (): Promise<chrome.alarms.Alarm | undefined> => undefined,
  )
  const alarmsCreate = vi.fn(async () => {})
  const alarmsClear = vi.fn(async () => true)
  const notificationsCreate = vi.fn(async () => NOTIFICATION_ID)
  const notificationsClear = vi.fn(async (_id: string) => true)
  const tabsCreate = vi.fn(async () => ({ id: 100 }))
  const api = {
    alarms: {
      get: alarmsGet,
      create: alarmsCreate,
      clear: alarmsClear,
      onAlarm: {
        addListener: (listener: AlarmListener) => alarmListeners.push(listener),
      },
    },
    storage: {
      onChanged: {
        addListener: (listener: ChangeListener) =>
          changeListeners.push(listener),
      },
    },
    notifications: {
      create: notificationsCreate,
      clear: notificationsClear,
      onClicked: {
        addListener: (listener: ClickListener) => clickListeners.push(listener),
      },
    },
    runtime: {
      id: 'tabbin-runtime',
      getURL: (path: string) =>
        `chrome-extension://tabbin/${path.replace(/^\//u, '')}`,
    },
    tabs: { create: tabsCreate },
  }
  vi.stubGlobal('chrome', api)
  return {
    api,
    alarmListeners,
    changeListeners,
    clickListeners,
    alarmsGet,
    alarmsCreate,
    alarmsClear,
    notificationsCreate,
    notificationsClear,
    tabsCreate,
  }
}
const flush = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0))
}
let registerListeners: () => void
let reconcileAlarm: (reset?: boolean) => Promise<void>
let harness: ReturnType<typeof createChromeHarness>

beforeEach(async () => {
  vi.resetModules()
  vi.resetAllMocks()
  vi.spyOn(Date, 'now').mockReturnValue(NOW)
  mocked.readSettings.mockResolvedValue({ ...enabledSettings })
  mocked.readNotification.mockResolvedValue(null)
  mocked.readAlarmTimeZone.mockResolvedValue(
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  )
  mocked.getCandidates.mockResolvedValue([
    {
      url: 'https://private.example/account?token=secret',
      title: 'Private title',
    },
  ])
  mocked.nextReviewTime.mockReturnValue(NEXT_REVIEW)
  mocked.isQuietHours.mockReturnValue(false)
  mocked.quietHoursEnd.mockReturnValue(NOW + 3_600_000)
  mocked.buildUrl.mockReturnValue(
    'chrome-extension://tabbin/app.html#/saved-tabs?review=1',
  )
  mocked.getMessage.mockImplementation(
    async (key: string, _fallback?: string, values?: Record<string, string>) =>
      key.endsWith('Title')
        ? 'Review saved tabs'
        : `${values?.count ?? ''} tabs to review`,
  )
  vi.stubGlobal('browser', undefined)
  harness = createChromeHarness()
  const runtime = await import('./review-reminders')
  registerListeners = runtime.registerReviewReminderListeners
  reconcileAlarm = runtime.reconcileReviewReminderAlarm
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const useFirefoxNamespaces = async () => {
  const callbackApis = {
    alarmsGet: vi.fn((): void => {}),
    alarmsCreate: vi.fn((): void => {}),
    alarmsClear: vi.fn((): void => {}),
    notificationsCreate: vi.fn((): void => {}),
    notificationsClear: vi.fn((): void => {}),
    tabsCreate: vi.fn((): void => {}),
  }
  vi.stubGlobal('browser', harness.api)
  vi.stubGlobal('chrome', {
    ...harness.api,
    alarms: {
      ...harness.api.alarms,
      get: callbackApis.alarmsGet,
      create: callbackApis.alarmsCreate,
      clear: callbackApis.alarmsClear,
    },
    notifications: {
      ...harness.api.notifications,
      create: callbackApis.notificationsCreate,
      clear: callbackApis.notificationsClear,
    },
    tabs: { create: callbackApis.tabsCreate },
  })
  vi.resetModules()
  const runtime = await import('./review-reminders')
  registerListeners = runtime.registerReviewReminderListeners
  reconcileAlarm = runtime.reconcileReviewReminderAlarm
  return callbackApis
}

describe('review reminder background runtime', () => {
  it('preserves Firefox future alarm results through its Promise browser namespace', async () => {
    const callbacks = await useFirefoxNamespaces()
    harness.alarmsGet.mockResolvedValue({
      name: ALARM_NAME,
      scheduledTime: NEXT_REVIEW,
      persistAcrossSessions: true,
    })
    await reconcileAlarm()
    expect(harness.alarmsGet).toHaveBeenCalledWith(ALARM_NAME)
    expect(harness.alarmsCreate).not.toHaveBeenCalled()
    expect(callbacks.alarmsGet).not.toHaveBeenCalled()
    expect(callbacks.alarmsCreate).not.toHaveBeenCalled()
  })

  it('awaits a Firefox native alarm rejection before recording its time zone', async () => {
    const callbacks = await useFirefoxNamespaces()
    const error = new Error('Firefox native alarm rejected')
    harness.alarmsCreate.mockRejectedValue(error)
    await expect(reconcileAlarm()).rejects.toBe(error)
    expect(mocked.saveAlarmTimeZone).not.toHaveBeenCalled()
    expect(callbacks.alarmsCreate).not.toHaveBeenCalled()
  })

  it('clears the actual Firefox notification after pending native creation completes while disabled', async () => {
    const callbacks = await useFirefoxNamespaces()
    const creating = Promise.withResolvers<string>()
    const visibleNotifications = new Set<string>()
    harness.notificationsCreate.mockImplementation(async () => {
      const id = await creating.promise
      visibleNotifications.add(id)
      return id
    })
    harness.notificationsClear.mockImplementation(async (id: string) =>
      visibleNotifications.delete(id),
    )
    registerListeners()
    harness.alarmListeners[0]?.({ name: ALARM_NAME, scheduledTime: NOW })
    await flush()
    expect(harness.notificationsCreate).toHaveBeenCalledOnce()
    mocked.readSettings.mockResolvedValue({
      ...enabledSettings,
      enabled: false,
    })
    harness.changeListeners[0]?.(
      { reviewReminderSettings: { newValue: { enabled: false } } },
      'local',
    )
    creating.resolve(NOTIFICATION_ID)
    await flush()
    expect(visibleNotifications.size).toBe(0)
    expect(harness.notificationsClear).toHaveBeenCalledWith(NOTIFICATION_ID)
    expect(callbacks.notificationsCreate).not.toHaveBeenCalled()
    expect(callbacks.notificationsClear).not.toHaveBeenCalled()
  })

  it('registers MV3 wake listeners synchronously before reading any settings', () => {
    registerListeners()
    expect(harness.alarmListeners).toHaveLength(1)
    expect(harness.changeListeners).toHaveLength(1)
    expect(harness.clickListeners).toHaveLength(1)
    expect(mocked.readSettings).not.toHaveBeenCalled()
  })

  it('clears the reminder alarm, visible notification and filter metadata when disabled', async () => {
    mocked.readSettings.mockResolvedValue({
      ...enabledSettings,
      enabled: false,
    })
    await reconcileAlarm()
    expect(harness.alarmsClear).toHaveBeenCalledWith(ALARM_NAME)
    expect(harness.notificationsClear).toHaveBeenCalledWith(NOTIFICATION_ID)
    expect(mocked.clearNotification).toHaveBeenCalledOnce()
    expect(harness.alarmsCreate).not.toHaveBeenCalled()
  })

  it('creates a one-shot future alarm for an enabled reminder', async () => {
    await reconcileAlarm()
    expect(harness.alarmsCreate).toHaveBeenCalledWith(ALARM_NAME, {
      when: NEXT_REVIEW,
    })
    expect(harness.notificationsCreate).not.toHaveBeenCalled()
  })

  it('preserves an existing future one-shot alarm when the service worker restarts', async () => {
    harness.alarmsGet.mockResolvedValue({
      name: ALARM_NAME,
      scheduledTime: NEXT_REVIEW,
      persistAcrossSessions: true,
    })
    await reconcileAlarm()
    expect(harness.alarmsCreate).not.toHaveBeenCalled()
    expect(harness.alarmsClear).not.toHaveBeenCalled()
  })

  it('recomputes a future local schedule after the device time zone changes', async () => {
    const resolvedOptions = Intl.DateTimeFormat().resolvedOptions()
    vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({
      ...resolvedOptions,
      timeZone: 'America/New_York',
    })
    mocked.readAlarmTimeZone.mockResolvedValue('Asia/Tokyo')
    harness.alarmsGet.mockResolvedValue({
      name: ALARM_NAME,
      scheduledTime: NEXT_REVIEW,
      persistAcrossSessions: true,
    })
    await reconcileAlarm()
    expect(harness.alarmsCreate).toHaveBeenCalledWith(ALARM_NAME, {
      when: NEXT_REVIEW,
    })
    expect(mocked.saveAlarmTimeZone).toHaveBeenCalledWith('America/New_York')
  })

  it('recomputes an existing future schedule whose time zone was never recorded', async () => {
    mocked.readAlarmTimeZone.mockResolvedValue(null)
    harness.alarmsGet.mockResolvedValue({
      name: ALARM_NAME,
      scheduledTime: NEXT_REVIEW,
      persistAcrossSessions: true,
    })
    await reconcileAlarm()
    expect(harness.alarmsCreate).toHaveBeenCalledWith(ALARM_NAME, {
      when: NEXT_REVIEW,
    })
  })

  it.each(['Asia/Tokyo', null])(
    'reschedules a wake alarm and skips delivery when its recorded time zone is %s',
    async (previousZone) => {
      const resolvedOptions = Intl.DateTimeFormat().resolvedOptions()
      vi.spyOn(
        Intl.DateTimeFormat.prototype,
        'resolvedOptions',
      ).mockReturnValue({
        ...resolvedOptions,
        timeZone: 'America/New_York',
      })
      mocked.readAlarmTimeZone.mockResolvedValue(previousZone)
      registerListeners()
      harness.alarmListeners[0]?.({ name: ALARM_NAME, scheduledTime: NOW })
      await flush()
      expect(harness.alarmsCreate).toHaveBeenCalledWith(ALARM_NAME, {
        when: NEXT_REVIEW,
      })
      expect(mocked.saveAlarmTimeZone).toHaveBeenCalledWith('America/New_York')
      expect(mocked.getCandidates).not.toHaveBeenCalled()
      expect(harness.notificationsCreate).not.toHaveBeenCalled()
    },
  )

  it('leaves initial scheduling to an alarm event already waking the service worker', async () => {
    const resolvedOptions = Intl.DateTimeFormat().resolvedOptions()
    vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({
      ...resolvedOptions,
      timeZone: 'America/New_York',
    })
    mocked.readAlarmTimeZone.mockResolvedValue('Asia/Tokyo')
    const reading = Promise.withResolvers<typeof enabledSettings>()
    mocked.readSettings.mockReturnValueOnce(reading.promise)
    registerListeners()
    harness.alarmListeners[0]?.({ name: ALARM_NAME, scheduledTime: NOW })
    const starting = reconcileAlarm()
    await flush()
    expect(harness.alarmsCreate).not.toHaveBeenCalled()
    reading.resolve(enabledSettings)
    await starting
    await flush()
    expect(harness.alarmsCreate).toHaveBeenCalledOnce()
    expect(mocked.getCandidates).not.toHaveBeenCalled()
  })

  it('still rejects a stale wake event when startup already began overwriting the alarm zone', async () => {
    const resolvedOptions = Intl.DateTimeFormat().resolvedOptions()
    vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({
      ...resolvedOptions,
      timeZone: 'America/New_York',
    })
    let storedZone = 'Asia/Tokyo'
    const reading = Promise.withResolvers<undefined>()
    mocked.readAlarmTimeZone
      .mockImplementationOnce(async () => storedZone)
      .mockImplementation(async () => {
        await reading.promise
        return storedZone
      })
    mocked.saveAlarmTimeZone.mockImplementation(async (zone: string) => {
      storedZone = zone
    })
    const creating = Promise.withResolvers<undefined>()
    harness.alarmsCreate.mockReturnValueOnce(creating.promise)
    const starting = reconcileAlarm()
    await flush()
    expect(harness.alarmsCreate).toHaveBeenCalledOnce()
    registerListeners()
    harness.alarmListeners[0]?.({ name: ALARM_NAME, scheduledTime: NOW })
    await flush()
    creating.resolve(undefined)
    await starting
    expect(storedZone).toBe('America/New_York')
    reading.resolve(undefined)
    await flush()
    expect(mocked.getCandidates).not.toHaveBeenCalled()
    expect(harness.notificationsCreate).not.toHaveBeenCalled()
    // The next event scheduled under the new zone remains deliverable.
    vi.mocked(Date.now).mockReturnValue(NEXT_REVIEW)
    mocked.nextReviewTime.mockReturnValue(NEXT_REVIEW + 86_400_000)
    harness.alarmListeners[0]?.({
      name: ALARM_NAME,
      scheduledTime: NEXT_REVIEW,
    })
    await flush()
    expect(mocked.getCandidates).toHaveBeenCalledOnce()
    expect(harness.notificationsCreate).toHaveBeenCalledOnce()
  })

  it('replaces expired or periodic alarms with the current one-shot schedule', async () => {
    harness.alarmsGet.mockResolvedValue({
      name: ALARM_NAME,
      scheduledTime: NEXT_REVIEW,
      periodInMinutes: 60,
      persistAcrossSessions: true,
    })
    await reconcileAlarm()
    expect(harness.alarmsCreate).toHaveBeenCalledWith(ALARM_NAME, {
      when: NEXT_REVIEW,
    })
  })

  it('reconciles local setting changes and invalidates the previous notification', async () => {
    registerListeners()
    harness.changeListeners[0]?.(
      { reviewReminderSettings: { newValue: enabledSettings } },
      'sync',
    )
    harness.changeListeners[0]?.({ unrelated: { newValue: true } }, 'local')
    await flush()
    expect(mocked.readSettings).not.toHaveBeenCalled()
    harness.changeListeners[0]?.(
      { reviewReminderSettings: { newValue: enabledSettings } },
      'local',
    )
    await flush()
    expect(harness.alarmsClear).toHaveBeenCalledWith(ALARM_NAME)
    expect(harness.notificationsClear).toHaveBeenCalledWith(NOTIFICATION_ID)
    expect(mocked.clearNotification).toHaveBeenCalledOnce()
    expect(harness.alarmsCreate).toHaveBeenCalledWith(ALARM_NAME, {
      when: NEXT_REVIEW,
    })
  })

  it('cannot restore an enabled alarm from a settings load superseded by disabling', async () => {
    const pending = Promise.withResolvers<typeof enabledSettings>()
    mocked.readSettings.mockReturnValueOnce(pending.promise)
    registerListeners()
    const starting = reconcileAlarm()
    mocked.readSettings.mockResolvedValue({
      ...enabledSettings,
      enabled: false,
    })
    harness.changeListeners[0]?.(
      { reviewReminderSettings: { newValue: { enabled: false } } },
      'local',
    )
    await flush()
    pending.resolve(enabledSettings)
    await starting
    expect(harness.alarmsClear).toHaveBeenCalledWith(ALARM_NAME)
    expect(harness.alarmsCreate).not.toHaveBeenCalled()
  })

  it('schedules the next reminder before querying and shows only a localized count', async () => {
    registerListeners()
    harness.alarmListeners[0]?.({ name: 'other-alarm' })
    await flush()
    expect(mocked.getCandidates).not.toHaveBeenCalled()
    harness.alarmListeners[0]?.({ name: ALARM_NAME })
    await flush()
    expect(harness.alarmsCreate.mock.invocationCallOrder[0]).toBeLessThan(
      mocked.getCandidates.mock.invocationCallOrder[0] ?? 0,
    )
    expect(harness.notificationsCreate).toHaveBeenCalledWith(NOTIFICATION_ID, {
      type: 'basic',
      iconUrl: 'chrome-extension://tabbin/icon/128.png',
      title: 'Review saved tabs',
      message: '1 tabs to review',
    })
    expect(mocked.saveNotification).toHaveBeenCalledWith({
      settings: enabledSettings,
      reviewAt: NOW,
    })
    expect(
      JSON.stringify(harness.notificationsCreate.mock.calls),
    ).not.toContain('private.example')
    expect(
      JSON.stringify(harness.notificationsCreate.mock.calls),
    ).not.toContain('Private title')
  })

  it('defers an alarm delivered during quiet hours to the end of that quiet window', async () => {
    mocked.isQuietHours.mockReturnValue(true)
    registerListeners()
    harness.alarmListeners[0]?.({ name: ALARM_NAME })
    await flush()
    expect(harness.alarmsCreate).toHaveBeenCalledWith(ALARM_NAME, {
      when: NOW + 3_600_000,
    })
    expect(mocked.getCandidates).not.toHaveBeenCalled()
    expect(harness.notificationsCreate).not.toHaveBeenCalled()
  })

  it.each(['candidate', 'localization'])(
    'defers delivery when a pending %s read crosses the quiet-hours boundary',
    async (phase) => {
      const beforeQuiet = new Date(2026, 9, 8, 21, 59, 59).getTime()
      const quietStart = new Date(2026, 9, 8, 22).getTime()
      const quietEnd = new Date(2026, 9, 9, 8).getTime()
      vi.mocked(Date.now).mockReturnValue(beforeQuiet)
      mocked.isQuietHours.mockImplementation(
        (_settings: unknown, time: number) => time >= quietStart,
      )
      mocked.quietHoursEnd.mockReturnValue(quietEnd)
      const reading = Promise.withResolvers<unknown[]>()
      const localizing = Promise.withResolvers<string>()
      if (phase === 'candidate') {
        mocked.getCandidates.mockReturnValue(reading.promise)
      } else {
        mocked.getMessage.mockReturnValue(localizing.promise)
      }
      registerListeners()
      harness.alarmListeners[0]?.({ name: ALARM_NAME })
      await flush()
      expect(mocked.getCandidates).toHaveBeenCalledOnce()
      vi.mocked(Date.now).mockReturnValue(quietStart)
      reading.resolve([{ id: 'private-url-id' }])
      localizing.resolve('Review saved tabs')
      await flush()
      expect(harness.alarmsCreate).toHaveBeenLastCalledWith(ALARM_NAME, {
        when: quietEnd,
      })
      expect(harness.notificationsCreate).not.toHaveBeenCalled()
      expect(mocked.saveNotification).not.toHaveBeenCalled()
    },
  )

  it('clears and defers a native notification creation that completes after quiet hours begin', async () => {
    const beforeQuiet = new Date(2026, 9, 8, 21, 59, 59).getTime()
    const quietStart = new Date(2026, 9, 8, 22).getTime()
    const quietEnd = new Date(2026, 9, 9, 8).getTime()
    vi.mocked(Date.now).mockReturnValue(beforeQuiet)
    mocked.isQuietHours.mockImplementation(
      (_settings: unknown, time: number) => time >= quietStart,
    )
    mocked.quietHoursEnd.mockReturnValue(quietEnd)
    const creating = Promise.withResolvers<string>()
    harness.notificationsCreate.mockReturnValue(creating.promise)
    registerListeners()
    harness.alarmListeners[0]?.({ name: ALARM_NAME })
    await flush()
    expect(harness.notificationsCreate).toHaveBeenCalledOnce()
    vi.mocked(Date.now).mockReturnValue(quietStart)
    creating.resolve(NOTIFICATION_ID)
    await flush()
    expect(harness.alarmsCreate).toHaveBeenLastCalledWith(ALARM_NAME, {
      when: quietEnd,
    })
    expect(harness.notificationsClear).toHaveBeenCalledTimes(2)
    expect(mocked.clearNotification).toHaveBeenCalledTimes(2)
  })

  it('keeps the next schedule and clears stale notifications when no candidates remain', async () => {
    mocked.getCandidates.mockResolvedValue([])
    registerListeners()
    harness.alarmListeners[0]?.({ name: ALARM_NAME })
    await flush()
    expect(harness.alarmsCreate).toHaveBeenCalledOnce()
    expect(harness.notificationsCreate).not.toHaveBeenCalled()
    expect(harness.notificationsClear).toHaveBeenCalledWith(NOTIFICATION_ID)
    expect(mocked.clearNotification).toHaveBeenCalledOnce()
  })

  it('keeps the next alarm after a persistence read fails and uses the private logger', async () => {
    mocked.getCandidates.mockRejectedValue(new Error('private URL read failed'))
    registerListeners()
    harness.alarmListeners[0]?.({ name: ALARM_NAME })
    await flush()
    expect(harness.alarmsCreate).toHaveBeenCalledWith(ALARM_NAME, {
      when: NEXT_REVIEW,
    })
    expect(harness.notificationsCreate).not.toHaveBeenCalled()
    expect(mocked.logger.error).toHaveBeenCalledWith(
      'review_reminder_alarm_failed',
      expect.any(Error),
    )
  })

  it('removes the previous notification before replacing its criteria and cleans a failed replacement', async () => {
    harness.notificationsCreate.mockRejectedValue(
      new Error('notification unavailable'),
    )
    registerListeners()
    harness.alarmListeners[0]?.({ name: ALARM_NAME })
    await flush()
    expect(harness.notificationsClear.mock.invocationCallOrder[0]).toBeLessThan(
      mocked.saveNotification.mock.invocationCallOrder[0] ?? 0,
    )
    expect(mocked.clearNotification).toHaveBeenCalledTimes(2)
    expect(mocked.logger.error).toHaveBeenCalledWith(
      'review_reminder_alarm_failed',
      expect.any(Error),
    )
  })

  it('does not deliver a pending reminder after its setting was disabled', async () => {
    const pending = Promise.withResolvers<unknown[]>()
    mocked.getCandidates.mockReturnValue(pending.promise)
    registerListeners()
    harness.alarmListeners[0]?.({ name: ALARM_NAME })
    await flush()
    mocked.readSettings.mockResolvedValue({
      ...enabledSettings,
      enabled: false,
    })
    harness.changeListeners[0]?.(
      { reviewReminderSettings: { newValue: { enabled: false } } },
      'local',
    )
    await flush()
    expect(harness.alarmsClear).toHaveBeenCalledWith(ALARM_NAME)
    pending.resolve([{ id: 'private-url-id' }])
    await flush()
    expect(harness.notificationsCreate).not.toHaveBeenCalled()
    expect(mocked.saveNotification).not.toHaveBeenCalled()
  })

  it('re-reads settings before delivery even if no storage event has arrived yet', async () => {
    mocked.readSettings
      .mockResolvedValueOnce(enabledSettings)
      .mockResolvedValue({ ...enabledSettings, enabled: false })
    registerListeners()
    harness.alarmListeners[0]?.({ name: ALARM_NAME })
    await flush()
    expect(harness.notificationsCreate).not.toHaveBeenCalled()
  })

  it('discards a candidate result if enabled filter criteria changed before delivery', async () => {
    mocked.readSettings
      .mockResolvedValueOnce(enabledSettings)
      .mockResolvedValue({ ...enabledSettings, target: 'older' })
    registerListeners()
    harness.alarmListeners[0]?.({ name: ALARM_NAME })
    await flush()
    expect(mocked.getCandidates).toHaveBeenCalledOnce()
    expect(harness.notificationsCreate).not.toHaveBeenCalled()
    expect(mocked.saveNotification).not.toHaveBeenCalled()
  })

  it('catches settings and click API failures and allows a later settings change to schedule again', async () => {
    mocked.readSettings.mockRejectedValueOnce(new Error('storage unavailable'))
    registerListeners()
    harness.changeListeners[0]?.(
      { reviewReminderSettings: { newValue: enabledSettings } },
      'local',
    )
    await flush()
    expect(mocked.logger.error).toHaveBeenCalledWith(
      'review_reminder_settings_reconcile_failed',
      expect.any(Error),
    )
    harness.changeListeners[0]?.(
      { reviewReminderSettings: { newValue: enabledSettings } },
      'local',
    )
    await flush()
    expect(harness.alarmsCreate).toHaveBeenCalledWith(ALARM_NAME, {
      when: NEXT_REVIEW,
    })
    mocked.readNotification.mockResolvedValue({
      settings: enabledSettings,
      reviewAt: NOW,
    })
    harness.tabsCreate.mockRejectedValue(new Error('tab creation unavailable'))
    harness.clickListeners[0]?.(NOTIFICATION_ID)
    await flush()
    expect(mocked.logger.error).toHaveBeenCalledWith(
      'review_reminder_notification_click_failed',
      expect.any(Error),
    )
  })

  it('clears a notification whose API creation completes after disabling', async () => {
    const creating = Promise.withResolvers<string>()
    harness.notificationsCreate.mockReturnValue(creating.promise)
    registerListeners()
    harness.alarmListeners[0]?.({ name: ALARM_NAME })
    await flush()
    expect(harness.notificationsCreate).toHaveBeenCalledOnce()
    mocked.readSettings.mockResolvedValue({
      ...enabledSettings,
      enabled: false,
    })
    harness.changeListeners[0]?.(
      { reviewReminderSettings: { newValue: { enabled: false } } },
      'local',
    )
    creating.resolve(NOTIFICATION_ID)
    await flush()
    expect(harness.notificationsClear).toHaveBeenCalledWith(NOTIFICATION_ID)
    expect(mocked.clearNotification).toHaveBeenCalled()
  })

  it('opens the fixed internal review route using the notification criteria and reference time', async () => {
    const reviewAt = NOW - 86_400_000
    mocked.readNotification.mockResolvedValue({
      settings: enabledSettings,
      reviewAt,
    })
    registerListeners()
    harness.clickListeners[0]?.(NOTIFICATION_ID)
    await flush()
    expect(mocked.buildUrl).toHaveBeenCalledWith(enabledSettings, reviewAt)
    expect(harness.tabsCreate).toHaveBeenCalledWith({
      url: 'chrome-extension://tabbin/app.html#/saved-tabs?review=1',
    })
    expect(harness.notificationsClear).toHaveBeenCalledWith(NOTIFICATION_ID)
  })

  it('ignores another notification id, missing metadata and disabled reminders', async () => {
    registerListeners()
    harness.clickListeners[0]?.('https://private.example/')
    await flush()
    expect(mocked.readNotification).not.toHaveBeenCalled()
    harness.clickListeners[0]?.(NOTIFICATION_ID)
    await flush()
    expect(harness.tabsCreate).not.toHaveBeenCalled()
    mocked.readNotification.mockResolvedValue({
      settings: enabledSettings,
      reviewAt: NOW,
    })
    mocked.readSettings.mockResolvedValue({
      ...enabledSettings,
      enabled: false,
    })
    harness.clickListeners[0]?.(NOTIFICATION_ID)
    await flush()
    expect(harness.tabsCreate).not.toHaveBeenCalled()
  })
})
