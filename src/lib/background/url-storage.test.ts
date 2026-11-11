import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocked = vi.hoisted(() => ({
  getUserSettings: vi.fn(),
  readUndoSnapshot: vi.fn(),
  removeUrl: vi.fn(),
  removeUrlIds: vi.fn(async (ids: readonly string[]) => ids.length),
}))

vi.mock('@/app/composition/backgroundSavedTabsDataPlane', () => ({
  getBackgroundSavedTabsDataPlane: () => ({
    readUndoSnapshot: mocked.readUndoSnapshot,
    removeUrl: mocked.removeUrl,
    removeUrlIds: mocked.removeUrlIds,
  }),
}))
vi.mock('@/lib/storage/settings', () => ({
  getUserSettings: mocked.getUserSettings,
  requireUserSettings: mocked.getUserSettings,
}))

import {
  clearDraggedUrlInfo,
  createComparableUrlKey,
  getDraggedUrlInfo,
  handleUrlDragStarted as startDrag,
  handleUrlDropped as dropUrl,
  removeUrlFromStorage,
  removeUrlRecordsFromStorage,
} from './url-storage'

const url = 'https://Example.com/page?mode=edit#/saved'
const createSettings = (enabled = true) => ({
  removeTabAfterExternalDrop: enabled,
  removeTabAfterOpen: true,
})

const handleUrlDragStarted = (
  value: string,
  id = 'saved-id',
  source?: number,
  dragId = 'test-drag',
) => startDrag(value, id, source, dragId)
const handleUrlDropped = async (
  value: string,
  external?: boolean,
  id?: string,
  source?: number,
  dragId = 'test-drag',
) => dropUrl(value, external, { urlRecordId: id, sourceTabId: source, dragId })

describe('exact URL identity background bridge', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocked.removeUrlIds.mockImplementation(
      async (ids: readonly string[]) => ids.length,
    )
    vi.useRealTimers()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    clearDraggedUrlInfo()
    mocked.getUserSettings.mockResolvedValue(createSettings())
    mocked.removeUrl.mockResolvedValue(1)
    mocked.readUndoSnapshot.mockResolvedValue({
      savedTabs: { urls: [{ id: 'saved-id', url }] },
    })
  })
  afterEach(() => {
    clearDraggedUrlInfo()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('外部drop成功は開始時の原文と永続IDを使う', async () => {
    handleUrlDragStarted(url)
    await expect(handleUrlDropped(url, true)).resolves.toBe('removed')
    expect(mocked.removeUrl).toHaveBeenCalledExactlyOnceWith(url, 'saved-id')
    expect(getDraggedUrlInfo()).toBeNull()
  })

  it('外部drop設定OFFならopen設定ONでも保存する', async () => {
    mocked.getUserSettings.mockResolvedValue(createSettings(false))
    handleUrlDragStarted(url)
    await expect(handleUrlDropped(url, true)).resolves.toBe('skipped')
    expect(mocked.removeUrl).not.toHaveBeenCalled()
  })

  it('OFFで完了したdropは設定をONにしても再生できない', async () => {
    mocked.getUserSettings.mockResolvedValue(createSettings(false))
    handleUrlDragStarted(url)
    await handleUrlDropped(url, true)
    mocked.getUserSettings.mockResolvedValue(createSettings(true))
    await handleUrlDropped(url, true)
    expect(mocked.removeUrl).not.toHaveBeenCalled()
    expect(getDraggedUrlInfo()).toBeNull()
  })

  it('内部drop通知は設定を読まずactive dragを終了する', async () => {
    handleUrlDragStarted(url)
    await expect(handleUrlDropped(url, false)).resolves.toBe(
      'internal_operation',
    )
    await handleUrlDropped(url, true)
    expect(mocked.getUserSettings).not.toHaveBeenCalled()
    expect(mocked.removeUrl).not.toHaveBeenCalled()
    expect(getDraggedUrlInfo()).toBeNull()
  })

  it.each([false, true])(
    '別URLのdropは現在のdragを消さない: external=%s',
    async (external) => {
      handleUrlDragStarted(url)
      await handleUrlDropped('https://example.com/other', external)
      expect(mocked.removeUrl).not.toHaveBeenCalled()
      expect(getDraggedUrlInfo()?.url).toBe(url)
    },
  )

  it.each([
    'https://example.com/page?mode=edit#/saved',
    'https://Example.com/page?mode=view#/saved',
    'https://Example.com/page?mode=edit#/other',
  ])('drop原文が異なれば同一視しない: %s', async (dropped) => {
    handleUrlDragStarted(url)
    await expect(handleUrlDropped(dropped, true)).resolves.toBe('skipped')
    expect(mocked.removeUrl).not.toHaveBeenCalled()
  })

  it('開始通知なし・再開直後のdropは削除しない', async () => {
    await expect(handleUrlDropped(url, true)).resolves.toBe('skipped')
    expect(mocked.removeUrl).not.toHaveBeenCalled()
  })

  it('開始時IDは後から取得したsnapshotの新IDへ差し替えない', async () => {
    mocked.readUndoSnapshot.mockResolvedValue({
      savedTabs: { urls: [{ id: 'resaved-id', url }] },
    })
    handleUrlDragStarted(url, 'saved-id')
    await expect(handleUrlDropped(url, true)).resolves.toBe('removed')
    expect(mocked.readUndoSnapshot).not.toHaveBeenCalled()
    expect(mocked.removeUrl).toHaveBeenCalledWith(url, 'saved-id')
  })

  it('開始IDと原文の組み合わせがDBに存在しなければskipする', async () => {
    mocked.removeUrl.mockResolvedValueOnce(0)
    handleUrlDragStarted(url, 'wrong-id')
    await expect(handleUrlDropped(url, true, 'wrong-id')).resolves.toBe(
      'skipped',
    )
    expect(mocked.removeUrl).toHaveBeenCalledExactlyOnceWith(url, 'wrong-id')
  })

  it('dropのID hintが開始時IDと異なる場合は削除しない', async () => {
    handleUrlDragStarted(url, 'saved-id')
    await handleUrlDropped(url, true, 'wrong-id')
    expect(mocked.removeUrl).not.toHaveBeenCalled()
  })

  it.each([false, true])(
    '別tabのdrop通知では削除・clearしない: external=%s',
    async (external) => {
      handleUrlDragStarted(url, undefined, 5)
      await handleUrlDropped(url, external, undefined, 8)
      expect(mocked.removeUrl).not.toHaveBeenCalled()
      expect(getDraggedUrlInfo()?.url).toBe(url)
      await handleUrlDropped(url, true, undefined, 5)
      expect(mocked.removeUrl).toHaveBeenCalledOnce()
    },
  )

  it('重複dropが再入しても一度だけ削除する', async () => {
    handleUrlDragStarted(url)
    await Promise.all([
      handleUrlDropped(url, true),
      handleUrlDropped(url, true),
    ])
    await expect(handleUrlDropped(url, true)).resolves.toBe('skipped')
    expect(mocked.removeUrl).toHaveBeenCalledOnce()
  })

  it('IDが既に消えていれば削除成功と報告しない', async () => {
    mocked.removeUrl.mockResolvedValueOnce(0)
    handleUrlDragStarted(url)
    await expect(handleUrlDropped(url, true)).resolves.toBe('skipped')
  })

  it('削除エラーは再送出してdragを終了しfallbackしない', async () => {
    mocked.removeUrl.mockRejectedValueOnce(new Error('indexeddb failed'))
    handleUrlDragStarted(url)
    await expect(handleUrlDropped(url, true)).rejects.toThrow(
      'indexeddb failed',
    )
    expect(getDraggedUrlInfo()).toBeNull()
    expect(mocked.removeUrl).toHaveBeenCalledOnce()
  })

  it('10秒timeout後の遅延dropは削除しない', async () => {
    vi.useFakeTimers()
    handleUrlDragStarted(url)
    await vi.advanceTimersByTimeAsync(10_000)
    await handleUrlDropped(url, true)
    expect(mocked.removeUrl).not.toHaveBeenCalled()
    expect(getDraggedUrlInfo()).toBeNull()
  })

  it('古いtimeoutは新しいdragを消さない', () => {
    vi.useFakeTimers()
    handleUrlDragStarted(url)
    vi.advanceTimersByTime(5_000)
    handleUrlDragStarted('https://example.com/new')
    vi.advanceTimersByTime(5_000)
    expect(getDraggedUrlInfo()?.url).toBe('https://example.com/new')
  })

  it.each(['new drag', 'timeout'])(
    'settings待機中の%sで古い処理を無効にする',
    async (interruption) => {
      vi.useFakeTimers()
      let resolveSettings:
        | ((settings: ReturnType<typeof createSettings>) => void)
        | undefined
      mocked.getUserSettings.mockImplementationOnce(
        async () =>
          new Promise((resolve) => {
            resolveSettings = resolve
          }),
      )
      handleUrlDragStarted(url)
      const drop = handleUrlDropped(url, true)
      await vi.advanceTimersByTimeAsync(0)
      if (interruption === 'new drag') {
        handleUrlDragStarted('https://example.com/new')
      } else {
        await vi.advanceTimersByTimeAsync(10_000)
      }
      resolveSettings?.(createSettings())
      await drop
      expect(mocked.removeUrl).not.toHaveBeenCalled()
      expect(getDraggedUrlInfo()?.url ?? null).toBe(
        interruption === 'new drag' ? 'https://example.com/new' : null,
      )
    },
  )

  it('legacy削除は原文をtrim・正規化しない', async () => {
    await removeUrlFromStorage(' https://EXAMPLE.com ')
    expect(mocked.removeUrl).toHaveBeenCalledWith(
      ' https://EXAMPLE.com ',
      undefined,
    )
  })

  it('不正URLは削除しない', async () => {
    await removeUrlFromStorage('not a url')
    expect(mocked.removeUrl).not.toHaveBeenCalled()
  })

  it('legacy削除失敗は再送出する', async () => {
    mocked.removeUrl.mockRejectedValueOnce(new Error('indexeddb failed'))
    await expect(removeUrlFromStorage(url)).rejects.toThrow('indexeddb failed')
  })

  it('bulk削除は空IDを除き重複排除する', async () => {
    await expect(
      removeUrlRecordsFromStorage(['url-1', '', 'url-1', 'url-2']),
    ).resolves.toBe(2)
    expect(mocked.removeUrlIds).toHaveBeenCalledWith(['url-1', 'url-2'])
  })

  it('browser比較は正規化してhash/queryを保持する', () => {
    expect(createComparableUrlKey(url)).toBe(
      'https://example.com/page?mode=edit#/saved',
    )
  })

  it('delete mutationを直列化する', async () => {
    let release: (() => void) | undefined
    mocked.removeUrl.mockImplementationOnce(
      async () =>
        new Promise<number>((resolve) => {
          release = () => resolve(1)
        }),
    )
    const first = removeUrlFromStorage(url)
    const second = removeUrlFromStorage('https://example.com/second')
    await Promise.resolve()
    expect(mocked.removeUrl).toHaveBeenCalledOnce()
    release?.()
    await Promise.all([first, second])
    expect(mocked.removeUrl).toHaveBeenCalledTimes(2)
  })

  it('legacy URL-only dragでは後から読み取った新IDを削除しない', async () => {
    mocked.readUndoSnapshot.mockResolvedValue({
      savedTabs: { urls: [{ id: 'resaved-id', url }] },
    })
    startDrag(url, undefined, 5, 'drag-old')
    await expect(
      handleUrlDropped(url, true, undefined, 5, 'drag-old'),
    ).resolves.toBe('skipped')
    expect(mocked.removeUrl).not.toHaveBeenCalled()
  })

  it('drag識別子のない旧dropは新しいdragを削除・終了しない', async () => {
    handleUrlDragStarted(url, 'saved-id', 5, 'drag-new')
    await expect(
      dropUrl(url, true, { urlRecordId: 'saved-id', sourceTabId: 5 }),
    ).resolves.toBe('skipped')
    await dropUrl(url, false, { urlRecordId: 'saved-id', sourceTabId: 5 })
    expect(mocked.removeUrl).not.toHaveBeenCalled()
    expect(getDraggedUrlInfo()?.url).toBe(url)
  })

  it.each([false, true])(
    '同じURLと送信元の旧drag通知は新dragに一致しない: external=%s',
    async (external) => {
      handleUrlDragStarted(url, 'saved-id', 5, 'drag-old')
      await handleUrlDropped(url, true, 'saved-id', 5, 'drag-old')
      mocked.removeUrl.mockClear()
      handleUrlDragStarted(url, 'saved-id', 5, 'drag-new')
      await handleUrlDropped(url, external, 'saved-id', 5, 'drag-old')
      expect(mocked.removeUrl).not.toHaveBeenCalled()
      expect(getDraggedUrlInfo()?.url).toBe(url)
      await expect(
        handleUrlDropped(url, true, 'saved-id', 5, 'drag-new'),
      ).resolves.toBe('removed')
    },
  )

  it('legacy削除は実削除件数を返す', async () => {
    await expect(removeUrlFromStorage(url)).resolves.toBe(1)
    mocked.removeUrl.mockResolvedValueOnce(0)
    await expect(removeUrlFromStorage(url, 'missing-id')).resolves.toBe(0)
  })
})
