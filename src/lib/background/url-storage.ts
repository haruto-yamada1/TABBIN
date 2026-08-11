/**
 * URL・ストレージ操作モジュール
 */

import { getBackgroundSavedTabsDataPlane } from '@/app/composition/backgroundSavedTabsDataPlane'
import { redactUrlForLog } from '@/lib/logging/redact-url'
import { getUserSettings } from '@/lib/storage/settings'
import type { DraggedUrlInfo } from '@/types/background'

let draggedUrlInfo: DraggedUrlInfo | null = null
let savedTabsStorageMutationQueue: Promise<void> = Promise.resolve()
const DRAG_INFO_TIMEOUT_MS = 10_000

const enqueueStorageMutation = async <Result>(
  mutation: () => Promise<Result>,
): Promise<Result> => {
  const nextTask = savedTabsStorageMutationQueue.then(mutation, mutation)
  savedTabsStorageMutationQueue = nextTask.then(
    () => undefined,
    () => undefined,
  )
  return nextTask
}

const setDraggedUrlInfo = (info: DraggedUrlInfo): void => {
  draggedUrlInfo = info
}

const getDraggedUrlInfo = (): DraggedUrlInfo | null => draggedUrlInfo

const clearDraggedUrlInfo = (): void => {
  draggedUrlInfo = null
}

type ComparableUrlKeyOptions = {
  readonly ignoreHash?: boolean
  readonly ignoreSearch?: boolean
}

const createComparableUrlKey = (
  rawUrl: string,
  options: ComparableUrlKeyOptions = {},
): string | null => {
  try {
    const url = new URL(rawUrl.trim())
    url.hostname = url.hostname.toLowerCase()
    if (options.ignoreHash) {
      url.hash = ''
    }
    if (options.ignoreSearch) {
      url.search = ''
    }
    return url.toString()
  } catch {
    return null
  }
}

const removeUrlFromStorage = async (url: string): Promise<void> => {
  const targetUrlKey = createComparableUrlKey(url)
  if (!targetUrlKey) {
    console.log(
      '削除対象URLを比較可能な形式にできないため、削除をスキップしました:',
      redactUrlForLog(url),
    )
    return
  }
  try {
    await enqueueStorageMutation(async () =>
      getBackgroundSavedTabsDataPlane().removeUrl(targetUrlKey),
    )
    console.log(`ストレージからURL ${redactUrlForLog(url)} を削除しました`)
  } catch (error) {
    console.error('URLの削除中にエラーが発生しました:', error)
    throw error
  }
}

const removeUrlRecordsFromStorage = async (
  urlIds: string[],
): Promise<number> => {
  const uniqueIds = [...new Set(urlIds.filter((id) => id.length > 0))]
  if (uniqueIds.length === 0) {
    return 0
  }
  try {
    return await enqueueStorageMutation(async () =>
      getBackgroundSavedTabsDataPlane().removeUrlIds(uniqueIds),
    )
  } catch (error) {
    console.error('URLレコードの一括削除中にエラーが発生しました:', error)
    throw error
  }
}

const handleUrlDragStarted = (url: string): void => {
  console.log('ドラッグ開始を検知:', redactUrlForLog(url))
  const dragInfo: DraggedUrlInfo = {
    processed: false,
    timestamp: Date.now(),
    url,
  }
  draggedUrlInfo = dragInfo
  const dragTimeout = setTimeout(() => {
    if (draggedUrlInfo === dragInfo && !dragInfo.processed) {
      console.log('ドラッグ情報のタイムアウト:', redactUrlForLog(dragInfo.url))
      draggedUrlInfo = null
    }
  }, DRAG_INFO_TIMEOUT_MS)
  dragInfo.timeoutId = dragTimeout
}

const handleUrlDropped = async (
  url: string,
  fromExternal?: boolean,
): Promise<string> => {
  console.log('URLドロップを検知:', redactUrlForLog(url))
  if (fromExternal === true) {
    try {
      const settings = await getUserSettings()
      if (settings.removeTabAfterExternalDrop) {
        await removeUrlFromStorage(url)
        console.log('外部ドロップ後にURLを削除しました:', redactUrlForLog(url))
        return 'removed'
      }
      console.log('設定により削除をスキップ')
      return 'skipped'
    } catch (error) {
      console.error('URL削除エラー:', error)
      throw error
    }
  }
  console.log('内部操作のため削除をスキップ')
  return 'internal_operation'
}

const handleTabCreated = async (tab: chrome.tabs.Tab): Promise<void> => {
  console.log('新しいタブが作成されました:', redactUrlForLog(tab.url))
  if (draggedUrlInfo && !draggedUrlInfo.processed) {
    console.log(
      'ドラッグ情報が存在します:',
      redactUrlForLog(draggedUrlInfo.url),
    )
    console.log('新しいタブのURL:', redactUrlForLog(tab.url))
    const draggedUrlKey = createComparableUrlKey(draggedUrlInfo.url, {
      ignoreHash: true,
    })
    const tabUrlKey = createComparableUrlKey(tab.url ?? '', {
      ignoreHash: true,
    })
    console.log('比較用ドラッグURL:', redactUrlForLog(draggedUrlInfo.url))
    console.log('比較用新タブURL:', redactUrlForLog(tab.url))
    if (!tabUrlKey || !draggedUrlKey || tabUrlKey !== draggedUrlKey) {
      console.log('URLが一致しません。削除をスキップします')
      return
    }
    console.log('URLが一致しています')
    try {
      draggedUrlInfo.processed = true
      const settings = await getUserSettings()
      if (!settings.removeTabAfterOpen) {
        console.log('設定により削除をスキップします')
        return
      }
      console.log(
        '設定に基づきURLを削除します:',
        redactUrlForLog(draggedUrlInfo.url),
      )
      await removeUrlFromStorage(draggedUrlInfo.url)
    } catch (error) {
      console.error('タブ作成後の処理でエラー:', error)
    } finally {
      draggedUrlInfo = null
    }
  }
}

export {
  clearDraggedUrlInfo,
  createComparableUrlKey,
  getDraggedUrlInfo,
  handleTabCreated,
  handleUrlDragStarted,
  handleUrlDropped,
  removeUrlFromStorage,
  removeUrlRecordsFromStorage,
  setDraggedUrlInfo,
}
