import { getAnalyticsViewsDataPlane } from '@/app/composition/analyticsViewsDataPlane'
import type { AnalyticsQuery } from '@/features/analytics/lib/analytics'
import {
  normalizeAnalyticsQuery,
  parseAnalyticsQuery,
} from '@/features/analytics/lib/analytics'
import { warnMissingChromeStorage } from '@/lib/browser/chrome-storage'

const HEX_RADIX_AS = 16

type SavedAnalyticsView = {
  createdAt: number
  id: string
  name: string
  query: AnalyticsQuery
  updatedAt: number
}

const isJsonRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const parseSavedAnalyticsView = (value: unknown): SavedAnalyticsView | null => {
  if (
    !isJsonRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.name !== 'string' ||
    typeof value.createdAt !== 'number' ||
    typeof value.updatedAt !== 'number'
  ) {
    return null
  }
  const query = parseAnalyticsQuery(value.query)
  return query
    ? {
        createdAt: value.createdAt,
        id: value.id,
        name: value.name,
        query,
        updatedAt: value.updatedAt,
      }
    : null
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
  query: normalizeAnalyticsQuery(query),
  updatedAt: now,
})

const loadSavedAnalyticsViews = async (): Promise<SavedAnalyticsView[]> => {
  const dataPlane = getAnalyticsViewsDataPlane()

  if (!dataPlane) {
    warnMissingChromeStorage('分析ビューの読み込み')
    return []
  }

  const rawViews = await dataPlane.readValues()
  return rawViews.flatMap((item): SavedAnalyticsView[] => {
    const parsed = parseSavedAnalyticsView(item)
    return parsed ? [parsed] : []
  })
}

const saveSavedAnalyticsViews = async (
  views: SavedAnalyticsView[],
): Promise<void> => {
  const dataPlane = getAnalyticsViewsDataPlane()

  if (!dataPlane) {
    warnMissingChromeStorage('分析ビューの保存')
    return
  }

  await dataPlane.replaceValues(
    views.map((view) => ({
      ...view,
      query: normalizeAnalyticsQuery(view.query),
    })),
  )
}

const deleteSavedAnalyticsView = async (viewId: string): Promise<void> => {
  const currentViews = await loadSavedAnalyticsViews()
  const nextViews = currentViews.filter((view) => view.id !== viewId)
  await saveSavedAnalyticsViews(nextViews)
}

export type { SavedAnalyticsView }
export {
  createSavedAnalyticsView,
  deleteSavedAnalyticsView,
  loadSavedAnalyticsViews,
  saveSavedAnalyticsViews,
}
