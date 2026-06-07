import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

const mocked = vi.hoisted(() => ({
  checkAndRemoveExpiredTabs: vi.fn(),
}))
vi.mock('./expired-tabs', () => ({
  checkAndRemoveExpiredTabs: mocked.checkAndRemoveExpiredTabs,
}))

import {
  setupExpiredTabsCheckAlarm,
  showNotification,
} from './alarm-notification'

type AlarmListener = (alarm: { name: string }) => void
const createAlarmChromeMock = (
  options: {
    existingAlarm?: {
      name: string
    } | null
    alarmsAvailable?: boolean
    createThrows?: Error
    clearThrows?: Error
    getThrows?: unknown
    onAlarmAddListenerThrows?: unknown
    notificationThrows?: Error
  } = {},
) => {
  const listeners: AlarmListener[] = []
  const alarmsCreate = vi.fn(
    (
      name: string,
      info: {
        periodInMinutes: number
      },
    ) => {
      if (options.createThrows) {
        throw options.createThrows
      }
      return {
        name,
        ...info,
      }
    },
  )
  const alarmsGet = vi.fn(
    (
      _name: string,
      cb: (
        alarm?: {
          name: string
        } | null,
      ) => void,
    ) => {
      if (options.getThrows) {
// eslint-disable-next-line typescript/only-throw-error
        throw options.getThrows
      }
      cb(options.existingAlarm ?? null)
    },
  )
  const alarmsClear = vi.fn(
    (_name: string, cb: (wasCleared: boolean) => void) => {
      if (options.clearThrows) {
        throw options.clearThrows
      }
      cb(true)
    },
  )
  const notificationsCreate = vi.fn(
    (_payload: chrome.notifications.NotificationCreateOptions) => {
      if (options.notificationThrows) {
        throw options.notificationThrows
      }
      return 'notification-id'
    },
  )
  const chromeMock: Partial<typeof chrome> = {
    runtime: {
      getURL: vi.fn((path: string) => `chrome-extension://tabbin/${path}`),
    } as unknown as typeof chrome.runtime,
    notifications: {
      create:
        notificationsCreate as unknown as typeof chrome.notifications.create,
    } as unknown as typeof chrome.notifications,
  }
  if (options.alarmsAvailable !== false) {
    chromeMock.alarms = {
      create: alarmsCreate as unknown as typeof chrome.alarms.create,
      get: alarmsGet as unknown as typeof chrome.alarms.get,
      clear: alarmsClear as unknown as typeof chrome.alarms.clear,
      onAlarm: {
        addListener: vi.fn((listener: AlarmListener) => {
          if (options.onAlarmAddListenerThrows) {
// eslint-disable-next-line typescript/only-throw-error
            throw options.onAlarmAddListenerThrows
          }
          listeners.push(listener)
        }),
      },
    } as unknown as typeof chrome.alarms
  }
  ;(
    globalThis as {
      chrome?: typeof chrome
    }
  ).chrome = chromeMock as unknown as typeof chrome
  return {
    listeners,
    alarmsCreate,
    alarmsGet,
    alarmsClear,
    notificationsCreate,
    getURL: chromeMock.runtime?.getURL as ReturnType<typeof vi.fn>,
  }
}
const flushInitialCheck = async () => {
  await Promise.resolve()
  vi.advanceTimersByTime(100)
  await Promise.resolve()
  await Promise.resolve()
}
describe('alarm-notification モジュール', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.useRealTimers()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })
  it('chrome.alarms が利用できない場合は直接チェックにフォールバックする', () => {
    createAlarmChromeMock({
      alarmsAvailable: false,
    })
    setupExpiredTabsCheckAlarm()
    expect(console.error).toHaveBeenCalledWith(
      'chrome.alarms APIが利用できません。Manifest.jsonで権限を確認してください。',
    )
    expect(mocked.checkAndRemoveExpiredTabs).toHaveBeenCalledTimes(1)
  })
  it('アラームを作成し、リスナーを登録し、初回チェックをスケジュールする', async () => {
    vi.useFakeTimers()
    const harness = createAlarmChromeMock()
    setupExpiredTabsCheckAlarm()
    expect(harness.alarmsGet).toHaveBeenCalledWith(
      'checkExpiredTabs',
      expect.any(Function),
    )
    expect(harness.alarmsCreate).toHaveBeenCalledWith('checkExpiredTabs', {
      periodInMinutes: 0.5,
    })
    expect(harness.listeners).toHaveLength(1)
    expect(mocked.checkAndRemoveExpiredTabs).not.toHaveBeenCalled()
    await flushInitialCheck()
    expect(mocked.checkAndRemoveExpiredTabs).toHaveBeenCalledTimes(1)
    harness.listeners[0]({
      name: 'otherAlarm',
    })
    expect(mocked.checkAndRemoveExpiredTabs).toHaveBeenCalledTimes(1)
    harness.listeners[0]({
      name: 'checkExpiredTabs',
    })
    expect(mocked.checkAndRemoveExpiredTabs).toHaveBeenCalledTimes(2)
  })
  it('再作成前に既存アラームをクリアする', () => {
    const harness = createAlarmChromeMock({
      existingAlarm: {
        name: 'checkExpiredTabs',
      },
    })
    setupExpiredTabsCheckAlarm()
    expect(harness.alarmsClear).toHaveBeenCalledWith(
      'checkExpiredTabs',
      expect.any(Function),
    )
    expect(harness.alarmsCreate).toHaveBeenCalledTimes(1)
  })
  it('clear が例外を投げてもアラーム作成を継続する', () => {
    const harness = createAlarmChromeMock({
      existingAlarm: {
        name: 'checkExpiredTabs',
      },
      clearThrows: new Error('clear failed'),
    })
    setupExpiredTabsCheckAlarm()
    expect(console.error).toHaveBeenCalledWith(
      'アラームクリアエラー:',
      expect.any(Error),
    )
    expect(harness.alarmsCreate).toHaveBeenCalledTimes(1)
  })
  it('chrome.alarms.create が例外時にアラーム作成エラーをログ出力する', () => {
    const error = new Error('create failed')
    createAlarmChromeMock({
      createThrows: error,
    })
    setupExpiredTabsCheckAlarm()
    expect(console.error).toHaveBeenCalledWith('アラーム作成エラー:', error)
  })
  it('アラーム設定で予期せぬ例外が発生した場合はスケジュール済み初回チェックにフォールバックする', async () => {
    vi.useFakeTimers()
    createAlarmChromeMock({
      getThrows: 'unexpected get failure',
    })
    setupExpiredTabsCheckAlarm()
    expect(console.error).toHaveBeenCalledWith(
      'アラーム設定エラー:',
      'unexpected get failure',
    )
    expect(mocked.checkAndRemoveExpiredTabs).not.toHaveBeenCalled()
    await flushInitialCheck()
    expect(mocked.checkAndRemoveExpiredTabs).toHaveBeenCalledTimes(1)
  })
  it('外側のアラーム設定 catch で Error.message をログ出力する', async () => {
    vi.useFakeTimers()
    createAlarmChromeMock({
      onAlarmAddListenerThrows: new Error('listener failed'),
    })
    setupExpiredTabsCheckAlarm()
    expect(console.error).toHaveBeenCalledWith(
      'アラーム設定エラー:',
      'listener failed',
    )
    await flushInitialCheck()
    expect(mocked.checkAndRemoveExpiredTabs).toHaveBeenCalledTimes(1)
  })
  it('拡張機能アイコン URL 付きの通知を表示する', async () => {
    const harness = createAlarmChromeMock()
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
    await expect(showNotification('Title', 'Message')).resolves.toBeUndefined()
    expect(console.error).toHaveBeenCalledWith(
      '通知表示エラー:',
      expect.any(Error),
    )
  })
})
