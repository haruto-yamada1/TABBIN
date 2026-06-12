import type {
  AiSavedUrlPage,
  AiSavedUrlPageOptions,
  AiSavedUrlRecord,
  AiSavedUrlSortDirection,
} from '@/features/ai-chat/types'

import {
  searchSavedUrls as filterSavedUrlsByQuery,
  findUrlsAddedInMonth,
} from './buildAiContext'

const DEFAULT_SAVED_URL_PAGE = 1
const DEFAULT_SAVED_URL_PAGE_SIZE = 50
const MAX_SAVED_URL_PAGE_SIZE = 200

const clampPositiveInteger = (
  value: number | undefined,
  fallback: number,
): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback
  }

  return Math.max(1, Math.trunc(value))
}

const normalizeSavedUrlPageOptions = (
  options: AiSavedUrlPageOptions = {},
): Required<
  Pick<AiSavedUrlPageOptions, 'page' | 'pageSize' | 'sortDirection'>
> => {
  const page = clampPositiveInteger(options.page, DEFAULT_SAVED_URL_PAGE)
  const pageSize = Math.min(
    clampPositiveInteger(options.pageSize, DEFAULT_SAVED_URL_PAGE_SIZE),
    MAX_SAVED_URL_PAGE_SIZE,
  )
  const sortDirection: AiSavedUrlSortDirection =
    options.sortDirection === 'asc' ? 'asc' : 'desc'

  return {
    page,
    pageSize,
    sortDirection,
  }
}

const sortSavedUrlRecords = (
  records: AiSavedUrlRecord[],
  sortDirection: AiSavedUrlSortDirection,
): AiSavedUrlRecord[] =>
  records.toSorted((left, right) =>
    sortDirection === 'desc'
      ? right.savedAt - left.savedAt
      : left.savedAt - right.savedAt,
  )

const paginateSavedUrlRecords = (
  records: AiSavedUrlRecord[],
  options: AiSavedUrlPageOptions = {},
): AiSavedUrlPage<AiSavedUrlRecord> => {
  const { page, pageSize, sortDirection } =
    normalizeSavedUrlPageOptions(options)
  const sortedRecords = sortSavedUrlRecords(records, sortDirection)
  const totalItems = sortedRecords.length
  const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize)
  const startIndex = (page - 1) * pageSize
  const endIndex = startIndex + pageSize

  return {
    hasNextPage: totalPages > 0 && page < totalPages,
    hasPreviousPage: totalItems > 0 && page > 1,
    items: sortedRecords.slice(startIndex, endIndex),
    page,
    pageSize,
    sortDirection,
    totalItems,
    totalPages,
  }
}

const listSavedUrlPage = (
  records: AiSavedUrlRecord[],
  options: AiSavedUrlPageOptions = {},
): AiSavedUrlPage<AiSavedUrlRecord> => paginateSavedUrlRecords(records, options)

const findSavedUrlsAddedInMonthPage = (
  records: AiSavedUrlRecord[],
  options: AiSavedUrlPageOptions & {
    year: number
    month: number
  },
): AiSavedUrlPage<AiSavedUrlRecord> =>
  paginateSavedUrlRecords(
    findUrlsAddedInMonth(records, options.year, options.month),
    options,
  )

const searchSavedUrlsPage = (
  records: AiSavedUrlRecord[],
  options: AiSavedUrlPageOptions & {
    query: string
  },
): AiSavedUrlPage<AiSavedUrlRecord> =>
  paginateSavedUrlRecords(
    filterSavedUrlsByQuery(records, options.query),
    options,
  )

export {
  DEFAULT_SAVED_URL_PAGE,
  DEFAULT_SAVED_URL_PAGE_SIZE,
  MAX_SAVED_URL_PAGE_SIZE,
  findSavedUrlsAddedInMonthPage,
  listSavedUrlPage,
  normalizeSavedUrlPageOptions,
  paginateSavedUrlRecords,
  searchSavedUrlsPage,
  sortSavedUrlRecords,
}
