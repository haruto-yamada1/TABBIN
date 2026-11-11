/** URL・ストレージ操作モジュール */
import { getBackgroundSavedTabsDataPlane } from '@/app/composition/backgroundSavedTabsDataPlane'
import type { DraggedUrlInfo } from '@/types/background'

import { requireOperationalUserSettings } from './settings-policy'

type ActiveDrag = DraggedUrlInfo & {
  readonly targetId: Promise<string | null>
}

let draggedUrlInfo: ActiveDrag | null = null
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
  draggedUrlInfo = {
    ...info,
    targetId: Promise.resolve(info.urlRecordId ?? null),
  }
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
): Promise<void> => {
  if (!createComparableUrlKey(url)) {
    return
  }
  // The data plane resolves exact source strings to one ID inside its mutation.
  await enqueueStorageMutation(async () =>
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
): void => {
  clearDraggedUrlInfo()
  // Capture identity at start, before a DOM drop arrives.
  // Keep this promise local to the drag; worker restarts cannot revive it.
  const targetId = (async () => {
    try {
      const { savedTabs } =
        await getBackgroundSavedTabsDataPlane().readUndoSnapshot()
      const matches = savedTabs.urls.filter(
        (record) =>
          record.url === url &&
          (urlRecordId === undefined || record.id === urlRecordId),
      )
      return matches.length === 1 ? (matches[0]?.id ?? null) : null
    } catch {
      return null
    }
  })()
  const drag: ActiveDrag = {
    processed: false,
    timestamp: Date.now(),
    url,
    urlRecordId,
    sourceTabId,
    targetId,
  }
  draggedUrlInfo = drag
  drag.timeoutId = setTimeout(() => {
    if (draggedUrlInfo === drag) {
      clearDraggedUrlInfo()
    }
  }, DRAG_INFO_TIMEOUT_MS)
}

const isCurrentDrag = (drag: ActiveDrag): boolean => {
  const elapsed = Date.now() - drag.timestamp
  return (
    draggedUrlInfo === drag && elapsed >= 0 && elapsed < DRAG_INFO_TIMEOUT_MS
  )
}

const consumeDrag = async (
  drag: ActiveDrag,
  urlRecordId?: string,
): Promise<string> => {
  let consumed = false
  try {
    const settings = await requireOperationalUserSettings()
    const id = await drag.targetId
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
  urlRecordId?: string,
  sourceTabId?: number,
): Promise<string> => {
  if (fromExternal !== true) {
    if (
      draggedUrlInfo?.url === url &&
      (draggedUrlInfo.sourceTabId === undefined ||
        draggedUrlInfo.sourceTabId === sourceTabId) &&
      (urlRecordId === undefined || draggedUrlInfo.urlRecordId === urlRecordId)
    ) {
      clearDraggedUrlInfo()
    }
    return 'internal_operation'
  }
  const drag = draggedUrlInfo
  if (
    !drag ||
    drag.processed ||
    !isCurrentDrag(drag) ||
    drag.url !== url ||
    (drag.sourceTabId !== undefined && drag.sourceTabId !== sourceTabId)
  ) {
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
