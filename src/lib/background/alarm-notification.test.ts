import { assert, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocked = vi.hoisted(() => ({
  ready: vi.fn(async () => {}),
  checkAndRemoveExpiredTabs: vi.fn(async () => {}),
  requireUserSettings: vi.fn(),
  logger: { error: vi.fn(), warn: vi.fn() },
}))
vi.mock('./expired-tabs', () => ({
  checkAndRemoveExpiredTabs: mocked.checkAndRemoveExpiredTabs,
}))
vi.mock('@/app/composition/persistenceBootstrap', () => ({
  getPersistenceBootstrapRuntime: () => ({
    bootstrap: { ready: mocked.ready },
  }),
}))
vi.mock('@/lib/logging/logger', () => ({ logger: mocked.logger }))
vi.mock('@/lib/storage/settings', () => ({
  requireUserSettings: mocked.requireUserSettings,
}))
vi.mock('wxt/browser', () => ({
  get browser() {
    return globalThis.chrome
  },
}))

type AlarmListener = (alarm: TestAlarm) => void
type StorageListener = (changes: Record<string, unknown>, area: string) => void
type TestAlarm = {
  name: string
  periodInMinutes?: number
  scheduledTime?: number
}

const createAlarmChromeMock = (
  options: {
    existingAlarm?: TestAlarm
    alarmsAvailable?: boolean
    createThrows?: Error
    getThrows?: Error
    listenerThrows?: Error
    notificationThrows?: Error
  } = {},
) => {
  const listeners: AlarmListener[] = []
  const storageListeners: StorageListener[] = []
  let alarm = options.existingAlarm && {
    scheduledTime: Date.now() + 30_000,
    ...options.existingAlarm,
  }
  const alarmsCreate = vi.fn(
    async (name: string, info: { periodInMinutes: number }) => {
      if (options.createThrows) {
        throw options.createThrows
      }
      alarm = {
        name,
        periodInMinutes: info.periodInMinutes,
        scheduledTime: Date.now() + info.periodInMinutes * 60_000,
      }
    },
  )
  const alarmsGet = vi.fn(async () => {
    if (options.getThrows) {
      throw options.getThrows
    }
    return alarm
  })
  const notificationsCreate = vi.fn(() => {
    if (options.notificationThrows) {
      throw options.notificationThrows
    }
    return 'notification-id'
  })
  const getURL = vi.fn((path: string) => `chrome-extension://tabbin/${path}`)
  const alarmsClear = vi.fn(async (_name: string) => {
    alarm = undefined
    return true
  })
  const addListener = vi.fn((listener: AlarmListener) => {
    if (options.listenerThrows) {
      throw options.listenerThrows
    }
    listeners.push(listener)
  })
  vi.stubGlobal('chrome', {
    runtime: { getURL },
    notifications: { create: notificationsCreate },
    storage: {
      onChanged: {
        addListener: (listener: StorageListener) =>
          storageListeners.push(listener),
        hasListener: (listener: StorageListener) =>
          storageListeners.includes(listener),
      },
    },
    ...(options.alarmsAvailable === false
      ? {}
      : {
          alarms: {
            create: alarmsCreate,
            get: alarmsGet,
            clear: alarmsClear,
            onAlarm: {
              addListener,
              hasListener: (listener: AlarmListener) =>
                listeners.includes(listener),
            },
          },
        }),
  })
  const fire = (
    name = 'checkExpiredTabs',
    info: Omit<TestAlarm, 'name'> = { periodInMinutes: 0.5 },
  ) => {
    assert.lengthOf(listeners, 1)
    listeners[0]?.({ name, scheduledTime: Date.now(), ...info })
  }
  return {
    listeners,
    alarmsCreate,
    alarmsGet,
    alarmsClear,
    addListener,
    notificationsCreate,
    getURL,
    fire,
    changeSettings: (period: string) => {
      mocked.requireUserSettings.mockResolvedValue({ autoDeletePeriod: period })
      for (const listener of storageListeners) {
        listener(
          { userSettings: { newValue: { autoDeletePeriod: period } } },
          'local',
        )
      }
    },
  }
}
const loadAlarm = async () => {
  vi.resetModules()
  return import('./alarm-notification')
}
const flush = async () => {
  await vi.advanceTimersByTimeAsync(0)
}

describe('alarm-notification モジュール', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocked.ready.mockResolvedValue(undefined)
    mocked.checkAndRemoveExpiredTabs.mockResolvedValue(undefined)
    mocked.requireUserSettings.mockResolvedValue({ autoDeletePeriod: '1day' })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('同期登録を一度だけ行い、登録時はDBやscheduleに触れない', async () => {
    const harness = createAlarmChromeMock()
    const { registerExpiredTabsAlarmListener } = await loadAlarm()
    registerExpiredTabsAlarmListener()
    registerExpiredTabsAlarmListener()
    expect(harness.addListener).toHaveBeenCalledOnce()
    expect(mocked.ready).not.toHaveBeenCalled()
    expect(harness.alarmsGet).not.toHaveBeenCalled()
    expect(harness.alarmsCreate).not.toHaveBeenCalled()
  })

  it('DB準備中のwakeを保持し、ready後に一度だけ期限チェックする', async () => {
    const pending = Promise.withResolvers<undefined>()
    mocked.ready.mockReturnValue(pending.promise)
    const harness = createAlarmChromeMock()
    const { registerExpiredTabsAlarmListener } = await loadAlarm()
    registerExpiredTabsAlarmListener()
    harness.fire()
    await flush()
    expect(mocked.ready).toHaveBeenCalledOnce()
    expect(mocked.checkAndRemoveExpiredTabs).not.toHaveBeenCalled()
    pending.resolve(undefined)
    await flush()
    expect(mocked.checkAndRemoveExpiredTabs).toHaveBeenCalledOnce()
  })

  it('reviewSavedTabsと未知のAlarmはDBを起動せず無視する', async () => {
    const harness = createAlarmChromeMock()
    const { registerExpiredTabsAlarmListener } = await loadAlarm()
    registerExpiredTabsAlarmListener()
    harness.fire('reviewSavedTabs')
    harness.fire('otherAlarm')
    await flush()
    expect(mocked.ready).not.toHaveBeenCalled()
    expect(mocked.checkAndRemoveExpiredTabs).not.toHaveBeenCalled()
  })

  it('連続Alarmと初回チェックを重ねず、完了後のAlarmは再処理する', async () => {
    const pending = Promise.withResolvers<undefined>()
    mocked.checkAndRemoveExpiredTabs.mockReturnValueOnce(pending.promise)
    const harness = createAlarmChromeMock()
    const { registerExpiredTabsAlarmListener, setupExpiredTabsCheckAlarm } =
      await loadAlarm()
    registerExpiredTabsAlarmListener()
    await setupExpiredTabsCheckAlarm()
    harness.fire()
    harness.fire()
    await vi.advanceTimersByTimeAsync(100)
    expect(mocked.checkAndRemoveExpiredTabs).toHaveBeenCalledOnce()
    pending.resolve(undefined)
    await flush()
    harness.fire()
    await flush()
    expect(mocked.checkAndRemoveExpiredTabs).toHaveBeenCalledTimes(2)
  })

  it('起動時のscheduleがDB待ちのAlarmと重なってもチェックを追加しない', async () => {
    const pending = Promise.withResolvers<undefined>()
    mocked.ready.mockReturnValue(pending.promise)
    const harness = createAlarmChromeMock()
    const { registerExpiredTabsAlarmListener, setupExpiredTabsCheckAlarm } =
      await loadAlarm()
    registerExpiredTabsAlarmListener()
    harness.fire()
    await flush()
    await setupExpiredTabsCheckAlarm()
    pending.resolve(undefined)
    await vi.advanceTimersByTimeAsync(100)
    expect(mocked.checkAndRemoveExpiredTabs).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('起動処理中に期限 Alarm がチェックを済ませた場合は再走査しない', async () => {
    const harness = createAlarmChromeMock({
      existingAlarm: { name: 'checkExpiredTabs', periodInMinutes: 0.5 },
    })
    const { registerExpiredTabsAlarmListener, setupExpiredTabsCheckAlarm } =
      await loadAlarm()
    registerExpiredTabsAlarmListener()
    harness.fire()
    await flush()
    expect(harness.alarmsGet).not.toHaveBeenCalled()
    await setupExpiredTabsCheckAlarm()
    await vi.advanceTimersByTimeAsync(100)
    expect(mocked.checkAndRemoveExpiredTabs).toHaveBeenCalledOnce()
  })

  it('bootstrap失敗を診断し、次のAlarmで再試行する', async () => {
    const error = new Error('bootstrap failed')
    mocked.ready.mockRejectedValueOnce(error)
    const harness = createAlarmChromeMock()
    const { registerExpiredTabsAlarmListener } = await loadAlarm()
    registerExpiredTabsAlarmListener()
    harness.fire()
    await flush()
    expect(mocked.logger.error).toHaveBeenCalledWith(
      'background_expired_tabs_alarm_check_failed',
      error,
      { action: 'alarm' },
    )
    expect(mocked.checkAndRemoveExpiredTabs).not.toHaveBeenCalled()
    harness.fire()
    await flush()
    expect(mocked.checkAndRemoveExpiredTabs).toHaveBeenCalledOnce()
  })

  it('チェック失敗後も排他を解放し、次のAlarmを処理する', async () => {
    const error = new Error('check failed')
    mocked.checkAndRemoveExpiredTabs.mockRejectedValueOnce(error)
    const harness = createAlarmChromeMock()
    const { registerExpiredTabsAlarmListener } = await loadAlarm()
    registerExpiredTabsAlarmListener()
    harness.fire()
    await flush()
    expect(mocked.logger.error).toHaveBeenCalledWith(
      'background_expired_tabs_alarm_check_failed',
      error,
      { action: 'alarm' },
    )
    harness.fire()
    await flush()
    expect(mocked.checkAndRemoveExpiredTabs).toHaveBeenCalledTimes(2)
  })

  it('新しいworker realmでもpending bootstrapより先に登録する', async () => {
    const pending = Promise.withResolvers<undefined>()
    mocked.ready.mockReturnValueOnce(pending.promise)
    const first = createAlarmChromeMock()
    const firstModule = await loadAlarm()
    firstModule.registerExpiredTabsAlarmListener()
    first.fire()
    await flush()
    // A new realm has fresh native listeners and no in-memory in-flight check.
    const restarted = createAlarmChromeMock()
    const nextModule = await loadAlarm()
    nextModule.registerExpiredTabsAlarmListener()
    restarted.fire()
    await flush()
    expect(restarted.addListener).toHaveBeenCalledOnce()
    expect(mocked.checkAndRemoveExpiredTabs).toHaveBeenCalledOnce()
    pending.resolve(undefined)
    await flush()
  })

  it('scheduleは登録せず30秒周期のAlarmと初回チェックを作成する', async () => {
    const harness = createAlarmChromeMock()
    const { setupExpiredTabsCheckAlarm } = await loadAlarm()
    await setupExpiredTabsCheckAlarm()
    expect(harness.listeners).toHaveLength(0)
    expect(harness.alarmsGet).toHaveBeenCalledWith('checkExpiredTabs')
    expect(harness.alarmsCreate).toHaveBeenCalledExactlyOnceWith(
      'checkExpiredTabs',
      { periodInMinutes: 0.5 },
    )
    expect(mocked.checkAndRemoveExpiredTabs).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(100)
    expect(mocked.checkAndRemoveExpiredTabs).toHaveBeenCalledOnce()
  })

  it('never の起動は古い期限 Alarm を解除し、初回スキャンを予約しない', async () => {
    mocked.requireUserSettings.mockResolvedValue({ autoDeletePeriod: 'never' })
    const harness = createAlarmChromeMock({
      existingAlarm: { name: 'checkExpiredTabs', periodInMinutes: 0.5 },
    })
    const { setupExpiredTabsCheckAlarm } = await loadAlarm()
    await setupExpiredTabsCheckAlarm()
    await vi.advanceTimersByTimeAsync(30_000)
    expect(harness.alarmsClear).toHaveBeenCalledExactlyOnceWith(
      'checkExpiredTabs',
    )
    expect(harness.alarmsCreate).not.toHaveBeenCalled()
    expect(mocked.ready).not.toHaveBeenCalled()
    expect(mocked.checkAndRemoveExpiredTabs).not.toHaveBeenCalled()
  })

  it('never → 1day → 30sec → never で期限 Alarm だけを更新する', async () => {
    mocked.requireUserSettings.mockResolvedValue({})
    const harness = createAlarmChromeMock()
    const { registerExpiredTabsAlarmListener, setupExpiredTabsCheckAlarm } =
      await loadAlarm()
    registerExpiredTabsAlarmListener()
    await setupExpiredTabsCheckAlarm()
    expect(harness.alarmsCreate).not.toHaveBeenCalled()

    harness.changeSettings('1day')
    await flush()
    expect(harness.alarmsCreate).toHaveBeenCalledExactlyOnceWith(
      'checkExpiredTabs',
      { periodInMinutes: 0.5 },
    )
    harness.changeSettings('30sec')
    await flush()
    expect(harness.alarmsCreate).toHaveBeenCalledOnce()
    expect(harness.alarmsClear).not.toHaveBeenCalled()

    harness.changeSettings('never')
    await flush()
    expect(harness.alarmsClear).toHaveBeenCalledExactlyOnceWith(
      'checkExpiredTabs',
    )
    expect(mocked.checkAndRemoveExpiredTabs).not.toHaveBeenCalled()
  })

  it('作成中に無効化された場合は古い作成が終わってから解除する', async () => {
    mocked.requireUserSettings.mockResolvedValue({ autoDeletePeriod: 'never' })
    const harness = createAlarmChromeMock()
    const create = harness.alarmsCreate.getMockImplementation()
    const pending = Promise.withResolvers<undefined>()
    harness.alarmsCreate.mockImplementationOnce(async (name, info) => {
      await pending.promise
      await create?.(name, info)
    })
    const { registerExpiredTabsAlarmListener, setupExpiredTabsCheckAlarm } =
      await loadAlarm()
    registerExpiredTabsAlarmListener()
    await setupExpiredTabsCheckAlarm()

    harness.changeSettings('1day')
    await flush()
    expect(harness.alarmsCreate).toHaveBeenCalledOnce()
    harness.changeSettings('never')
    await flush()
    expect(harness.alarmsClear).not.toHaveBeenCalled()

    pending.resolve(undefined)
    await flush()
    expect(harness.alarmsClear).toHaveBeenCalledExactlyOnceWith(
      'checkExpiredTabs',
    )
    expect(await harness.alarmsGet()).toBeUndefined()
  })

  it('設定読み込みに失敗しても Alarm を書き換えず、次の設定イベントで復旧する', async () => {
    const error = new Error('settings unavailable')
    mocked.requireUserSettings.mockRejectedValueOnce(error)
    const harness = createAlarmChromeMock({
      existingAlarm: { name: 'checkExpiredTabs', periodInMinutes: 0.5 },
    })
    const { registerExpiredTabsAlarmListener, setupExpiredTabsCheckAlarm } =
      await loadAlarm()
    registerExpiredTabsAlarmListener()
    await setupExpiredTabsCheckAlarm()
    expect(harness.alarmsGet).not.toHaveBeenCalled()
    expect(mocked.logger.error).toHaveBeenCalledWith(
      'background_expired_tabs_alarm_schedule_failed',
      error,
    )

    harness.changeSettings('never')
    await flush()
    expect(harness.alarmsClear).toHaveBeenCalledExactlyOnceWith(
      'checkExpiredTabs',
    )
  })

  it('無効化時の解除失敗は、残っていた周期 Alarm の発火から再試行する', async () => {
    mocked.requireUserSettings.mockResolvedValue({ autoDeletePeriod: 'never' })
    const harness = createAlarmChromeMock({
      existingAlarm: { name: 'checkExpiredTabs', periodInMinutes: 0.5 },
    })
    const error = new Error('clear failed')
    harness.alarmsClear.mockRejectedValueOnce(error)
    const { registerExpiredTabsAlarmListener, setupExpiredTabsCheckAlarm } =
      await loadAlarm()
    registerExpiredTabsAlarmListener()
    await setupExpiredTabsCheckAlarm()
    expect(mocked.logger.error).toHaveBeenCalledWith(
      'background_expired_tabs_alarm_schedule_failed',
      error,
    )
    harness.fire()
    await flush()
    expect(harness.alarmsClear).toHaveBeenCalledTimes(2)
    expect(await harness.alarmsGet()).toBeUndefined()
  })

  it('時計が戻って次回予定が遠のいた Alarm を起動時に復元する', async () => {
    const now = Date.now()
    const harness = createAlarmChromeMock({
      existingAlarm: {
        name: 'checkExpiredTabs',
        periodInMinutes: 0.5,
        scheduledTime: now + 30_000,
      },
    })
    vi.setSystemTime(now - 3_600_000)
    const { setupExpiredTabsCheckAlarm } = await loadAlarm()
    await setupExpiredTabsCheckAlarm()
    expect(harness.alarmsCreate).toHaveBeenCalledExactlyOnceWith(
      'checkExpiredTabs',
      { periodInMinutes: 0.5 },
    )
    await vi.advanceTimersByTimeAsync(100)
    expect(mocked.checkAndRemoveExpiredTabs).toHaveBeenCalledOnce()
  })

  it('有効な既存Alarmを消さず、worker停止後の次回wakeを維持する', async () => {
    const harness = createAlarmChromeMock({
      existingAlarm: { name: 'checkExpiredTabs', periodInMinutes: 0.5 },
    })
    const { setupExpiredTabsCheckAlarm } = await loadAlarm()
    await setupExpiredTabsCheckAlarm()
    expect(harness.alarmsClear).not.toHaveBeenCalled()
    expect(harness.alarmsCreate).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(100)
    expect(mocked.checkAndRemoveExpiredTabs).toHaveBeenCalledOnce()
  })

  it('一回限りの期限 Alarm が消えたとき、起動済みの background でも周期を復元する', async () => {
    const harness = createAlarmChromeMock()
    const { registerExpiredTabsAlarmListener } = await loadAlarm()
    registerExpiredTabsAlarmListener()
    harness.fire('checkExpiredTabs', {})
    await flush()
    expect(harness.alarmsCreate).toHaveBeenCalledExactlyOnceWith(
      'checkExpiredTabs',
      { periodInMinutes: 0.5 },
    )
    expect(mocked.checkAndRemoveExpiredTabs).toHaveBeenCalledOnce()
  })

  it('周期が違う既存Alarmは同じ名前で置き換える', async () => {
    const harness = createAlarmChromeMock({
      existingAlarm: { name: 'checkExpiredTabs', periodInMinutes: 1 },
    })
    const { setupExpiredTabsCheckAlarm } = await loadAlarm()
    await setupExpiredTabsCheckAlarm()
    expect(harness.alarmsCreate).toHaveBeenCalledWith('checkExpiredTabs', {
      periodInMinutes: 0.5,
    })
  })

  it.each(['get', 'create'] as const)(
    '%sの拒否を診断し、初回チェックを維持する',
    async (operation) => {
      const error = new Error('native alarm failed')
      createAlarmChromeMock(
        operation === 'get' ? { getThrows: error } : { createThrows: error },
      )
      const { setupExpiredTabsCheckAlarm } = await loadAlarm()
      await setupExpiredTabsCheckAlarm()
      expect(mocked.logger.error).toHaveBeenCalledWith(
        'background_expired_tabs_alarm_schedule_failed',
        error,
      )
      await vi.advanceTimersByTimeAsync(100)
      expect(mocked.checkAndRemoveExpiredTabs).toHaveBeenCalledOnce()
    },
  )

  it('Alarm APIが無くても初回チェックをDB準備後に実行する', async () => {
    const pending = Promise.withResolvers<undefined>()
    mocked.ready.mockReturnValue(pending.promise)
    createAlarmChromeMock({ alarmsAvailable: false })
    const { registerExpiredTabsAlarmListener, setupExpiredTabsCheckAlarm } =
      await loadAlarm()
    registerExpiredTabsAlarmListener()
    await setupExpiredTabsCheckAlarm()
    await flush()
    expect(mocked.logger.warn).toHaveBeenCalledWith(
      'background_expired_tabs_alarms_unavailable',
    )
    expect(mocked.checkAndRemoveExpiredTabs).not.toHaveBeenCalled()
    pending.resolve(undefined)
    await flush()
    expect(mocked.checkAndRemoveExpiredTabs).toHaveBeenCalledOnce()
  })

  it('listener登録失敗を診断し、scheduleの初回チェックは維持する', async () => {
    const error = new Error('listener failed')
    createAlarmChromeMock({ listenerThrows: error })
    const { registerExpiredTabsAlarmListener, setupExpiredTabsCheckAlarm } =
      await loadAlarm()
    registerExpiredTabsAlarmListener()
    expect(mocked.logger.error).toHaveBeenCalledWith(
      'background_expired_tabs_alarm_listener_failed',
      error,
    )
    await setupExpiredTabsCheckAlarm()
    await vi.advanceTimersByTimeAsync(100)
    expect(mocked.checkAndRemoveExpiredTabs).toHaveBeenCalledOnce()
  })

  it('初回チェックの準備失敗も診断する', async () => {
    const error = new Error('initial bootstrap failed')
    mocked.ready.mockRejectedValueOnce(error)
    createAlarmChromeMock()
    const { setupExpiredTabsCheckAlarm } = await loadAlarm()
    await setupExpiredTabsCheckAlarm()
    await vi.advanceTimersByTimeAsync(100)
    expect(mocked.logger.error).toHaveBeenCalledWith(
      'background_expired_tabs_alarm_check_failed',
      error,
      { action: 'initialCheck' },
    )
  })

  it('拡張機能アイコン URL 付きの通知を表示する', async () => {
    const harness = createAlarmChromeMock()
    const { showNotification } = await loadAlarm()
    await expect(showNotification('Title', 'Message')).resolves.toBeUndefined()
    expect(harness.getURL).toHaveBeenCalledWith('icon/128.png')
    expect(harness.notificationsCreate).toHaveBeenCalledWith({
      type: 'basic',
      iconUrl: 'chrome-extension://tabbin/icon/128.png',
      title: 'Title',
      message: 'Message',
    })
  })

  it('通知エラーを握りつぶしてログ出力する', async () => {
    createAlarmChromeMock({
      notificationThrows: new Error('notification failed'),
    })
    const { showNotification } = await loadAlarm()
    await expect(showNotification('Title', 'Message')).resolves.toBeUndefined()
    expect(console.error).toHaveBeenCalledWith(
      '通知表示エラー:',
      expect.any(Error),
    )
  })
})
