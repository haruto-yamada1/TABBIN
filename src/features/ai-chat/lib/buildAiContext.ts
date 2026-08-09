import type { AiSavedUrlRecord } from '@/features/ai-chat/types'
import { isTimestampInLocalMonth } from '@/utils/localDateTime'

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
