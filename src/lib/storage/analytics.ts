import type { AnalyticsQuery } from '@/features/analytics/lib/analytics'
import {
  getChromeStorageLocal,
  warnMissingChromeStorage,
} from '@/lib/browser/chrome-storage'

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
  id: `analytics-view-${now}-${Math.random().toString(16).slice(2)}`,
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
  return Array.isArray(stored[SAVED_ANALYTICS_VIEWS_KEY])
    ? (stored[SAVED_ANALYTICS_VIEWS_KEY] as SavedAnalyticsView[])
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
