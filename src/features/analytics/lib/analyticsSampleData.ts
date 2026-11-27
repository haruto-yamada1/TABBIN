import type { AiSavedUrlRecord } from '@/features/ai-chat/types'

const DAY_MS = 86_400_000
const SAMPLE_SPREAD_DAYS = 14

type AnalyticsSampleGroup = {
  count: number
  domain: string
  parentCategories: string[]
  projectCategories: string[]
  savedInProjects: string[]
  subCategories: string[]
}

// Display-only sample shape for the empty-state ghost preview. Domains use
// reserved example hosts so the values can never be mistaken for real saves.
const SAMPLE_GROUPS: AnalyticsSampleGroup[] = [
  {
    count: 7,
    domain: 'docs.example.com',
    parentCategories: ['Work'],
    projectCategories: ['Reading'],
    savedInProjects: ['Research'],
    subCategories: ['Docs'],
  },
  {
    count: 5,
    domain: 'news.example.net',
    parentCategories: ['Daily'],
    projectCategories: ['Catchup'],
    savedInProjects: ['Inbox'],
    subCategories: ['News'],
  },
  {
    count: 5,
    domain: 'blog.example.com',
    parentCategories: ['Work'],
    projectCategories: ['Reading'],
    savedInProjects: ['Research'],
    subCategories: ['Blog'],
  },
  {
    count: 4,
    domain: 'shop.example.net',
    parentCategories: ['Daily'],
    projectCategories: [],
    savedInProjects: [],
    subCategories: ['Shopping'],
  },
  {
    count: 3,
    domain: 'video.example.com',
    parentCategories: [],
    projectCategories: [],
    savedInProjects: [],
    subCategories: [],
  },
]

const createAnalyticsSampleRecords = (now: number): AiSavedUrlRecord[] => {
  const records: AiSavedUrlRecord[] = []
  let index = 0
  for (const group of SAMPLE_GROUPS) {
    for (let offset = 0; offset < group.count; offset += 1) {
      const daysAgo = (index * 2 + offset) % SAMPLE_SPREAD_DAYS
      records.push({
        domain: group.domain,
        id: `analytics-sample-${index}`,
        parentCategories: group.parentCategories,
        projectCategories: group.projectCategories,
        savedAt: now - daysAgo * DAY_MS,
        savedInProjects: group.savedInProjects,
        savedInTabGroups: [group.domain],
        subCategories: group.subCategories,
        title: `Sample page ${index + 1}`,
        url: `https://${group.domain}/sample-${index + 1}`,
      })
      index += 1
    }
  }
  return records
}

const shouldShowAnalyticsGhostPreview = (
  recordCount: number,
  isLoaded: boolean,
): boolean => isLoaded && recordCount === 0

export { createAnalyticsSampleRecords, shouldShowAnalyticsGhostPreview }
