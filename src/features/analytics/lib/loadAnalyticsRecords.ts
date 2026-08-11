import { getBackgroundSavedTabsDataPlane } from '@/app/composition/backgroundSavedTabsDataPlane'
import type { SavedTabsAnalyticsRecord } from '@/app/composition/backgroundSavedTabsDataPlaneTypes'
import { getUserSettings } from '@/lib/storage/settings'
import { filterItemsBySavableUrl } from '@/lib/url-filter'

const loadAnalyticsRecords = async (): Promise<SavedTabsAnalyticsRecord[]> => {
  const [records, settings] = await Promise.all([
    getBackgroundSavedTabsDataPlane().readAnalyticsRecords(),
    getUserSettings(),
  ])
  return filterItemsBySavableUrl([...records], settings.excludePatterns)
}

export { loadAnalyticsRecords }
