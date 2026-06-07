import type { AnalyticsQuery } from '@/features/analytics/lib/analytics'
import {
  getChromeStorageLocal,
  warnMissingChromeStorage,
} from '@/lib/browser/chrome-storage'

const HEX_RADIX_AS = 16

const SAVED_ANALYTICS_VIEWS_KEY = 'savedAnalyticsViews'

interface SavedAnalyticsView {
  createdAt: number
  id: string
  name: string
  query: AnalyticsQuery
  updatedAt: number
}

const createSavedAnalyticsView = ({
  name,
  now = Date.now(),
  query,
}: {
  name: string
  now?: number
  query: AnalyticsQuery
}): SavedAnalyticsView => ({
  createdAt: now,
  id: `analytics-view-${now}-${Math.random().toString(HEX_RADIX_AS).slice(2)}`,
  name,
  query,
  updatedAt: now,
})

const loadSavedAnalyticsViews = async (): Promise<SavedAnalyticsView[]> => {
  const storageLocal = getChromeStorageLocal()

  if (!storageLocal) {
    warnMissingChromeStorage('分析ビューの読み込み')
    return []
  }

  const stored = await storageLocal.get(SAVED_ANALYTICS_VIEWS_KEY)
  const rawViews = stored[SAVED_ANALYTICS_VIEWS_KEY]
  return Array.isArray(rawViews)
    ? rawViews.filter(
        (item): item is SavedAnalyticsView =>
          typeof item === 'object' && item !== null && 'id' in item && 'name' in item,
      )
    : []
}

const saveSavedAnalyticsViews = async (
  views: SavedAnalyticsView[],
): Promise<void> => {
  const storageLocal = getChromeStorageLocal()

  if (!storageLocal) {
    warnMissingChromeStorage('分析ビューの保存')
    return
  }

  await storageLocal.set({
    [SAVED_ANALYTICS_VIEWS_KEY]: views,
  })
}

const deleteSavedAnalyticsView = async (viewId: string): Promise<void> => {
  const currentViews = await loadSavedAnalyticsViews()
  const nextViews = currentViews.filter((view) => view.id !== viewId)
  await saveSavedAnalyticsViews(nextViews)
}

export type { SavedAnalyticsView }
export {
  SAVED_ANALYTICS_VIEWS_KEY,
  createSavedAnalyticsView,
  deleteSavedAnalyticsView,
  loadSavedAnalyticsViews,
  saveSavedAnalyticsViews,
}
