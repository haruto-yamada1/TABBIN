import { buildAiSavedUrlRecords } from '@/features/ai-chat/lib/buildAiContext'
import type { AiSavedUrlRecord } from '@/features/ai-chat/types'
import { getParentCategories } from '@/lib/storage/categories'
import { getCustomProjects } from '@/lib/storage/projects'
import { getUserSettings } from '@/lib/storage/settings'
import { getSavedTabs } from '@/lib/storage/tabs'
import { getUrlRecords } from '@/lib/storage/urls'
import { filterItemsBySavableUrl } from '@/lib/url-filter'

const loadAnalyticsRecords = async (): Promise<AiSavedUrlRecord[]> => {
  const [
    urlRecords,
    customProjects,
    parentCategories,
    savedTabsResult,
    settings,
  ] = await Promise.all([
    getUrlRecords(),
    getCustomProjects(),
    getParentCategories(),
    getSavedTabs(),
    getUserSettings(),
  ])

  return buildAiSavedUrlRecords({
    customProjects,
    parentCategories,
    savedTabs: savedTabsResult,
    urlRecords: filterItemsBySavableUrl(urlRecords, settings.excludePatterns),
  })
}

export { loadAnalyticsRecords }
