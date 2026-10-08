import { assert, describe, expect, it, vi } from 'vitest' // eslint-disable-line
import { z } from 'zod'

import type { SavedTabsOrganizationCatalogDto } from '@/contexts/saved-tabs/public-api'
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

const organizationCatalog: SavedTabsOrganizationCatalogDto = {
  memberships: [
    { categoryId: 'reading', projectId: 'research', urlId: '1' },
    { projectId: 'inbox', urlId: '2' },
  ],
  projects: [
    {
      categories: [{ id: 'reading', name: 'Reading' }],
      id: 'research',
      name: 'Research',
    },
    {
      categories: [{ id: 'catchup', name: 'Catchup' }],
      id: 'inbox',
      name: 'Inbox',
    },
  ],
  revision: 7,
}

const toolExecutionOptions = {
  context: {},
  messages: [],
  toolCallId: 'organization-tool',
}

const executeOrganizationProposal = async (
  proposal: unknown,
  catalog = organizationCatalog,
  urlRecords = records,
) => {
  const tools = createAiChatTools(urlRecords, 'en', [], catalog)
  const { execute } = tools.proposeSavedTabsAction
  assert.isDefined(execute)
  return Reflect.apply(execute, undefined, [proposal, toolExecutionOptions])
}

describe('organization proposal tools', () => {
  it('bounds membership output by default and exposes remaining pages without mutating the catalog', async () => {
    const catalog = {
      ...organizationCatalog,
      memberships: Array.from({ length: 551 }, (_, index) => ({
        projectId: index % 2 === 0 ? 'research' : 'inbox',
        urlId: `url-${index}`,
      })),
    }
    const before = structuredClone(catalog)
    const { execute } = createAiChatTools(
      records,
      'en',
      [],
      catalog,
    ).listOrganizationTargets
    assert.isDefined(execute)
    const first = await Reflect.apply(execute, undefined, [
      {},
      toolExecutionOptions,
    ])
    expect(first).toMatchObject({
      page: 1,
      pageSize: 50,
      totalItems: 551,
      totalPages: 12,
      hasNextPage: true,
      hasPreviousPage: false,
    })
    expect(first.memberships).toEqual(catalog.memberships.slice(0, 50))
    const next = await Reflect.apply(execute, undefined, [
      { page: 2, pageSize: 200 },
      toolExecutionOptions,
    ])
    expect(next).toMatchObject({
      page: 2,
      pageSize: 200,
      totalItems: 551,
      totalPages: 3,
      hasNextPage: true,
      hasPreviousPage: true,
    })
    expect(next.memberships).toEqual(catalog.memberships.slice(200, 400))
    const capped = await Reflect.apply(execute, undefined, [
      { pageSize: 1000 },
      toolExecutionOptions,
    ])
    expect(capped.memberships).toHaveLength(200)
    expect(capped.pageSize).toBe(200)
    expect(catalog).toEqual(before)
  })

  it('combines URL and project filters and reports empty selections', async () => {
    const catalog = {
      ...organizationCatalog,
      memberships: [
        { projectId: 'research', urlId: '1' },
        { projectId: 'inbox', urlId: '1' },
        { projectId: 'inbox', urlId: '2' },
      ],
    }
    const { execute } = createAiChatTools(
      records,
      'en',
      [],
      catalog,
    ).listOrganizationTargets
    assert.isDefined(execute)
    const filtered = await Reflect.apply(execute, undefined, [
      { urlIds: ['1'], projectId: 'inbox' },
      toolExecutionOptions,
    ])
    expect(filtered.memberships).toEqual([{ projectId: 'inbox', urlId: '1' }])
    expect(filtered).toMatchObject({
      totalItems: 1,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    })
    expect(filtered.projects).toEqual(catalog.projects)
    const urlsOnly = await Reflect.apply(execute, undefined, [
      { urlIds: ['2'] },
      toolExecutionOptions,
    ])
    expect(urlsOnly.memberships).toEqual([{ projectId: 'inbox', urlId: '2' }])
    const empty = await Reflect.apply(execute, undefined, [
      { projectId: 'missing' },
      toolExecutionOptions,
    ])
    expect(empty).toMatchObject({
      memberships: [],
      totalItems: 0,
      totalPages: 0,
      hasNextPage: false,
      hasPreviousPage: false,
    })
  })

  it('exposes operation parameters in the object schema accepted by Ollama', () => {
    const { inputSchema } = createAiChatTools(records).proposeSavedTabsAction
    if (!(inputSchema instanceof z.ZodType)) {
      throw new Error('Expected the tool input Zod schema')
    }
    const schema = z.toJSONSchema(inputSchema)
    expect(schema).toMatchObject({
      type: 'object',
      properties: {
        kind: {
          enum: ['move_urls', 'set_category', 'delete_urls', 'create_project'],
        },
        urlIds: { type: 'array' },
        sourceProjectId: { type: 'string' },
        targetProjectId: { type: 'string' },
        projectId: { type: 'string' },
        name: { type: 'string' },
      },
      required: ['kind'],
    })
    expect(schema).not.toHaveProperty('oneOf')
  })

  it('一覧・検索・月別結果からcanonical URL IDを参照できる', async () => {
    const tools = createAiChatTools(records)
    const pagination = { page: 1, pageSize: 10, sortDirection: 'desc' as const }
    const invocations = [
      { input: pagination, tool: tools.listSavedUrls },
      { input: { ...pagination, query: 'Docs' }, tool: tools.searchSavedUrls },
      {
        input: { ...pagination, month: 3, year: 2026 },
        tool: tools.findUrlsByMonth,
      },
    ]
    await Promise.all(
      invocations.map(async ({ input, tool }) => {
        assert.isDefined(tool.execute)
        const result = await Reflect.apply(tool.execute, undefined, [
          input,
          toolExecutionOptions,
        ])
        expect(result.items).toContainEqual(
          expect.objectContaining({ id: '1', url: records[0]?.url }),
        )
      }),
    )
  })

  it('プロジェクト・カテゴリ・所属IDを読み取り専用の独立した結果に返す', async () => {
    const tools = createAiChatTools(records, 'en', [], organizationCatalog)
    const { execute } = tools.listOrganizationTargets
    assert.isDefined(execute)
    const result = await execute(
      { page: 1, pageSize: 50 },
      toolExecutionOptions,
    )
    expect(result).toStrictEqual({
      hasNextPage: false,
      hasPreviousPage: false,
      memberships: organizationCatalog.memberships,
      page: 1,
      pageSize: 50,
      projects: organizationCatalog.projects,
      totalItems: 2,
      totalPages: 1,
    })
    if (!('projects' in result) || !('memberships' in result)) {
      throw new Error('Expected organization target output')
    }
    expect(result.projects).not.toBe(organizationCatalog.projects)
    expect(result.memberships).not.toBe(organizationCatalog.memberships)
  })

  it('移動先に既存所属があるURLは元の所属情報を失わせず拒否する', async () => {
    const catalog = {
      ...organizationCatalog,
      memberships: [
        ...organizationCatalog.memberships,
        { categoryId: 'catchup', projectId: 'inbox', urlId: '1' },
      ],
    }

    await expect(
      executeOrganizationProposal(
        {
          kind: 'move_urls',
          sourceProjectId: 'research',
          targetProjectId: 'inbox',
          urlIds: ['1'],
        },
        catalog,
      ),
    ).rejects.toThrow('The target project already contains a selected URL')
  })

  it('最大100件の一意な既存URLを提案できる', async () => {
    assert.isDefined(records[0])
    const firstRecord = records[0]
    const urlRecords = Array.from({ length: 100 }, (_, index) => ({
      ...firstRecord,
      id: `url-${index}`,
    }))
    const proposal = {
      kind: 'delete_urls',
      urlIds: urlRecords.map((record) => record.id),
    }
    await expect(
      executeOrganizationProposal(proposal, organizationCatalog, urlRecords),
    ).resolves.toStrictEqual({ proposal })
  })

  it.each([
    {
      kind: 'move_urls',
      sourceProjectId: 'research',
      targetProjectId: 'inbox',
      urlIds: ['1'],
    },
    {
      categoryId: 'reading',
      kind: 'set_category',
      projectId: 'research',
      urlIds: ['1'],
    },
    {
      categoryId: null,
      kind: 'set_category',
      projectId: 'research',
      urlIds: ['1'],
    },
    { kind: 'delete_urls', urlIds: ['1', '2'] },
    { kind: 'create_project', name: 'New collection' },
  ])('有効な $kind は保存状態を変更せず提案だけを返す', async (proposal) => {
    const before = structuredClone({ organizationCatalog, records })
    await expect(executeOrganizationProposal(proposal)).resolves.toStrictEqual({
      proposal,
    })
    expect({ organizationCatalog, records }).toStrictEqual(before)
  })

  it.each([
    { kind: 'delete_urls', urlIds: ['1'], name: 'Unrelated field' },
    { kind: 'move_urls', sourceProjectId: 'research', urlIds: ['1'] },
    { kind: 'set_category', projectId: 'research', urlIds: ['1'] },
    { kind: 'delete_urls', urlIds: ['missing'] },
    { kind: 'delete_urls', urlIds: [] },
    { kind: 'delete_urls', urlIds: ['1', '1'] },
    {
      kind: 'delete_urls',
      urlIds: Array.from({ length: 101 }, (_, index) => `url-${index}`),
    },
    { kind: 'delete_urls', urlIds: ['1'], confirmed: true },
    {
      kind: 'move_urls',
      sourceProjectId: 'missing',
      targetProjectId: 'inbox',
      urlIds: ['1'],
    },
    {
      kind: 'move_urls',
      sourceProjectId: 'research',
      targetProjectId: 'missing',
      urlIds: ['1'],
    },
    {
      kind: 'move_urls',
      sourceProjectId: 'research',
      targetProjectId: 'research',
      urlIds: ['1'],
    },
    {
      kind: 'move_urls',
      sourceProjectId: 'research',
      targetProjectId: 'inbox',
      urlIds: ['2'],
    },
    {
      categoryId: 'reading',
      kind: 'set_category',
      projectId: 'missing',
      urlIds: ['1'],
    },
    {
      categoryId: 'catchup',
      kind: 'set_category',
      projectId: 'research',
      urlIds: ['1'],
    },
    {
      categoryId: 'reading',
      kind: 'set_category',
      projectId: 'research',
      urlIds: ['2'],
    },
    { kind: 'create_project', name: ' research ' },
    { kind: 'create_project', name: ' ' },
    { kind: 'deduplicate_urls', urlIds: ['1'] },
  ])(
    '未知の対象・所属不一致・不正な入力を拒否する: $kind',
    async (proposal) => {
      await expect(executeOrganizationProposal(proposal)).rejects.toThrow(/.+/)
    },
  )
})

describe('createAiChatTools', () => {
  it('保存データ分析ツールでチャート仕様を返す', async () => {
    const tools = createAiChatTools(records)
    assert.isDefined(tools.generateSavedTabsAnalytics)
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
    assert.isDefined(records[0])
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
    assert.isDefined(tools.generateSavedTabsAnalytics)
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

describe('current date and time tool', () => {
  it('returns complete date, time, and timestamp fields', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(now)
    try {
      const { execute } = createAiChatTools(records).getCurrentDateTime
      assert.isDefined(execute)
      const result = await execute(
        {},
        {
          context: {},
          messages: [],
          toolCallId: 'current-time',
        },
      )
      expect(result).toEqual({
        iso8601: new Date(now).toISOString(),
        localDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        localDateTime: expect.stringMatching(
          /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/,
        ),
        localTime: expect.stringMatching(/^\d{2}:\d{2}:\d{2}$/),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        unixMs: now,
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it.each(['year', 'month', 'day', 'hour', 'minute', 'second'])(
    'rejects incomplete formatter output when %s is missing',
    async (missingPart) => {
      const completeParts: Intl.DateTimeFormatPart[] = [
        { type: 'year', value: '2026' },
        { type: 'month', value: '03' },
        { type: 'day', value: '14' },
        { type: 'hour', value: '12' },
        { type: 'minute', value: '30' },
        { type: 'second', value: '45' },
      ]
      const formatter = vi
        .spyOn(Intl.DateTimeFormat.prototype, 'formatToParts')
        .mockReturnValue(
          completeParts.filter(({ type }) => type !== missingPart),
        )
      try {
        const { execute } = createAiChatTools(records).getCurrentDateTime
        assert.isDefined(execute)
        await expect(
          execute(
            {},
            {
              context: {},
              messages: [],
              toolCallId: 'incomplete-current-time',
            },
          ),
        ).rejects.toThrow(
          'Date formatter did not provide all date and time parts',
        )
      } finally {
        formatter.mockRestore()
      }
    },
  )
})
