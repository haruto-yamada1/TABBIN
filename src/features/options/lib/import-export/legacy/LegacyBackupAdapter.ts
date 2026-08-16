import { mapLegacyStorageToPersistenceV2 } from '@/contexts/saved-tabs/public-api'
import type {
  LegacyMigrationIssueCode,
  RawLegacyStorageSnapshot,
  RawLegacyStorageValue,
} from '@/contexts/saved-tabs/public-api'
import { isLegacyBackupImportSupported } from '@/features/options/lib/import-export/compatibility/legacyBackupPolicy'
import { BackupMapper } from '@/features/options/lib/import-export/v2/BackupMapper'
import type { BackupDataV2 } from '@/features/options/lib/import-export/v2/BackupV2Schema'
import {
  BackupSchemaError,
  detectBackupFormat,
} from '@/lib/persistence/backupSchema'
import { defaultSettings } from '@/lib/storage/settings'

import { LegacyBackupV0Schema } from './LegacyBackupV0Schema'
import type { LegacyBackupV0 } from './LegacyBackupV0Schema'

export type LegacyBackupImportErrorCode =
  | 'LEGACY_IMPORT_CUTOFF_REACHED'
  | 'LEGACY_MIGRATION_BLOCKED'

const LEGACY_BACKUP_IMPORT_ERROR_MESSAGES: Readonly<
  Record<LegacyBackupImportErrorCode, string>
> = {
  LEGACY_IMPORT_CUTOFF_REACHED: 'Legacy backup import is no longer supported',
  LEGACY_MIGRATION_BLOCKED: 'Legacy backup migration validation failed',
}

export class LegacyBackupImportError extends Error {
  readonly code: LegacyBackupImportErrorCode
  readonly issueCodes: readonly LegacyMigrationIssueCode[]

  constructor(
    code: LegacyBackupImportErrorCode,
    issueCodes: readonly LegacyMigrationIssueCode[] = [],
  ) {
    super(LEGACY_BACKUP_IMPORT_ERROR_MESSAGES[code])
    this.name = 'LegacyBackupImportError'
    this.code = code
    this.issueCodes = issueCodes
  }
}

export type LegacyBackupWarning = {
  readonly code: LegacyMigrationIssueCode
  readonly count: number
}

export type LegacyBackupConversion = {
  readonly appVersion: string
  readonly data: BackupDataV2
  readonly exportedAt: string
  readonly warnings: readonly LegacyBackupWarning[]
}

const toLegacySourceValue = (
  backup: Record<string, unknown>,
  key: string,
): RawLegacyStorageValue =>
  Object.hasOwn(backup, key)
    ? { status: 'present', value: backup[key] }
    : { status: 'missing' }

const toRawLegacyStorageSnapshot = (
  backup: Record<string, unknown>,
): RawLegacyStorageSnapshot => ({
  activeAiChatConversationId: toLegacySourceValue(
    backup,
    'activeAiChatConversationId',
  ),
  aiChatConversations: toLegacySourceValue(backup, 'aiChatConversations'),
  customProjectOrder: toLegacySourceValue(backup, 'customProjectOrder'),
  customProjects: toLegacySourceValue(backup, 'customProjects'),
  domainCategoryMappings: { status: 'missing' },
  domainCategorySettings: { status: 'missing' },
  parentCategories: toLegacySourceValue(backup, 'parentCategories'),
  savedAnalyticsViews: toLegacySourceValue(backup, 'savedAnalyticsViews'),
  savedTabs: toLegacySourceValue(backup, 'savedTabs'),
  urls: toLegacySourceValue(backup, 'urls'),
})

type LegacyNestedUrl = NonNullable<
  LegacyBackupV0['savedTabs'][number]['urls']
>[number]
type LegacyCanonicalUrl = NonNullable<LegacyBackupV0['urls']>[number]
type LegacyCustomProject = NonNullable<LegacyBackupV0['customProjects']>[number]
type LegacyCustomProjectUrl = NonNullable<LegacyCustomProject['urls']>[number]
type LegacyUrlMetadata = NonNullable<LegacyCustomProject['urlMetadata']>

const createExporterUrlKey = (url: {
  readonly title: string
  readonly url: string
}): string => JSON.stringify([url.url, url.title])

const createCanonicalUrlIndex = (
  urls: readonly LegacyCanonicalUrl[],
): ReadonlyMap<string, readonly LegacyCanonicalUrl[]> => {
  const index = new Map<string, LegacyCanonicalUrl[]>()
  for (const url of urls) {
    const key = createExporterUrlKey(url)
    const matches = index.get(key) ?? []
    matches.push(url)
    index.set(key, matches)
  }
  return index
}

const resolveCanonicalUrlIds = (
  urls: readonly { readonly title: string; readonly url: string }[],
  canonicalUrlIndex: ReadonlyMap<string, readonly LegacyCanonicalUrl[]>,
): readonly string[] | undefined => {
  const ids: string[] = []
  for (const url of urls) {
    const matches = canonicalUrlIndex.get(createExporterUrlKey(url)) ?? []
    if (matches.length !== 1) {
      return undefined
    }
    ids.push(matches[0].id)
  }
  return ids
}

const normalizeLegacyNestedUrl = (
  url: LegacyNestedUrl,
): Omit<LegacyNestedUrl, 'tabId' | 'timestamp'> => {
  const savedAt = url.savedAt ?? url.timestamp
  return {
    ...(url.favIconUrl === undefined ? {} : { favIconUrl: url.favIconUrl }),
    ...(url.id === undefined ? {} : { id: url.id }),
    ...(savedAt === undefined ? {} : { savedAt }),
    ...(url.subCategory === undefined ? {} : { subCategory: url.subCategory }),
    title: url.title,
    url: url.url,
  }
}

const completeLegacyCategoryOrder = (
  order: readonly string[] | undefined,
  categories: readonly string[] | undefined,
  options: { readonly hasUncategorizedMarker: boolean },
): string[] | undefined => {
  if (!order || !categories) {
    return order === undefined ? undefined : [...order]
  }
  const categorySet = new Set(categories)
  if (categorySet.size !== categories.length) {
    return [...order]
  }
  const orderedCategories = options.hasUncategorizedMarker
    ? order.filter((category) => category !== '__uncategorized')
    : order
  const orderedSet = new Set(orderedCategories)
  if (
    orderedSet.size !== orderedCategories.length ||
    orderedCategories.some((category) => !categorySet.has(category))
  ) {
    return [...order]
  }
  return [
    ...order,
    ...categories.filter((category) => !orderedSet.has(category)),
  ]
}

const resolveSavedTabUrlIds = (
  normalizedUrls: readonly LegacyNestedUrl[] | undefined,
  existingUrlIds: readonly string[] | undefined,
  canonicalUrlIndex: ReadonlyMap<string, readonly LegacyCanonicalUrl[]>,
): readonly string[] | undefined => {
  if (normalizedUrls === undefined) {
    return undefined
  }
  if (existingUrlIds && existingUrlIds.length > 0) {
    if (existingUrlIds.length !== normalizedUrls.length) {
      return undefined
    }
    return existingUrlIds
  }
  return resolveCanonicalUrlIds(normalizedUrls, canonicalUrlIndex)
}

const normalizeLegacySavedTab = (
  savedTab: LegacyBackupV0['savedTabs'][number],
  canonicalUrlIndex: ReadonlyMap<string, readonly LegacyCanonicalUrl[]>,
  requiresCanonicalUrlReferences: boolean,
): LegacyBackupV0['savedTabs'][number] => {
  const normalizedUrls = savedTab.urls?.map(normalizeLegacyNestedUrl)
  const resolvedUrlIds = resolveSavedTabUrlIds(
    normalizedUrls,
    savedTab.urlIds,
    canonicalUrlIndex,
  )
  if (
    normalizedUrls !== undefined &&
    (savedTab.urlIds?.length ?? 0) === 0 &&
    requiresCanonicalUrlReferences &&
    resolvedUrlIds === undefined
  ) {
    throw new LegacyBackupImportError('LEGACY_MIGRATION_BLOCKED', [
      'LEGACY_URL_REFERENCE_CONFLICT',
    ])
  }
  return {
    ...savedTab,
    ...(resolvedUrlIds === undefined ? {} : { urlIds: [...resolvedUrlIds] }),
    ...(normalizedUrls === undefined
      ? {}
      : {
          urls: normalizedUrls.map((url, index) =>
            url.id === undefined && resolvedUrlIds?.[index]
              ? { ...url, id: resolvedUrlIds[index] }
              : url,
          ),
        }),
    ...(savedTab.subCategoryOrder === undefined
      ? {}
      : {
          subCategoryOrder: completeLegacyCategoryOrder(
            savedTab.subCategoryOrder,
            savedTab.subCategories,
            { hasUncategorizedMarker: false },
          ),
        }),
    ...(savedTab.subCategoryOrderWithUncategorized === undefined
      ? {}
      : {
          subCategoryOrderWithUncategorized: completeLegacyCategoryOrder(
            savedTab.subCategoryOrderWithUncategorized,
            savedTab.subCategories,
            { hasUncategorizedMarker: true },
          ),
        }),
  }
}

const buildLegacyProjectUrlMetadata = (
  project: LegacyCustomProject,
  urls: readonly LegacyCustomProjectUrl[],
  urlIds: readonly string[],
): LegacyUrlMetadata | undefined => {
  const metadata: LegacyUrlMetadata = { ...project.urlMetadata }
  urls.forEach((url, index) => {
    const urlId = urlIds[index]
    if (
      Object.hasOwn(metadata, urlId) ||
      (url.category === undefined && url.notes === undefined)
    ) {
      return
    }
    metadata[urlId] = {
      ...(url.category === undefined ? {} : { category: url.category }),
      ...(url.notes === undefined ? {} : { notes: url.notes }),
    }
  })
  return Object.keys(metadata).length > 0 ? metadata : undefined
}

const normalizeLegacyCustomProject = (
  project: LegacyCustomProject,
  canonicalUrlIndex: ReadonlyMap<string, readonly LegacyCanonicalUrl[]>,
  requiresCanonicalUrlReferences: boolean,
): LegacyCustomProject => {
  const normalizedProject = {
    ...project,
    ...(project.projectKeywords === undefined
      ? {}
      : {
          projectKeywords: {
            domainKeywords: project.projectKeywords.domainKeywords ?? [],
            titleKeywords: project.projectKeywords.titleKeywords ?? [],
            urlKeywords: project.projectKeywords.urlKeywords ?? [],
          },
        }),
  }
  if (
    project.urls === undefined ||
    (project.urlIds !== undefined && project.urlIds.length > 0)
  ) {
    return normalizedProject
  }
  const urlIds = resolveCanonicalUrlIds(project.urls, canonicalUrlIndex)
  if (!urlIds) {
    if (requiresCanonicalUrlReferences) {
      throw new LegacyBackupImportError('LEGACY_MIGRATION_BLOCKED', [
        'LEGACY_URL_REFERENCE_CONFLICT',
      ])
    }
    return normalizedProject
  }
  const urlMetadata = buildLegacyProjectUrlMetadata(
    project,
    project.urls,
    urlIds,
  )
  return {
    ...normalizedProject,
    urlIds: [...urlIds],
    ...(urlMetadata === undefined ? {} : { urlMetadata }),
  }
}

const normalizeLegacyBackupForMapper = (
  backup: LegacyBackupV0,
): LegacyBackupV0 => {
  const canonicalUrlIndex = createCanonicalUrlIndex(backup.urls ?? [])
  const requiresCanonicalUrlReferences = backup.version.startsWith('2.')
  return {
    ...backup,
    ...(backup.customProjects === undefined
      ? {}
      : {
          customProjects: backup.customProjects.map((project) =>
            normalizeLegacyCustomProject(
              project,
              canonicalUrlIndex,
              requiresCanonicalUrlReferences,
            ),
          ),
        }),
    savedTabs: backup.savedTabs.map((savedTab) =>
      normalizeLegacySavedTab(
        savedTab,
        canonicalUrlIndex,
        requiresCanonicalUrlReferences,
      ),
    ),
  }
}

export const convertLegacyBackup = (
  input: unknown,
  importDate: string,
): LegacyBackupConversion => {
  if (detectBackupFormat(input).kind !== 'legacy') {
    throw new BackupSchemaError('INVALID_SCHEMA')
  }
  if (!isLegacyBackupImportSupported(importDate)) {
    throw new LegacyBackupImportError('LEGACY_IMPORT_CUTOFF_REACHED')
  }

  const legacyResult = LegacyBackupV0Schema.safeParse(input)
  if (!legacyResult.success) {
    throw new BackupSchemaError('INVALID_SCHEMA')
  }

  const legacyBackup = legacyResult.data
  const normalizedLegacyBackup = normalizeLegacyBackupForMapper(legacyBackup)
  const migration = mapLegacyStorageToPersistenceV2(
    toRawLegacyStorageSnapshot(normalizedLegacyBackup),
  )
  const errors = migration.issues.filter(({ severity }) => severity === 'error')
  if (errors.length > 0) {
    throw new LegacyBackupImportError(
      'LEGACY_MIGRATION_BLOCKED',
      errors.map(({ code }) => code),
    )
  }

  const userSettings = {
    ...structuredClone(defaultSettings),
    ...structuredClone(legacyBackup.userSettings),
  }
  const data = BackupMapper.toBackupData(
    {
      ...migration.target,
      revision: 0,
    },
    userSettings,
  )

  return {
    appVersion: legacyBackup.version,
    data,
    exportedAt: legacyBackup.timestamp,
    warnings: migration.issues.reduce<LegacyBackupWarning[]>(
      (warnings, { code, occurrenceCount, severity }) => {
        if (severity === 'warning') {
          warnings.push({ code, count: occurrenceCount })
        }
        return warnings
      },
      [],
    ),
  }
}
