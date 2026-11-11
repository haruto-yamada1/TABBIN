/** URL・ストレージ操作モジュール */
import { getBackgroundSavedTabsDataPlane } from '@/app/composition/backgroundSavedTabsDataPlane'
import type { DraggedUrlInfo } from '@/types/background'

import { requireOperationalUserSettings } from './settings-policy'

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
  clearDraggedUrlInfo()
  draggedUrlInfo = info
}

const getDraggedUrlInfo = (): DraggedUrlInfo | null => draggedUrlInfo

const clearDraggedUrlInfo = (): void => {
  if (draggedUrlInfo?.timeoutId) {
    clearTimeout(draggedUrlInfo.timeoutId)
  }
  draggedUrlInfo = null
}

/** Browser navigation comparison only; never use this key for persistence. */
const createComparableUrlKey = (rawUrl: string): string | null => {
  try {
    return new URL(rawUrl).href
  } catch {
    return null
  }
}

const removeUrlFromStorage = async (
  url: string,
  urlRecordId?: string,
): Promise<number> => {
  if (!createComparableUrlKey(url)) {
    return 0
  }
  // The data plane resolves exact source strings to one ID inside its mutation.
  return enqueueStorageMutation(async () =>
    getBackgroundSavedTabsDataPlane().removeUrl(url, urlRecordId),
  )
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

const handleUrlDragStarted = (
  url: string,
  urlRecordId?: string,
  sourceTabId?: number,
  dragId?: string,
): void => {
  clearDraggedUrlInfo()
  // The displayed record ID is captured by the sender at the DOM start event.
  // Resolving it from a later snapshot could select a newly re-saved record.
  const drag: DraggedUrlInfo = {
    processed: false,
    timestamp: Date.now(),
    url,
    urlRecordId,
    sourceTabId,
    dragId,
  }
  draggedUrlInfo = drag
  drag.timeoutId = setTimeout(() => {
    if (draggedUrlInfo === drag) {
      clearDraggedUrlInfo()
    }
  }, DRAG_INFO_TIMEOUT_MS)
}

const isCurrentDrag = (drag: DraggedUrlInfo): boolean => {
  const elapsed = Date.now() - drag.timestamp
  return (
    draggedUrlInfo === drag && elapsed >= 0 && elapsed < DRAG_INFO_TIMEOUT_MS
  )
}

const consumeDrag = async (
  drag: DraggedUrlInfo,
  urlRecordId?: string,
): Promise<string> => {
  let consumed = false
  try {
    const settings = await requireOperationalUserSettings()
    const id = drag.urlRecordId
    if (!isCurrentDrag(drag) || drag.processed) {
      return 'skipped'
    }
    // Claim before the mutation await so duplicate drop messages cannot replay.
    drag.processed = true
    consumed = true
    if (
      !settings.removeTabAfterExternalDrop ||
      !id ||
      (urlRecordId !== undefined && id !== urlRecordId)
    ) {
      return 'skipped'
    }
    const removed = await enqueueStorageMutation(async () => {
      if (!isCurrentDrag(drag)) {
        return 0
      }
      // Recheck exact URL + ID atomically; a re-saved URL with a new ID survives.
      return getBackgroundSavedTabsDataPlane().removeUrl(drag.url, id)
    })
    return removed > 0 ? 'removed' : 'skipped'
  } catch (error) {
    consumed = true
    throw error
  } finally {
    if (consumed && draggedUrlInfo === drag) {
      clearDraggedUrlInfo()
    }
  }
}

const handleUrlDropped = async (
  url: string,
  fromExternal?: boolean,
  identity: Pick<DraggedUrlInfo, 'urlRecordId' | 'sourceTabId' | 'dragId'> = {},
): Promise<string> => {
  const { urlRecordId, sourceTabId, dragId } = identity
  const drag = draggedUrlInfo
  // A URL or source tab cannot distinguish successive drags of the same item.
  // Legacy envelopes remain accepted, but cannot authorize destructive drops.
  const matches =
    drag &&
    dragId &&
    drag.dragId === dragId &&
    drag.url === url &&
    (drag.sourceTabId === undefined || drag.sourceTabId === sourceTabId) &&
    (urlRecordId === undefined || drag.urlRecordId === urlRecordId)
  if (fromExternal !== true) {
    if (matches) {
      clearDraggedUrlInfo()
    }
    return 'internal_operation'
  }
  if (!matches || drag.processed || !isCurrentDrag(drag)) {
    return 'skipped'
  }
  return consumeDrag(drag, urlRecordId)
}

export {
  clearDraggedUrlInfo,
  createComparableUrlKey,
  getDraggedUrlInfo,
  handleUrlDragStarted,
  handleUrlDropped,
  removeUrlFromStorage,
  removeUrlRecordsFromStorage,
  setDraggedUrlInfo,
}
