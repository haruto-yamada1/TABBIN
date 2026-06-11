import type {
  AiChartSpec,
  AiChartType,
  AiSavedUrlRecord,
} from '@/features/ai-chat/types'
import {
  getLocalDateKey,
  getLocalMonthKey,
  getLocalWeekStartKey,
  isTimestampInLocalDateRange,
} from '@/utils/localDateTime'

type AnalyticsMode = 'both' | 'custom' | 'domain'
type AnalyticsGroupBy =
  | 'domain'
  | 'parentCategory'
  | 'project'
  | 'projectCategory'
  | 'subCategory'
  | 'timeRecent'
  | 'timeTop'
type AnalyticsTimeRange = '30d' | '365d' | '7d' | '90d' | 'all' | 'custom'
type AnalyticsTimeBucket = 'day' | 'month' | 'week'
type AnalyticsSort = 'label-asc' | 'label-desc' | 'value-asc' | 'value-desc'
type AnalyticsCompareBy = 'mode' | 'none'

interface AnalyticsDateRange {
  from?: string
  to?: string
}

interface AnalyticsFilters {
  excludedDomains: string[]
  excludedParentCategories: string[]
  excludedProjectCategories: string[]
  excludedProjects: string[]
  excludedSubCategories: string[]
  includedDomains: string[]
  includedParentCategories: string[]
  includedProjectCategories: string[]
  includedProjects: string[]
  includedSubCategories: string[]
}

interface AnalyticsQuery {
  chartType: AiChartType
  compareBy: AnalyticsCompareBy
  customDateRange?: AnalyticsDateRange
  filters: AnalyticsFilters
  groupBy: AnalyticsGroupBy
  limit: number
  mode: AnalyticsMode
  normalize: boolean
  sort: AnalyticsSort
  stacked: boolean
  timeBucket: AnalyticsTimeBucket
  timeRange: AnalyticsTimeRange
  title?: string
}

type LegacyAnalyticsGroupBy = AnalyticsGroupBy | 'time'

type AnalyticsQueryInput = Omit<AnalyticsQuery, 'groupBy'> & {
  groupBy: LegacyAnalyticsGroupBy
}

interface AnalyticsPreset {
  id: string
  description: string
  isReadonly: true
  name: string
  query: AnalyticsQuery
}

interface AnalyticsResult {
  chartSpecs: AiChartSpec[]
  filteredRecordCount: number
  query: AnalyticsQuery
  summary: string
}

interface GenerateAnalyticsResultOptions {
  messages?: Partial<AnalyticsMessages>
  now?: number
  timeZone?: string
}

interface AnalyticsMessages {
  chartDescriptionAggregated: string
  chartDescriptionCompareMode: string
  chartMonthlySavedTrend: string
  chartSavedCountByDomain: string
  chartSavedCountByParentCategory: string
  chartSavedCountByProject: string
  chartSavedCountByProjectCategory: string
  chartSavedCountBySubCategory: string
  chartSeriesCustomMode: string
  chartSeriesDomainMode: string
  chartSeriesSavedCount: string
  chartSeriesShare: string
  chartSummary: string
  chartWeeklySavedTrend: string
  chartDailySavedTrend: string
  uncategorizedLabel: string
}

const CHART_COLORS = ['chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5']
const UNCATEGORIZED_LABEL = 'Uncategorized'
const DEFAULT_ANALYTICS_MESSAGES: AnalyticsMessages = {
  chartDailySavedTrend: 'Daily saved trend',
  chartDescriptionAggregated: '{{count}} saved records aggregated',
  chartDescriptionCompareMode: '{{count}} saved records compared by mode',
  chartMonthlySavedTrend: 'Monthly saved trend',
  chartSavedCountByDomain: 'Saved count by domain',
  chartSavedCountByParentCategory: 'Saved count by parent category',
  chartSavedCountByProject: 'Saved count by project',
  chartSavedCountByProjectCategory: 'Saved count by project category',
  chartSavedCountBySubCategory: 'Saved count by sub category',
  chartSeriesCustomMode: 'Custom mode',
  chartSeriesDomainMode: 'Domain mode',
  chartSeriesSavedCount: 'Saved count',
  chartSeriesShare: 'Share',
  chartSummary: 'Created {{title}} from {{count}} saved records.',
  chartWeeklySavedTrend: 'Weekly saved trend',
  uncategorizedLabel: UNCATEGORIZED_LABEL,
}
const DEFAULT_LIMIT = 8
const EMPTY_FILTERS: AnalyticsFilters = {
  excludedDomains: [],
  excludedParentCategories: [],
  excludedProjectCategories: [],
  excludedProjects: [],
  excludedSubCategories: [],
  includedDomains: [],
  includedParentCategories: [],
  includedProjectCategories: [],
  includedProjects: [],
  includedSubCategories: [],
}

const HOURS_IN_DAY_A = 24
const MINUTES_IN_HOUR_A = 60
const SECONDS_IN_MINUTE_A = 60
const MS_IN_SECOND_A = 1000
const DAY_MS =
  HOURS_IN_DAY_A * MINUTES_IN_HOUR_A * SECONDS_IN_MINUTE_A * MS_IN_SECOND_A

const RANGE_IN_DAYS: Record<
  Exclude<AnalyticsTimeRange, 'all' | 'custom'>,
  number
> = {
  '30d': 30,
  '365d': 365,
  '7d': 7,
  '90d': 90,
}

const lowerCaseSet = (values: string[]): Set<string> =>
  new Set(
    values.reduce<string[]>((items, value) => {
      const normalizedValue = value.trim().toLowerCase()
      if (normalizedValue) {
        items.push(normalizedValue)
      }
      return items
    }, []),
  )

const interpolate = (
  template: string,
  values: Record<string, string>,
): string =>
  // eslint-disable-next-line typescript/no-unsafe-member-access
  template.replaceAll(/\{\{(\w+)\}\}/g, (_, token) => values[token] ?? '')
const getDefaultAnalyticsQuery = (): AnalyticsQuery => ({
  chartType: 'bar',
  compareBy: 'none',
  filters: {
    ...EMPTY_FILTERS,
  },
  groupBy: 'domain',
  limit: DEFAULT_LIMIT,
  mode: 'both',
  normalize: false,
  sort: 'value-desc',
  stacked: false,
  timeBucket: 'day',
  timeRange: 'all',
})

const normalizeAnalyticsQuery = (
  query: AnalyticsQueryInput,
): AnalyticsQuery => ({
  ...query,
  groupBy: query.groupBy === 'time' ? 'timeRecent' : query.groupBy,
})

const isWithinCustomDateRange = (
  savedAt: number,
  customDateRange: AnalyticsDateRange | undefined,
  timeZone?: string,
): boolean =>
  isTimestampInLocalDateRange(
    savedAt,
    customDateRange?.from,
    customDateRange?.to,
    timeZone,
  )

const matchesMode = (
  record: AiSavedUrlRecord,
  mode: AnalyticsMode,
): boolean => {
  const inDomainMode = record.savedInTabGroups.length > 0
  const inCustomMode = record.savedInProjects.length > 0

  if (mode === 'domain') {
    return inDomainMode
  }

  if (mode === 'custom') {
    return inCustomMode
  }

  return inDomainMode || inCustomMode
}

const isWithinTimeRange = (
  savedAt: number,
  options: {
    customDateRange: AnalyticsDateRange | undefined
    now: number
    timeRange: AnalyticsTimeRange
    timeZone?: string
  },
): boolean => {
  if (options.timeRange === 'all') {
    return true
  }

  if (options.timeRange === 'custom') {
    return isWithinCustomDateRange(
      savedAt,
      options.customDateRange,
      options.timeZone,
    )
  }

  return savedAt >= options.now - RANGE_IN_DAYS[options.timeRange] * DAY_MS
}

const arrayMatchesFilters = (
  values: string[],
  included: string[],
  excluded: string[],
  uncategorizedLabel = UNCATEGORIZED_LABEL,
): boolean => {
  const normalizedValues = lowerCaseSet(
    values.length > 0 ? values : [uncategorizedLabel],
  )
  const includedSet = lowerCaseSet(included)
  const excludedSet = lowerCaseSet(excluded)

  if (
    includedSet.size > 0 &&
    ![...normalizedValues].some((value) => includedSet.has(value))
  ) {
    return false
  }

  if ([...normalizedValues].some((value) => excludedSet.has(value))) {
    return false
  }

  return true
}

const matchesFilters = (
  record: AiSavedUrlRecord,
  filters: AnalyticsFilters,
  uncategorizedLabel = UNCATEGORIZED_LABEL,
): boolean =>
  arrayMatchesFilters(
    [record.domain],
    filters.includedDomains,
    filters.excludedDomains,
    uncategorizedLabel,
  ) &&
  arrayMatchesFilters(
    record.parentCategories,
    filters.includedParentCategories,
    filters.excludedParentCategories,
    uncategorizedLabel,
  ) &&
  arrayMatchesFilters(
    record.subCategories,
    filters.includedSubCategories,
    filters.excludedSubCategories,
    uncategorizedLabel,
  ) &&
  arrayMatchesFilters(
    record.savedInProjects,
    filters.includedProjects,
    filters.excludedProjects,
    uncategorizedLabel,
  ) &&
  arrayMatchesFilters(
    record.projectCategories,
    filters.includedProjectCategories,
    filters.excludedProjectCategories,
    uncategorizedLabel,
  )

const sortEntries = (
  entries: { count: number; label: string }[],
  sort: AnalyticsSort,
) => {
  entries.sort((left, right) => {
    // eslint-disable-next-line typescript/switch-exhaustiveness-check
    switch (sort) {
      case 'label-asc': {
        return left.label.localeCompare(right.label, 'en')
      }
      case 'label-desc': {
        return right.label.localeCompare(left.label, 'en')
      }
      case 'value-asc': {
        return (
          left.count - right.count ||
          left.label.localeCompare(right.label, 'en')
        )
      }
      default: {
        return (
          right.count - left.count ||
          left.label.localeCompare(right.label, 'en')
        )
      }
    }
  })
}

const getTimeBucketLabel = (
  savedAt: number,
  bucket: AnalyticsTimeBucket,
  timeZone?: string,
): string => {
  if (bucket === 'month') {
    return getLocalMonthKey(savedAt, timeZone)
  }

  if (bucket === 'week') {
    return getLocalWeekStartKey(savedAt, timeZone)
  }

  return getLocalDateKey(savedAt, timeZone)
}

// eslint-disable-next-line eslint/complexity
const getLabelsForGroup = (
  record: AiSavedUrlRecord,
  groupBy: AnalyticsGroupBy,
  uncategorizedLabel = UNCATEGORIZED_LABEL,
): string[] => {
  switch (groupBy) {
    case 'domain': {
      return [record.domain]
    }
    case 'parentCategory': {
      return record.parentCategories.length > 0
        ? record.parentCategories
        : [uncategorizedLabel]
    }
    case 'subCategory': {
      return record.subCategories.length > 0
        ? record.subCategories
        : [uncategorizedLabel]
    }
    case 'project': {
      return record.savedInProjects.length > 0
        ? record.savedInProjects
        : [uncategorizedLabel]
    }
    case 'projectCategory': {
      return record.projectCategories.length > 0
        ? record.projectCategories
        : [uncategorizedLabel]
    }
    case 'timeRecent':
    case 'timeTop': {
      return [getTimeBucketLabel(record.savedAt, 'day')]
    }
    default: {
      return [record.domain]
    }
  }
}

const getSingleSeriesTitle = (
  groupBy: AnalyticsGroupBy,
  messages: AnalyticsMessages,
): string => {
  switch (groupBy) {
    case 'domain': {
      return messages.chartSavedCountByDomain
    }
    case 'parentCategory': {
      return messages.chartSavedCountByParentCategory
    }
    case 'subCategory': {
      return messages.chartSavedCountBySubCategory
    }
    case 'project': {
      return messages.chartSavedCountByProject
    }
    case 'projectCategory': {
      return messages.chartSavedCountByProjectCategory
    }
    case 'timeRecent':
    case 'timeTop': {
      return messages.chartDailySavedTrend
    }
    default: {
      return messages.chartSavedCountByDomain
    }
  }
}

const getTimeTitle = (
  bucket: AnalyticsTimeBucket,
  messages: AnalyticsMessages,
): string => {
  // eslint-disable-next-line typescript/switch-exhaustiveness-check
  switch (bucket) {
    case 'week': {
      return messages.chartWeeklySavedTrend
    }
    case 'month': {
      return messages.chartMonthlySavedTrend
    }
    default: {
      return messages.chartDailySavedTrend
    }
  }
}

const PERCENTAGE_MULTIPLIER = 100

const getNormalizedCount = (count: number, total: number): number => {
  if (total === 0) {
    return 0
  }

  return Math.round((count / total) * PERCENTAGE_MULTIPLIER)
}

const sortTimeEntriesByTotalDesc = (
  entries: { count: number; label: string }[],
) => {
  entries.sort(
    (left, right) =>
      right.count - left.count || left.label.localeCompare(right.label, 'en'),
  )
}

const getTimeGroupByVariant = (
  groupBy: AnalyticsGroupBy,
): 'timeRecent' | 'timeTop' | null => {
  if (groupBy === 'timeRecent' || groupBy === 'timeTop') {
    return groupBy
  }

  return null
}

const getLimitedTimeEntries = <T extends { count: number; label: string }>(
  entries: T[],
  groupBy: 'timeRecent' | 'timeTop',
  limit: number,
): T[] => {
  if (groupBy === 'timeRecent') {
    sortEntries(entries, 'label-asc')
    return entries.slice(-limit)
  }

  sortTimeEntriesByTotalDesc(entries)
  const limitedEntries = entries.slice(0, limit)
  sortEntries(limitedEntries, 'label-asc')
  return limitedEntries
}

const createSingleSeriesChart = (
  filteredRecords: AiSavedUrlRecord[],
  query: AnalyticsQuery,
  messages: AnalyticsMessages,
  timeZone?: string,
): AiChartSpec => {
  const bucketMap = new Map<string, number>()
  const timeGroupBy = getTimeGroupByVariant(query.groupBy)
  const isTimeSeries = timeGroupBy !== null

  for (const record of filteredRecords) {
    const labels = isTimeSeries
      ? [getTimeBucketLabel(record.savedAt, query.timeBucket, timeZone)]
      : getLabelsForGroup(record, query.groupBy, messages.uncategorizedLabel)

    for (const label of labels) {
      bucketMap.set(label, (bucketMap.get(label) ?? 0) + 1)
    }
  }

  const entries = [...bucketMap.entries()].map(([label, count]) => ({
    count,
    label,
  }))
  const limitedEntries = isTimeSeries
    ? getLimitedTimeEntries(entries, timeGroupBy, query.limit)
    : (() => {
        sortEntries(entries, query.sort)
        return entries.slice(0, query.limit)
      })()
  const total = limitedEntries.reduce((sum, entry) => sum + entry.count, 0)
  const data = limitedEntries.map((entry) => ({
    count: query.normalize
      ? getNormalizedCount(entry.count, total)
      : entry.count,
    label: entry.label,
  }))

  return {
    categoryKey: 'label',
    data,
    description: interpolate(messages.chartDescriptionAggregated, {
      count: String(filteredRecords.length),
    }),
    series: [
      {
        colorToken: CHART_COLORS[0],
        dataKey: 'count',
        label: query.normalize
          ? messages.chartSeriesShare
          : messages.chartSeriesSavedCount,
      },
    ],
    showLegend: query.chartType !== 'pie',
    stacked: query.stacked,
    title:
      query.title ??
      (isTimeSeries
        ? getTimeTitle(query.timeBucket, messages)
        : getSingleSeriesTitle(query.groupBy, messages)),
    type: query.chartType,
    valueFormat: query.normalize ? 'percent' : 'count',
    xKey: query.chartType === 'pie' ? undefined : 'label',
  }
}

const createModeComparisonChart = (
  filteredRecords: AiSavedUrlRecord[],
  query: AnalyticsQuery,
  messages: AnalyticsMessages,
  timeZone?: string,
): AiChartSpec => {
  const timeGroupBy = getTimeGroupByVariant(query.groupBy)
  const isTimeSeries = timeGroupBy !== null
  const buckets = new Map<
    string,
    {
      custom: number
      domain: number
    }
  >()

  for (const record of filteredRecords) {
    const label = isTimeSeries
      ? getTimeBucketLabel(record.savedAt, query.timeBucket, timeZone)
      : record.domain
    const current = buckets.get(label) ?? {
      custom: 0,
      domain: 0,
    }

    if (record.savedInTabGroups.length > 0) {
      current.domain += 1
    }

    if (record.savedInProjects.length > 0) {
      current.custom += 1
    }

    buckets.set(label, current)
  }

  const entries = [...buckets.entries()].map(([label, counts]) => ({
    count: counts.custom + counts.domain,
    counts,
    label,
  }))
  const limitedEntries = isTimeSeries
    ? getLimitedTimeEntries(entries, timeGroupBy, query.limit)
    : (() => {
        sortEntries(entries, query.sort)
        return entries.slice(0, query.limit)
      })()
  const rawData = limitedEntries.map(({ counts, label }) => ({
    ...counts,
    label,
  }))
  const data = query.normalize
    ? rawData.map((entry) => {
        const total = entry.domain + entry.custom
        return {
          custom: getNormalizedCount(entry.custom, total),
          domain: getNormalizedCount(entry.domain, total),
          label: entry.label,
        }
      })
    : rawData

  return {
    data,
    description: interpolate(messages.chartDescriptionCompareMode, {
      count: String(filteredRecords.length),
    }),
    series: [
      {
        colorToken: CHART_COLORS[0],
        dataKey: 'domain',
        label: messages.chartSeriesDomainMode,
      },
      {
        colorToken: CHART_COLORS[1],
        dataKey: 'custom',
        label: messages.chartSeriesCustomMode,
      },
    ],
    stacked: query.stacked,
    title: query.title ?? getTimeTitle(query.timeBucket, messages),
    type: query.chartType,
    valueFormat: query.normalize ? 'percent' : 'count',
    xKey: query.chartType === 'pie' ? undefined : 'label',
  }
}

const filterAnalyticsRecords = (
  records: AiSavedUrlRecord[],
  query: AnalyticsQueryInput,
  options: GenerateAnalyticsResultOptions = {},
): AiSavedUrlRecord[] => {
  const normalizedQuery = normalizeAnalyticsQuery(query)
  const now = options.now ?? Date.now()
  const messages = {
    ...DEFAULT_ANALYTICS_MESSAGES,
    ...options.messages,
  }

  return records.filter(
    (record) =>
      matchesMode(record, normalizedQuery.mode) &&
      isWithinTimeRange(record.savedAt, {
        customDateRange: normalizedQuery.customDateRange,
        now,
        timeRange: normalizedQuery.timeRange,
        timeZone: options.timeZone,
      }) &&
      matchesFilters(
        record,
        normalizedQuery.filters,
        messages.uncategorizedLabel,
      ),
  )
}

const generateAnalyticsResult = (
  records: AiSavedUrlRecord[],
  query: AnalyticsQueryInput,
  options: GenerateAnalyticsResultOptions = {},
): AnalyticsResult => {
  const normalizedQuery = normalizeAnalyticsQuery(query)
  const now = options.now ?? Date.now()
  const messages = {
    ...DEFAULT_ANALYTICS_MESSAGES,
    ...options.messages,
  }
  const filteredRecords = filterAnalyticsRecords(records, normalizedQuery, {
    ...options,
    now,
  })

  const chartSpec =
    normalizedQuery.compareBy === 'mode'
      ? createModeComparisonChart(
          filteredRecords,
          normalizedQuery,
          messages,
          options.timeZone,
        )
      : createSingleSeriesChart(
          filteredRecords,
          normalizedQuery,
          messages,
          options.timeZone,
        )

  return {
    chartSpecs: [chartSpec],
    filteredRecordCount: filteredRecords.length,
    query: normalizedQuery,
    summary: interpolate(messages.chartSummary, {
      count: String(filteredRecords.length),
      title: chartSpec.title,
    }),
  }
}

const getAnalyticsPresets = (): AnalyticsPreset[] => [
  {
    description: 'View the domains saved most often in the last 30 days',
    id: 'top-domains-30d',
    isReadonly: true,
    name: 'Top domains',
    query: {
      ...getDefaultAnalyticsQuery(),
      chartType: 'bar',
      groupBy: 'domain',
      mode: 'domain',
      timeRange: '30d',
    },
  },
  {
    description: 'View the saved trend for the last 30 days',
    id: 'daily-trend-30d',
    isReadonly: true,
    name: '30-day trend',
    query: {
      ...getDefaultAnalyticsQuery(),
      chartType: 'line',
      groupBy: 'timeRecent',
      timeBucket: 'day',
      timeRange: '30d',
    },
  },
  {
    description: 'View month-over-month saved changes',
    id: 'monthly-trend',
    isReadonly: true,
    name: 'Monthly trend',
    query: {
      ...getDefaultAnalyticsQuery(),
      chartType: 'area',
      groupBy: 'timeRecent',
      timeBucket: 'month',
      timeRange: '365d',
    },
  },
  {
    description: 'View the distribution of parent categories',
    id: 'top-parent-categories',
    isReadonly: true,
    name: 'Parent category breakdown',
    query: {
      ...getDefaultAnalyticsQuery(),
      chartType: 'pie',
      groupBy: 'parentCategory',
      mode: 'domain',
      normalize: true,
    },
  },
  {
    description: 'View the distribution of custom projects',
    id: 'top-projects',
    isReadonly: true,
    name: 'Saved count by project',
    query: {
      ...getDefaultAnalyticsQuery(),
      chartType: 'bar',
      groupBy: 'project',
      mode: 'custom',
    },
  },
  {
    description: 'View the distribution of sub categories',
    id: 'top-sub-categories',
    isReadonly: true,
    name: 'Saved count by sub category',
    query: {
      ...getDefaultAnalyticsQuery(),
      chartType: 'bar',
      groupBy: 'subCategory',
      mode: 'domain',
    },
  },
  {
    description: 'View the distribution of project categories',
    id: 'top-project-categories',
    isReadonly: true,
    name: 'Saved count by project category',
    query: {
      ...getDefaultAnalyticsQuery(),
      chartType: 'bar',
      groupBy: 'projectCategory',
      mode: 'custom',
    },
  },
  {
    description: 'Quickly view changes over the last 7 days',
    id: 'daily-trend-7d',
    isReadonly: true,
    name: '7-day trend',
    query: {
      ...getDefaultAnalyticsQuery(),
      chartType: 'line',
      groupBy: 'timeRecent',
      timeBucket: 'day',
      timeRange: '7d',
    },
  },
  {
    description: 'View the monthly trend for custom mode',
    id: 'custom-monthly-trend',
    isReadonly: true,
    name: 'Custom monthly trend',
    query: {
      ...getDefaultAnalyticsQuery(),
      chartType: 'area',
      groupBy: 'timeRecent',
      mode: 'custom',
      timeBucket: 'month',
      timeRange: '365d',
    },
  },
  {
    description: 'Compare domain mode and custom mode',
    id: 'mode-comparison-30d',
    isReadonly: true,
    name: 'Mode comparison',
    query: {
      ...getDefaultAnalyticsQuery(),
      chartType: 'line',
      compareBy: 'mode',
      groupBy: 'timeRecent',
      mode: 'both',
      timeBucket: 'day',
      timeRange: '30d',
    },
  },
]

export type {
  AnalyticsCompareBy,
  AnalyticsDateRange,
  AnalyticsFilters,
  AnalyticsGroupBy,
  AnalyticsMode,
  AnalyticsPreset,
  AnalyticsQuery,
  AnalyticsResult,
  AnalyticsSort,
  AnalyticsTimeBucket,
  AnalyticsTimeRange,
}
export {
  UNCATEGORIZED_LABEL,
  filterAnalyticsRecords,
  generateAnalyticsResult,
  getAnalyticsPresets,
  getDefaultAnalyticsQuery,
  getLabelsForGroup,
  getNormalizedCount,
  getSingleSeriesTitle,
  normalizeAnalyticsQuery,
}
