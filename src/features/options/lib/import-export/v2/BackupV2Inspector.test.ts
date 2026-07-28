import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { LegacyBackupImportError } from '@/features/options/lib/import-export/legacy/LegacyBackupAdapter'
import type { BackupSchemaError } from '@/lib/persistence/backupSchema'

import { inspectBackupV2 } from './BackupV2Inspector'
import { BackupEnvelopeV2Schema } from './BackupV2Schema'

const readFixture = (name: string): string =>
  readFileSync(new URL(`fixtures/${name}`, import.meta.url), 'utf8')

const parseFixture = (name: string): unknown => {
  const parsed: unknown = JSON.parse(readFixture(name))
  return parsed
}

const inspectFixture = (name: string, importDate = '2026-08-31') =>
  inspectBackupV2(readFixture(name), { importDate })

const captureError = (action: () => unknown): Error => {
  try {
    action()
  } catch (error) {
    if (error instanceof Error) {
      return error
    }
  }
  throw new Error('Expected action to throw')
}

describe('inspectBackupV2 legacy conversion', () => {
  it('preserves a nested tab URL, category membership, and timestamp fallback', () => {
    const result = inspectFixture('legacy-tab-group-nested-urls.json')

    expect(result.data.savedTabs.urls).toEqual([
      expect.objectContaining({
        firstSavedAt: 0,
        title: 'Nested guide',
        url: 'https://nested.example.com/guide',
      }),
    ])
    expect(result.data.savedTabs.categories).toEqual([
      expect.objectContaining({
        collectionId: 'domain-nested',
        name: 'docs',
      }),
    ])
    expect(result.data.savedTabs.memberships).toEqual([
      expect.objectContaining({
        categoryId: 'domain-nested:category:0',
        collectionId: 'domain-nested',
      }),
    ])
    expect(result.data.userSettings.showSavedTime).toBe(true)
    expect(
      result.preview.warnings.find(
        ({ code }) => code === 'MISSING_TIMESTAMP_PROVENANCE',
      ),
    ).toEqual({
      code: 'MISSING_TIMESTAMP_PROVENANCE',
      count: 2,
    })
  })

  it('normalizes a legacy nested timestamp and removes runtime tabId', () => {
    const input = parseFixture('legacy-tab-group-nested-urls.json')
    if (
      typeof input !== 'object' ||
      input === null ||
      !('savedTabs' in input) ||
      !Array.isArray(input.savedTabs)
    ) {
      throw new TypeError('Expected saved tabs fixture')
    }
    const savedTab: unknown = input.savedTabs[0]
    if (
      typeof savedTab !== 'object' ||
      savedTab === null ||
      !('urls' in savedTab) ||
      !Array.isArray(savedTab.urls)
    ) {
      throw new TypeError('Expected nested URLs fixture')
    }
    const nestedUrl: unknown = savedTab.urls[0]
    if (typeof nestedUrl !== 'object' || nestedUrl === null) {
      throw new TypeError('Expected nested URL fixture')
    }
    Object.assign(nestedUrl, { tabId: 99, timestamp: 321 })

    const result = inspectBackupV2(input, {
      importDate: '2026-08-31',
    })

    expect(result.data.savedTabs.urls[0]?.firstSavedAt).toBe(321)
    expect(JSON.stringify(result.data)).not.toContain('tabId')
    expect(JSON.stringify(result.data)).not.toContain('timestamp')
  })

  it('prefers nested savedAt over the legacy timestamp alias', () => {
    const input = parseFixture('legacy-tab-group-nested-urls.json')
    if (
      typeof input !== 'object' ||
      input === null ||
      !('savedTabs' in input) ||
      !Array.isArray(input.savedTabs)
    ) {
      throw new TypeError('Expected saved tabs fixture')
    }
    const savedTab: unknown = input.savedTabs[0]
    if (
      typeof savedTab !== 'object' ||
      savedTab === null ||
      !('urls' in savedTab) ||
      !Array.isArray(savedTab.urls)
    ) {
      throw new TypeError('Expected nested URLs fixture')
    }
    const nestedUrl: unknown = savedTab.urls[0]
    if (typeof nestedUrl !== 'object' || nestedUrl === null) {
      throw new TypeError('Expected nested URL fixture')
    }
    Object.assign(nestedUrl, { savedAt: 654, timestamp: 321 })

    const result = inspectBackupV2(input, {
      importDate: '2026-08-31',
    })

    expect(result.data.savedTabs.urls[0]?.firstSavedAt).toBe(654)
  })

  it('preserves a canonical URL id and its domain membership', () => {
    const result = inspectFixture('legacy-tab-group-url-ids.json')

    expect(result.data.savedTabs.urls).toEqual([
      expect.objectContaining({
        firstSavedAt: 101,
        id: 'url-canonical',
      }),
    ])
    expect(result.data.savedTabs.memberships).toEqual([
      expect.objectContaining({
        categoryId: 'domain-ids:category:0',
        collectionId: 'domain-ids',
        urlId: 'url-canonical',
      }),
    ])
  })

  it('preserves nested custom project notes and category membership', () => {
    const result = inspectFixture('legacy-custom-project-urls.json')

    expect(result.data.savedTabs.collections).toEqual([
      expect.objectContaining({
        id: 'project-nested',
        name: 'Nested project',
      }),
    ])
    expect(result.data.savedTabs.memberships).toEqual([
      expect.objectContaining({
        categoryId: 'project-nested:category:0',
        notes: 'private-project-note',
      }),
    ])
  })

  it('normalizes missing project keyword arrays while preserving supplied values', () => {
    const input = parseFixture('legacy-custom-project-urls.json')
    if (
      typeof input !== 'object' ||
      input === null ||
      !('customProjects' in input) ||
      !Array.isArray(input.customProjects)
    ) {
      throw new TypeError('Expected custom projects fixture')
    }
    const project: unknown = input.customProjects[0]
    if (typeof project !== 'object' || project === null) {
      throw new TypeError('Expected custom project fixture')
    }
    Object.assign(project, {
      projectKeywords: {
        titleKeywords: ['preserved-title'],
      },
    })

    const result = inspectBackupV2(input, {
      importDate: '2026-08-31',
    })

    expect(result.data.savedTabs.collections[0]?.definition).toEqual({
      projectKeywords: {
        domainKeywords: [],
        titleKeywords: ['preserved-title'],
        urlKeywords: [],
      },
      type: 'custom',
    })
  })

  it('preserves urlMetadata notes and category membership', () => {
    const result = inspectFixture('legacy-custom-project-url-metadata.json')

    expect(result.data.savedTabs.memberships).toEqual([
      expect.objectContaining({
        categoryId: 'project-metadata:category:0',
        notes: 'private-metadata-note',
        urlId: 'url-project-metadata',
      }),
    ])
  })

  it('preserves the parent category relation', () => {
    const result = inspectFixture('legacy-parent-category.json')

    expect(result.data.savedTabs.groups).toEqual([
      expect.objectContaining({
        id: 'parent-work',
        name: 'Work',
      }),
    ])
    expect(result.data.savedTabs.collections).toEqual([
      expect.objectContaining({
        groupId: 'parent-work',
        id: 'domain-parented',
      }),
    ])
  })

  it('accepts a fixture with mixed legacy URL representations', () => {
    const result = inspectFixture('legacy-mixed-fields.json')

    expect(result.preview.entityCounts).toEqual({
      analyticsViews: 0,
      categories: 0,
      collections: 3,
      conversations: 0,
      groups: 0,
      memberships: 3,
      messages: 0,
      urls: 3,
    })
    expect(result.data.userSettings.language).toBe('en')
  })

  it('normalizes the legacy analytics time grouping alias', () => {
    const input = parseFixture('legacy-tab-group-url-ids.json')
    if (typeof input !== 'object' || input === null) {
      throw new TypeError('Expected legacy fixture')
    }
    Object.assign(input, {
      savedAnalyticsViews: [
        {
          createdAt: 1,
          id: 'legacy-time-view',
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
      ],
    })

    const result = inspectBackupV2(input, {
      importDate: '2026-08-31',
    })

    expect(result.data.analyticsViews[0]?.value).toMatchObject({
      query: { groupBy: 'timeRecent' },
    })
  })

  it('rejects a malformed legacy fixture', () => {
    const error = captureError(() => inspectFixture('legacy-malformed.json'))

    expect(error).toMatchObject<Partial<BackupSchemaError>>({
      code: 'INVALID_SCHEMA',
      name: 'BackupSchemaError',
    })
  })

  it('keeps preview diagnostics content-free', () => {
    const result = inspectFixture('legacy-custom-project-urls.json')
    const previewJson = JSON.stringify(result.preview)

    expect(result.preview).toMatchObject({
      advisory: {
        cutoffDate: '2026-09-01',
        lastSupportedDate: '2026-08-31',
        requiresReExport: true,
      },
      formatKind: 'legacy',
      schemaVersion: null,
    })
    expect(result.preview.appVersion).toBe('1.9.0')
    expect(result.preview.exportedAt).toBe('2026-07-03T00:00:00.000Z')
    expect(
      result.preview.warnings.every(
        (warning) => Object.keys(warning).toSorted().join(',') === 'code,count',
      ),
    ).toBe(true)
    expect(previewJson).not.toContain('private-project-note')
    expect(previewJson).not.toContain('project.example.com')
  })

  it('rejects mapper errors with content-free issue codes', () => {
    const input = parseFixture('legacy-tab-group-url-ids.json')
    if (
      typeof input !== 'object' ||
      input === null ||
      !('savedTabs' in input) ||
      !Array.isArray(input.savedTabs)
    ) {
      throw new TypeError('Expected the test fixture to contain saved tabs')
    }
    const [savedTab] = input.savedTabs
    if (typeof savedTab !== 'object' || savedTab === null) {
      throw new TypeError('Expected the test fixture to contain a saved tab')
    }
    savedTab.urlIds = ['private-dangling-url-id']

    const error = captureError(() =>
      inspectBackupV2(input, { importDate: '2026-08-31' }),
    )

    expect(error).toMatchObject<Partial<LegacyBackupImportError>>({
      code: 'LEGACY_MIGRATION_BLOCKED',
      name: 'LegacyBackupImportError',
    })
    if (!(error instanceof LegacyBackupImportError)) {
      throw new TypeError('Expected a legacy backup import error')
    }
    expect(error.issueCodes).toContain('LEGACY_URL_REFERENCE_CONFLICT')
    expect(JSON.stringify(error)).not.toContain('private-dangling-url-id')
  })

  it('supports the last legacy import date and rejects the cutoff date', () => {
    expect(() =>
      inspectFixture('legacy-tab-group-url-ids.json', '2026-08-31'),
    ).not.toThrow()

    const error = captureError(() =>
      inspectFixture('legacy-tab-group-url-ids.json', '2026-09-01'),
    )
    expect(error).toMatchObject<Partial<LegacyBackupImportError>>({
      code: 'LEGACY_IMPORT_CUTOFF_REACHED',
      name: 'LegacyBackupImportError',
    })
  })
})

describe('inspectBackupV2 versioned backups', () => {
  it('strictly validates the current V2 fixture', () => {
    const fixture = BackupEnvelopeV2Schema.parse(
      parseFixture('backup-v2-current.json'),
    )

    const result = inspectBackupV2(fixture, {
      importDate: '2027-01-01',
    })

    expect(result).toMatchObject({
      data: fixture.data,
      preview: {
        appVersion: '2.0.0',
        entityCounts: {
          analyticsViews: 0,
          categories: 0,
          collections: 0,
          conversations: 0,
          groups: 0,
          memberships: 0,
          messages: 0,
          urls: 0,
        },
        exportedAt: '2026-07-08T00:00:00.000Z',
        formatKind: 'current-v2',
        schemaVersion: 2,
        warnings: [],
      },
    })
  })

  it('rejects a future schema with current and received versions', () => {
    const error = captureError(() => inspectFixture('backup-v2-future.json'))

    expect(error).toMatchObject<Partial<BackupSchemaError>>({
      code: 'UNSUPPORTED_FUTURE_SCHEMA',
      currentVersion: 2,
      name: 'BackupSchemaError',
      receivedVersion: 3,
    })
  })

  it('rejects invalid JSON without leaking parser details', () => {
    const error = captureError(() =>
      inspectBackupV2('{"schemaVersion":', {
        importDate: '2026-08-31',
      }),
    )

    expect(error).toMatchObject<Partial<BackupSchemaError>>({
      code: 'INVALID_SCHEMA',
      message: 'Backup schema is invalid',
      name: 'BackupSchemaError',
    })
  })
})
