import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocked = vi.hoisted(() => ({
  getUserSettings: vi.fn(),
  removeUrl: vi.fn(async () => 1),
  removeUrlIds: vi.fn(async (ids: readonly string[]) => ids.length),
}))

vi.mock('@/app/composition/backgroundSavedTabsDataPlane', () => ({
  getBackgroundSavedTabsDataPlane: () => ({
    removeUrl: mocked.removeUrl,
    removeUrlIds: mocked.removeUrlIds,
  }),
}))

vi.mock('@/lib/storage/settings', () => ({
  getUserSettings: mocked.getUserSettings,
}))

import {
  clearDraggedUrlInfo,
  createComparableUrlKey,
  getDraggedUrlInfo,
  handleTabCreated,
  handleUrlDragStarted,
  handleUrlDropped,
  removeUrlFromStorage,
  removeUrlRecordsFromStorage,
} from './url-storage'

const createSettings = (overrides: Record<string, unknown> = {}) => ({
  removeTabAfterExternalDrop: true,
  removeTabAfterOpen: true,
  ...overrides,
})

describe('url-storage route-aware background bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    clearDraggedUrlInfo()
  })

  afterEach(() => {
    clearDraggedUrlInfo()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('外部ドロップ設定がONならroute-aware deleteを1回呼ぶ', async () => {
    mocked.getUserSettings.mockResolvedValue(createSettings())

    await expect(
      handleUrlDropped('https://Example.com/path', true),
    ).resolves.toBe('removed')

    expect(mocked.removeUrl).toHaveBeenCalledOnce()
    expect(mocked.removeUrl).toHaveBeenCalledWith('https://example.com/path')
  })

  it('外部ドロップ設定がOFFなら永続化を呼ばない', async () => {
    mocked.getUserSettings.mockResolvedValue(
      createSettings({ removeTabAfterExternalDrop: false }),
    )

    await expect(handleUrlDropped('https://example.com', true)).resolves.toBe(
      'skipped',
    )
    expect(mocked.removeUrl).not.toHaveBeenCalled()
  })

  it('内部ドロップなら設定を読まず削除しない', async () => {
    await expect(handleUrlDropped('https://example.com', false)).resolves.toBe(
      'internal_operation',
    )
    expect(mocked.getUserSettings).not.toHaveBeenCalled()
    expect(mocked.removeUrl).not.toHaveBeenCalled()
  })

  it('不正URLはroute-aware deleteを呼ばない', async () => {
    await removeUrlFromStorage('not a url')
    expect(mocked.removeUrl).not.toHaveBeenCalled()
  })

  it('route-aware delete failureをsilent fallbackせず再送出する', async () => {
    mocked.removeUrl.mockRejectedValueOnce(new Error('indexeddb failed'))

    await expect(removeUrlFromStorage('https://example.com')).rejects.toThrow(
      'indexeddb failed',
    )
    expect(mocked.removeUrl).toHaveBeenCalledOnce()
  })

  it('bulk deleteは空IDを除き重複排除して1回だけ委譲する', async () => {
    await expect(
      removeUrlRecordsFromStorage(['url-1', '', 'url-1', 'url-2']),
    ).resolves.toBe(2)

    expect(mocked.removeUrlIds).toHaveBeenCalledWith(['url-1', 'url-2'])
  })

  it('hashだけ異なる新規タブを開いたら保存URLを削除する', async () => {
    mocked.getUserSettings.mockResolvedValue(createSettings())
    handleUrlDragStarted('https://example.com/page#saved')

    await handleTabCreated({
      url: 'https://example.com/page#opened',
    } as chrome.tabs.Tab)

    expect(mocked.removeUrl).toHaveBeenCalledWith(
      'https://example.com/page#saved',
    )
    expect(getDraggedUrlInfo()).toBeNull()
  })

  it('queryが異なる新規タブでは削除しない', async () => {
    handleUrlDragStarted('https://example.com/page?mode=edit')

    await handleTabCreated({
      url: 'https://example.com/page?mode=view',
    } as chrome.tabs.Tab)

    expect(mocked.removeUrl).not.toHaveBeenCalled()
    expect(mocked.getUserSettings).not.toHaveBeenCalled()
  })

  it('open後削除設定がOFFなら削除せずdrag stateをclearする', async () => {
    mocked.getUserSettings.mockResolvedValue(
      createSettings({ removeTabAfterOpen: false }),
    )
    handleUrlDragStarted('https://example.com/page')

    await handleTabCreated({
      url: 'https://example.com/page',
    } as chrome.tabs.Tab)

    expect(mocked.removeUrl).not.toHaveBeenCalled()
    expect(getDraggedUrlInfo()).toBeNull()
  })

  it('一致しないopenはdrag stateを次のtab event向けに保持する', async () => {
    handleUrlDragStarted('https://example.com/saved')

    await handleTabCreated({
      url: 'https://example.com/other',
    } as chrome.tabs.Tab)

    expect(mocked.removeUrl).not.toHaveBeenCalled()
    expect(getDraggedUrlInfo()?.url).toBe('https://example.com/saved')
  })

  it('open後削除が失敗してもlegacy fallbackせずdrag stateだけclearする', async () => {
    mocked.getUserSettings.mockResolvedValue(createSettings())
    mocked.removeUrl.mockRejectedValueOnce(new Error('indexeddb failed'))
    handleUrlDragStarted('https://example.com/page')

    await expect(
      handleTabCreated({
        url: 'https://example.com/page',
      } as chrome.tabs.Tab),
    ).resolves.toBeUndefined()

    expect(mocked.removeUrl).toHaveBeenCalledOnce()
    expect(getDraggedUrlInfo()).toBeNull()
  })

  it('ドラッグ情報をタイムアウトでクリアする', () => {
    vi.useFakeTimers()
    handleUrlDragStarted('https://example.com/page')
    expect(getDraggedUrlInfo()).not.toBeNull()

    vi.advanceTimersByTime(10_000)
    expect(getDraggedUrlInfo()).toBeNull()
  })

  it('古いdrag timeoutは新しいdrag stateを消さない', () => {
    vi.useFakeTimers()
    handleUrlDragStarted('https://example.com/old')
    vi.advanceTimersByTime(5_000)
    handleUrlDragStarted('https://example.com/new')

    vi.advanceTimersByTime(5_000)

    expect(getDraggedUrlInfo()?.url).toBe('https://example.com/new')
  })

  it('URL比較keyはhostを正規化し指定されたhashを除く', () => {
    expect(
      createComparableUrlKey('https://Example.com/path?x=1#top', {
        ignoreHash: true,
      }),
    ).toBe('https://example.com/path?x=1')
  })

  it('URL比較keyはsearchを明示した場合だけ除く', () => {
    expect(
      createComparableUrlKey('https://example.com/path?x=1#top', {
        ignoreSearch: true,
      }),
    ).toBe('https://example.com/path#top')
  })

  it('delete mutationsを直列化して古いsnapshot相当の上書きを防ぐ', async () => {
    let releaseFirst: (() => void) | undefined
    mocked.removeUrl.mockImplementationOnce(
      async () =>
        new Promise<number>((resolve) => {
          releaseFirst = () => resolve(1)
        }),
    )

    const first = removeUrlFromStorage('https://example.com/first')
    const second = removeUrlFromStorage('https://example.com/second')
    await Promise.resolve()
    expect(mocked.removeUrl).toHaveBeenCalledTimes(1)

    releaseFirst?.()
    await Promise.all([first, second])
    expect(mocked.removeUrl).toHaveBeenCalledTimes(2)
  })
})
