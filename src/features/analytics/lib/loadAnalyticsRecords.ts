import { buildAiSavedUrlRecords } from '@/features/ai-chat/lib/buildAiContext'
import type { AiSavedUrlRecord } from '@/features/ai-chat/types'
import { getParentCategories } from '@/lib/storage/categories'
import { getCustomProjects } from '@/lib/storage/projects'
import { getUserSettings } from '@/lib/storage/settings'
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
    chrome.storage.local.get<{
// eslint-disable-next-line typescript/consistent-type-imports
      savedTabs?: import('@/types/storage').TabGroup[]
    }>('savedTabs'),
    getUserSettings(),
  ])

  return buildAiSavedUrlRecords({
    customProjects,
    parentCategories,
    savedTabs: Array.isArray(savedTabsResult.savedTabs)
      ? savedTabsResult.savedTabs
      : [],
    urlRecords: filterItemsBySavableUrl(
      urlRecords,
      settings.excludePatterns ?? [],
    ),
  })
}

export { loadAnalyticsRecords }
