import { describe, expect, it } from 'vitest'

import type { AiSavedUrlRecord } from '@/features/ai-chat/types'

import {
  filterAnalyticsRecords,
  generateAnalyticsResult,
  getAnalyticsPresets,
  getDefaultAnalyticsQuery,
} from './analytics'

const DAY_MS = 24 * 60 * 60 * 1000
const NOW = Date.UTC(2026, 2, 14, 0, 0, 0)

const records: AiSavedUrlRecord[] = [
  {
    id: '1',
    url: 'https://docs.example.com/a',
    title: 'Example Docs',
    domain: 'docs.example.com',
    savedAt: NOW - DAY_MS,
    savedInTabGroups: ['docs.example.com'],
    savedInProjects: ['Research'],
    subCategories: ['Docs'],
    projectCategories: ['Reading'],
    parentCategories: ['Work'],
  },
  {
    id: '2',
    url: 'https://docs.example.com/b',
    title: 'Example Guide',
    domain: 'docs.example.com',
    savedAt: NOW - 3 * DAY_MS,
    savedInTabGroups: ['docs.example.com'],
    savedInProjects: [],
    subCategories: ['Guides'],
    projectCategories: [],
    parentCategories: ['Work'],
  },
  {
    id: '3',
    url: 'https://news.example.net/a',
    title: 'News Entry',
    domain: 'news.example.net',
    savedAt: NOW - 2 * DAY_MS,
    savedInTabGroups: [],
    savedInProjects: ['Inbox'],
    subCategories: [],
    projectCategories: ['Catchup'],
    parentCategories: [],
  },
  {
    id: '4',
    url: 'https://app.example.org/a',
    title: 'App Entry',
    domain: 'app.example.org',
    savedAt: NOW - 8 * DAY_MS,
    savedInTabGroups: ['app.example.org'],
    savedInProjects: ['Inbox'],
    subCategories: ['Ops'],
    projectCategories: ['Review'],
    parentCategories: ['Operations'],
  },
]

describe('analytics', () => {
  it('renders a domain-mode top-domain bar chart', () => {
    const result = generateAnalyticsResult(
      records,
      {
        ...getDefaultAnalyticsQuery(),
        chartType: 'bar',
        groupBy: 'domain',
        mode: 'domain',
        timeRange: '30d',
      },
      {
        now: NOW,
      },
    )

    expect(result.filteredRecordCount).toBe(3)
    expect(result.chartSpecs).toHaveLength(1)
    expect(result.chartSpecs[0]).toMatchObject({
      title: 'Saved count by domain',
      type: 'bar',
      xKey: 'label',
      series: [
        { colorToken: 'chart-1', dataKey: 'count', label: 'Saved count' },
      ],
    })
    expect(result.chartSpecs[0]?.data).toEqual([
      { count: 2, label: 'docs.example.com' },
      { count: 1, label: 'app.example.org' },
    ])
  })

  it('renders a time-series mode comparison chart with multiple series', () => {
    const result = generateAnalyticsResult(
      records,
      {
        ...getDefaultAnalyticsQuery(),
        chartType: 'line',
        compareBy: 'mode',
        groupBy: 'timeRecent',
        mode: 'both',
        timeBucket: 'day',
        timeRange: '30d',
      },
      {
        now: NOW,
      },
    )

    expect(result.chartSpecs[0]).toMatchObject({
      title: 'Daily saved trend',
      type: 'line',
      xKey: 'label',
      series: [
        { colorToken: 'chart-1', dataKey: 'domain', label: 'Domain mode' },
        { colorToken: 'chart-2', dataKey: 'custom', label: 'Custom mode' },
      ],
    })
    expect(result.chartSpecs[0]?.data).toContainEqual({
      custom: 1,
      domain: 1,
      label: '2026-03-13',
    })
    expect(result.chartSpecs[0]?.data).toContainEqual({
      custom: 1,
      domain: 0,
      label: '2026-03-12',
    })
  })

  it('shows only the latest buckets for recent time series', () => {
    const result = generateAnalyticsResult(
      records,
      {
        ...getDefaultAnalyticsQuery(),
        groupBy: 'timeRecent',
        limit: 2,
        mode: 'both',
        timeBucket: 'day',
        timeRange: '30d',
      },
      {
        now: NOW,
      },
    )

    expect(result.chartSpecs[0]?.data).toEqual([
      { count: 1, label: '2026-03-12' },
      { count: 1, label: '2026-03-13' },
    ])
  })

  it('groups day buckets by the provided timezone instead of UTC', () => {
    const options: Parameters<typeof generateAnalyticsResult>[2] & {
      timeZone: string
    } = {
      now: Date.UTC(2026, 2, 1, 0, 0, 0),
      timeZone: 'Asia/Tokyo',
    }

    const result = generateAnalyticsResult(
      [
        {
          id: 'tz-1',
          url: 'https://docs.example.com/tz',
          title: 'Timezone Sensitive',
          domain: 'docs.example.com',
          savedAt: Date.UTC(2026, 1, 28, 15, 30, 0),
          savedInTabGroups: ['docs.example.com'],
          savedInProjects: [],
          subCategories: [],
          projectCategories: [],
          parentCategories: [],
        },
      ],
      {
        ...getDefaultAnalyticsQuery(),
        groupBy: 'timeRecent',
        mode: 'both',
        timeBucket: 'day',
        timeRange: 'all',
      },
      options,
    )

    expect(result.chartSpecs[0]?.data).toEqual([
      { count: 1, label: '2026-03-01' },
    ])
  })

  it('sorts time-series buckets by count before restoring chronological order', () => {
    const result = generateAnalyticsResult(
      [
        ...records,
        {
          id: '5',
          url: 'https://docs.example.com/c',
          title: 'Example Docs 2',
          domain: 'docs.example.com',
          savedAt: NOW - DAY_MS,
          savedInTabGroups: ['docs.example.com'],
          savedInProjects: [],
          subCategories: ['Docs'],
          projectCategories: ['Reading'],
          parentCategories: ['Work'],
        },
        {
          id: '6',
          url: 'https://app.example.org/b',
          title: 'App Entry 2',
          domain: 'app.example.org',
          savedAt: NOW - 8 * DAY_MS,
          savedInTabGroups: ['app.example.org'],
          savedInProjects: [],
          subCategories: ['Ops'],
          projectCategories: ['Review'],
          parentCategories: ['Operations'],
        },
      ],
      {
        ...getDefaultAnalyticsQuery(),
        groupBy: 'timeTop',
        limit: 2,
        mode: 'both',
        timeBucket: 'day',
        timeRange: '30d',
      },
      {
        now: NOW,
      },
    )

    expect(result.chartSpecs[0]?.data).toEqual([
      { count: 2, label: '2026-03-06' },
      { count: 2, label: '2026-03-13' },
    ])
  })

  it('treats the legacy time query as recent time series', () => {
    const result = generateAnalyticsResult(
      records,
      {
        ...getDefaultAnalyticsQuery(),
        groupBy: 'time' as never,
        limit: 1,
        mode: 'both',
        timeBucket: 'day',
        timeRange: '30d',
      },
      {
        now: NOW,
      },
    )

    expect(result.chartSpecs[0]?.data).toEqual([
      { count: 1, label: '2026-03-13' },
    ])
  })

  it('未分類の project/projectCategory と週/月タイトルを生成する', () => {
    const projectResult = generateAnalyticsResult(
      records,
      {
        ...getDefaultAnalyticsQuery(),
        groupBy: 'project',
        mode: 'both',
        timeRange: '30d',
      },
      {
        now: NOW,
      },
    )
    const projectCategoryResult = generateAnalyticsResult(
      records,
      {
        ...getDefaultAnalyticsQuery(),
        groupBy: 'projectCategory',
        mode: 'both',
        timeRange: '30d',
      },
      {
        now: NOW,
      },
    )
    const weeklyResult = generateAnalyticsResult(
      records,
      {
        ...getDefaultAnalyticsQuery(),
        groupBy: 'timeTop',
        mode: 'both',
        timeBucket: 'week',
        timeRange: '30d',
      },
      {
        now: NOW,
      },
    )
    const monthlyResult = generateAnalyticsResult(
      records,
      {
        ...getDefaultAnalyticsQuery(),
        groupBy: 'timeTop',
        mode: 'both',
        timeBucket: 'month',
        timeRange: '30d',
      },
      {
        now: NOW,
      },
    )
    const normalizedEmptyResult = generateAnalyticsResult(
      [],
      {
        ...getDefaultAnalyticsQuery(),
        groupBy: 'domain',
        mode: 'both',
        normalize: true,
      },
      {
        now: NOW,
      },
    )

    expect(projectResult.chartSpecs[0]?.data).toContainEqual({
      count: 1,
      label: 'Uncategorized',
    })
    expect(projectCategoryResult.chartSpecs[0]?.data).toContainEqual({
      count: 1,
      label: 'Uncategorized',
    })
    expect(weeklyResult.chartSpecs[0]?.title).toBe('Weekly saved trend')
    expect(monthlyResult.chartSpecs[0]?.title).toBe('Monthly saved trend')
    expect(normalizedEmptyResult.chartSpecs[0]?.data).toEqual([])
  })

  it('applies include/exclude filters and percent normalization', () => {
    const result = generateAnalyticsResult(
      records,
      {
        ...getDefaultAnalyticsQuery(),
        chartType: 'pie',
        filters: {
          ...getDefaultAnalyticsQuery().filters,
          excludedDomains: ['app.example.org'],
          includedParentCategories: ['Work'],
        },
        groupBy: 'parentCategory',
        mode: 'domain',
        normalize: true,
        timeRange: '30d',
      },
      {
        now: NOW,
      },
    )

    expect(result.filteredRecordCount).toBe(2)
    expect(result.chartSpecs[0]).toMatchObject({
      categoryKey: 'label',
      type: 'pie',
      valueFormat: 'percent',
    })
    expect(result.chartSpecs[0]?.data).toEqual([{ count: 100, label: 'Work' }])
  })

  it('custom mode, label/value sorts, and uncategorized category labels are supported', () => {
    const customResult = generateAnalyticsResult(
      records,
      {
        ...getDefaultAnalyticsQuery(),
        groupBy: 'projectCategory',
        mode: 'custom',
        sort: 'label-desc',
        timeRange: '30d',
      },
      {
        now: NOW,
      },
    )

    expect(customResult.filteredRecordCount).toBe(3)
    expect(customResult.chartSpecs[0]).toMatchObject({
      title: 'Saved count by project category',
    })
    expect(customResult.chartSpecs[0]?.data).toEqual([
      { count: 1, label: 'Review' },
      { count: 1, label: 'Reading' },
      { count: 1, label: 'Catchup' },
    ])

    const subCategoryResult = generateAnalyticsResult(
      records,
      {
        ...getDefaultAnalyticsQuery(),
        groupBy: 'subCategory',
        mode: 'custom',
        sort: 'value-asc',
        timeRange: '30d',
      },
      {
        messages: {
          uncategorizedLabel: 'No category',
        },
        now: NOW,
      },
    )

    expect(subCategoryResult.chartSpecs[0]).toMatchObject({
      title: 'Saved count by sub category',
    })
    expect(subCategoryResult.chartSpecs[0]?.data).toEqual([
      { count: 1, label: 'Docs' },
      { count: 1, label: 'No category' },
      { count: 1, label: 'Ops' },
    ])
  })

  it('renders weekly and monthly bucket titles with timezone-aware labels', () => {
    const weeklyResult = generateAnalyticsResult(
      records,
      {
        ...getDefaultAnalyticsQuery(),
        groupBy: 'timeRecent',
        mode: 'both',
        timeBucket: 'week',
        timeRange: '30d',
      },
      {
        now: NOW,
        timeZone: 'Asia/Tokyo',
      },
    )

    expect(weeklyResult.chartSpecs[0]).toMatchObject({
      title: 'Weekly saved trend',
    })
    expect(weeklyResult.chartSpecs[0]?.data).toEqual([
      { count: 1, label: '2026-03-02' },
      { count: 3, label: '2026-03-09' },
    ])

    const monthlyResult = generateAnalyticsResult(
      records,
      {
        ...getDefaultAnalyticsQuery(),
        groupBy: 'timeRecent',
        mode: 'custom',
        timeBucket: 'month',
        timeRange: '365d',
      },
      {
        now: NOW,
        timeZone: 'Asia/Tokyo',
      },
    )

    expect(monthlyResult.chartSpecs[0]).toMatchObject({
      title: 'Monthly saved trend',
    })
    expect(monthlyResult.chartSpecs[0]?.data).toEqual([
      { count: 3, label: '2026-03' },
    ])
  })

  it('normalizes non-time mode comparison charts and honors custom titles/messages', () => {
    const result = generateAnalyticsResult(
      records,
      {
        ...getDefaultAnalyticsQuery(),
        compareBy: 'mode',
        groupBy: 'domain',
        mode: 'both',
        normalize: true,
        sort: 'value-asc',
        stacked: true,
        timeRange: '30d',
        title: 'Mode share by domain',
      },
      {
        messages: {
          chartDescriptionCompareMode: '{{count}} compared',
          chartSummary: '{{title}} / {{count}}',
        },
        now: NOW,
      },
    )

    expect(result.summary).toBe('Mode share by domain / 4')
    expect(result.chartSpecs[0]).toMatchObject({
      description: '4 compared',
      stacked: true,
      title: 'Mode share by domain',
      valueFormat: 'percent',
    })
    expect(result.chartSpecs[0]?.data).toEqual([
      { custom: 100, domain: 0, label: 'news.example.net' },
      { custom: 50, domain: 50, label: 'app.example.org' },
      { custom: 33, domain: 67, label: 'docs.example.com' },
    ])
  })

  it('空データの normalize は0件として扱い日次タイトルを返す', () => {
    const result = generateAnalyticsResult(
      [],
      {
        ...getDefaultAnalyticsQuery(),
        groupBy: 'timeTop',
        mode: 'both',
        normalize: true,
        timeBucket: 'day',
        timeRange: 'all',
      },
      {
        now: NOW,
      },
    )

    expect(result.filteredRecordCount).toBe(0)
    expect(result.chartSpecs[0]).toMatchObject({
      title: 'Daily saved trend',
      valueFormat: 'percent',
    })
    expect(result.chartSpecs[0]?.data).toEqual([])
  })

  it('defaults to the all-time range', () => {
    expect(getDefaultAnalyticsQuery().timeRange).toBe('all')
  })

  it('filters by a custom date range', () => {
    const result = generateAnalyticsResult(
      records,
      {
        ...getDefaultAnalyticsQuery(),
        customDateRange: {
          from: '2026-03-11',
          to: '2026-03-13',
        },
        groupBy: 'domain',
        mode: 'both',
        timeRange: 'custom',
      },
      {
        now: NOW,
      },
    )

    expect(result.filteredRecordCount).toBe(3)
    expect(result.chartSpecs[0]?.data).toEqual([
      { count: 2, label: 'docs.example.com' },
      { count: 1, label: 'news.example.net' },
    ])
  })

  it('drilldown 向けの共通絞り込みで時間条件とモード条件を適用する', () => {
    const filtered = filterAnalyticsRecords(
      [
        ...records,
        {
          id: '5',
          url: 'https://docs.example.com/old',
          title: 'Old Docs',
          domain: 'docs.example.com',
          savedAt: NOW - 60 * DAY_MS,
          savedInTabGroups: ['docs.example.com'],
          savedInProjects: [],
          subCategories: ['Docs'],
          projectCategories: [],
          parentCategories: ['Work'],
        },
        {
          id: '6',
          url: 'https://docs.example.com/custom-only',
          title: 'Custom Only Docs',
          domain: 'docs.example.com',
          savedAt: NOW - DAY_MS,
          savedInTabGroups: [],
          savedInProjects: ['Research'],
          subCategories: [],
          projectCategories: ['Reading'],
          parentCategories: [],
        },
      ],
      {
        ...getDefaultAnalyticsQuery(),
        filters: {
          ...getDefaultAnalyticsQuery().filters,
          includedDomains: ['docs.example.com'],
        },
        mode: 'domain',
        timeRange: '30d',
      },
      {
        now: NOW,
      },
    )

    expect(filtered).toEqual([
      expect.objectContaining({
        id: '1',
      }),
      expect.objectContaining({
        id: '2',
      }),
    ])
  })

  it('interprets custom date ranges using the local date', () => {
    const localDateRecord: AiSavedUrlRecord = {
      id: 'local-date-1',
      url: 'https://calendar.example.com/a',
      title: 'Local Date Entry',
      domain: 'calendar.example.com',
      savedAt: new Date(2026, 2, 13, 0, 30, 0).getTime(),
      savedInTabGroups: ['calendar.example.com'],
      savedInProjects: [],
      subCategories: [],
      projectCategories: [],
      parentCategories: [],
    }

    const result = generateAnalyticsResult(
      [localDateRecord],
      {
        ...getDefaultAnalyticsQuery(),
        customDateRange: {
          from: '2026-03-13',
          to: '2026-03-13',
        },
        groupBy: 'domain',
        mode: 'domain',
        timeRange: 'custom',
      },
      {
        now: NOW,
      },
    )

    expect(result.filteredRecordCount).toBe(1)
    expect(result.chartSpecs[0]?.data).toEqual([
      { count: 1, label: 'calendar.example.com' },
    ])
  })

  it('returns analytics presets', () => {
    const presets = getAnalyticsPresets()

    expect(presets.length).toBeGreaterThanOrEqual(6)
    expect(presets.map((preset) => preset.id)).toContain('top-domains-30d')
    expect(presets.map((preset) => preset.id)).toContain('mode-comparison-30d')
  })
})
