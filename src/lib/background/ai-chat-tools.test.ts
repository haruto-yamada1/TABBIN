import { describe, expect, it } from 'vitest' // eslint-disable-line

import type { AiSavedUrlRecord } from '@/features/ai-chat/types'
import type { AnalyticsResult } from '@/features/analytics/lib/analytics'

import { createAiChatTools } from './ai-chat-tools'

const now = Date.UTC(2026, 2, 14)

const records: AiSavedUrlRecord[] = [
  {
    id: '1',
    url: 'https://docs.example.com/a',
    title: 'Docs',
    domain: 'docs.example.com',
    savedAt: now,
    savedInTabGroups: ['docs.example.com'],
    savedInProjects: ['Research'],
    subCategories: ['Docs'],
    projectCategories: ['Reading'],
    parentCategories: ['Work'],
  },
  {
    id: '2',
    url: 'https://news.example.net/a',
    title: 'News',
    domain: 'news.example.net',
    savedAt: now,
    savedInTabGroups: [],
    savedInProjects: ['Inbox'],
    subCategories: [],
    projectCategories: ['Catchup'],
    parentCategories: [],
  },
]

describe('createAiChatTools', () => {
  it('保存データ分析ツールでチャート仕様を返す', async () => {
    const tools = createAiChatTools(records)
    const execute = tools.generateSavedTabsAnalytics.execute
    if (!execute) {
      throw new Error('generateSavedTabsAnalytics.execute is not available')
    }

    const result = (await execute(
      {
        chartType: 'bar',
        collectionType: 'all',
        compareBy: 'none',
        filters: {
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
        },
        groupBy: 'domain',
        limit: 8,
        metric: 'first-saved',
        mode: 'both',
        normalize: false,
        sort: 'value-desc',
        stacked: false,
        timeBucket: 'day',
        timeRange: 'all',
      },
      {
        abortSignal: new AbortController().signal,
        context: {},
        toolCallId: 'tool-1',
        messages: [],
      },
    )) as AnalyticsResult

    expect(result.query.groupBy).toBe('domain')
    expect(result.chartSpecs[0]).toMatchObject({
      description: '2 件の保存データを集計',
      title: 'ドメインごとの保存数',
      type: 'bar',
    })
    expect(result.summary).toBe(
      '2 件の保存データから「ドメインごとの保存数」を作成しました。',
    )
  })

  it('分析toolはAI共用savedAtではなく専用metric eventを使う', async () => {
    const analyticsRecords = [
      {
        ...records[0],
        eventId: 'url-1:first-saved',
        metric: 'first-saved' as const,
        savedAt: Date.UTC(2026, 0, 1),
        timestampAccuracy: 'exact' as const,
      },
      {
        ...records[0],
        eventId: 'url-1:last-saved',
        metric: 'last-saved' as const,
        savedAt: Date.UTC(2026, 2, 1),
        timestampAccuracy: 'exact' as const,
      },
    ]
    const tools = createAiChatTools(records, 'ja', analyticsRecords)
    const execute = tools.generateSavedTabsAnalytics.execute
    if (!execute) {
      throw new Error('generateSavedTabsAnalytics.execute is not available')
    }

    const result = (await execute(
      {
        chartType: 'line',
        collectionType: 'all',
        compareBy: 'none',
        filters: {
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
        },
        groupBy: 'timeRecent',
        limit: 8,
        metric: 'last-saved',
        mode: 'both',
        normalize: false,
        sort: 'value-desc',
        stacked: false,
        timeBucket: 'month',
        timeRange: 'all',
      },
      {
        abortSignal: new AbortController().signal,
        context: {},
        messages: [],
        toolCallId: 'tool-metric',
      },
    )) as AnalyticsResult

    expect(result.query).toEqual(
      expect.objectContaining({ metric: 'last-saved', schemaVersion: 2 }),
    )
    expect(result.chartSpecs[0]?.data).toStrictEqual([
      { count: 1, label: '2026-03' },
    ])
  })
})

describe('createAiChatTools (language-aware descriptions)', () => {
  it('language=ja のとき日本語 description を AI SDK tool へ渡す', () => {
    const tools = createAiChatTools(records, 'ja')
    expect(tools.getCurrentDateTime.description).toBe(
      '現在時刻を取得する。今日、今月、何日前、相対日付を扱う前に使う',
    )
    expect(tools.listSavedUrls.description).toBe(
      '現在保存されているタブを保存日時順に一覧化する。page/pageSize/sortDirection を指定できる',
    )
  })

  it('language=en のとき英語 description を AI SDK tool へ渡す', () => {
    const tools = createAiChatTools(records, 'en')
    expect(tools.getCurrentDateTime.description).toBe(
      'Get the current time. Use this before handling today, this month, days ago, or relative dates.',
    )
    expect(tools.listSavedUrls.description).toBe(
      'List currently saved tabs in order of saved time. page/pageSize/sortDirection are configurable.',
    )
  })
})
