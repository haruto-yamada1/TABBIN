// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  AiChatConversation,
  AiChatConversationMessage,
} from '@/features/ai-chat/types'
import type { AnalyticsQuery } from '@/features/analytics/lib/analytics'
import type { SavedAnalyticsView } from '@/lib/storage/analytics'
import type { AiChatToolTrace } from '@/types/background'
import type { CustomProject, UserSettings } from '@/types/storage'

vi.mock('@/lib/storage/categories', () => ({
  saveParentCategories: vi.fn(),
}))

vi.mock('@/lib/storage/migration', () => ({
  migrateToUrlsStorage: vi.fn(),
}))

vi.mock('@/lib/storage/settings', () => {
  const defaultSettings: UserSettings = {
    removeTabAfterOpen: true,
    removeTabAfterExternalDrop: true,
    excludePatterns: ['chrome-extension://', 'chrome://'],
    enableCategories: true,
    autoDeletePeriod: 'never',
    showSavedTime: false,
    clickBehavior: 'saveSameDomainTabs',
    excludePinnedTabs: true,
    openUrlInBackground: true,
    openAllInNewWindow: false,
    confirmDeleteAll: false,
    confirmDeleteEach: false,
    colors: {},
    ollamaModel: '',
  }

  return {
    defaultSettings,
    getUserSettings: vi.fn(),
    saveUserSettings: vi.fn(),
  }
})

vi.mock('@/lib/storage/urls', () => ({
  createOrUpdateUrlRecord: vi.fn(),
  createOrUpdateUrlRecordsBatch: vi.fn(),
}))

import { saveParentCategories } from '@/lib/storage/categories'
import { migrateToUrlsStorage } from '@/lib/storage/migration'
import {
  defaultSettings,
  getUserSettings,
  saveUserSettings,
} from '@/lib/storage/settings'
import {
  createOrUpdateUrlRecord,
  createOrUpdateUrlRecordsBatch,
} from '@/lib/storage/urls'

import { downloadAsJson, exportSettings, importSettings } from './import-export'

type StorageStore = Record<string, unknown>

const clone = <T>(value: T): T => {
  if (value === undefined) {
    return value
  }
  return JSON.parse(JSON.stringify(value)) as T
}

const readStorageByKeys = (
  store: StorageStore,
  keys?: string | string[] | Record<string, unknown>,
) => {
  if (keys == null) {
    return clone(store)
  }

  if (typeof keys === 'string') {
    return { [keys]: clone(store[keys]) }
  }

  if (Array.isArray(keys)) {
    const result: Record<string, unknown> = {}
    for (const key of keys) {
      result[key] = clone(store[key])
    }
    return result
  }

  const result: Record<string, unknown> = {}
  for (const [key, fallback] of Object.entries(keys)) {
    result[key] = store[key] === undefined ? clone(fallback) : clone(store[key])
  }
  return result
}

const createChromeMock = (
  initialStore: StorageStore = {},
  options: {
    manifestVersion?: string
    failGet?: boolean
  } = {},
) => {
  const store = clone(initialStore)

  const get = vi.fn(
    async (keys?: string | string[] | Record<string, unknown>) => {
      if (options.failGet) {
        throw new Error('storage get failed')
      }
      return readStorageByKeys(store, keys)
    },
  )

  const set = vi.fn(async (next: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(next)) {
      store[key] = clone(value)
    }
  })

  ;(globalThis as unknown as { chrome: typeof chrome }).chrome = {
    storage: {
      local: { get, set },
    },
    runtime: {
      getManifest: () => ({ version: options.manifestVersion ?? '9.9.9' }),
    },
  } as unknown as typeof chrome

  return { store, get, set }
}

const buildFullUserSettings = (
  override: Partial<UserSettings> = {},
): UserSettings => ({
  removeTabAfterOpen: true,
  removeTabAfterExternalDrop: true,
  excludePatterns: ['existing-pattern'],
  enableCategories: true,
  autoDeletePeriod: 'never',
  showSavedTime: false,
  clickBehavior: 'saveSameDomainTabs',
  excludePinnedTabs: true,
  openUrlInBackground: true,
  openAllInNewWindow: false,
  confirmDeleteAll: false,
  confirmDeleteEach: false,
  colors: {},
  ollamaModel: '',
  ...override,
})

const buildCustomProject = (
  override: Partial<CustomProject> = {},
): CustomProject => ({
  id: 'project-1',
  name: 'Project 1',
  projectKeywords: {
    titleKeywords: [],
    urlKeywords: [],
    domainKeywords: [],
  },
  urlIds: [],
  categories: [],
  createdAt: 1,
  updatedAt: 1,
  ...override,
})

const buildAnalyticsQuery = (
  override: Partial<AnalyticsQuery> = {},
): AnalyticsQuery => ({
  chartType: 'bar',
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
  mode: 'both',
  normalize: false,
  sort: 'value-desc',
  stacked: false,
  timeBucket: 'day',
  timeRange: '30d',
  ...override,
})

const buildAnalyticsView = (
  override: Partial<SavedAnalyticsView> = {},
): SavedAnalyticsView => ({
  createdAt: 1,
  id: 'analytics-view-1',
  name: 'Top Domains',
  query: buildAnalyticsQuery(),
  updatedAt: 2,
  ...override,
})

const buildAiChatToolTrace = (
  override: Partial<AiChatToolTrace> = {},
): AiChatToolTrace => ({
  input: { groupBy: 'domain' },
  output: { count: 1 },
  state: 'output-available',
  title: '保存分析',
  toolCallId: 'tool-call-1',
  toolName: 'generateSavedTabsAnalytics',
  type: 'dynamic-tool',
  ...override,
})

const buildAiChatMessage = (
  override: Partial<AiChatConversationMessage> = {},
): AiChatConversationMessage => ({
  content: '最近の保存タブを分析して',
  id: 'message-1',
  role: 'user',
  ...override,
})

const buildAiChatConversation = (
  override: Partial<AiChatConversation> = {},
): AiChatConversation => ({
  createdAt: 1,
  id: 'conversation-1',
  messages: [
    buildAiChatMessage(),
    buildAiChatMessage({
      attachments: [
        {
          content: 'attachment body',
          filename: 'context.txt',
          kind: 'text',
          mediaType: 'text/plain',
        },
      ],
      charts: [
        {
          data: [{ count: 1, label: 'docs.example.com' }],
          series: [
            {
              colorToken: 'chart-1',
              dataKey: 'count',
              label: '保存数',
            },
          ],
          title: 'ドメイン別保存数',
          type: 'bar',
          xKey: 'label',
        },
      ],
      content: 'docs.example.com が最も多いです',
      id: 'message-2',
      ollamaError: {
        baseUrl: 'http://localhost:11434',
        downloadUrl: 'https://ollama.com/download',
        faqUrl: 'https://example.com/faq',
        kind: 'notInstalledOrNotRunning',
        tagsUrl: 'http://localhost:11434/api/tags',
      },
      reasoning: '保存数が最も多いドメインを集計しました。',
      role: 'assistant',
      toolTraces: [buildAiChatToolTrace()],
    }),
  ],
  title: '保存タブを分析して',
  updatedAt: 2,
  ...override,
})

describe('import-export ユーティリティ', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(migrateToUrlsStorage).mockResolvedValue(undefined)
    vi.mocked(createOrUpdateUrlRecord).mockReset()
    vi.mocked(createOrUpdateUrlRecordsBatch).mockReset()
    vi.mocked(createOrUpdateUrlRecordsBatch).mockResolvedValue(new Map())
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('exportSettings はストレージと設定からバックアップ payload を返す', async () => {
    const userSettings = buildFullUserSettings()
    const parentCategories = [
      { id: 'cat-1', name: 'Work', domains: [], domainNames: [] },
    ]
    const savedTabs = [{ id: 'tab-1', domain: 'https://example.com', urls: [] }]

    createChromeMock({
      customProjectOrder: [],
      customProjects: [],
      parentCategories,
      savedTabs,
    })
    vi.mocked(getUserSettings).mockResolvedValue(userSettings)

    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-02-16T00:00:00.000Z'))

    const result = await exportSettings()

    expect(result).toEqual({
      activeAiChatConversationId: '',
      aiChatConversations: [],
      version: '9.9.9',
      timestamp: '2026-02-16T00:00:00.000Z',
      userSettings,
      parentCategories,
      savedAnalyticsViews: [],
      savedTabs,
      customProjects: [],
      customProjectOrder: [],
      urls: [],
    })
  })

  it('exportSettings は AI チャット履歴を含める', async () => {
    const aiChatConversations = [
      buildAiChatConversation(),
      buildAiChatConversation({
        createdAt: 3,
        id: 'conversation-2',
        messages: [
          buildAiChatMessage({
            content: 'プロジェクト別に見せて',
            id: 'message-3',
            role: 'user',
          }),
        ],
        title: 'プロジェクト別に見せて',
        updatedAt: 4,
      }),
    ]

    createChromeMock({
      activeAiChatConversationId: 'conversation-2',
      aiChatConversations,
      customProjectOrder: [],
      customProjects: [],
      parentCategories: [],
      savedTabs: [
        {
          id: 'project-urlids-group',
          domain: 'https://project-urlids.example.com',
          urlIds: ['imported-project-url', 'current-project-url'],
        },
      ],
      urls: [],
    })
    vi.mocked(getUserSettings).mockResolvedValue(buildFullUserSettings())

    const result = await exportSettings()

    expect(result.aiChatConversations).toEqual(aiChatConversations)
    expect(result.activeAiChatConversationId).toBe('conversation-2')
  })

  it('exportSettings は customProjects と customProjectOrder を含める', async () => {
    createChromeMock({
      customProjectOrder: ['project-2', 'project-1'],
      customProjects: [
        buildCustomProject({
          id: 'project-1',
          name: 'Project 1',
          urlIds: ['url-1'],
          projectKeywords: {
            titleKeywords: ['release'],
            urlKeywords: ['docs'],
            domainKeywords: ['example.com'],
          },
          categories: ['Docs'],
          categoryOrder: ['Docs'],
          urlMetadata: {
            'url-1': {
              category: 'Docs',
              notes: 'memo',
            },
          },
          createdAt: 10,
          updatedAt: 11,
        }),
        buildCustomProject({
          id: 'project-2',
          name: 'Project 2',
          urlIds: ['url-2'],
          categories: [],
          createdAt: 12,
          updatedAt: 13,
        }),
      ],
      parentCategories: [],
      savedTabs: [
        {
          id: 'saved-group',
          domain: 'https://example.com',
          urls: [
            {
              url: 'https://example.com/docs',
              title: 'Docs',
              savedAt: 100,
            },
            {
              url: 'https://example.com/backlog',
              title: 'Backlog',
              savedAt: 101,
            },
            {
              url: 'https://example.com/uncategorized',
              title: 'Uncategorized',
              savedAt: 102,
            },
          ],
        },
      ],
      urls: [
        {
          id: 'url-1',
          url: 'https://example.com/docs',
          title: 'Docs',
          savedAt: 100,
        },
        {
          id: 'url-2',
          url: 'https://example.com/2',
          title: 'Two',
          savedAt: 101,
        },
      ],
    })
    vi.mocked(getUserSettings).mockResolvedValue(buildFullUserSettings())

    const result = await exportSettings()

    expect(result.customProjects).toEqual([
      {
        id: 'project-1',
        name: 'Project 1',
        urls: [
          {
            url: 'https://example.com/docs',
            title: 'Docs',
            notes: 'memo',
            savedAt: 100,
            category: 'Docs',
          },
        ],
        projectKeywords: {
          titleKeywords: ['release'],
          urlKeywords: ['docs'],
          domainKeywords: ['example.com'],
        },
        categories: ['Docs'],
        categoryOrder: ['Docs'],
        createdAt: 10,
        updatedAt: 11,
      },
      {
        id: 'project-2',
        name: 'Project 2',
        urls: [
          {
            url: 'https://example.com/2',
            title: 'Two',
            notes: undefined,
            savedAt: 101,
            category: undefined,
          },
        ],
        projectKeywords: {
          titleKeywords: [],
          urlKeywords: [],
          domainKeywords: [],
        },
        categories: [],
        createdAt: 12,
        updatedAt: 13,
      },
    ])
    expect(result.customProjectOrder).toEqual(['project-2', 'project-1'])
  })

  it('exportSettings は legacy customProjects.urls を不正項目を除いてそのまま出力する', async () => {
    createChromeMock({
      customProjectOrder: ['legacy-project', 'empty-project'],
      customProjects: [
        buildCustomProject({
          id: 'legacy-project',
          name: 'Legacy Project',
          urls: [
            {
              url: 'https://legacy-project.example.com/ok',
              title: 'OK',
              notes: 'memo',
              savedAt: 1,
              category: 'Docs',
            },
            {
              title: 'missing url',
            },
            null,
          ] as CustomProject['urls'],
          urlIds: [],
        }),
        buildCustomProject({
          id: 'empty-project',
          name: 'Empty Project',
          urlIds: [],
        }),
      ],
      parentCategories: [],
      savedTabs: [],
      urls: [],
    })
    vi.mocked(getUserSettings).mockResolvedValue(buildFullUserSettings())

    const result = await exportSettings()

    expect(result.customProjects).toEqual([
      expect.objectContaining({
        id: 'legacy-project',
        urls: [
          {
            url: 'https://legacy-project.example.com/ok',
            title: 'OK',
            notes: 'memo',
            savedAt: 1,
            category: 'Docs',
          },
        ],
      }),
      expect.objectContaining({
        id: 'empty-project',
        urls: [],
      }),
    ])
  })

  it('exportSettings は savedAnalyticsViews を含める', async () => {
    const savedAnalyticsViews = [
      buildAnalyticsView(),
      buildAnalyticsView({
        createdAt: 3,
        id: 'analytics-view-2',
        name: 'Recent Projects',
        query: buildAnalyticsQuery({
          groupBy: 'project',
          timeRange: '7d',
        }),
        updatedAt: 4,
      }),
    ]

    createChromeMock({
      customProjectOrder: [],
      customProjects: [],
      parentCategories: [],
      savedAnalyticsViews,
      savedTabs: [],
      urls: [],
    })
    vi.mocked(getUserSettings).mockResolvedValue(buildFullUserSettings())

    const result = await exportSettings()

    expect(result.savedAnalyticsViews).toEqual(savedAnalyticsViews)
  })

  it('exportSettings の customProjects は importSettings で順序と設定を保持する', async () => {
    createChromeMock({
      customProjectOrder: ['project-2', 'custom-uncategorized', 'project-1'],
      customProjects: [
        buildCustomProject({
          id: 'project-1',
          name: 'Project 1',
          urlIds: ['url-1'],
          projectKeywords: {
            titleKeywords: ['release'],
            urlKeywords: ['docs'],
            domainKeywords: ['example.com'],
          },
          categories: ['Docs'],
          categoryOrder: ['Docs'],
          urlMetadata: {
            'url-1': {
              category: 'Docs',
              notes: 'memo-1',
            },
          },
          createdAt: 10,
          updatedAt: 11,
        }),
        buildCustomProject({
          id: 'project-2',
          name: 'Project 2',
          urlIds: ['url-2'],
          categories: ['Backlog'],
          categoryOrder: ['Backlog'],
          urlMetadata: {
            'url-2': {
              category: 'Backlog',
              notes: 'memo-2',
            },
          },
          createdAt: 12,
          updatedAt: 13,
        }),
        buildCustomProject({
          id: 'custom-uncategorized',
          name: '未分類',
          urlIds: ['url-3'],
          categories: [],
          createdAt: 14,
          updatedAt: 15,
        }),
      ],
      parentCategories: [],
      savedTabs: [
        {
          id: 'project-urlids-group',
          domain: 'https://project-urlids.example.com',
          urlIds: ['imported-project-url', 'current-project-url'],
        },
      ],
      urls: [
        {
          id: 'url-1',
          url: 'https://example.com/docs',
          title: 'Docs',
          savedAt: 100,
        },
        {
          id: 'url-2',
          url: 'https://example.com/backlog',
          title: 'Backlog',
          savedAt: 101,
        },
        {
          id: 'url-3',
          url: 'https://example.com/uncategorized',
          title: 'Uncategorized',
          savedAt: 102,
        },
      ],
    })
    vi.mocked(getUserSettings).mockResolvedValue(buildFullUserSettings())

    const backup = await exportSettings()

    const importedStore = createChromeMock({
      customProjectOrder: [],
      customProjects: [],
      parentCategories: [],
      savedTabs: [],
      urls: [],
    }).store

    vi.mocked(createOrUpdateUrlRecordsBatch).mockResolvedValue(
      new Map([
        [
          'https://example.com/docs',
          {
            id: 'url-1',
            url: 'https://example.com/docs',
            title: 'Docs',
            savedAt: 200,
          },
        ],
        [
          'https://example.com/backlog',
          {
            id: 'url-2',
            url: 'https://example.com/backlog',
            title: 'Backlog',
            savedAt: 201,
          },
        ],
        [
          'https://example.com/uncategorized',
          {
            id: 'url-3',
            url: 'https://example.com/uncategorized',
            title: 'Uncategorized',
            savedAt: 202,
          },
        ],
      ]),
    )

    const result = await importSettings(JSON.stringify(backup), false)

    expect(result.success).toBe(true)
    expect(importedStore.customProjectOrder).toEqual([
      'project-2',
      'custom-uncategorized',
      'project-1',
    ])
    expect(importedStore.customProjects).toEqual([
      buildCustomProject({
        id: 'project-2',
        name: 'Project 2',
        urlIds: [],
        categories: ['Backlog'],
        categoryOrder: ['Backlog'],
        createdAt: 12,
        updatedAt: 13,
      }),
      buildCustomProject({
        id: 'custom-uncategorized',
        name: '未分類',
        urlIds: [],
        categories: [],
        createdAt: 14,
        updatedAt: 15,
      }),
      buildCustomProject({
        id: 'project-1',
        name: 'Project 1',
        urlIds: [],
        projectKeywords: {
          titleKeywords: ['release'],
          urlKeywords: ['docs'],
          domainKeywords: ['example.com'],
        },
        categories: ['Docs'],
        categoryOrder: ['Docs'],
        createdAt: 10,
        updatedAt: 11,
      }),
    ])
  })

  it('importSettings は AI チャット設定を保持する', async () => {
    createChromeMock({
      parentCategories: [],
      savedTabs: [],
      urls: [],
    })
    vi.mocked(getUserSettings).mockResolvedValue(buildFullUserSettings())

    const importedSettings = buildFullUserSettings({
      activeAiSystemPromptId: 'research-system-prompt',
      aiSystemPrompts: [
        {
          createdAt: 0,
          id: 'default-system-prompt',
          name: 'デフォルト',
          template:
            'あなたは TABBIN に保存されたタブの情報だけを根拠に答えるアシスタントです。',
          updatedAt: 0,
        },
        {
          createdAt: 1,
          id: 'research-system-prompt',
          name: 'リサーチ',
          template: '保存タブの比較観点を多めに出してください。',
          updatedAt: 1,
        },
      ],
      ollamaModel: 'llama3.2',
    })

    const result = await importSettings(
      JSON.stringify({
        version: '9.9.9',
        timestamp: '2026-03-07T00:00:00.000Z',
        userSettings: importedSettings,
        parentCategories: [],
        savedTabs: [],
        urls: [],
      }),
      false,
    )

    expect(result.success).toBe(true)
    expect(saveUserSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        activeAiSystemPromptId: 'research-system-prompt',
        aiSystemPrompts: [
          expect.objectContaining({
            id: 'default-system-prompt',
            name: 'デフォルト',
          }),
          expect.objectContaining({
            id: 'research-system-prompt',
            name: 'リサーチ',
          }),
        ],
        ollamaModel: 'llama3.2',
      }),
    )
  })

  it('importSettings は savedAnalyticsViews を id でマージする', async () => {
    const currentAnalyticsView = buildAnalyticsView({
      createdAt: 10,
      id: 'analytics-view-shared',
      name: 'Current View',
      updatedAt: 11,
    })
    const importedAnalyticsView = buildAnalyticsView({
      createdAt: 20,
      id: 'analytics-view-shared',
      name: 'Imported View',
      query: buildAnalyticsQuery({
        chartType: 'line',
        groupBy: 'project',
      }),
      updatedAt: 21,
    })
    const addedAnalyticsView = buildAnalyticsView({
      createdAt: 30,
      id: 'analytics-view-added',
      name: 'Added View',
      query: buildAnalyticsQuery({
        groupBy: 'timeRecent',
        timeBucket: 'week',
      }),
      updatedAt: 31,
    })
    const { store } = createChromeMock({
      customProjectOrder: [],
      customProjects: [],
      parentCategories: [],
      savedAnalyticsViews: [currentAnalyticsView],
      savedTabs: [],
      urls: [],
    })
    vi.mocked(getUserSettings).mockResolvedValue(buildFullUserSettings())

    const result = await importSettings(
      JSON.stringify({
        version: '9.9.9',
        timestamp: '2026-03-14T00:00:00.000Z',
        userSettings: buildFullUserSettings(),
        parentCategories: [],
        savedAnalyticsViews: [importedAnalyticsView, addedAnalyticsView],
        savedTabs: [],
        urls: [],
      }),
      true,
    )

    expect(result.success).toBe(true)
    expect(store.savedAnalyticsViews).toEqual([
      importedAnalyticsView,
      addedAnalyticsView,
    ])
  })

  it('importSettings は savedAnalyticsViews を全置換できる', async () => {
    const importedAnalyticsView = buildAnalyticsView({
      createdAt: 20,
      id: 'analytics-view-imported',
      name: 'Imported View',
      updatedAt: 21,
    })
    const { store } = createChromeMock({
      customProjectOrder: [],
      customProjects: [],
      parentCategories: [],
      savedAnalyticsViews: [buildAnalyticsView()],
      savedTabs: [],
      urls: [],
    })
    vi.mocked(getUserSettings).mockResolvedValue(buildFullUserSettings())

    const result = await importSettings(
      JSON.stringify({
        version: '9.9.9',
        timestamp: '2026-03-14T00:00:00.000Z',
        userSettings: buildFullUserSettings(),
        parentCategories: [],
        savedAnalyticsViews: [importedAnalyticsView],
        savedTabs: [],
        urls: [],
      }),
      false,
    )

    expect(result.success).toBe(true)
    expect(store.savedAnalyticsViews).toEqual([importedAnalyticsView])
  })

  it('importSettings は AI チャット履歴を id でマージする', async () => {
    const currentConversation = buildAiChatConversation({
      createdAt: 10,
      id: 'conversation-shared',
      title: 'Current Conversation',
      updatedAt: 11,
    })
    const importedConversation = buildAiChatConversation({
      createdAt: 20,
      id: 'conversation-shared',
      messages: [
        buildAiChatMessage({
          content: '更新された会話です',
          id: 'message-imported',
          role: 'user',
        }),
      ],
      title: 'Imported Conversation',
      updatedAt: 21,
    })
    const addedConversation = buildAiChatConversation({
      createdAt: 30,
      id: 'conversation-added',
      messages: [
        buildAiChatMessage({
          content: '新しい会話です',
          id: 'message-added',
          role: 'user',
        }),
      ],
      title: 'Added Conversation',
      updatedAt: 31,
    })

    const { store } = createChromeMock({
      activeAiChatConversationId: 'conversation-shared',
      aiChatConversations: [currentConversation],
      customProjectOrder: [],
      customProjects: [],
      parentCategories: [],
      savedTabs: [],
      urls: [],
    })
    vi.mocked(getUserSettings).mockResolvedValue(buildFullUserSettings())

    const result = await importSettings(
      JSON.stringify({
        activeAiChatConversationId: 'conversation-added',
        aiChatConversations: [importedConversation, addedConversation],
        version: '9.9.9',
        timestamp: '2026-03-14T00:00:00.000Z',
        userSettings: buildFullUserSettings(),
        parentCategories: [],
        savedTabs: [],
        urls: [],
      }),
      true,
    )

    expect(result.success).toBe(true)
    expect(store.aiChatConversations).toEqual([
      importedConversation,
      addedConversation,
    ])
    expect(store.activeAiChatConversationId).toBe('conversation-added')
  })

  it('importSettings は無効な active id の AI チャット履歴をマージ時に維持する', async () => {
    const currentConversation = buildAiChatConversation({
      id: 'conversation-current',
    })
    const addedConversation = buildAiChatConversation({
      id: 'conversation-added',
      title: 'Added Conversation',
    })

    const { store } = createChromeMock({
      activeAiChatConversationId: 'conversation-current',
      aiChatConversations: [currentConversation],
      customProjectOrder: [],
      customProjects: [],
      parentCategories: [],
      savedTabs: [],
      urls: [],
    })
    vi.mocked(getUserSettings).mockResolvedValue(buildFullUserSettings())

    const result = await importSettings(
      JSON.stringify({
        activeAiChatConversationId: 'conversation-missing',
        aiChatConversations: [addedConversation],
        version: '9.9.9',
        timestamp: '2026-03-14T00:00:00.000Z',
        userSettings: buildFullUserSettings(),
        parentCategories: [],
        savedTabs: [],
        urls: [],
      }),
      true,
    )

    expect(result.success).toBe(true)
    expect(store.activeAiChatConversationId).toBe('conversation-current')
  })

  it('importSettings は AI チャット履歴を全置換し active id を復元する', async () => {
    const importedConversation = buildAiChatConversation({
      createdAt: 20,
      id: 'conversation-imported',
      title: 'Imported Conversation',
      updatedAt: 21,
    })

    const { store } = createChromeMock({
      activeAiChatConversationId: 'conversation-old',
      aiChatConversations: [
        buildAiChatConversation({ id: 'conversation-old' }),
      ],
      customProjectOrder: [],
      customProjects: [],
      parentCategories: [],
      savedTabs: [],
      urls: [],
    })
    vi.mocked(getUserSettings).mockResolvedValue(buildFullUserSettings())

    const result = await importSettings(
      JSON.stringify({
        activeAiChatConversationId: 'conversation-imported',
        aiChatConversations: [importedConversation],
        version: '9.9.9',
        timestamp: '2026-03-14T00:00:00.000Z',
        userSettings: buildFullUserSettings(),
        parentCategories: [],
        savedTabs: [],
        urls: [],
      }),
      false,
    )

    expect(result.success).toBe(true)
    expect(store.aiChatConversations).toEqual([importedConversation])
    expect(store.activeAiChatConversationId).toBe('conversation-imported')
  })

  it('importSettings は全置換時に無効な active id を先頭会話へフォールバックする', async () => {
    const importedConversation = buildAiChatConversation({
      id: 'conversation-first',
      title: 'First Imported Conversation',
    })

    const { store } = createChromeMock({
      activeAiChatConversationId: 'conversation-old',
      aiChatConversations: [
        buildAiChatConversation({ id: 'conversation-old' }),
      ],
      customProjectOrder: [],
      customProjects: [],
      parentCategories: [],
      savedTabs: [],
      urls: [],
    })
    vi.mocked(getUserSettings).mockResolvedValue(buildFullUserSettings())

    const result = await importSettings(
      JSON.stringify({
        activeAiChatConversationId: 'conversation-missing',
        aiChatConversations: [importedConversation],
        version: '9.9.9',
        timestamp: '2026-03-14T00:00:00.000Z',
        userSettings: buildFullUserSettings(),
        parentCategories: [],
        savedTabs: [],
        urls: [],
      }),
      false,
    )

    expect(result.success).toBe(true)
    expect(store.activeAiChatConversationId).toBe('conversation-first')
  })

  it('移行しやすいバックアップデータ用に urlIds から urls を再構築する', async () => {
    const userSettings = buildFullUserSettings()
    createChromeMock({
      parentCategories: [],
      savedTabs: [
        {
          id: 'group-1',
          domain: 'https://portable.example.com',
          urlIds: ['url-1', 'url-2'],
          urlSubCategories: { 'url-2': 'Docs' },
        },
      ],
      urls: [
        {
          id: 'url-1',
          url: 'https://portable.example.com/home',
          title: 'Home',
          savedAt: 1,
        },
        {
          id: 'url-2',
          url: 'https://portable.example.com/docs',
          title: 'Docs',
          savedAt: 2,
        },
      ],
    })
    vi.mocked(getUserSettings).mockResolvedValue(userSettings)

    const result = await exportSettings()

    expect(result.savedTabs[0]).toEqual(
      expect.objectContaining({
        id: 'group-1',
        domain: 'https://portable.example.com',
        urls: [
          {
            url: 'https://portable.example.com/home',
            title: 'Home',
            savedAt: 1,
            subCategory: undefined,
          },
          {
            url: 'https://portable.example.com/docs',
            title: 'Docs',
            savedAt: 2,
            subCategory: 'Docs',
          },
        ],
      }),
    )
    expect(result.urls).toHaveLength(2)
  })

  it('urlIds を解決できない場合はプレースホルダー URL を追加する', async () => {
    const userSettings = buildFullUserSettings()
    createChromeMock({
      parentCategories: [],
      savedTabs: [
        {
          id: 'missing-group',
          domain: 'https://missing-export.example.com',
          urlIds: ['missing-id-1', 'missing-id-2'],
          urlSubCategories: { 'missing-id-2': 'RecoveredSub' },
          savedAt: 100,
        },
      ],
      urls: [],
    })
    vi.mocked(getUserSettings).mockResolvedValue(userSettings)

    const result = await exportSettings()

    expect(result.savedTabs[0]).toEqual(
      expect.objectContaining({
        id: 'missing-group',
        domain: 'https://missing-export.example.com',
        urls: [
          {
            url: 'https://missing-export.example.com/#tabbin-export-missing-missing-id-1',
            title: '復元データ（元URL欠損）',
            savedAt: 100,
            subCategory: undefined,
          },
          {
            url: 'https://missing-export.example.com/#tabbin-export-missing-missing-id-2',
            title: '復元データ（元URL欠損）',
            savedAt: 101,
            subCategory: 'RecoveredSub',
          },
        ],
      }),
    )
    expect(result.urls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'missing-id-1',
          url: 'https://missing-export.example.com/#tabbin-export-missing-missing-id-1',
        }),
        expect.objectContaining({
          id: 'missing-id-2',
          url: 'https://missing-export.example.com/#tabbin-export-missing-missing-id-2',
        }),
      ]),
    )
  })

  it('tab.urls が既にある場合は不正な legacy url 項目を除外する', async () => {
    const userSettings = buildFullUserSettings()
    createChromeMock({
      parentCategories: [],
      savedTabs: [
        {
          id: 'legacy-group',
          domain: 'https://legacy.example.com',
          urls: [
            { url: 'https://legacy.example.com/ok', title: 'ok' },
            { title: 'missing-url' },
            null,
          ],
        },
      ],
      urls: [],
    })
    vi.mocked(getUserSettings).mockResolvedValue(userSettings)

    const result = await exportSettings()

    expect(result.savedTabs[0]).toEqual(
      expect.objectContaining({
        urls: [{ url: 'https://legacy.example.com/ok', title: 'ok' }],
      }),
    )
  })

  it('再構築した urls に fallback の savedAt/title 分岐を使う', async () => {
    createChromeMock({
      parentCategories: [],
      savedTabs: [
        {
          id: 'placeholder-no-savedat',
          domain: 'https://placeholder-branch.example.com/',
          urlIds: ['missing-no-savedat'],
        },
        {
          id: 'titleless-record-group',
          domain: 'https://titleless-record.example.com',
          urlIds: ['titleless-record-id'],
        },
      ],
      urls: [
        {
          id: 'titleless-record-id',
          url: 'https://titleless-record.example.com/path',
          savedAt: 55,
        },
      ],
    })
    vi.mocked(getUserSettings).mockResolvedValue(buildFullUserSettings())

    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-02-16T00:00:10.000Z'))

    const result = await exportSettings()

    const placeholderGroup = result.savedTabs.find(
      (tab) => tab.id === 'placeholder-no-savedat',
    )
    expect(placeholderGroup?.urls?.[0]).toEqual(
      expect.objectContaining({
        url: 'https://placeholder-branch.example.com/#tabbin-export-missing-missing-no-savedat',
        savedAt: new Date('2026-02-16T00:00:10.000Z').getTime(),
      }),
    )

    const titlelessGroup = result.savedTabs.find(
      (tab) => tab.id === 'titleless-record-group',
    )
    expect(titlelessGroup?.urls?.[0]).toEqual(
      expect.objectContaining({
        url: 'https://titleless-record.example.com/path',
        title: '',
      }),
    )
  })

  it('マージ済みプレースホルダーマップの has() が予期せず true を返しても処理できる', async () => {
    const originalHas = Map.prototype.has
    let hasCallCount = 0
    using hasSpy = vi.spyOn(Map.prototype, 'has')
    hasSpy.mockImplementation((key: unknown) => {
      hasCallCount += 1
      if (hasCallCount === 2 && key === 'forced-skip-placeholder-id') {
        return true
      }
      const context = hasSpy.mock.contexts[hasSpy.mock.calls.length - 1] as Map<
        unknown,
        unknown
      >
      return originalHas.call(context, key)
    })

    createChromeMock({
      parentCategories: [],
      savedTabs: [
        {
          id: 'forced-skip-group',
          domain: 'https://forced-skip.example.com',
          urlIds: ['forced-skip-placeholder-id'],
        },
      ],
      urls: [],
    })
    vi.mocked(getUserSettings).mockResolvedValue(buildFullUserSettings())

    const result = await exportSettings()

    expect(result.savedTabs[0]?.urls).toHaveLength(1)
  })

  it('ストレージアクセス失敗時に正規化されたエラーを投げる', async () => {
    createChromeMock({}, { failGet: true })
    vi.mocked(getUserSettings).mockResolvedValue(buildFullUserSettings())

    await expect(exportSettings()).rejects.toThrow(
      'データのエクスポート中にエラーが発生しました',
    )
  })

  it('manifest の version が空ならデフォルト版にフォールバックする', async () => {
    createChromeMock(
      {
        parentCategories: [],
        savedTabs: [],
      },
      { manifestVersion: '' },
    )
    vi.mocked(getUserSettings).mockResolvedValue(buildFullUserSettings())

    const result = await exportSettings()

    expect(result.version).toBe('1.0.0')
  })

  it('配列でないストレージ payload でも処理できる', async () => {
    createChromeMock({
      parentCategories: { invalid: true },
      savedTabs: { invalid: true },
      urls: { invalid: true },
    })
    vi.mocked(getUserSettings).mockResolvedValue(buildFullUserSettings())

    const result = await exportSettings()

    expect(result.parentCategories).toEqual([])
    expect(result.savedTabs).toEqual([])
    expect(result.urls).toEqual([])
  })

  it('downloadAsJson は一時的なアンカーを作成してクリーンアップする', () => {
    const originalCreateObjectUrl = URL.createObjectURL
    const originalRevokeObjectUrl = URL.revokeObjectURL
    const createObjectUrl = vi.fn(() => 'blob:mock-url')
    const revokeObjectUrl = vi.fn()

    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: createObjectUrl,
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: revokeObjectUrl,
    })

    using clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {})
    using _rafSpy = vi
      .spyOn(globalThis, 'requestAnimationFrame')
      .mockImplementation((callback: FrameRequestCallback) => {
        callback(0)
        return 1
      })

    downloadAsJson(
      {
        version: '1.0.0',
        timestamp: '2026-02-16T00:00:00.000Z',
        userSettings: buildFullUserSettings(),
        parentCategories: [],
        savedTabs: [],
      },
      'backup.json',
    )

    expect(createObjectUrl).toHaveBeenCalledTimes(1)
    expect(clickSpy).toHaveBeenCalledTimes(1)
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:mock-url')
    expect(document.querySelector('a[download="backup.json"]')).toBeNull()

    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: originalCreateObjectUrl,
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: originalRevokeObjectUrl,
    })
  })

  it('importSettings はスキーマ不正な JSON に対してバリデーションエラーを返す', async () => {
    createChromeMock()

    const result = await importSettings(JSON.stringify({ foo: 'bar' }))

    expect(result).toEqual({
      success: false,
      message: 'インポートされたデータの形式が正しくありません',
    })
    expect(saveUserSettings).not.toHaveBeenCalled()
    expect(saveParentCategories).not.toHaveBeenCalled()
  })

  it('importSettings は不正な JSON 形式に対して汎用エラーを返す', async () => {
    createChromeMock()

    const result = await importSettings('{malformed-json')

    expect(result).toEqual({
      success: false,
      message: 'データのインポート中にエラーが発生しました',
    })
  })

  it('バックアップに URL レコードがある場合 urlIds のみのタブを復元する', async () => {
    const { set } = createChromeMock({
      parentCategories: [],
      savedTabs: [],
      urls: [],
    })
    vi.mocked(getUserSettings).mockResolvedValue(buildFullUserSettings())
    vi.mocked(createOrUpdateUrlRecord).mockResolvedValue({
      id: 'restored-url-id',
      url: 'https://restored.example.com/path',
      title: 'Restored',
      savedAt: 1,
    })

    const imported = {
      version: '6.0.0',
      timestamp: '2026-02-16T00:00:00.000Z',
      userSettings: {
        removeTabAfterOpen: true,
        removeTabAfterExternalDrop: true,
        excludePatterns: [],
        enableCategories: true,
        showSavedTime: false,
        clickBehavior: 'saveWindowTabs',
      },
      parentCategories: [],
      savedTabs: [
        {
          id: 'restored-group',
          domain: 'https://restored.example.com',
          urlIds: ['backup-url-1'],
          urlSubCategories: { 'backup-url-1': 'FromBackup' },
        },
      ],
      urls: [
        {
          id: 'backup-url-1',
          url: 'https://restored.example.com/path',
          title: 'Restored',
          savedAt: 10,
        },
      ],
    }

    const result = await importSettings(JSON.stringify(imported), false)

    expect(result.success).toBe(true)
    expect(createOrUpdateUrlRecord).toHaveBeenCalledWith(
      'https://restored.example.com/path',
      'Restored',
      undefined,
      {
        preserveExistingOnDuplicate: true,
      },
    )

    const savedTabsArg = set.mock.calls[0]?.[0]?.savedTabs as Record<
      string,
      unknown
    >[]
    expect(savedTabsArg[0]).toEqual(
      expect.objectContaining({
        id: 'restored-group',
        domain: 'https://restored.example.com',
        urlIds: ['restored-url-id'],
        urlSubCategories: { 'restored-url-id': 'FromBackup' },
      }),
    )
  })

  it('バックアップ URL レコードから空タイトル fallback を使って urlIds のみのタブを復元する', async () => {
    createChromeMock({
      parentCategories: [],
      savedTabs: [],
      urls: [],
    })
    vi.mocked(getUserSettings).mockResolvedValue(buildFullUserSettings())
    vi.mocked(createOrUpdateUrlRecord).mockResolvedValue({
      id: 'restored-titleless-url-id',
      url: 'https://restored-titleless.example.com/path',
      title: '',
      savedAt: 1,
    })

    const imported = {
      version: '6.0.0',
      timestamp: '2026-02-16T00:00:00.000Z',
      userSettings: {
        removeTabAfterOpen: true,
        removeTabAfterExternalDrop: true,
        excludePatterns: [],
        enableCategories: true,
        showSavedTime: false,
        clickBehavior: 'saveWindowTabs',
      },
      parentCategories: [],
      savedTabs: [
        {
          id: 'restored-titleless-group',
          domain: 'https://restored-titleless.example.com',
          urlIds: ['backup-titleless-url-1'],
        },
      ],
      urls: [
        {
          id: 'backup-titleless-url-1',
          url: 'https://restored-titleless.example.com/path',
          savedAt: 10,
        },
      ],
    }

    const result = await importSettings(JSON.stringify(imported), false)

    expect(result.success).toBe(true)
    expect(createOrUpdateUrlRecord).toHaveBeenCalledWith(
      'https://restored-titleless.example.com/path',
      '',
      undefined,
      {
        preserveExistingOnDuplicate: true,
      },
    )
  })

  it('importSettings は URL レコード不足時にプレースホルダー URL を生成する', async () => {
    const { set } = createChromeMock({
      parentCategories: [],
      savedTabs: [],
      urls: [],
    })
    vi.mocked(getUserSettings).mockResolvedValue(buildFullUserSettings())
    vi.mocked(createOrUpdateUrlRecord).mockImplementation(
      async (url: string, title: string) => ({
        id: url.includes('imported-project')
          ? 'imported-project-url'
          : 'current-project-url',
        url,
        title,
        savedAt: 1,
      }),
    )

    const imported = {
      version: '6.0.0',
      timestamp: '2026-02-16T00:00:00.000Z',
      userSettings: {
        removeTabAfterOpen: true,
        removeTabAfterExternalDrop: true,
        excludePatterns: [],
        enableCategories: true,
        showSavedTime: false,
        clickBehavior: 'saveWindowTabs',
      },
      parentCategories: [],
      savedTabs: [
        {
          id: 'missing-group',
          domain: 'https://missing.example.com',
          urlIds: ['missing-url-id'],
        },
      ],
    }

    const result = await importSettings(JSON.stringify(imported), true)

    expect(result.success).toBe(true)
    expect(result.message).toContain('データをマージしました')
    expect(createOrUpdateUrlRecord).not.toHaveBeenCalled()
    expect(saveUserSettings).toHaveBeenCalledTimes(1)
    expect(saveParentCategories).toHaveBeenCalledTimes(1)
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        customProjectOrder: ['custom-uncategorized'],
        customProjects: [
          buildCustomProject({
            id: 'custom-uncategorized',
            name: '未分類',
            urlIds: ['missing-url-id'],
            categories: [],
            createdAt: expect.any(Number),
            updatedAt: expect.any(Number),
          }),
        ],
        savedTabs: [
          {
            id: 'missing-group',
            domain: 'https://missing.example.com',
            urlIds: ['missing-url-id'],
            urlSubCategories: undefined,
            parentCategoryId: undefined,
            categoryKeywords: [],
            subCategories: [],
            savedAt: undefined,
          },
        ],
      }),
    )
    expect(set).toHaveBeenCalledWith({
      urls: [
        expect.objectContaining({
          id: 'missing-url-id',
          title: '復元データ（元URL欠損）',
        }),
      ],
    })
  })

  it('overwrite モードでは URL レコード不足時にプレースホルダー URL を生成する', async () => {
    const { set } = createChromeMock({
      parentCategories: [],
      savedTabs: [],
      urls: [],
    })
    vi.mocked(getUserSettings).mockResolvedValue(buildFullUserSettings())

    const imported = {
      version: '6.0.0',
      timestamp: '2026-02-16T00:00:00.000Z',
      userSettings: {
        removeTabAfterOpen: true,
        removeTabAfterExternalDrop: true,
        excludePatterns: [],
        enableCategories: true,
        showSavedTime: false,
        clickBehavior: 'saveWindowTabs',
      },
      parentCategories: [],
      savedTabs: [
        {
          id: 'missing-overwrite-group',
          domain: 'https://missing-overwrite.example.com',
          urlIds: ['missing-overwrite-url-id'],
        },
      ],
    }

    const result = await importSettings(JSON.stringify(imported), false)

    expect(result.success).toBe(true)
    expect(result.message).toContain('設定とタブデータを置き換えました')
    expect(createOrUpdateUrlRecord).not.toHaveBeenCalled()
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        customProjectOrder: ['custom-uncategorized'],
        customProjects: [
          buildCustomProject({
            id: 'custom-uncategorized',
            name: '未分類',
            urlIds: ['missing-overwrite-url-id'],
            categories: [],
            createdAt: expect.any(Number),
            updatedAt: expect.any(Number),
          }),
        ],
        savedTabs: [
          {
            id: 'missing-overwrite-group',
            domain: 'https://missing-overwrite.example.com',
            urlIds: ['missing-overwrite-url-id'],
            urlSubCategories: undefined,
            parentCategoryId: undefined,
            subCategories: [],
            categoryKeywords: [],
            savedAt: undefined,
          },
        ],
      }),
    )
    expect(set).toHaveBeenCalledWith({
      urls: [
        expect.objectContaining({
          id: 'missing-overwrite-url-id',
          title: '復元データ（元URL欠損）',
        }),
      ],
    })
  })

  it('overwrite モードでは raw urlIds の fallback を保持し、後続で id が既に存在する場合はプレースホルダー生成をスキップする', async () => {
    const existingUrlRecord = {
      id: 'already-resolved-id',
      url: 'https://existing.example.com/current',
      title: 'Current',
      savedAt: 1,
    }
    const lateAvailablePlaceholder = {
      id: 'raw-fallback-id',
      url: 'https://fallback.example.com/#tabbin-restored-raw-fallback-id',
      title: '復元データ（元URL欠損）',
      savedAt: 2,
    }

    const { get, set } = createChromeMock({
      parentCategories: [],
      savedTabs: [],
      urls: [existingUrlRecord],
    })
    vi.mocked(getUserSettings).mockResolvedValue(buildFullUserSettings())

    const isUrlsDefaultRequest = (
      keys?: string | string[] | Record<string, unknown>,
    ): keys is Record<string, unknown> =>
      Boolean(
        keys &&
        typeof keys === 'object' &&
        !Array.isArray(keys) &&
        'urls' in keys,
      )

    const buildUndefinedResponse = (
      keys?: string | string[] | Record<string, unknown>,
    ) => {
      if (keys == null) {
        return {}
      }
      if (typeof keys === 'string') {
        return { [keys]: undefined }
      }
      if (Array.isArray(keys)) {
        return Object.fromEntries(keys.map((key) => [key, undefined]))
      }
      return Object.fromEntries(Object.entries(keys))
    }

    let urlsGetCount = 0
    get.mockImplementation(
      async (keys?: string | string[] | Record<string, unknown>) => {
        if (isUrlsDefaultRequest(keys)) {
          urlsGetCount += 1
          if (urlsGetCount === 1) {
            return { urls: [existingUrlRecord] }
          }

          return { urls: [existingUrlRecord, lateAvailablePlaceholder] }
        }

        return buildUndefinedResponse(keys)
      },
    )

    const imported = {
      version: '6.0.0',
      timestamp: '2026-02-16T00:00:00.000Z',
      userSettings: {
        removeTabAfterOpen: true,
        removeTabAfterExternalDrop: true,
        excludePatterns: [],
        enableCategories: true,
        showSavedTime: false,
        clickBehavior: 'saveWindowTabs',
      },
      parentCategories: [],
      savedTabs: [
        {
          id: 'raw-fallback-group',
          domain: 'https://fallback.example.com/',
          urlIds: ['raw-fallback-id', 'raw-fallback-id'],
          urlSubCategories: {
            'raw-fallback-id': 'KeepMe',
            'not-in-urlids': 'DropMe',
          },
        },
      ],
    }

    const result = await importSettings(JSON.stringify(imported), false)

    expect(result.success).toBe(true)
    expect(result.message).toContain('設定とタブデータを置き換えました')
    expect(createOrUpdateUrlRecord).not.toHaveBeenCalled()

    const savedTabsArg = set.mock.calls[0]?.[0]?.savedTabs as Record<
      string,
      unknown
    >[]
    expect(savedTabsArg[0]).toEqual(
      expect.objectContaining({
        id: 'raw-fallback-group',
        domain: 'https://fallback.example.com/',
        urlIds: ['raw-fallback-id'],
        urlSubCategories: { 'raw-fallback-id': 'KeepMe' },
      }),
    )

    expect(
      set.mock.calls.some(([payload]) =>
        Boolean(
          (payload as Record<string, unknown>)?.urls &&
          Array.isArray((payload as Record<string, unknown>).urls) &&
          ((payload as Record<string, unknown>).urls as unknown[]).some(
            (record) =>
              typeof record === 'object' &&
              record !== null &&
              (record as { id?: string }).id === 'raw-fallback-id',
          ),
        ),
      ),
    ).toBe(false)
  })

  it('overwrite モードでは urls/urlIds を持たないタブを空グループとして保持する', async () => {
    const { set } = createChromeMock({
      parentCategories: [],
      savedTabs: [],
      urls: [],
    })
    vi.mocked(getUserSettings).mockResolvedValue(buildFullUserSettings())

    const imported = {
      version: '6.1.0',
      timestamp: '2026-02-16T00:00:00.000Z',
      userSettings: {
        removeTabAfterOpen: true,
        removeTabAfterExternalDrop: true,
        excludePatterns: [],
        enableCategories: true,
        showSavedTime: false,
        clickBehavior: 'saveWindowTabs',
      },
      parentCategories: [],
      savedTabs: [
        {
          id: 'empty-group',
          domain: 'https://empty.example.com',
        },
      ],
    }

    const result = await importSettings(JSON.stringify(imported), false)

    expect(result.success).toBe(true)
    expect(createOrUpdateUrlRecord).not.toHaveBeenCalled()

    const savedTabsArg = set.mock.calls[0]?.[0]?.savedTabs as Record<
      string,
      unknown
    >[]
    expect(savedTabsArg[0]).toEqual(
      expect.objectContaining({
        id: 'empty-group',
        domain: 'https://empty.example.com',
        urlIds: [],
        urlSubCategories: undefined,
        subCategories: [],
        categoryKeywords: [],
      }),
    )
  })

  it('overwrite モードでは現在の urls ストレージが配列でなくてもプレースホルダーを生成する', async () => {
    const { set } = createChromeMock({
      parentCategories: [],
      savedTabs: [],
      urls: { invalid: true },
    })
    vi.mocked(getUserSettings).mockResolvedValue(buildFullUserSettings())

    const imported = {
      version: '6.2.0',
      timestamp: '2026-02-16T00:00:00.000Z',
      userSettings: {
        removeTabAfterOpen: true,
        removeTabAfterExternalDrop: true,
        excludePatterns: [],
        enableCategories: true,
        showSavedTime: false,
        clickBehavior: 'saveWindowTabs',
      },
      parentCategories: [],
      savedTabs: [
        {
          id: 'invalid-current-urls-group',
          domain: 'https://invalid-current-urls.example.com',
          urlIds: ['invalid-current-urls-id'],
        },
      ],
    }

    const result = await importSettings(JSON.stringify(imported), false)

    expect(result.success).toBe(true)
    expect(result.message).toContain('設定とタブデータを置き換えました')
    expect(set).toHaveBeenCalledWith({
      urls: [
        expect.objectContaining({
          id: 'invalid-current-urls-id',
          title: '復元データ（元URL欠損）',
        }),
      ],
    })
  })

  it('merge モードでは配列でない現在ストレージを安全に処理する', async () => {
    const { set } = createChromeMock({
      parentCategories: { invalid: true },
      savedTabs: { invalid: true },
    })
    vi.mocked(getUserSettings).mockResolvedValue(buildFullUserSettings())
    vi.mocked(createOrUpdateUrlRecord).mockResolvedValue({
      id: 'new-url-id',
      url: 'https://safe.example.com/path',
      title: '',
      savedAt: 1,
    })

    const imported = {
      version: '1.0.0',
      timestamp: '2026-02-16T00:00:00.000Z',
      userSettings: {
        removeTabAfterOpen: true,
        removeTabAfterExternalDrop: true,
        excludePatterns: ['safe'],
        enableCategories: true,
        showSavedTime: false,
        clickBehavior: 'saveWindowTabs',
      },
      parentCategories: [
        {
          id: 'safe-cat',
          name: 'Safe',
          domains: [],
          domainNames: [],
        },
      ],
      savedTabs: [
        {
          id: 'safe-group',
          domain: 'https://safe.example.com',
          urls: [{ url: 'https://safe.example.com/path' }],
        },
      ],
    }

    const result = await importSettings(JSON.stringify(imported), true)

    expect(result.success).toBe(true)
    expect(result.message).toContain('1個のカテゴリと1個のドメイン')
    expect(saveParentCategories).toHaveBeenCalledWith([
      {
        id: 'safe-cat',
        name: 'Safe',
        domains: [],
        domainNames: [],
      },
    ])
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        customProjectOrder: ['custom-uncategorized'],
        customProjects: [
          buildCustomProject({
            id: 'custom-uncategorized',
            name: '未分類',
            urlIds: ['new-url-id'],
            categories: [],
            createdAt: expect.any(Number),
            updatedAt: expect.any(Number),
          }),
        ],
        savedTabs: [
          {
            id: 'safe-group',
            domain: 'https://safe.example.com',
            urlIds: ['new-url-id'],
            urlSubCategories: undefined,
            parentCategoryId: undefined,
            categoryKeywords: [],
            subCategories: [],
            savedAt: undefined,
          },
        ],
      }),
    )
  })

  it('merge モードではインポート値が省略された場合に既存の parent/savedAt を保持する', async () => {
    const { set } = createChromeMock({
      parentCategories: [],
      savedTabs: [
        {
          id: 'existing-group',
          domain: 'https://existing-fallback.example.com',
          parentCategoryId: 'parent-old',
          savedAt: 777,
        },
      ],
    })
    vi.mocked(getUserSettings).mockResolvedValue(buildFullUserSettings())
    vi.mocked(createOrUpdateUrlRecord).mockResolvedValue({
      id: 'new-id',
      url: 'https://existing-fallback.example.com/path',
      title: '',
      savedAt: 1,
    })

    const imported = {
      version: '1.0.0',
      timestamp: '2026-02-16T00:00:00.000Z',
      userSettings: {
        removeTabAfterOpen: true,
        removeTabAfterExternalDrop: true,
        excludePatterns: ['p'],
        enableCategories: true,
        showSavedTime: false,
        clickBehavior: 'saveWindowTabs',
      },
      parentCategories: [],
      savedTabs: [
        {
          id: 'imported-existing',
          domain: 'https://existing-fallback.example.com',
          urls: [{ url: 'https://existing-fallback.example.com/path' }],
        },
      ],
    }

    const result = await importSettings(JSON.stringify(imported), true)

    expect(result.success).toBe(true)

    const savedTabsArg = set.mock.calls[0]?.[0]?.savedTabs as Record<
      string,
      unknown
    >[]
    expect(savedTabsArg[0]).toEqual(
      expect.objectContaining({
        id: 'existing-group',
        domain: 'https://existing-fallback.example.com',
        parentCategoryId: 'parent-old',
        savedAt: 777,
        urlIds: ['new-id'],
        urlSubCategories: undefined,
        categoryKeywords: [],
        subCategories: [],
      }),
    )
  })

  it('merge モードでは重複 URL ID を避けつつ混在した subcategory/keyword payload を正規化する', async () => {
    const { set } = createChromeMock({
      parentCategories: [],
      savedTabs: [
        {
          id: 'dup-group',
          domain: 'https://dup.example.com',
          urlIds: ['dup-id'],
          urlSubCategories: {},
          categoryKeywords: [{ categoryName: 'news', keywords: ['old'] }],
          subCategories: [{ name: 'ObjA' }, { name: 'ObjA' }, 123, 'StrA'],
        },
      ],
    })
    vi.mocked(getUserSettings).mockResolvedValue(buildFullUserSettings())
    vi.mocked(createOrUpdateUrlRecord).mockResolvedValue({
      id: 'dup-id',
      url: 'https://dup.example.com/path',
      title: '',
      savedAt: 1,
    })

    const imported = {
      version: '1.0.0',
      timestamp: '2026-02-16T00:00:00.000Z',
      userSettings: {
        removeTabAfterOpen: true,
        removeTabAfterExternalDrop: true,
        excludePatterns: [],
        enableCategories: true,
        showSavedTime: false,
        clickBehavior: 'saveWindowTabs',
      },
      parentCategories: [],
      savedTabs: [
        {
          id: 'dup-group-imported',
          domain: 'https://dup.example.com',
          urls: [{ url: 'https://dup.example.com/path' }],
          categoryKeywords: [
            { categoryName: 'news', keywords: 'not-array' },
            { categoryName: 'news', keywords: ['fresh'] },
            { categoryName: 'extra', keywords: ['x'] },
          ],
          subCategories: [
            { name: 'ObjA' },
            { name: 'ObjB' },
            999,
            'StrB',
            'StrB',
          ],
          savedAt: 1000,
        },
      ],
    }

    const result = await importSettings(JSON.stringify(imported), true)

    expect(result.success).toBe(true)
    const savedTabsArg = set.mock.calls[0]?.[0]?.savedTabs as Record<
      string,
      unknown
    >[]
    expect(savedTabsArg[0]).toEqual(
      expect.objectContaining({
        urlIds: ['dup-id'],
        subCategories: ['ObjA', 'StrA', 'ObjB', 'StrB'],
        categoryKeywords: [
          { categoryName: 'news', keywords: ['old', 'fresh'] },
          { categoryName: 'extra', keywords: ['x'] },
        ],
      }),
    )
  })

  it('merge モードでは新規ドメインの keyword と subcategory の境界ケースを正規化する', async () => {
    const { set } = createChromeMock({
      parentCategories: [],
      savedTabs: [],
    })
    vi.mocked(getUserSettings).mockResolvedValue(buildFullUserSettings())
    vi.mocked(createOrUpdateUrlRecord).mockResolvedValue({
      id: 'new-domain-edge',
      url: 'https://new-edge.example.com',
      title: '',
      savedAt: 1,
    })

    const imported = {
      version: '1.0.0',
      timestamp: '2026-02-16T00:00:00.000Z',
      userSettings: {
        removeTabAfterOpen: true,
        removeTabAfterExternalDrop: true,
        excludePatterns: [],
        enableCategories: true,
        showSavedTime: false,
        clickBehavior: 'saveWindowTabs',
      },
      parentCategories: [],
      savedTabs: [
        {
          id: 'new-domain-edge-group',
          domain: 'https://new-edge.example.com',
          urls: [{ url: 'https://new-edge.example.com' }],
          categoryKeywords: [{ categoryName: 'edge', keywords: 'not-array' }],
          subCategories: [{ name: 'Obj' }, { name: 'Obj' }, 'Str', 'Str', 0],
        },
      ],
    }

    const result = await importSettings(JSON.stringify(imported), true)

    expect(result.success).toBe(true)
    const savedTabsArg = set.mock.calls[0]?.[0]?.savedTabs as Record<
      string,
      unknown
    >[]
    expect(savedTabsArg[0]).toEqual(
      expect.objectContaining({
        categoryKeywords: [{ categoryName: 'edge', keywords: [] }],
        subCategories: ['Obj', 'Str'],
      }),
    )
  })

  it('merge モードでは子カテゴリ順序を既存優先で復元する', async () => {
    const { set } = createChromeMock({
      parentCategories: [],
      savedTabs: [
        {
          id: 'ordered-group',
          domain: 'https://ordered.example.com',
          urlIds: ['ordered-url-id'],
          subCategories: ['ExistingA', 'ExistingB'],
          subCategoryOrder: ['ExistingA', 'ExistingB'],
          subCategoryOrderWithUncategorized: [
            'ExistingA',
            '__uncategorized',
            'ExistingB',
          ],
        },
      ],
    })
    vi.mocked(getUserSettings).mockResolvedValue(buildFullUserSettings())
    vi.mocked(createOrUpdateUrlRecord).mockResolvedValue({
      id: 'ordered-url-id',
      url: 'https://ordered.example.com/path',
      title: '',
      savedAt: 1,
    })

    const imported = {
      version: '1.0.0',
      timestamp: '2026-02-16T00:00:00.000Z',
      userSettings: {
        removeTabAfterOpen: true,
        removeTabAfterExternalDrop: true,
        excludePatterns: [],
        enableCategories: true,
        showSavedTime: false,
        clickBehavior: 'saveWindowTabs',
      },
      parentCategories: [],
      savedTabs: [
        {
          id: 'ordered-group-imported',
          domain: 'https://ordered.example.com',
          urls: [{ url: 'https://ordered.example.com/path' }],
          subCategories: ['ImportedB', 'ExistingB', 'ImportedA'],
          subCategoryOrder: ['ImportedB', 'ExistingB', 'ImportedA'],
          subCategoryOrderWithUncategorized: [
            'ImportedB',
            '__uncategorized',
            'ExistingB',
            'ImportedA',
          ],
        },
      ],
    }

    const result = await importSettings(JSON.stringify(imported), true)

    expect(result.success).toBe(true)
    const savedTabsArg = set.mock.calls[0]?.[0]?.savedTabs as Record<
      string,
      unknown
    >[]
    expect(savedTabsArg[0]).toEqual(
      expect.objectContaining({
        subCategories: ['ExistingA', 'ExistingB', 'ImportedB', 'ImportedA'],
        subCategoryOrder: ['ExistingA', 'ExistingB', 'ImportedB', 'ImportedA'],
        subCategoryOrderWithUncategorized: [
          'ExistingA',
          '__uncategorized',
          'ExistingB',
          'ImportedB',
          'ImportedA',
        ],
      }),
    )
  })

  it('merge モードでは has() 後の keyword map 参照が undefined を返しても処理できる', async () => {
    const originalGet = Map.prototype.get
    using getSpy = vi.spyOn(Map.prototype, 'get')
    getSpy.mockImplementation((key: unknown) => {
      if (key === 'force-undefined-existing-item') {
        return
      }
      const context = getSpy.mock.contexts[getSpy.mock.calls.length - 1] as Map<
        unknown,
        unknown
      >
      return originalGet.call(context, key)
    })

    const { set } = createChromeMock({
      parentCategories: [],
      savedTabs: [
        {
          id: 'force-group',
          domain: 'https://force.example.com',
          categoryKeywords: [
            {
              categoryName: 'force-undefined-existing-item',
              keywords: ['keep'],
            },
          ],
        },
      ],
    })
    vi.mocked(getUserSettings).mockResolvedValue(buildFullUserSettings())
    vi.mocked(createOrUpdateUrlRecord).mockResolvedValue({
      id: 'force-url',
      url: 'https://force.example.com',
      title: '',
      savedAt: 1,
    })

    const imported = {
      version: '1.0.0',
      timestamp: '2026-02-16T00:00:00.000Z',
      userSettings: {
        removeTabAfterOpen: true,
        removeTabAfterExternalDrop: true,
        excludePatterns: [],
        enableCategories: true,
        showSavedTime: false,
        clickBehavior: 'saveWindowTabs',
      },
      parentCategories: [],
      savedTabs: [
        {
          id: 'force-group-imported',
          domain: 'https://force.example.com',
          urls: [{ url: 'https://force.example.com' }],
          categoryKeywords: [
            {
              categoryName: 'force-undefined-existing-item',
              keywords: ['new'],
            },
          ],
        },
      ],
    }

    const result = await importSettings(JSON.stringify(imported), true)

    expect(result.success).toBe(true)
    expect(set).toHaveBeenCalled()
  })

  it('importSettings は merge モードで既存データとインポートデータを結合する', async () => {
    const currentSettings = buildFullUserSettings({
      excludePatterns: ['existing-pattern'],
      showSavedTime: false,
    })

    const currentCategories = [
      {
        id: 'cat-1',
        name: 'Current Category',
        domains: ['group-1'],
        domainNames: ['https://existing.example.com'],
      },
    ]

    const currentTabs = [
      {
        id: 'group-1',
        domain: 'https://existing.example.com',
        urlIds: ['url-existing'],
        urlSubCategories: { 'url-existing': 'OldSub' },
        parentCategoryId: 'cat-1',
        categoryKeywords: [{ categoryName: 'news', keywords: ['old'] }],
        subCategories: [
          { name: 'ExistingObjSub' },
          'ExistingStrSub',
          'ExistingStrSub',
        ],
        savedAt: 100,
      },
    ]

    const { set } = createChromeMock({
      parentCategories: currentCategories,
      savedTabs: currentTabs,
    })
    vi.mocked(getUserSettings).mockResolvedValue(currentSettings)
    vi.mocked(createOrUpdateUrlRecord)
      .mockResolvedValueOnce({
        id: 'url-imported-existing',
        url: 'https://existing.example.com/new',
        title: 'Existing New',
        savedAt: 1,
      })
      .mockResolvedValueOnce({
        id: 'url-imported-new-domain',
        url: 'https://new.example.com/path',
        title: 'New Domain',
        savedAt: 2,
      })

    const imported = {
      version: '2.0.0',
      timestamp: '2026-02-16T00:00:00.000Z',
      userSettings: {
        removeTabAfterOpen: false,
        removeTabAfterExternalDrop: true,
        excludePatterns: ['existing-pattern', 'new-pattern'],
        enableCategories: true,
        showSavedTime: true,
        autoDeletePeriod: '7days',
        clickBehavior: 'saveWindowTabs',
      },
      parentCategories: [
        {
          id: 'cat-1',
          name: 'Merged Category',
          domains: ['group-2'],
          domainNames: ['https://imported.example.com'],
          keywords: ['ignore-this'],
        },
        {
          id: 'cat-2',
          name: 'New Category',
          domains: [],
          domainNames: [],
          keywords: ['ignore-this-too'],
        },
      ],
      savedTabs: [
        {
          id: 'imported-existing-group',
          domain: 'https://existing.example.com',
          urls: [
            {
              url: 'https://existing.example.com/new',
              title: 'Existing New',
              subCategory: 'ImportedSub',
            },
          ],
          parentCategoryId: 'cat-2',
          subCategories: [
            { name: 'ImportedObjSub' },
            { name: 'ExistingObjSub' },
            'ImportedStringSub',
          ],
          categoryKeywords: [
            { categoryName: 'news', keywords: ['new'] },
            { categoryName: 'tech', keywords: ['ai'] },
          ],
          savedAt: 50,
        },
        {
          id: 'imported-new-group',
          domain: 'https://new.example.com',
          urls: [
            {
              url: 'https://new.example.com/path',
              title: 'New Domain',
            },
          ],
          subCategories: [
            { name: 'ProjectObj' },
            { name: 'ProjectObj' },
            'ProjectStr',
          ],
          categoryKeywords: [{ categoryName: 'topic', keywords: ['keyword'] }],
          savedAt: 200,
        },
      ],
    }

    const result = await importSettings(JSON.stringify(imported), true)

    expect(result.success).toBe(true)
    expect(result.message).toContain('1個のカテゴリと1個のドメイン')
    expect(migrateToUrlsStorage).toHaveBeenCalledTimes(1)

    expect(saveUserSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        excludePatterns: ['existing-pattern', 'new-pattern'],
        clickBehavior: 'saveWindowTabs',
        showSavedTime: true,
      }),
    )

    const savedCategoryArg = vi.mocked(saveParentCategories).mock.calls[0]?.[0]
    expect(savedCategoryArg).toHaveLength(2)
    expect(savedCategoryArg).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'cat-1',
          name: 'Merged Category',
          domains: ['group-1', 'group-2'],
          domainNames: [
            'https://existing.example.com',
            'https://imported.example.com',
          ],
        }),
        expect.objectContaining({
          id: 'cat-2',
          name: 'New Category',
        }),
      ]),
    )

    const savedTabsArg = set.mock.calls[0]?.[0]?.savedTabs as Record<
      string,
      unknown
    >[]
    expect(savedTabsArg).toHaveLength(2)

    const mergedExisting = savedTabsArg.find(
      (tab) => tab.domain === 'https://existing.example.com',
    )
    expect(mergedExisting).toEqual(
      expect.objectContaining({
        id: 'group-1',
        domain: 'https://existing.example.com',
        parentCategoryId: 'cat-2',
        savedAt: 50,
      }),
    )
    expect(mergedExisting?.urlIds).toEqual([
      'url-existing',
      'url-imported-existing',
    ])
    expect(mergedExisting?.urlSubCategories).toEqual({
      'url-existing': 'OldSub',
      'url-imported-existing': 'ImportedSub',
    })
    expect(mergedExisting?.subCategories).toEqual([
      'ExistingObjSub',
      'ExistingStrSub',
      'ImportedObjSub',
      'ImportedStringSub',
    ])
    expect(mergedExisting?.categoryKeywords).toEqual([
      { categoryName: 'news', keywords: ['old', 'new'] },
      { categoryName: 'tech', keywords: ['ai'] },
    ])

    const mergedNewDomain = savedTabsArg.find(
      (tab) => tab.domain === 'https://new.example.com',
    )
    expect(mergedNewDomain).toEqual(
      expect.objectContaining({
        id: 'imported-new-group',
        domain: 'https://new.example.com',
        urlIds: ['url-imported-new-domain'],
        subCategories: ['ProjectObj', 'ProjectStr'],
        categoryKeywords: [{ categoryName: 'topic', keywords: ['keyword'] }],
      }),
    )
  })

  it('importSettings は merge モードで customProjects を既存順維持で追加する', async () => {
    const { store } = createChromeMock({
      customProjectOrder: ['current-project'],
      customProjects: [
        buildCustomProject({
          id: 'current-project',
          name: 'Current Project',
          urlIds: ['url-current'],
          categories: ['Current'],
          createdAt: 1,
          updatedAt: 2,
        }),
      ],
      parentCategories: [],
      savedTabs: [
        {
          id: 'current-group',
          domain: 'https://current.example.com',
          urlIds: ['url-current'],
        },
      ],
      urls: [
        {
          id: 'url-current',
          url: 'https://current.example.com/1',
          title: 'Current 1',
          savedAt: 1,
        },
      ],
    })
    vi.mocked(getUserSettings).mockResolvedValue(buildFullUserSettings())
    vi.mocked(createOrUpdateUrlRecordsBatch).mockResolvedValue(
      new Map([
        [
          'https://duplicate.example.com/1',
          {
            id: 'url-duplicate-project-1',
            url: 'https://duplicate.example.com/1',
            title: 'Duplicate 1',
            savedAt: 9,
          },
        ],
        [
          'https://imported.example.com/1',
          {
            id: 'url-imported-project-1',
            url: 'https://imported.example.com/1',
            title: 'Imported 1',
            savedAt: 10,
          },
        ],
      ]),
    )

    const imported = {
      version: '4.0.0',
      timestamp: '2026-03-08T00:00:00.000Z',
      userSettings: {
        removeTabAfterOpen: true,
        removeTabAfterExternalDrop: true,
        excludePatterns: [],
        enableCategories: true,
        showSavedTime: false,
        clickBehavior: 'saveWindowTabs',
      },
      customProjects: [
        buildCustomProject({
          id: 'current-project',
          name: 'Imported Duplicate',
          urls: [
            {
              url: 'https://duplicate.example.com/1',
              title: 'Duplicate 1',
            },
          ],
          categories: ['Duplicate'],
          createdAt: 10,
          updatedAt: 11,
        }),
        buildCustomProject({
          id: 'imported-project',
          name: 'Imported Project',
          urls: [
            {
              url: 'https://imported.example.com/1',
              title: 'Imported 1',
              notes: 'memo',
              category: 'Imported',
            },
          ],
          categories: ['Imported'],
          categoryOrder: ['Imported'],
          createdAt: 12,
          updatedAt: 13,
        }),
      ],
      customProjectOrder: ['imported-project', 'current-project'],
      parentCategories: [],
      savedTabs: [
        {
          id: 'imported-group',
          domain: 'https://imported.example.com',
          urls: [
            {
              url: 'https://duplicate.example.com/1',
              title: 'Duplicate 1',
            },
            {
              url: 'https://imported.example.com/1',
              title: 'Imported 1',
            },
          ],
        },
      ],
      urls: [],
    }

    const result = await importSettings(JSON.stringify(imported), true)

    expect(result.success).toBe(true)
    expect(store.customProjects).toEqual([
      buildCustomProject({
        id: 'current-project',
        name: 'Current Project',
        urlIds: ['url-current'],
        categories: ['Current'],
        createdAt: 1,
        updatedAt: 2,
      }),
      buildCustomProject({
        id: 'imported-project',
        name: 'Imported Project',
        urlIds: ['url-imported-project-1'],
        urlMetadata: {
          'url-imported-project-1': {
            notes: 'memo',
            category: 'Imported',
          },
        },
        categories: ['Imported'],
        categoryOrder: ['Imported'],
        createdAt: 12,
        updatedAt: 13,
      }),
      buildCustomProject({
        id: 'custom-uncategorized',
        name: '未分類',
        urlIds: ['url-duplicate-project-1'],
        categories: [],
        createdAt: expect.any(Number),
        updatedAt: expect.any(Number),
      }),
    ])
    expect(store.customProjectOrder).toEqual([
      'current-project',
      'imported-project',
      'custom-uncategorized',
    ])
  })

  it('importSettings は customProjects の URL 変換を一括処理する', async () => {
    const { store } = createChromeMock({
      customProjectOrder: [],
      customProjects: [],
      parentCategories: [],
      savedTabs: [
        {
          id: 'saved-group',
          domain: 'https://example.com',
          urls: [
            { url: 'https://example.com/a', title: 'A' },
            { url: 'https://example.com/b', title: 'B' },
          ],
        },
      ],
      urls: [],
    })
    vi.mocked(getUserSettings).mockResolvedValue(buildFullUserSettings())
    vi.mocked(createOrUpdateUrlRecordsBatch).mockResolvedValue(
      new Map([
        [
          'https://example.com/a',
          {
            id: 'url-a',
            url: 'https://example.com/a',
            title: 'A',
            savedAt: 100,
          },
        ],
        [
          'https://example.com/b',
          {
            id: 'url-b',
            url: 'https://example.com/b',
            title: 'B',
            savedAt: 101,
          },
        ],
      ]),
    )

    const imported = {
      version: '4.0.1',
      timestamp: '2026-03-08T00:00:00.000Z',
      userSettings: {
        removeTabAfterOpen: true,
        removeTabAfterExternalDrop: true,
        excludePatterns: [],
        enableCategories: true,
        showSavedTime: false,
        clickBehavior: 'saveWindowTabs',
      },
      customProjects: [
        buildCustomProject({
          id: 'project-a',
          name: 'Project A',
          urls: [
            {
              url: 'https://example.com/a',
              title: 'A',
              notes: 'note-a',
              category: 'Docs',
            },
          ],
          categories: ['Docs'],
          categoryOrder: ['Docs'],
          createdAt: 10,
          updatedAt: 11,
        }),
        buildCustomProject({
          id: 'project-b',
          name: 'Project B',
          urls: [
            {
              url: 'https://example.com/b',
              title: 'B',
            },
          ],
          categories: [],
          createdAt: 12,
          updatedAt: 13,
        }),
      ],
      customProjectOrder: ['project-a', 'project-b'],
      parentCategories: [],
      savedTabs: [
        {
          id: 'saved-group',
          domain: 'https://example.com',
          urls: [
            { url: 'https://example.com/a', title: 'A' },
            { url: 'https://example.com/b', title: 'B' },
          ],
        },
      ],
      urls: [],
    }

    const result = await importSettings(JSON.stringify(imported), false)

    expect(result.success).toBe(true)
    expect(createOrUpdateUrlRecordsBatch).toHaveBeenCalledTimes(1)
    expect(createOrUpdateUrlRecordsBatch).toHaveBeenCalledWith(
      expect.any(Array),
      {
        preserveExistingOnDuplicate: true,
      },
    )
    expect(createOrUpdateUrlRecord).not.toHaveBeenCalled()
    expect(store.customProjects).toEqual([
      buildCustomProject({
        id: 'project-a',
        name: 'Project A',
        urlIds: ['url-a'],
        categories: ['Docs'],
        categoryOrder: ['Docs'],
        urlMetadata: {
          'url-a': {
            notes: 'note-a',
            category: 'Docs',
          },
        },
        createdAt: 10,
        updatedAt: 11,
      }),
      buildCustomProject({
        id: 'project-b',
        name: 'Project B',
        urlIds: ['url-b'],
        categories: [],
        createdAt: 12,
        updatedAt: 13,
      }),
    ])
  })

  it('importSettings は overwrite モードで全データを置き換える', async () => {
    const { set } = createChromeMock()
    vi.mocked(getUserSettings).mockResolvedValue(buildFullUserSettings())
    vi.mocked(createOrUpdateUrlRecord)
      .mockRejectedValueOnce(new Error('failed to convert first URL'))
      .mockResolvedValueOnce({
        id: 'url-overwrite-2',
        url: 'https://replace.example.com/ok',
        title: 'ok',
        savedAt: 10,
      })

    const imported = {
      version: '3.0.0',
      timestamp: '2026-02-16T00:00:00.000Z',
      userSettings: {
        removeTabAfterOpen: false,
        removeTabAfterExternalDrop: true,
        excludePatterns: ['replace-pattern'],
        enableCategories: false,
        showSavedTime: true,
        autoDeletePeriod: '30days',
        clickBehavior: 'saveCurrentTab',
      },
      parentCategories: [
        {
          id: 'replace-cat',
          name: 'Replace Category',
          domains: [],
          domainNames: [],
          keywords: ['to-be-removed'],
        },
      ],
      savedTabs: [
        {
          id: 'replace-group',
          domain: 'https://replace.example.com',
          urls: [
            { url: 'https://replace.example.com/fail', title: 'fail' },
            {
              url: 'https://replace.example.com/ok',
              title: 'ok',
              subCategory: 'SubA',
            },
          ],
          subCategories: [{ name: 'ObjectSub' }, 'StringSub'],
          categoryKeywords: [{ categoryName: 'kw', keywords: ['alpha'] }],
          savedAt: 999,
        },
      ],
    }

    const result = await importSettings(JSON.stringify(imported), false)

    expect(result.success).toBe(true)
    expect(result.message).toContain('設定とタブデータを置き換えました')
    expect(migrateToUrlsStorage).toHaveBeenCalledTimes(2)

    expect(saveUserSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        removeTabAfterOpen: false,
        removeTabAfterExternalDrop: true,
        enableCategories: false,
        showSavedTime: true,
        autoDeletePeriod: '30days',
        excludePatterns: ['replace-pattern'],
        clickBehavior: 'saveCurrentTab',
        excludePinnedTabs: defaultSettings.excludePinnedTabs,
        openUrlInBackground: defaultSettings.openUrlInBackground,
        openAllInNewWindow: defaultSettings.openAllInNewWindow,
        confirmDeleteAll: defaultSettings.confirmDeleteAll,
        confirmDeleteEach: defaultSettings.confirmDeleteEach,
        colors: defaultSettings.colors,
      }),
    )

    expect(saveParentCategories).toHaveBeenCalledWith([
      {
        id: 'replace-cat',
        name: 'Replace Category',
        domains: [],
        domainNames: [],
      },
    ])

    const savedTabsArg = set.mock.calls[0]?.[0]?.savedTabs as Record<
      string,
      unknown
    >[]
    expect(savedTabsArg).toHaveLength(1)
    expect(savedTabsArg[0]).toEqual(
      expect.objectContaining({
        id: 'replace-group',
        domain: 'https://replace.example.com',
        urlIds: ['url-overwrite-2'],
        urlSubCategories: { 'url-overwrite-2': 'SubA' },
        subCategories: ['ObjectSub', 'StringSub'],
        categoryKeywords: [{ categoryName: 'kw', keywords: ['alpha'] }],
        savedAt: 999,
      }),
    )
    expect(set.mock.calls[0]?.[0]?.customProjects).toEqual([
      buildCustomProject({
        id: 'custom-uncategorized',
        name: '未分類',
        urlIds: ['url-overwrite-2'],
        categories: [],
        createdAt: expect.any(Number),
        updatedAt: expect.any(Number),
      }),
    ])
  })

  it('importSettings は overwrite モードで customProjects と customProjectOrder を復元する', async () => {
    const { store } = createChromeMock({
      customProjectOrder: ['stale-project'],
      customProjects: [
        buildCustomProject({
          id: 'stale-project',
          name: 'Stale',
          urlIds: ['url-stale'],
          categories: [],
          createdAt: 1,
          updatedAt: 1,
        }),
      ],
      parentCategories: [],
      savedTabs: [],
      urls: [],
    })
    vi.mocked(getUserSettings).mockResolvedValue(buildFullUserSettings())
    vi.mocked(createOrUpdateUrlRecordsBatch).mockResolvedValue(
      new Map([
        [
          'https://restored.example.com/1',
          {
            id: 'url-restored-project-1',
            url: 'https://restored.example.com/1',
            title: 'Restored 1',
            savedAt: 20,
          },
        ],
      ]),
    )

    const imported = {
      version: '4.0.1',
      timestamp: '2026-03-08T00:00:00.000Z',
      userSettings: {
        removeTabAfterOpen: true,
        removeTabAfterExternalDrop: true,
        excludePatterns: [],
        enableCategories: true,
        showSavedTime: false,
        clickBehavior: 'saveWindowTabs',
      },
      customProjects: [
        buildCustomProject({
          id: 'restored-project',
          name: 'Restored',
          urls: [
            {
              url: 'https://restored.example.com/1',
              title: 'Restored 1',
              notes: 'note',
              category: 'Docs',
            },
          ],
          categories: ['Docs'],
          categoryOrder: ['Docs'],
          createdAt: 20,
          updatedAt: 21,
        }),
      ],
      customProjectOrder: ['restored-project'],
      parentCategories: [],
      savedTabs: [
        {
          id: 'saved-group',
          domain: 'https://restored.example.com',
          urls: [
            {
              url: 'https://restored.example.com/1',
              title: 'Restored 1',
            },
          ],
        },
      ],
      urls: [],
    }

    const result = await importSettings(JSON.stringify(imported), false)

    expect(result.success).toBe(true)
    expect(store.customProjects).toEqual([
      buildCustomProject({
        id: 'restored-project',
        name: 'Restored',
        urlIds: ['url-restored-project-1'],
        urlMetadata: {
          'url-restored-project-1': {
            notes: 'note',
            category: 'Docs',
          },
        },
        categories: ['Docs'],
        categoryOrder: ['Docs'],
        createdAt: 20,
        updatedAt: 21,
      }),
    ])
    expect(store.customProjectOrder).toEqual(['restored-project'])
  })

  it('importSettings は customProjects の urlIds から urls を復元して保存形式へ変換する', async () => {
    const { store } = createChromeMock({
      customProjectOrder: [],
      customProjects: [],
      parentCategories: [],
      savedTabs: [],
      urls: [
        {
          id: 'current-project-url',
          url: 'https://current-project.example.com/path',
          title: 'Current Project URL',
          savedAt: 20,
        },
      ],
    })
    vi.mocked(getUserSettings).mockResolvedValue(buildFullUserSettings())

    const imported = {
      version: '4.0.1',
      timestamp: '2026-03-08T00:00:00.000Z',
      userSettings: {
        removeTabAfterOpen: true,
        removeTabAfterExternalDrop: true,
        excludePatterns: [],
        enableCategories: true,
        showSavedTime: false,
        clickBehavior: 'saveWindowTabs',
      },
      customProjects: [
        buildCustomProject({
          id: 'project-from-urlids',
          name: 'Project From URL IDs',
          urlIds: [
            'imported-project-url',
            'current-project-url',
            'missing-url',
          ],
          urls: undefined,
          urlMetadata: {
            'imported-project-url': {
              notes: 'imported memo',
              category: 'Imported',
            },
            'current-project-url': {
              notes: 'current memo',
              category: 'Current',
            },
          },
          categories: ['Imported', 'Current'],
          categoryOrder: ['Imported', 'Current'],
          createdAt: 10,
          updatedAt: 11,
        }),
      ],
      customProjectOrder: ['project-from-urlids'],
      parentCategories: [],
      savedTabs: [],
      urls: [
        {
          id: 'imported-project-url',
          url: 'https://imported-project.example.com/path',
          title: 'Imported Project URL',
          savedAt: 10,
        },
      ],
    }

    const result = await importSettings(JSON.stringify(imported), false)

    expect(result.success).toBe(true)
    expect(store.customProjects).toEqual([
      buildCustomProject({
        id: 'project-from-urlids',
        name: 'Project From URL IDs',
        urlIds: [],
        categories: ['Imported', 'Current'],
        categoryOrder: ['Imported', 'Current'],
        createdAt: 10,
        updatedAt: 11,
      }),
    ])
  })

  it('importSettings は customProjects の URL 変換失敗をスキップする', async () => {
    const { store } = createChromeMock({
      customProjectOrder: [],
      customProjects: [],
      parentCategories: [],
      savedTabs: [],
      urls: [],
    })
    vi.mocked(getUserSettings).mockResolvedValue(buildFullUserSettings())
    vi.mocked(createOrUpdateUrlRecordsBatch).mockResolvedValue(new Map())
    vi.mocked(createOrUpdateUrlRecord).mockRejectedValueOnce(
      new Error('custom project url failed'),
    )

    const imported = {
      version: '4.0.1',
      timestamp: '2026-03-08T00:00:00.000Z',
      userSettings: {
        removeTabAfterOpen: true,
        removeTabAfterExternalDrop: true,
        excludePatterns: [],
        enableCategories: true,
        showSavedTime: false,
        clickBehavior: 'saveWindowTabs',
      },
      customProjects: [
        buildCustomProject({
          id: 'project-with-failed-url',
          name: 'Failed URL Project',
          urls: [
            {
              url: 'https://failed-project-url.example.com',
              title: 'Failed',
              notes: 'drop me',
              category: 'Drop',
            },
          ],
          urlIds: [],
          categories: ['Drop'],
          categoryOrder: ['Drop'],
          createdAt: 10,
          updatedAt: 11,
        }),
      ],
      customProjectOrder: ['project-with-failed-url'],
      parentCategories: [],
      savedTabs: [],
      urls: [],
    }

    const result = await importSettings(JSON.stringify(imported), false)

    expect(result.success).toBe(true)
    expect(store.customProjects).toEqual([
      buildCustomProject({
        id: 'project-with-failed-url',
        name: 'Failed URL Project',
        urlIds: [],
        categories: ['Drop'],
        categoryOrder: ['Drop'],
        createdAt: 10,
        updatedAt: 11,
      }),
    ])
  })

  it('importSettings は overwrite モードで customProjects を savedTabs に合わせて正規化する', async () => {
    const { store } = createChromeMock({
      customProjectOrder: [],
      customProjects: [],
      parentCategories: [],
      savedTabs: [],
      urls: [],
    })
    vi.mocked(getUserSettings).mockResolvedValue(buildFullUserSettings())
    vi.mocked(createOrUpdateUrlRecordsBatch).mockResolvedValue(
      new Map([
        [
          'https://example.com/a',
          {
            id: 'url-a',
            url: 'https://example.com/a',
            title: 'A',
            savedAt: 100,
          },
        ],
        [
          'https://example.com/b',
          {
            id: 'url-b',
            url: 'https://example.com/b',
            title: 'B',
            savedAt: 101,
          },
        ],
        [
          'https://example.com/c',
          {
            id: 'url-c',
            url: 'https://example.com/c',
            title: 'C',
            savedAt: 102,
          },
        ],
      ]),
    )

    const imported = {
      version: '4.0.1',
      timestamp: '2026-03-08T00:00:00.000Z',
      userSettings: {
        removeTabAfterOpen: true,
        removeTabAfterExternalDrop: true,
        excludePatterns: [],
        enableCategories: true,
        showSavedTime: false,
        clickBehavior: 'saveWindowTabs',
      },
      customProjects: [
        buildCustomProject({
          id: 'project-main',
          name: 'Main',
          urls: [
            {
              url: 'https://example.com/a',
              title: 'A',
              notes: 'keep-a',
              category: 'Docs',
            },
            {
              url: 'https://example.com/c',
              title: 'C',
              notes: 'drop-c',
              category: 'Extra',
            },
          ],
          categories: ['Docs', 'Extra'],
          categoryOrder: ['Docs', 'Extra'],
          createdAt: 10,
          updatedAt: 11,
        }),
        buildCustomProject({
          id: 'custom-uncategorized',
          name: '未分類',
          urls: [],
          categories: [],
          createdAt: 12,
          updatedAt: 13,
        }),
      ],
      customProjectOrder: ['project-main', 'custom-uncategorized'],
      parentCategories: [],
      savedTabs: [
        {
          id: 'group-main',
          domain: 'https://example.com',
          urls: [
            { url: 'https://example.com/a', title: 'A' },
            { url: 'https://example.com/b', title: 'B' },
          ],
        },
      ],
      urls: [],
    }

    const result = await importSettings(JSON.stringify(imported), false)

    expect(result.success).toBe(true)
    expect(store.customProjects).toEqual([
      buildCustomProject({
        id: 'project-main',
        name: 'Main',
        urlIds: ['url-a'],
        urlMetadata: {
          'url-a': {
            notes: 'keep-a',
            category: 'Docs',
          },
        },
        categories: ['Docs', 'Extra'],
        categoryOrder: ['Docs', 'Extra'],
        createdAt: 10,
        updatedAt: 11,
      }),
      buildCustomProject({
        id: 'custom-uncategorized',
        name: '未分類',
        urlIds: ['url-b'],
        categories: [],
        createdAt: 12,
        updatedAt: 13,
      }),
    ])
    expect(store.customProjectOrder).toEqual([
      'project-main',
      'custom-uncategorized',
    ])
  })

  it('importSettings は merge モードで customProjects を savedTabs に合わせて重複なく正規化する', async () => {
    const { store } = createChromeMock({
      customProjectOrder: ['current-project'],
      customProjects: [
        buildCustomProject({
          id: 'current-project',
          name: 'Current',
          urlIds: ['url-current'],
          categories: [],
          createdAt: 1,
          updatedAt: 2,
        }),
      ],
      parentCategories: [],
      savedTabs: [
        {
          id: 'current-group',
          domain: 'https://current.example.com',
          urlIds: ['url-current'],
        },
      ],
      urls: [],
    })
    vi.mocked(getUserSettings).mockResolvedValue(buildFullUserSettings())
    vi.mocked(createOrUpdateUrlRecordsBatch).mockResolvedValue(
      new Map([
        [
          'https://imported.example.com/a',
          {
            id: 'url-imported-a',
            url: 'https://imported.example.com/a',
            title: 'Imported A',
            savedAt: 100,
          },
        ],
        [
          'https://imported.example.com/b',
          {
            id: 'url-imported-b',
            url: 'https://imported.example.com/b',
            title: 'Imported B',
            savedAt: 101,
          },
        ],
        [
          'https://imported.example.com/extra',
          {
            id: 'url-imported-extra',
            url: 'https://imported.example.com/extra',
            title: 'Imported Extra',
            savedAt: 102,
          },
        ],
      ]),
    )

    const imported = {
      version: '4.0.1',
      timestamp: '2026-03-08T00:00:00.000Z',
      userSettings: {
        removeTabAfterOpen: true,
        removeTabAfterExternalDrop: true,
        excludePatterns: [],
        enableCategories: true,
        showSavedTime: false,
        clickBehavior: 'saveWindowTabs',
      },
      customProjects: [
        buildCustomProject({
          id: 'project-main',
          name: 'Main',
          urls: [
            {
              url: 'https://imported.example.com/a',
              title: 'Imported A',
              notes: 'keep-a',
              category: 'Docs',
            },
            {
              url: 'https://imported.example.com/extra',
              title: 'Imported Extra',
              notes: 'drop-extra',
              category: 'Extra',
            },
          ],
          categories: ['Docs', 'Extra'],
          categoryOrder: ['Docs', 'Extra'],
          createdAt: 10,
          updatedAt: 11,
        }),
        buildCustomProject({
          id: 'project-secondary',
          name: 'Secondary',
          urls: [
            {
              url: 'https://imported.example.com/a',
              title: 'Imported A',
              notes: 'drop-duplicate',
              category: 'Dup',
            },
          ],
          categories: ['Dup'],
          categoryOrder: ['Dup'],
          createdAt: 12,
          updatedAt: 13,
        }),
      ],
      customProjectOrder: ['project-main', 'project-secondary'],
      parentCategories: [],
      savedTabs: [
        {
          id: 'imported-group',
          domain: 'https://imported.example.com',
          urls: [
            {
              url: 'https://imported.example.com/a',
              title: 'Imported A',
            },
            {
              url: 'https://imported.example.com/b',
              title: 'Imported B',
            },
          ],
        },
      ],
      urls: [],
    }

    const result = await importSettings(JSON.stringify(imported), true)

    expect(result.success).toBe(true)
    expect(store.customProjects).toEqual([
      buildCustomProject({
        id: 'current-project',
        name: 'Current',
        urlIds: ['url-current'],
        categories: [],
        createdAt: 1,
        updatedAt: 2,
      }),
      buildCustomProject({
        id: 'project-main',
        name: 'Main',
        urlIds: ['url-imported-a'],
        urlMetadata: {
          'url-imported-a': {
            notes: 'keep-a',
            category: 'Docs',
          },
        },
        categories: ['Docs', 'Extra'],
        categoryOrder: ['Docs', 'Extra'],
        createdAt: 10,
        updatedAt: 11,
      }),
      buildCustomProject({
        id: 'project-secondary',
        name: 'Secondary',
        urlIds: [],
        categories: ['Dup'],
        categoryOrder: ['Dup'],
        createdAt: 12,
        updatedAt: 13,
      }),
      buildCustomProject({
        id: 'custom-uncategorized',
        name: '未分類',
        urlIds: ['url-imported-b'],
        categories: [],
        createdAt: expect.any(Number),
        updatedAt: expect.any(Number),
      }),
    ])
    expect(store.customProjectOrder).toEqual([
      'current-project',
      'project-main',
      'project-secondary',
      'custom-uncategorized',
    ])
  })

  it('customProjects が無いバックアップでも未分類プロジェクトへ整合化して importSettings は成功する', async () => {
    const { store } = createChromeMock({
      parentCategories: [],
      customProjects: [],
      customProjectOrder: [],
      savedTabs: [],
    })
    vi.mocked(getUserSettings).mockResolvedValue(buildFullUserSettings())
    vi.mocked(createOrUpdateUrlRecord).mockResolvedValue({
      id: 'sync-failure-url',
      url: 'https://sync-failure.example.com',
      title: 'sync-failure',
      savedAt: 1,
    })

    const imported = {
      version: '3.1.0',
      timestamp: '2026-02-16T00:00:00.000Z',
      userSettings: {
        removeTabAfterOpen: true,
        removeTabAfterExternalDrop: true,
        excludePatterns: [],
        enableCategories: true,
        showSavedTime: false,
        clickBehavior: 'saveWindowTabs',
      },
      parentCategories: [],
      savedTabs: [
        {
          id: 'sync-failure-group',
          domain: 'https://sync-failure.example.com',
          urls: [
            {
              url: 'https://sync-failure.example.com',
              title: 'sync-failure',
            },
          ],
        },
      ],
    }

    const result = await importSettings(JSON.stringify(imported), true)

    expect(result.success).toBe(true)
    expect(store.customProjectOrder).toEqual(['custom-uncategorized'])
    expect(store.customProjects).toEqual([
      buildCustomProject({
        id: 'custom-uncategorized',
        name: '未分類',
        urlIds: ['sync-failure-url'],
        categories: [],
        createdAt: expect.any(Number),
        updatedAt: expect.any(Number),
      }),
    ])
  })

  it('importSettings は大量URL時にURL変換を一括で実行する', async () => {
    const { set } = createChromeMock({
      parentCategories: [],
      savedTabs: [],
    })
    vi.mocked(getUserSettings).mockResolvedValue(buildFullUserSettings())

    const importedUrls = Array.from({
      length: 101,
    }).map((_, index) => ({
      url: `https://bulk.example.com/page-${index}`,
      title: `Bulk ${index}`,
    }))

    const bulkMap = new Map(
      importedUrls.slice(0, 100).map((item, index) => [
        item.url,
        {
          id: `bulk-id-${index}`,
          url: item.url,
          title: item.title,
          savedAt: index,
        },
      ]),
    )
    vi.mocked(createOrUpdateUrlRecordsBatch).mockResolvedValue(
      bulkMap as Map<
        string,
        {
          id: string
          url: string
          title: string
          savedAt: number
        }
      >,
    )

    const imported = {
      version: '6.0.0',
      timestamp: '2026-02-16T00:00:00.000Z',
      userSettings: {
        removeTabAfterOpen: true,
        removeTabAfterExternalDrop: true,
        excludePatterns: [],
        enableCategories: true,
        showSavedTime: false,
        clickBehavior: 'saveWindowTabs',
      },
      parentCategories: [],
      savedTabs: [
        {
          id: 'bulk-group',
          domain: 'https://bulk.example.com',
          urls: importedUrls,
        },
      ],
    }

    const result = await importSettings(JSON.stringify(imported), true)

    expect(result.success).toBe(true)
    expect(createOrUpdateUrlRecordsBatch).toHaveBeenCalledTimes(1)
    expect(createOrUpdateUrlRecord).not.toHaveBeenCalled()
    const savedTabsArg = set.mock.calls[0]?.[0]?.savedTabs as Record<
      string,
      unknown
    >[]
    expect(savedTabsArg[0]?.urlIds).toHaveLength(100)
  })

  it('overwrite モードでは不正な keyword と subcategory エントリを正規化する', async () => {
    const { set } = createChromeMock()
    vi.mocked(getUserSettings).mockResolvedValue(buildFullUserSettings())
    vi.mocked(createOrUpdateUrlRecord).mockResolvedValue({
      id: 'url-normalize-1',
      url: 'https://normalize.example.com',
      title: 'Normalize',
      savedAt: 10,
    })

    const imported = {
      version: '4.0.0',
      timestamp: '2026-02-16T00:00:00.000Z',
      userSettings: {
        removeTabAfterOpen: true,
        removeTabAfterExternalDrop: true,
        excludePatterns: ['n1'],
        enableCategories: true,
        showSavedTime: false,
        clickBehavior: 'saveWindowTabs',
      },
      parentCategories: [
        {
          id: 'normalize-cat',
          name: 'Normalize',
          domains: [],
          domainNames: [],
        },
      ],
      savedTabs: [
        {
          id: 'normalize-group',
          domain: 'https://normalize.example.com',
          urls: [{ url: 'https://normalize.example.com', title: 'Normalize' }],
          subCategories: [{ name: 'ObjSub' }, 123, 'StrSub', { name: 999 }],
          categoryKeywords: [
            { categoryName: 'valid', keywords: 'not-array' },
            { invalid: true },
            null,
          ],
          savedAt: 1,
        },
      ],
    }

    const result = await importSettings(JSON.stringify(imported), false)

    expect(result.success).toBe(true)
    const savedTabsArg = set.mock.calls[0]?.[0]?.savedTabs as Record<
      string,
      unknown
    >[]
    expect(savedTabsArg[0]).toEqual(
      expect.objectContaining({
        subCategories: ['ObjSub', 'StrSub'],
        categoryKeywords: [{ categoryName: 'valid', keywords: [] }],
      }),
    )
  })

  it('overwrite モードでは子カテゴリ順序を復元する', async () => {
    const { set } = createChromeMock()
    vi.mocked(getUserSettings).mockResolvedValue(buildFullUserSettings())
    vi.mocked(createOrUpdateUrlRecord).mockResolvedValue({
      id: 'url-ordered-1',
      url: 'https://ordered-overwrite.example.com',
      title: 'Ordered',
      savedAt: 10,
    })

    const imported = {
      version: '5.0.0',
      timestamp: '2026-02-16T00:00:00.000Z',
      userSettings: {
        removeTabAfterOpen: true,
        removeTabAfterExternalDrop: true,
        excludePatterns: [],
        enableCategories: true,
        showSavedTime: false,
        clickBehavior: 'saveWindowTabs',
      },
      parentCategories: [],
      savedTabs: [
        {
          id: 'ordered-overwrite-group',
          domain: 'https://ordered-overwrite.example.com',
          urls: [
            {
              url: 'https://ordered-overwrite.example.com',
              title: 'Ordered',
            },
          ],
          subCategories: ['Alpha', 'Beta'],
          subCategoryOrder: ['Beta', 'Missing', 'Alpha'],
          subCategoryOrderWithUncategorized: [
            'Beta',
            '__uncategorized',
            'Missing',
            'Alpha',
          ],
        },
      ],
    }

    const result = await importSettings(JSON.stringify(imported), false)

    expect(result.success).toBe(true)
    const savedTabsArg = set.mock.calls[0]?.[0]?.savedTabs as Record<
      string,
      unknown
    >[]
    expect(savedTabsArg[0]).toEqual(
      expect.objectContaining({
        subCategories: ['Alpha', 'Beta'],
        subCategoryOrder: ['Beta', 'Alpha'],
        subCategoryOrderWithUncategorized: ['Beta', '__uncategorized', 'Alpha'],
      }),
    )
  })

  it('overwrite モードでは categoryKeywords/subCategories がないタブもサポートする', async () => {
    const { set } = createChromeMock()
    vi.mocked(getUserSettings).mockResolvedValue(buildFullUserSettings())
    vi.mocked(createOrUpdateUrlRecord).mockResolvedValue({
      id: 'url-minimal',
      url: 'https://minimal.example.com',
      title: '',
      savedAt: 10,
    })

    const imported = {
      version: '5.0.0',
      timestamp: '2026-02-16T00:00:00.000Z',
      userSettings: {
        removeTabAfterOpen: true,
        removeTabAfterExternalDrop: true,
        excludePatterns: [],
        enableCategories: true,
        showSavedTime: false,
        clickBehavior: 'saveWindowTabs',
      },
      parentCategories: [],
      savedTabs: [
        {
          id: 'minimal-group',
          domain: 'https://minimal.example.com',
          urls: [{ url: 'https://minimal.example.com' }],
        },
      ],
    }

    const result = await importSettings(JSON.stringify(imported), false)

    expect(result.success).toBe(true)
    const savedTabsArg = set.mock.calls[0]?.[0]?.savedTabs as Record<
      string,
      unknown
    >[]
    expect(savedTabsArg[0]).toEqual(
      expect.objectContaining({
        id: 'minimal-group',
        domain: 'https://minimal.example.com',
        urlIds: ['url-minimal'],
        subCategories: [],
        categoryKeywords: [],
      }),
    )
  })
})
