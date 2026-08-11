import type {
  SavedTabsAnalyticsMetric,
  SavedTabsAnalyticsRecord,
} from '@/app/composition/backgroundSavedTabsDataPlaneTypes'
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
  | 'collection'
  | 'collectionCategory'
  | 'collectionGroup'
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
type AnalyticsCollectionType = 'all' | 'custom' | 'domain'
type AnalyticsHistoricalDataQuality = 'exact' | 'partial'

type AnalyticsDateRange = {
  from?: string
  to?: string
}

type AnalyticsFilters = {
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

type AnalyticsQuery = {
  chartType: AiChartType
  collectionType?: AnalyticsCollectionType
  compareBy: AnalyticsCompareBy
  customDateRange?: AnalyticsDateRange
  filters: AnalyticsFilters
  groupBy: AnalyticsGroupBy
  limit: number
  metric?: SavedTabsAnalyticsMetric
  mode: AnalyticsMode
  normalize: boolean
  schemaVersion?: 2
  sort: AnalyticsSort
  stacked: boolean
  timeBucket: AnalyticsTimeBucket
  timeRange: AnalyticsTimeRange
  title?: string
}

type LegacyAnalyticsGroupBy =
  | AnalyticsGroupBy
  | 'parentCategory'
  | 'project'
  | 'projectCategory'
  | 'subCategory'
  | 'time'

type AnalyticsQueryInput = Omit<AnalyticsQuery, 'groupBy'> & {
  groupBy: LegacyAnalyticsGroupBy
}

type AnalyticsPreset = {
  id: string
  description: string
  isReadonly: true
  name: string
  query: AnalyticsQuery
}

type AnalyticsResult = {
  chartSpecs: AiChartSpec[]
  filteredRecordCount: number
  historicalDataQuality: AnalyticsHistoricalDataQuality
  query: AnalyticsQuery
  summary: string
}

type GenerateAnalyticsResultOptions = {
  messages?: Partial<AnalyticsMessages>
  now?: number
  timeZone?: string
}

type AnalyticsMessages = {
  chartDescriptionAggregated: string
  chartDescriptionCompareMode: string
  chartMonthlySavedTrend: string
  chartSavedCountByCollection: string
  chartSavedCountByCollectionCategory: string
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
  chartSavedCountByCollection: 'Saved count by collection',
  chartSavedCountByCollectionCategory: 'Saved count by collection category',
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
  values: Partial<Record<string, string>>,
): string =>
  // eslint-disable-next-line typescript/no-unsafe-member-access
  template.replaceAll(/\{\{(\w+)\}\}/g, (_, token) => values[token] ?? '')
const getDefaultAnalyticsQuery = (): AnalyticsQuery => ({
  chartType: 'bar',
  collectionType: 'all',
  compareBy: 'none',
  filters: {
    ...EMPTY_FILTERS,
  },
  groupBy: 'domain',
  limit: DEFAULT_LIMIT,
  metric: 'first-saved',
  mode: 'both',
  normalize: false,
  schemaVersion: 2,
  sort: 'value-desc',
  stacked: false,
  timeBucket: 'day',
  timeRange: 'all',
})

const LEGACY_CUSTOM_COLLECTION_GROUPS = new Set<LegacyAnalyticsGroupBy>([
  'project',
  'projectCategory',
])
const LEGACY_DOMAIN_COLLECTION_GROUPS = new Set<LegacyAnalyticsGroupBy>([
  'parentCategory',
  'subCategory',
])
const COLLECTION_SCOPED_GROUPS = new Set<LegacyAnalyticsGroupBy>([
  'collection',
  'collectionCategory',
  'collectionGroup',
  ...LEGACY_CUSTOM_COLLECTION_GROUPS,
  ...LEGACY_DOMAIN_COLLECTION_GROUPS,
])
const isCollectionScopedGroupBy = (groupBy: LegacyAnalyticsGroupBy): boolean =>
  COLLECTION_SCOPED_GROUPS.has(groupBy)
const URL_METRIC_GROUPS = new Set<AnalyticsGroupBy>([
  'domain',
  'timeRecent',
  'timeTop',
])

const getNormalizedCollectionType = (
  query: AnalyticsQueryInput,
): AnalyticsCollectionType => {
  if (LEGACY_CUSTOM_COLLECTION_GROUPS.has(query.groupBy)) {
    return 'custom'
  }
  if (LEGACY_DOMAIN_COLLECTION_GROUPS.has(query.groupBy)) {
    return 'domain'
  }
  return query.collectionType ?? (query.mode === 'both' ? 'all' : query.mode)
}

const getNormalizedGroupBy = (
  groupBy: LegacyAnalyticsGroupBy,
): AnalyticsGroupBy => {
  if (groupBy === 'time') {
    return 'timeRecent'
  }
  if (groupBy === 'parentCategory') {
    return 'collectionGroup'
  }
  if (groupBy === 'project') {
    return 'collection'
  }
  if (groupBy === 'projectCategory' || groupBy === 'subCategory') {
    return 'collectionCategory'
  }
  return groupBy
}

const normalizeAnalyticsQuery = (
  query: AnalyticsQueryInput,
): AnalyticsQuery => {
  const collectionType = getNormalizedCollectionType(query)
  const collectionScoped =
    isCollectionScopedGroupBy(query.groupBy) ||
    query.compareBy === 'mode' ||
    collectionType !== 'all'
  let metric = query.metric
  metric ??= collectionScoped ? 'membership-added' : 'first-saved'
  let groupBy = getNormalizedGroupBy(query.groupBy)
  if (metric !== 'membership-added' && !URL_METRIC_GROUPS.has(groupBy)) {
    groupBy = 'domain'
  }
  return {
    ...query,
    collectionType: metric === 'membership-added' ? collectionType : 'all',
    compareBy: metric === 'membership-added' ? query.compareBy : 'none',
    groupBy,
    metric,
    schemaVersion: 2,
  }
}

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string')

const isJsonRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isAnalyticsFilters = (value: unknown): value is AnalyticsFilters =>
  isJsonRecord(value) &&
  isStringArray(value.excludedDomains) &&
  isStringArray(value.excludedParentCategories) &&
  isStringArray(value.excludedProjectCategories) &&
  isStringArray(value.excludedProjects) &&
  isStringArray(value.excludedSubCategories) &&
  isStringArray(value.includedDomains) &&
  isStringArray(value.includedParentCategories) &&
  isStringArray(value.includedProjectCategories) &&
  isStringArray(value.includedProjects) &&
  isStringArray(value.includedSubCategories)

const isAnalyticsDateRange = (value: unknown): value is AnalyticsDateRange =>
  isJsonRecord(value) &&
  (value.from === undefined || typeof value.from === 'string') &&
  (value.to === undefined || typeof value.to === 'string')

const isOneOf = <Value extends string>(
  value: unknown,
  options: readonly Value[],
): value is Value =>
  typeof value === 'string' && options.some((option) => option === value)

const ANALYTICS_CHART_TYPES: readonly AiChartType[] = [
  'area',
  'bar',
  'line',
  'pie',
  'radar',
]
const ANALYTICS_GROUP_BY_VALUES: readonly LegacyAnalyticsGroupBy[] = [
  'collection',
  'collectionCategory',
  'collectionGroup',
  'domain',
  'parentCategory',
  'project',
  'projectCategory',
  'subCategory',
  'time',
  'timeRecent',
  'timeTop',
]
const ANALYTICS_MODE_VALUES: readonly AnalyticsMode[] = [
  'both',
  'custom',
  'domain',
]
const ANALYTICS_COMPARE_VALUES: readonly AnalyticsCompareBy[] = ['mode', 'none']
const ANALYTICS_SORT_VALUES: readonly AnalyticsSort[] = [
  'label-asc',
  'label-desc',
  'value-asc',
  'value-desc',
]
const ANALYTICS_BUCKET_VALUES: readonly AnalyticsTimeBucket[] = [
  'day',
  'month',
  'week',
]
const ANALYTICS_RANGE_VALUES: readonly AnalyticsTimeRange[] = [
  '30d',
  '365d',
  '7d',
  '90d',
  'all',
  'custom',
]
const ANALYTICS_COLLECTION_TYPE_VALUES: readonly AnalyticsCollectionType[] = [
  'all',
  'custom',
  'domain',
]
const ANALYTICS_METRIC_VALUES: readonly SavedTabsAnalyticsMetric[] = [
  'first-saved',
  'last-saved',
  'membership-added',
]

type ParsedAnalyticsQueryRecord = Record<string, unknown> & {
  chartType: AiChartType
  collectionType?: AnalyticsCollectionType
  compareBy: AnalyticsCompareBy
  customDateRange?: AnalyticsDateRange
  filters: AnalyticsFilters
  groupBy: LegacyAnalyticsGroupBy
  limit: number
  metric?: SavedTabsAnalyticsMetric
  mode: AnalyticsMode
  normalize: boolean
  schemaVersion?: 2
  sort: AnalyticsSort
  stacked: boolean
  timeBucket: AnalyticsTimeBucket
  timeRange: AnalyticsTimeRange
}

const isOptionalOneOf = <Value extends string>(
  value: unknown,
  options: readonly Value[],
): value is Value | undefined => value === undefined || isOneOf(value, options)

const isPositiveSafeInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0

const isParsedAnalyticsQueryRecord = (
  value: Record<string, unknown>,
): value is ParsedAnalyticsQueryRecord =>
  [
    isAnalyticsFilters(value.filters),
    value.customDateRange === undefined ||
      isAnalyticsDateRange(value.customDateRange),
    isOneOf(value.chartType, ANALYTICS_CHART_TYPES),
    isOneOf(value.compareBy, ANALYTICS_COMPARE_VALUES),
    isOneOf(value.groupBy, ANALYTICS_GROUP_BY_VALUES),
    isOneOf(value.mode, ANALYTICS_MODE_VALUES),
    isOneOf(value.sort, ANALYTICS_SORT_VALUES),
    isOneOf(value.timeBucket, ANALYTICS_BUCKET_VALUES),
    isOneOf(value.timeRange, ANALYTICS_RANGE_VALUES),
    isPositiveSafeInteger(value.limit),
    typeof value.normalize === 'boolean',
    typeof value.stacked === 'boolean',
    value.schemaVersion === undefined || value.schemaVersion === 2,
    isOptionalOneOf(value.collectionType, ANALYTICS_COLLECTION_TYPE_VALUES),
    isOptionalOneOf(value.metric, ANALYTICS_METRIC_VALUES),
  ].every(Boolean)

const parseAnalyticsQuery = (value: unknown): AnalyticsQuery | null => {
  if (!isJsonRecord(value) || !isParsedAnalyticsQueryRecord(value)) {
    return null
  }
  const query: AnalyticsQueryInput = {
    chartType: value.chartType,
    ...(value.collectionType === undefined
      ? {}
      : { collectionType: value.collectionType }),
    compareBy: value.compareBy,
    ...(value.customDateRange === undefined
      ? {}
      : { customDateRange: value.customDateRange }),
    filters: value.filters,
    groupBy: value.groupBy,
    limit: value.limit,
    ...(value.metric === undefined ? {} : { metric: value.metric }),
    mode: value.mode,
    normalize: value.normalize,
    sort: value.sort,
    stacked: value.stacked,
    timeBucket: value.timeBucket,
    timeRange: value.timeRange,
    ...(typeof value.title === 'string' ? { title: value.title } : {}),
  }
  return normalizeAnalyticsQuery(query)
}

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
  if ('metric' in record) {
    return true
  }
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

const matchesMetric = (
  record: AiSavedUrlRecord | SavedTabsAnalyticsRecord,
  query: AnalyticsQuery,
): boolean => {
  if (!('metric' in record)) {
    return true
  }
  if (record.metric !== query.metric) {
    return false
  }
  return (
    record.metric !== 'membership-added' ||
    query.collectionType === 'all' ||
    record.collectionType === query.collectionType
  )
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

const getCollectionLabelsForType = (
  record: AiSavedUrlRecord,
  collectionType: AnalyticsCollectionType = 'all',
): string[] => {
  if (collectionType === 'domain') {
    return record.savedInTabGroups
  }
  if (collectionType === 'custom') {
    return record.savedInProjects
  }
  return [...record.savedInTabGroups, ...record.savedInProjects]
}

const getCollectionCategoryLabelsForType = (
  record: AiSavedUrlRecord,
  collectionType: AnalyticsCollectionType = 'all',
): string[] => {
  if (collectionType === 'domain') {
    return record.subCategories
  }
  if (collectionType === 'custom') {
    return record.projectCategories
  }
  return [...record.subCategories, ...record.projectCategories]
}

const withUncategorizedLabel = (
  labels: string[],
  uncategorizedLabel: string,
): string[] => (labels.length > 0 ? labels : [uncategorizedLabel])

// eslint-disable-next-line eslint/complexity
const getLabelsForGroup = (
  record: AiSavedUrlRecord,
  groupBy: AnalyticsGroupBy,
  uncategorizedLabel = UNCATEGORIZED_LABEL,
  collectionType: AnalyticsCollectionType = 'all',
): string[] => {
  switch (groupBy) {
    case 'domain': {
      return [record.domain]
    }
    case 'collection': {
      return withUncategorizedLabel(
        getCollectionLabelsForType(record, collectionType),
        uncategorizedLabel,
      )
    }
    case 'project': {
      return withUncategorizedLabel(
        getCollectionLabelsForType(record, 'custom'),
        uncategorizedLabel,
      )
    }
    case 'collectionCategory': {
      return withUncategorizedLabel(
        getCollectionCategoryLabelsForType(record, collectionType),
        uncategorizedLabel,
      )
    }
    case 'projectCategory': {
      return withUncategorizedLabel(
        getCollectionCategoryLabelsForType(record, 'custom'),
        uncategorizedLabel,
      )
    }
    case 'subCategory': {
      return withUncategorizedLabel(
        getCollectionCategoryLabelsForType(record, 'domain'),
        uncategorizedLabel,
      )
    }
    case 'collectionGroup':
    case 'parentCategory': {
      return record.parentCategories.length > 0
        ? record.parentCategories
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

const getCollectionTitle = (
  collectionType: AnalyticsCollectionType,
  messages: AnalyticsMessages,
): string =>
  ({
    all: messages.chartSavedCountByCollection,
    custom: messages.chartSavedCountByProject,
    domain: messages.chartSavedCountByDomain,
  })[collectionType]

const getCollectionCategoryTitle = (
  collectionType: AnalyticsCollectionType,
  messages: AnalyticsMessages,
): string =>
  ({
    all: messages.chartSavedCountByCollectionCategory,
    custom: messages.chartSavedCountByProjectCategory,
    domain: messages.chartSavedCountBySubCategory,
  })[collectionType]

const getSingleSeriesTitle = (
  groupBy: AnalyticsGroupBy,
  messages: AnalyticsMessages,
  collectionType: AnalyticsCollectionType = 'all',
): string => {
  switch (groupBy) {
    case 'domain': {
      return messages.chartSavedCountByDomain
    }
    case 'collectionGroup':
    case 'parentCategory': {
      return messages.chartSavedCountByParentCategory
    }
    case 'project': {
      return messages.chartSavedCountByProject
    }
    case 'projectCategory': {
      return messages.chartSavedCountByProjectCategory
    }
    case 'subCategory': {
      return messages.chartSavedCountBySubCategory
    }
    case 'collection': {
      return getCollectionTitle(collectionType, messages)
    }
    case 'collectionCategory': {
      return getCollectionCategoryTitle(collectionType, messages)
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
      : getLabelsForGroup(
          record,
          query.groupBy,
          messages.uncategorizedLabel,
          query.collectionType,
        )

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
        : getSingleSeriesTitle(query.groupBy, messages, query.collectionType)),
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
      matchesMetric(record, normalizedQuery) &&
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
    historicalDataQuality: filteredRecords.some(
      (record) =>
        !('timestampAccuracy' in record) ||
        record.timestampAccuracy === 'legacy-fallback',
    )
      ? 'partial'
      : 'exact',
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
      collectionType: 'domain',
      groupBy: 'collectionGroup',
      metric: 'membership-added',
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
      collectionType: 'custom',
      groupBy: 'collection',
      metric: 'membership-added',
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
      collectionType: 'domain',
      groupBy: 'collectionCategory',
      metric: 'membership-added',
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
      collectionType: 'custom',
      groupBy: 'collectionCategory',
      metric: 'membership-added',
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
      collectionType: 'custom',
      groupBy: 'timeRecent',
      metric: 'membership-added',
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
      metric: 'membership-added',
      mode: 'both',
      timeBucket: 'day',
      timeRange: '30d',
    },
  },
  {
    description: 'View last saved activity independently from first saves',
    id: 'last-saved-activity-30d',
    isReadonly: true,
    name: 'Last saved activity',
    query: {
      ...getDefaultAnalyticsQuery(),
      chartType: 'line',
      groupBy: 'timeRecent',
      metric: 'last-saved',
      timeBucket: 'day',
      timeRange: '30d',
    },
  },
  {
    description: 'View collection additions independently from URL saves',
    id: 'collection-additions-30d',
    isReadonly: true,
    name: 'Collection additions',
    query: {
      ...getDefaultAnalyticsQuery(),
      chartType: 'line',
      groupBy: 'timeRecent',
      metric: 'membership-added',
      timeBucket: 'day',
      timeRange: '30d',
    },
  },
]

export type {
  AnalyticsCollectionType,
  AnalyticsCompareBy,
  AnalyticsDateRange,
  AnalyticsFilters,
  AnalyticsGroupBy,
  AnalyticsHistoricalDataQuality,
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
  getCollectionCategoryLabelsForType,
  getCollectionLabelsForType,
  getDefaultAnalyticsQuery,
  getLabelsForGroup,
  getNormalizedCount,
  getSingleSeriesTitle,
  isCollectionScopedGroupBy,
  normalizeAnalyticsQuery,
  parseAnalyticsQuery,
}
