import { useCallback, useMemo, useState } from 'react'

import type { SavedTabsInsightRecord } from '@/app/composition/backgroundSavedTabsDataPlaneTypes'
import { calculateAnalyticsHealth } from '@/features/analytics/lib/analyticsHealth'
import type { AnalyticsDrilldownSelection } from '@/features/analytics/routes/analyticsRoute.helpers'
import { useI18n } from '@/features/i18n/context/I18nProvider'

export const useAnalyticsHealth = (
  records: readonly SavedTabsInsightRecord[],
  loadedAt: number | null,
  chartDrilldownSelection: AnalyticsDrilldownSelection | null,
) => {
  const { t } = useI18n()
  const [healthReview, setHealthReview] = useState<{
    ids: Set<string>
    label: string
  } | null>(null)
  const health = useMemo(
    () =>
      loadedAt === null ? null : calculateAnalyticsHealth(records, loadedAt),
    [records, loadedAt],
  )
  const drilldownSelection = useMemo(
    () =>
      healthReview && health
        ? {
            label: healthReview.label,
            matchingRecords: health.records.filter((record) =>
              healthReview.ids.has(record.id),
            ),
            specTitle: t('analytics.health.title'),
          }
        : chartDrilldownSelection,
    [healthReview, health, chartDrilldownSelection, t],
  )
  const handleReviewHealth = useCallback(
    (records: SavedTabsInsightRecord[], label: string) => {
      setHealthReview({
        ids: new Set(records.map((record) => record.id)),
        label,
      })
      requestAnimationFrame(() => {
        const panel = document.querySelector('#analytics-drilldown-panel')
        if (panel && typeof panel.scrollIntoView === 'function') {
          panel.scrollIntoView({ block: 'start' })
        }
      })
    },
    [],
  )
  const clearHealthReview = useCallback(() => {
    setHealthReview(null)
  }, [])
  return {
    health,
    drilldownSelection,
    handleReviewHealth,
    clearHealthReview,
    isReviewingHealth: healthReview !== null,
  }
}
