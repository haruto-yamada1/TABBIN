import { getBackgroundSavedTabsDataPlane } from '@/app/composition/backgroundSavedTabsDataPlane'
import type { AiSavedUrlRecord } from '@/features/ai-chat/types'
import { getUserSettings } from '@/lib/storage/settings'
import { filterItemsBySavableUrl } from '@/lib/url-filter'

const loadAnalyticsRecords = async (): Promise<AiSavedUrlRecord[]> => {
  const [records, settings] = await Promise.all([
    getBackgroundSavedTabsDataPlane().readInsightRecords(),
    getUserSettings(),
  ])
  return filterItemsBySavableUrl([...records], settings.excludePatterns)
}

export { loadAnalyticsRecords }
