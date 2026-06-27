import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { UserSettings } from '@/types/storage'

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

import { migrateToUrlsStorage } from '@/lib/storage/migration'
import { getUserSettings } from '@/lib/storage/settings'
import { createOrUpdateUrlRecordsBatch } from '@/lib/storage/urls'

import { importSettings } from './import-export'
import {
  buildCustomProject,
  buildFullUserSettings,
  createChromeMock,
} from './import-export.test-fixtures'

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
