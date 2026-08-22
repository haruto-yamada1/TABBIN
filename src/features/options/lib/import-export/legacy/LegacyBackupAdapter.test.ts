import { describe, expect, it } from 'vitest'

import { checkPersistenceIntegrity } from '@/contexts/saved-tabs/public-api'
import { BackupSchemaError } from '@/lib/persistence/backupSchema'

import {
  convertLegacyBackup,
  LegacyBackupImportError,
} from './LegacyBackupAdapter'

const createLegacyExporterBackup = () => {
  const activeAiSystemPrompt = {
    createdAt: 1,
    id: 'legacy-active-prompt',
    name: 'Legacy active prompt',
    template: 'Legacy prompt template',
    updatedAt: 2,
  }
  const urls = [
    {
      id: 'url-a',
      savedAt: 11,
      title: 'URL A',
      url: 'https://legacy-export.example/a',
    },
    {
      id: 'url-b',
      savedAt: 12,
      title: 'URL B',
      url: 'https://legacy-export.example/b',
    },
  ]
  return {
    customProjectOrder: ['project-1'],
    customProjects: [
      {
        categories: ['Research'],
        categoryOrder: ['Research'],
        createdAt: 1,
        id: 'project-1',
        name: 'Project',
        projectKeywords: {
          domainKeywords: [],
          titleKeywords: [],
          urlKeywords: [],
        },
        updatedAt: 2,
        urls: urls.map((url, index) => ({
          ...(index === 0 ? { category: 'Research', notes: 'memo' } : {}),
          savedAt: url.savedAt,
          title: url.title,
          url: url.url,
        })),
      },
    ],
    parentCategories: [],
    savedTabs: [
      {
        categoryKeywords: [
          { categoryName: 'news', keywords: ['latest'] },
          { categoryName: 'docs', keywords: [] },
        ],
        domain: 'legacy-export.example',
        id: 'domain-group',
        savedAt: 10,
        subCategories: ['news', 'docs'],
        subCategoryOrder: ['news'],
        subCategoryOrderWithUncategorized: ['__uncategorized', 'news'],
        urlIds: urls.map(({ id }) => id),
        urls: urls.map((url, index) => ({
          savedAt: url.savedAt,
          subCategory: index === 0 ? 'news' : 'docs',
          title: url.title,
          url: url.url,
        })),
        urlSubCategories: { 'url-a': 'news', 'url-b': 'docs' },
      },
    ],
    timestamp: '2026-08-15T00:00:00.000Z',
    urls,
    userSettings: {
      activeAiSystemPrompt,
      activeAiSystemPromptId: activeAiSystemPrompt.id,
      aiSystemPrompts: [activeAiSystemPrompt],
    },
    version: '2.0.9',
  }
}

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

describe('convertLegacyBackup', () => {
  it('rejects non-legacy input before applying the legacy cutoff', () => {
    const error = (() => {
      try {
        convertLegacyBackup({ schemaVersion: 2 }, '2026-10-01')
      } catch (error) {
        return error
      }
      throw new Error('Expected conversion to fail')
    })()

    expect(error).toBeInstanceOf(BackupSchemaError)
    expect(error).toMatchObject({
      code: 'INVALID_SCHEMA',
      name: 'BackupSchemaError',
    })
  })

  it('converts the canonical schema-less exporter shape without duplicating URLs', () => {
    const conversion = convertLegacyBackup(
      createLegacyExporterBackup(),
      '2026-08-15',
    )

    expect(conversion.data.savedTabs.urls.map(({ id }) => id)).toEqual([
      'url-a',
      'url-b',
    ])
    expect(conversion.data.savedTabs.memberships).toHaveLength(4)
    expect(
      conversion.data.savedTabs.categories
        .filter(({ collectionId }) => collectionId === 'domain-group')
        .map(({ name }) => name),
    ).toEqual(['news', 'docs'])
    expect(checkPersistenceIntegrity(conversion.data.savedTabs).issues).toEqual(
      [],
    )
    expect(conversion.data.savedTabs.memberships).toContainEqual(
      expect.objectContaining({
        categoryId: 'project-1:category:0',
        collectionId: 'project-1',
        notes: 'memo',
        urlId: 'url-a',
      }),
    )
    expect(conversion.data.userSettings).not.toHaveProperty(
      'activeAiSystemPrompt',
    )
  })

  it('keeps mismatched parallel URLs fail-closed', () => {
    const backup = createLegacyExporterBackup()
    backup.savedTabs[0].urls[0].url = 'https://mismatch.example/a'

    const error = captureError(() => convertLegacyBackup(backup, '2026-08-15'))

    expect(error).toBeInstanceOf(LegacyBackupImportError)
    expect(error).toMatchObject({
      code: 'LEGACY_MIGRATION_BLOCKED',
      issueCodes: expect.arrayContaining(['LEGACY_URL_REFERENCE_CONFLICT']),
    })
  })

  it('keeps an unmatched saved-tab URL without an id fail-closed', () => {
    const backup = createLegacyExporterBackup()
    backup.savedTabs[0].urlIds = []
    Reflect.deleteProperty(backup.savedTabs[0], 'urlSubCategories')
    backup.savedTabs[0].urls[0].url = 'https://unmatched.example/a'

    const error = captureError(() => convertLegacyBackup(backup, '2026-08-15'))

    expect(error).toBeInstanceOf(LegacyBackupImportError)
    expect(error).toMatchObject({
      code: 'LEGACY_MIGRATION_BLOCKED',
      issueCodes: expect.arrayContaining(['LEGACY_URL_REFERENCE_CONFLICT']),
    })
  })

  it('keeps ambiguous canonical URL matches fail-closed', () => {
    const backup = createLegacyExporterBackup()
    backup.urls.push({ ...backup.urls[0], id: 'url-a-duplicate' })
    backup.savedTabs[0].urlIds = []

    const error = captureError(() => convertLegacyBackup(backup, '2026-08-15'))

    expect(error).toBeInstanceOf(LegacyBackupImportError)
    expect(error).toMatchObject({
      code: 'LEGACY_MIGRATION_BLOCKED',
      issueCodes: expect.arrayContaining(['LEGACY_URL_REFERENCE_CONFLICT']),
    })
  })

  it('keeps an unmatched custom-project URL without an id fail-closed', () => {
    const backup = createLegacyExporterBackup()
    backup.customProjects[0].urls[0].url = 'https://unmatched.example/a'

    const error = captureError(() => convertLegacyBackup(backup, '2026-08-15'))

    expect(error).toBeInstanceOf(LegacyBackupImportError)
    expect(error).toMatchObject({
      code: 'LEGACY_MIGRATION_BLOCKED',
      issueCodes: expect.arrayContaining(['LEGACY_URL_REFERENCE_CONFLICT']),
    })
  })

  it('requires top-level canonical URLs for nested saved-tab URLs in 2.x backups', () => {
    const backup = createLegacyExporterBackup()
    backup.customProjectOrder = []
    backup.customProjects = []
    backup.savedTabs[0].urlIds = []
    backup.urls = []

    const error = captureError(() => convertLegacyBackup(backup, '2026-08-15'))

    expect(error).toBeInstanceOf(LegacyBackupImportError)
    expect(error).toMatchObject({
      code: 'LEGACY_MIGRATION_BLOCKED',
      issueCodes: expect.arrayContaining(['LEGACY_URL_REFERENCE_CONFLICT']),
    })
  })

  it('requires top-level canonical URLs for nested custom URLs in 2.x backups', () => {
    const backup = createLegacyExporterBackup()
    backup.savedTabs = []
    backup.urls = []

    const error = captureError(() => convertLegacyBackup(backup, '2026-08-15'))

    expect(error).toBeInstanceOf(LegacyBackupImportError)
    expect(error).toMatchObject({
      code: 'LEGACY_MIGRATION_BLOCKED',
      issueCodes: expect.arrayContaining(['LEGACY_URL_REFERENCE_CONFLICT']),
    })
  })

  it('keeps an unknown category in a partial order fail-closed', () => {
    const backup = createLegacyExporterBackup()
    backup.savedTabs[0].subCategoryOrder = ['news', 'unknown']

    const error = captureError(() => convertLegacyBackup(backup, '2026-08-15'))

    expect(error).toBeInstanceOf(LegacyBackupImportError)
    expect(error).toMatchObject({
      code: 'LEGACY_MIGRATION_BLOCKED',
      issueCodes: expect.arrayContaining([
        'LEGACY_DOMAIN_CATEGORY_MAPPING_CONFLICT',
      ]),
    })
  })
})
