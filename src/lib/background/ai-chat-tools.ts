import { tool } from 'ai'
import { z } from 'zod'

import { AI_CHAT_TOOL_DESCRIPTIONS } from '@/constants/aiChatTools'
import { inferUserInterests } from '@/features/ai-chat/lib/inferInterests'
import {
  DEFAULT_SAVED_URL_PAGE,
  DEFAULT_SAVED_URL_PAGE_SIZE,
  MAX_SAVED_URL_PAGE_SIZE,
  findSavedUrlsAddedInMonthPage,
  listSavedUrlPage,
  searchSavedUrlsPage,
} from '@/features/ai-chat/lib/savedUrlQuery'
import type {
  AiSavedUrlPage,
  AiSavedUrlRecord,
  AiSavedUrlToolItem,
} from '@/features/ai-chat/types'
import {
  generateAnalyticsResult,
  getDefaultAnalyticsQuery,
  normalizeAnalyticsQuery,
} from '@/features/analytics/lib/analytics'
import { getMessage } from '@/features/i18n/lib/language'
import type { AppLanguage } from '@/features/i18n/messages'

const paginationSchema = z.object({
  page: z.number().int().min(1).default(DEFAULT_SAVED_URL_PAGE),
  pageSize: z
    .number()
    .int()
    .min(1)
    .max(MAX_SAVED_URL_PAGE_SIZE)
    .default(DEFAULT_SAVED_URL_PAGE_SIZE),
  sortDirection: z.enum(['desc', 'asc']).default('desc'),
})

const TOOL_DATE_TIME_FORMATTER = new Intl.DateTimeFormat('en-US', {
  day: '2-digit',
  hour: '2-digit',
  hour12: false,
  minute: '2-digit',
  month: '2-digit',
  second: '2-digit',
  year: 'numeric',
})

const mapRecordForToolOutput = (
  record: AiSavedUrlRecord,
): AiSavedUrlToolItem => ({
  domain: record.domain,
  parentCategories: record.parentCategories,
  savedAt: record.savedAt,
  savedInProjects: record.savedInProjects,
  title: record.title,
  url: record.url,
})

const mapPageForToolOutput = (
  page: AiSavedUrlPage<AiSavedUrlRecord>,
): AiSavedUrlPage<AiSavedUrlToolItem> => ({
  ...page,
  items: page.items.map(mapRecordForToolOutput),
})

const createCurrentDateTimeOutput = (now = new Date()) => {
  const parts = Object.fromEntries(
    TOOL_DATE_TIME_FORMATTER.formatToParts(now).reduce<[string, string][]>(
      (items, part) => {
        if (part.type !== 'literal') {
          items.push([part.type, part.value])
        }
        return items
      },
      [],
    ),
  ) as Record<string, string>

  const localDate = `${parts.year}-${parts.month}-${parts.day}`
  const localTime = `${parts.hour}:${parts.minute}:${parts.second}`

  return {
    iso8601: now.toISOString(),
    localDate,
    localDateTime: `${localDate} ${localTime}`,
    localTime,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    unixMs: now.getTime(),
  }
}

const createAnalyticsMessages = (language: AppLanguage) => ({
  chartDailySavedTrend: getMessage(language, 'analytics.chart.dailySavedTrend'),
  chartDescriptionAggregated: getMessage(
    language,
    'analytics.chart.descriptionAggregated',
  ),
  chartDescriptionCompareMode: getMessage(
    language,
    'analytics.chart.descriptionCompareMode',
  ),
  chartMonthlySavedTrend: getMessage(
    language,
    'analytics.chart.monthlySavedTrend',
  ),
  chartSavedCountByDomain: getMessage(
    language,
    'analytics.chart.savedCountByDomain',
  ),
  chartSavedCountByParentCategory: getMessage(
    language,
    'analytics.chart.savedCountByParentCategory',
  ),
  chartSavedCountByProject: getMessage(
    language,
    'analytics.chart.savedCountByProject',
  ),
  chartSavedCountByProjectCategory: getMessage(
    language,
    'analytics.chart.savedCountByProjectCategory',
  ),
  chartSavedCountBySubCategory: getMessage(
    language,
    'analytics.chart.savedCountBySubCategory',
  ),
  chartSeriesCustomMode: getMessage(
    language,
    'analytics.chart.seriesCustomMode',
  ),
  chartSeriesDomainMode: getMessage(
    language,
    'analytics.chart.seriesDomainMode',
  ),
  chartSeriesSavedCount: getMessage(
    language,
    'analytics.chart.seriesSavedCount',
  ),
  chartSeriesShare: getMessage(language, 'analytics.chart.seriesShare'),
  chartSummary: getMessage(language, 'analytics.summary'),
  chartWeeklySavedTrend: getMessage(
    language,
    'analytics.chart.weeklySavedTrend',
  ),
  uncategorizedLabel: getMessage(language, 'analytics.uncategorized'),
})

const createAiChatTools = (
  records: AiSavedUrlRecord[],
  language: AppLanguage = 'ja',
) => ({
  findUrlsByMonth: tool({
    description: AI_CHAT_TOOL_DESCRIPTIONS.findUrlsByMonth,
    inputSchema: paginationSchema.extend({
      year: z.number().int(),
      // eslint-disable-next-line eslint/no-magic-numbers
      month: z.number().int().min(1).max(12),
    }),
    // eslint-disable-next-line typescript/require-await
    execute: async (input) =>
      mapPageForToolOutput(findSavedUrlsAddedInMonthPage(records, input)),
  }),
  generateSavedTabsAnalytics: tool({
    description: AI_CHAT_TOOL_DESCRIPTIONS.generateSavedTabsAnalytics,
    inputSchema: z.object({
      chartType: z.enum(['area', 'bar', 'line', 'pie', 'radar']).default('bar'),
      compareBy: z.enum(['mode', 'none']).default('none'),
      customDateRange: z
        .object({
          from: z.string().optional(),
          to: z.string().optional(),
        })
        .optional(),
      filters: z
        .object({
          excludedDomains: z.array(z.string()).default([]),
          excludedParentCategories: z.array(z.string()).default([]),
          excludedProjectCategories: z.array(z.string()).default([]),
          excludedProjects: z.array(z.string()).default([]),
          excludedSubCategories: z.array(z.string()).default([]),
          includedDomains: z.array(z.string()).default([]),
          includedParentCategories: z.array(z.string()).default([]),
          includedProjectCategories: z.array(z.string()).default([]),
          includedProjects: z.array(z.string()).default([]),
          includedSubCategories: z.array(z.string()).default([]),
        })
        .default(getDefaultAnalyticsQuery().filters),
      groupBy: z
        .enum([
          'domain',
          'parentCategory',
          'project',
          'projectCategory',
          'subCategory',
          'time',
          'timeRecent',
          'timeTop',
        ])
        .default('domain'),
      // eslint-disable-next-line eslint/no-magic-numbers
      limit: z.number().int().min(1).max(20).default(8),
      mode: z.enum(['both', 'custom', 'domain']).default('both'),
      normalize: z.boolean().default(false),
      sort: z
        .enum(['label-asc', 'label-desc', 'value-asc', 'value-desc'])
        .default('value-desc'),
      stacked: z.boolean().default(false),
      timeBucket: z.enum(['day', 'month', 'week']).default('day'),
      timeRange: z
        .enum(['30d', '365d', '7d', '90d', 'all', 'custom'])
        .default('all'),
      title: z.string().trim().optional(),
      // eslint-disable-next-line typescript/require-await
    }),
    // eslint-disable-next-line typescript/require-await
    execute: async (input) =>
      generateAnalyticsResult(records, normalizeAnalyticsQuery(input), {
        messages: createAnalyticsMessages(language),
      }),
  }),
  getCurrentDateTime: tool({
    // eslint-disable-next-line typescript/require-await
    description: AI_CHAT_TOOL_DESCRIPTIONS.getCurrentDateTime,
    inputSchema: z.object({}),
    // eslint-disable-next-line typescript/require-await
    execute: async () => createCurrentDateTimeOutput(),
  }),
  // eslint-disable-next-line typescript/require-await
  inferUserInterests: tool({
    description: AI_CHAT_TOOL_DESCRIPTIONS.inferUserInterests,
    inputSchema: z.object({}),
    // eslint-disable-next-line typescript/require-await
    execute: async () => inferUserInterests(records, language),
    // eslint-disable-next-line typescript/require-await
  }),
  listSavedUrls: tool({
    description: AI_CHAT_TOOL_DESCRIPTIONS.listSavedUrls,
    inputSchema: paginationSchema,
    // eslint-disable-next-line typescript/require-await
    execute: async (input) =>
      mapPageForToolOutput(listSavedUrlPage(records, input)),
  }),
  // eslint-disable-next-line typescript/require-await
  searchSavedUrls: tool({
    description: AI_CHAT_TOOL_DESCRIPTIONS.searchSavedUrls,
    inputSchema: paginationSchema.extend({
      query: z.string().min(1),
    }),
    // eslint-disable-next-line typescript/require-await
    execute: async (input) =>
      mapPageForToolOutput(searchSavedUrlsPage(records, input)),
  }),
})

export { createAiChatTools }
