import { describe, expect, it } from 'vitest'

import { LegacyBackupV0Schema } from './LegacyBackupV0Schema'

const createLegacyBackup = (): Record<string, unknown> => ({
  parentCategories: [],
  savedTabs: [
    {
      domain: 'strict.example.com',
      id: 'strict-group',
      savedAt: 1,
      urls: [
        {
          savedAt: 2,
          title: 'Strict URL',
          url: 'https://strict.example.com/path',
        },
      ],
    },
  ],
  timestamp: '2026-07-01T00:00:00.000Z',
  userSettings: {
    excludePatterns: ['https://allowed.example/*'],
    showSavedTime: true,
  },
  version: '1.9.0',
})

describe('LegacyBackupV0Schema', () => {
  it('accepts explicitly supported legacy representations', () => {
    expect(LegacyBackupV0Schema.safeParse(createLegacyBackup()).success).toBe(
      true,
    )
  })

  it('accepts and strips the runtime-only active prompt emitted by the legacy exporter', () => {
    const backup = createLegacyBackup()
    const activeAiSystemPrompt = {
      createdAt: 1,
      id: 'legacy-active-prompt',
      name: 'Legacy active prompt',
      template: 'Legacy prompt template',
      updatedAt: 2,
    }
    backup.userSettings = {
      activeAiSystemPrompt,
      activeAiSystemPromptId: activeAiSystemPrompt.id,
      aiSystemPrompts: [activeAiSystemPrompt],
    }

    const result = LegacyBackupV0Schema.parse(backup)

    expect(result.userSettings).toMatchObject({
      activeAiSystemPromptId: activeAiSystemPrompt.id,
      aiSystemPrompts: [activeAiSystemPrompt],
    })
    expect(result.userSettings).not.toHaveProperty('activeAiSystemPrompt')
  })

  it('accepts legacy nested timestamp and runtime tabId fields', () => {
    const backup = createLegacyBackup()
    backup.savedTabs = [
      {
        domain: 'runtime.example.com',
        id: 'runtime-group',
        urls: [
          {
            tabId: 42,
            timestamp: 123,
            title: 'Runtime URL',
            url: 'https://runtime.example.com/path',
          },
        ],
      },
    ]

    expect(LegacyBackupV0Schema.safeParse(backup).success).toBe(true)
  })

  it('accepts prior optional parent and project keyword fields', () => {
    const backup = createLegacyBackup()
    backup.parentCategories = [
      {
        domainNames: ['strict.example.com'],
        domains: ['strict-group'],
        id: 'parent-1',
        keywords: ['strict'],
        name: 'Parent',
      },
    ]
    backup.customProjects = [
      {
        id: 'project-1',
        name: 'Project',
        projectKeywords: {
          titleKeywords: ['title'],
        },
      },
    ]
    backup.customProjectOrder = ['project-1']

    expect(LegacyBackupV0Schema.safeParse(backup).success).toBe(true)
  })

  it('accepts the legacy analytics time grouping alias', () => {
    const backup = createLegacyBackup()
    backup.savedAnalyticsViews = [
      {
        createdAt: 1,
        id: 'view-1',
        name: 'Legacy time',
        query: {
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
          groupBy: 'time',
          limit: 10,
          mode: 'both',
          normalize: false,
          sort: 'value-desc',
          stacked: false,
          timeBucket: 'day',
          timeRange: '30d',
        },
        updatedAt: 2,
      },
    ]

    const result = LegacyBackupV0Schema.parse(backup)

    expect(result.savedAnalyticsViews?.[0]?.query.groupBy).toBe('timeRecent')
  })

  it('accepts versioned analytics query fields inside a schema-less backup', () => {
    const backup = createLegacyBackup()
    backup.savedAnalyticsViews = [
      {
        createdAt: 1,
        id: 'view-v2-query',
        name: 'Collection activity',
        query: {
          chartType: 'bar',
          collectionType: 'domain',
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
          groupBy: 'collection',
          limit: 10,
          metric: 'membership-added',
          mode: 'both',
          normalize: false,
          schemaVersion: 2,
          sort: 'value-desc',
          stacked: false,
          timeBucket: 'day',
          timeRange: '30d',
        },
        updatedAt: 2,
      },
    ]

    expect(LegacyBackupV0Schema.safeParse(backup).success).toBe(true)
  })

  it('rejects a mixed array containing an invalid member', () => {
    const backup = createLegacyBackup()
    backup.urls = [
      {
        id: 'valid-url',
        savedAt: 1,
        title: 'Valid',
        url: 'https://valid.example/path',
      },
      {
        id: 'invalid-url',
        savedAt: 2,
        title: 'Invalid',
        url: 42,
      },
    ]

    expect(LegacyBackupV0Schema.safeParse(backup).success).toBe(false)
  })

  it('rejects an invalid member inside a legacy settings array', () => {
    const backup = createLegacyBackup()
    backup.userSettings = {
      excludePatterns: ['https://valid.example/*', 42],
    }

    expect(LegacyBackupV0Schema.safeParse(backup).success).toBe(false)
  })

  it('rejects an invalid legacy settings field instead of dropping it', () => {
    const backup = createLegacyBackup()
    backup.userSettings = {
      showSavedTime: 'yes',
    }

    expect(LegacyBackupV0Schema.safeParse(backup).success).toBe(false)
  })

  it('rejects unknown top-level fields', () => {
    const backup = createLegacyBackup()
    backup.internalMetadata = { revision: 123 }

    expect(LegacyBackupV0Schema.safeParse(backup).success).toBe(false)
  })

  it('rejects unknown fields in known nested objects', () => {
    const backup = createLegacyBackup()
    const savedTabs = backup.savedTabs
    if (!Array.isArray(savedTabs)) {
      throw new TypeError('Expected saved tabs fixture')
    }
    const savedTab: unknown = savedTabs[0]
    if (
      typeof savedTab !== 'object' ||
      savedTab === null ||
      Array.isArray(savedTab)
    ) {
      throw new TypeError('Expected saved tab fixture')
    }
    Object.assign(savedTab, { internalCache: true })

    expect(LegacyBackupV0Schema.safeParse(backup).success).toBe(false)
  })

  it.each([
    { field: 'version', value: '' },
    { field: 'timestamp', value: 'not-an-iso-datetime' },
  ])('rejects invalid $field metadata', ({ field, value }) => {
    const backup = createLegacyBackup()
    backup[field] = value

    expect(LegacyBackupV0Schema.safeParse(backup).success).toBe(false)
  })
})
