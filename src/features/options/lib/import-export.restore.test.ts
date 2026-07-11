import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { UserSettings } from '@/types/storage'

vi.mock('@/lib/storage/categories', () => ({
  getParentCategories: vi.fn(async () => {
    const result = await chrome.storage.local.get('parentCategories')
    return Array.isArray(result.parentCategories) ? result.parentCategories : []
  }),
  saveParentCategories: vi.fn(async (categories: unknown) => {
    await chrome.storage.local.set({ parentCategories: categories })
  }),
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
  getUrlRecords: vi.fn(async () => {
    const result = await chrome.storage.local.get({ urls: [] })
    return Array.isArray(result.urls) ? result.urls : []
  }),
  saveUrlRecords: vi.fn(async (records: unknown[]) => {
    await chrome.storage.local.set({ urls: records })
  }),
  invalidateUrlCache: vi.fn(),
}))

vi.mock('@/lib/storage/tabs', () => ({
  getSavedTabs: vi.fn(async () => {
    const result = await chrome.storage.local.get('savedTabs')
    return Array.isArray(result.savedTabs) ? result.savedTabs : []
  }),
  saveTabGroups: vi.fn(async (tabs: unknown[]) => {
    await chrome.storage.local.set({ savedTabs: tabs })
  }),
}))

vi.mock('@/lib/storage/projects', () => ({
  getCustomProjects: vi.fn(async () => {
    const result = await chrome.storage.local.get('customProjects')
    return Array.isArray(result.customProjects) ? result.customProjects : []
  }),
  getCustomProjectOrder: vi.fn(async () => {
    const result = await chrome.storage.local.get('customProjectOrder')
    return Array.isArray(result.customProjectOrder)
      ? result.customProjectOrder
      : []
  }),
  saveCustomProjects: vi.fn(async (projects: unknown[]) => {
    await chrome.storage.local.set({ customProjects: projects })
  }),
  updateProjectOrder: vi.fn(async (order: string[]) => {
    await chrome.storage.local.set({ customProjectOrder: order })
  }),
}))

vi.mock('@/lib/storage/analytics', () => ({
  loadSavedAnalyticsViews: vi.fn(async () => {
    const result = await chrome.storage.local.get('savedAnalyticsViews')
    return Array.isArray(result.savedAnalyticsViews)
      ? result.savedAnalyticsViews
      : []
  }),
  saveSavedAnalyticsViews: vi.fn(async (views: unknown[]) => {
    await chrome.storage.local.set({ savedAnalyticsViews: views })
  }),
}))

vi.mock('@/features/ai-chat/lib/conversation-history', () => ({
  ACTIVE_AI_CHAT_CONVERSATION_ID_KEY: 'activeAiChatConversationId',
  AI_CHAT_CONVERSATIONS_KEY: 'aiChatConversations',
  loadConversationHistory: vi.fn(async () => {
    const result = await chrome.storage.local.get([
      'activeAiChatConversationId',
      'aiChatConversations',
    ])
    const conversations = Array.isArray(result.aiChatConversations)
      ? result.aiChatConversations
      : []
    const activeId =
      typeof result.activeAiChatConversationId === 'string'
        ? result.activeAiChatConversationId
        : (conversations[0]?.id ?? '')
    return { activeConversationId: activeId, conversations }
  }),
  saveConversationHistory: vi.fn(
    async (state: {
      activeConversationId: string
      conversations: unknown[]
    }) => {
      await chrome.storage.local.set({
        activeAiChatConversationId: state.activeConversationId,
        aiChatConversations: state.conversations,
      })
    },
  ),
}))

import { migrateToUrlsStorage } from '@/lib/storage/migration'
import { getUserSettings } from '@/lib/storage/settings'
import { createOrUpdateUrlRecordsBatch } from '@/lib/storage/urls'

import { importSettings } from './import-export'
import {
  buildCustomProject,
  buildFullUserSettings,
  createChromeMock,
} from './importExportTestFixtures'

describe('import/export restore regression', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(migrateToUrlsStorage).mockResolvedValue(undefined)
    vi.mocked(createOrUpdateUrlRecordsBatch).mockReset()
    vi.mocked(createOrUpdateUrlRecordsBatch).mockResolvedValue(new Map())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('merge モードは同一ドメインの既存 URL とインポート URL の分類を保持して追加する', async () => {
    const { store } = createChromeMock({
      customProjectOrder: ['existing-project'],
      customProjects: [
        buildCustomProject({
          id: 'existing-project',
          name: 'Existing Project',
          urlIds: ['existing-url'],
          categories: ['Reading'],
          categoryOrder: ['Reading'],
          urlMetadata: {
            'existing-url': {
              category: 'Reading',
              notes: 'existing-note',
            },
          },
          createdAt: 100,
          updatedAt: 101,
        }),
      ],
      parentCategories: [],
      savedTabs: [
        {
          id: 'existing-docs-group',
          domain: 'docs.example.com',
          urlIds: ['existing-url'],
          urlSubCategories: {
            'existing-url': 'Reading',
          },
          subCategories: ['Reading'],
          subCategoryOrder: ['Reading'],
          savedAt: 500,
        },
      ],
      urls: [
        {
          id: 'existing-url',
          url: 'https://docs.example.com/start',
          title: 'Start',
          savedAt: 500,
        },
      ],
    })
    vi.mocked(getUserSettings).mockResolvedValue(buildFullUserSettings())
    const existingUrlRecord = {
      id: 'existing-url',
      url: 'https://docs.example.com/start',
      title: 'Start',
      savedAt: 500,
    }
    const importedUrlRecord = {
      id: 'imported-url',
      url: 'https://docs.example.com/release-notes',
      title: 'Release Notes',
      savedAt: 600,
    }
    vi.mocked(createOrUpdateUrlRecordsBatch).mockImplementation(async () => {
      await chrome.storage.local.set({
        urls: [existingUrlRecord, importedUrlRecord],
      })
      return new Map([
        ['https://docs.example.com/release-notes', importedUrlRecord],
      ])
    })

    const result = await importSettings(
      JSON.stringify({
        customProjectOrder: ['imported-project'],
        customProjects: [
          buildCustomProject({
            id: 'imported-project',
            name: 'Imported Project',
            urls: [
              {
                url: 'https://docs.example.com/release-notes',
                title: 'Release Notes',
                notes: 'imported-note',
                savedAt: 600,
                category: 'Release',
              },
            ],
            urlIds: [],
            categories: ['Release'],
            categoryOrder: ['Release'],
            createdAt: 200,
            updatedAt: 201,
          }),
        ],
        parentCategories: [],
        savedTabs: [
          {
            id: 'imported-docs-group',
            domain: 'docs.example.com',
            urls: [
              {
                url: 'https://docs.example.com/release-notes',
                title: 'Release Notes',
                savedAt: 600,
                subCategory: 'Release',
              },
            ],
            subCategories: ['Release'],
            subCategoryOrder: ['Release'],
            savedAt: 600,
          },
        ],
        timestamp: '2026-03-22T00:00:00.000Z',
        urls: [],
        userSettings: buildFullUserSettings(),
        version: '9.9.9',
      }),
      true,
    )

    expect(result.success).toBe(true)

    expect(store.savedTabs).toEqual([
      {
        id: 'existing-docs-group',
        domain: 'docs.example.com',
        urlIds: ['existing-url', 'imported-url'],
        urlSubCategories: {
          'existing-url': 'Reading',
          'imported-url': 'Release',
        },
        categoryKeywords: [],
        savedAt: 500,
        subCategories: ['Reading', 'Release'],
        subCategoryOrder: ['Reading', 'Release'],
        subCategoryOrderWithUncategorized: ['Reading', 'Release'],
      },
    ])
    expect(store.urls).toEqual([existingUrlRecord, importedUrlRecord])
    expect(store.customProjectOrder).toEqual([
      'existing-project',
      'imported-project',
    ])
    expect(store.customProjects).toEqual([
      buildCustomProject({
        id: 'existing-project',
        name: 'Existing Project',
        urlIds: ['existing-url'],
        categories: ['Reading'],
        categoryOrder: ['Reading'],
        urlMetadata: {
          'existing-url': {
            category: 'Reading',
            notes: 'existing-note',
          },
        },
        createdAt: 100,
        updatedAt: 101,
      }),
      buildCustomProject({
        id: 'imported-project',
        name: 'Imported Project',
        urlIds: ['imported-url'],
        categories: ['Release'],
        categoryOrder: ['Release'],
        urlMetadata: {
          'imported-url': {
            category: 'Release',
            notes: 'imported-note',
          },
        },
        createdAt: 200,
        updatedAt: 201,
      }),
    ])
  })
})
