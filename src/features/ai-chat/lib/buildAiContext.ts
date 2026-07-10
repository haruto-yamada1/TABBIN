import type { AiSavedUrlRecord } from '@/features/ai-chat/types'
import type {
  CustomProject,
  ParentCategory,
  TabGroup,
  UrlRecord,
} from '@/types/storage'
import { tabGroupMatchesCategory, toHostname } from '@/utils/domain-normalize'
import { isTimestampInLocalMonth } from '@/utils/localDateTime'

const unique = (values: string[]): string[] => [...new Set(values)]

type BuildAiSavedUrlRecordsInput = {
  urlRecords: UrlRecord[]
  savedTabs: TabGroup[]
  customProjects: CustomProject[]
  parentCategories: ParentCategory[]
}

export const buildAiSavedUrlRecords = ({
  urlRecords,
  savedTabs,
  customProjects,
  parentCategories,
}: BuildAiSavedUrlRecordsInput): AiSavedUrlRecord[] =>
  urlRecords
    .map((record) => {
      const matchingGroups = savedTabs.filter((group) =>
        group.urlIds?.includes(record.id),
      )
      const matchingProjects = customProjects.filter((project) =>
        project.urlIds?.includes(record.id),
      )
      const subCategories = unique(
        matchingGroups.flatMap((group) => {
          const value = group.urlSubCategories?.[record.id]
          return typeof value === 'string' ? [value] : []
        }),
      )
      const projectCategories = unique(
        matchingProjects.flatMap((project) => {
          const value = project.urlMetadata?.[record.id]?.category
          return typeof value === 'string' ? [value] : []
        }),
      )
      const parentCategoryNames = unique(
        matchingGroups.flatMap((group) =>
          parentCategories.flatMap((category) =>
            tabGroupMatchesCategory(
              category.domains,
              category.domainNames,
              group.id,
              group.domain,
            )
              ? [category.name]
              : [],
          ),
        ),
      )

      return {
        domain: toHostname(record.url),
        id: record.id,
        parentCategories: parentCategoryNames,
        projectCategories,
        savedAt: record.savedAt,
        savedInProjects: unique(
          matchingProjects.map((project) => project.name),
        ),
        savedInTabGroups: unique(matchingGroups.map((group) => group.domain)),
        subCategories,
        title: record.title,
        url: record.url,
      }
    })
    .sort((left, right) => right.savedAt - left.savedAt)

export const findUrlsAddedInMonth = (
  records: AiSavedUrlRecord[],
  year: number,
  month: number,
  timeZone?: string,
): AiSavedUrlRecord[] =>
  records.filter((record) =>
    isTimestampInLocalMonth(record.savedAt, year, month, timeZone),
  )

export const searchSavedUrls = (
  records: AiSavedUrlRecord[],
  query: string,
): AiSavedUrlRecord[] => {
  const normalizedQuery = query.trim().toLowerCase()

  if (!normalizedQuery) {
    return records
  }

  return records.filter((record) => {
    const haystacks = [
      record.title,
      record.url,
      record.domain,
      ...record.savedInProjects,
      ...record.subCategories,
      ...record.projectCategories,
      ...record.parentCategories,
    ]

    return haystacks.some((value) =>
      value.toLowerCase().includes(normalizedQuery),
    )
  })
}
