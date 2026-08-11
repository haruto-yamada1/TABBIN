import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocked = vi.hoisted(() => ({
  getUserSettings: vi.fn(),
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
  removeExpiredUrls: vi.fn(),
  updateTabTimestamps: vi.fn(),
}))

vi.mock('@/app/composition/backgroundSavedTabsDataPlane', () => ({
  getBackgroundSavedTabsDataPlane: () => ({
    removeExpiredUrls: mocked.removeExpiredUrls,
    updateTabTimestamps: mocked.updateTabTimestamps,
  }),
}))

vi.mock('@/lib/logging/logger', () => ({ logger: mocked.logger }))
vi.mock('@/lib/storage/settings', () => ({
  getUserSettings: mocked.getUserSettings,
}))

import {
  checkAndRemoveExpiredTabs,
  getExpirationPeriodMs,
  isAutoDeletePeriod,
  updateTabTimestamps,
} from './expired-tabs'

describe('expired-tabs route-aware background bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
    mocked.getUserSettings.mockResolvedValue({ autoDeletePeriod: 'never' })
    mocked.removeExpiredUrls.mockResolvedValue({
      removedCount: 0,
      sourceCount: 0,
    })
    mocked.updateTabTimestamps.mockResolvedValue({ success: true })
  })

  it('有効な期間をミリ秒へ変換する', () => {
    expect(isAutoDeletePeriod('30sec')).toBe(true)
    expect(isAutoDeletePeriod('invalid')).toBe(false)
    expect(getExpirationPeriodMs('1day')).toBe(86_400_000)
    expect(getExpirationPeriodMs('365days')).toBe(365 * 86_400_000)
    expect(getExpirationPeriodMs('never')).toBeNull()
  })

  it('auto delete無効ならdata planeを呼ばない', async () => {
    await checkAndRemoveExpiredTabs()
    expect(mocked.removeExpiredUrls).not.toHaveBeenCalled()
  })

  it('不正なauto delete期間はwarningしてdata planeを呼ばない', async () => {
    mocked.getUserSettings.mockResolvedValue({ autoDeletePeriod: 'invalid' })

    await checkAndRemoveExpiredTabs()

    expect(mocked.removeExpiredUrls).not.toHaveBeenCalled()
    expect(mocked.logger.warn).toHaveBeenCalledWith(
      'background_expired_tabs_auto_delete_period_invalid',
    )
  })

  it('selected routeへcutoffを渡して期限切れURLを削除する', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-02-24T12:00:00.000Z'))
    mocked.getUserSettings.mockResolvedValue({ autoDeletePeriod: '1day' })
    mocked.removeExpiredUrls.mockResolvedValue({
      removedCount: 2,
      sourceCount: 3,
    })

    await checkAndRemoveExpiredTabs()

    expect(mocked.removeExpiredUrls).toHaveBeenCalledWith(
      Date.now() - 86_400_000,
      Date.now(),
    )
    expect(mocked.logger.info).toHaveBeenCalledWith(
      'background_expired_tabs_removed',
      { recordCount: 2 },
    )
  })

  it('selected route sourceが空ならscan/remove logを出さない', async () => {
    mocked.getUserSettings.mockResolvedValue({ autoDeletePeriod: '1day' })

    await checkAndRemoveExpiredTabs()

    expect(mocked.logger.debug).toHaveBeenCalledWith(
      'background_expired_tabs_source_empty',
    )
    expect(mocked.logger.info).not.toHaveBeenCalled()
  })

  it('期限切れがない場合はscan後にno-opを記録する', async () => {
    mocked.getUserSettings.mockResolvedValue({ autoDeletePeriod: '1day' })
    mocked.removeExpiredUrls.mockResolvedValue({
      removedCount: 0,
      sourceCount: 2,
    })

    await checkAndRemoveExpiredTabs()

    expect(mocked.logger.debug).toHaveBeenCalledWith(
      'background_expired_tabs_removal_not_required',
    )
  })

  it('IndexedDB failureをlegacyへfallbackせずログする', async () => {
    mocked.getUserSettings.mockResolvedValue({ autoDeletePeriod: '1day' })
    const error = new Error('indexeddb failed')
    mocked.removeExpiredUrls.mockRejectedValue(error)

    await expect(checkAndRemoveExpiredTabs()).resolves.toBeUndefined()
    expect(mocked.removeExpiredUrls).toHaveBeenCalledOnce()
    expect(mocked.logger.error).toHaveBeenCalledWith(
      'background_expired_tabs_check_failed',
      error,
    )
  })

  it('timestamp更新をselected routeへ委譲する', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-02-24T12:00:00.000Z'))

    await expect(updateTabTimestamps('30sec')).resolves.toEqual({
      success: true,
      timestamp: Date.now() - 40_000,
    })
    expect(mocked.updateTabTimestamps).toHaveBeenCalledWith(Date.now() - 40_000)
  })

  it('1min timestamp offsetをselected routeへ委譲する', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-02-24T12:00:00.000Z'))

    await updateTabTimestamps('1min')

    expect(mocked.updateTabTimestamps).toHaveBeenCalledWith(Date.now() - 70_000)
  })

  it('timestamp sourceが空なら失敗結果を返す', async () => {
    mocked.updateTabTimestamps.mockResolvedValue({ success: false })

    await expect(updateTabTimestamps('1day')).resolves.toEqual({
      success: false,
      timestamp: 0,
    })
  })

  it('timestamp更新失敗をsilent fallbackせず再送出する', async () => {
    mocked.updateTabTimestamps.mockRejectedValue(new Error('indexeddb failed'))

    await expect(updateTabTimestamps()).rejects.toThrow('indexeddb failed')
    expect(mocked.updateTabTimestamps).toHaveBeenCalledOnce()
  })
})
