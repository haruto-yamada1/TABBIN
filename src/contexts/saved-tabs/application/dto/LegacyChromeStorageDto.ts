import type {
  MigrationSourceKey,
  RawLegacyStorageSnapshot,
} from '@/contexts/saved-tabs/application/ports/RawLegacyStorageReaderPort'

export type LegacyUrlDto = {
  readonly favIconUrl?: unknown
  readonly id?: unknown
  readonly savedAt?: unknown
  readonly title?: unknown
  readonly url?: unknown
}

export type LegacyCollectionDto = {
  readonly id?: unknown
  readonly urlIds?: unknown
  readonly urls?: unknown
}

export type LegacyConversationDto = {
  readonly createdAt?: unknown
  readonly id?: unknown
  readonly messages?: unknown
  readonly title?: unknown
  readonly updatedAt?: unknown
}

export type LegacyAnalyticsViewDto = {
  readonly createdAt?: unknown
  readonly id?: unknown
  readonly updatedAt?: unknown
}

export type LegacyChromeStorageDto = {
  readonly activeAiChatConversationId: unknown
  readonly aiChatConversations: readonly unknown[]
  readonly customProjectOrder: readonly unknown[]
  readonly customProjects: readonly unknown[]
  readonly domainCategoryMappings: readonly unknown[]
  readonly domainCategorySettings: readonly unknown[]
  readonly parentCategories: readonly unknown[]
  readonly savedAnalyticsViews: readonly unknown[]
  readonly savedTabs: readonly unknown[]
  readonly urls: readonly unknown[]
}

export type LegacyChromeStorageDtoIssue = {
  readonly code:
    | 'MIGRATION_SOURCE_INVALID_TYPE'
    | 'MIGRATION_SOURCE_MISSING_KEY'
  readonly key: MigrationSourceKey
  readonly severity: 'error' | 'warning'
}

export type LegacyChromeStorageParseResult = {
  readonly dto: LegacyChromeStorageDto
  readonly issues: readonly LegacyChromeStorageDtoIssue[]
}

const readArray = (
  source: RawLegacyStorageSnapshot,
  key: Exclude<MigrationSourceKey, 'activeAiChatConversationId'>,
  issues: LegacyChromeStorageDtoIssue[],
): readonly unknown[] => {
  const entry = source[key]
  if (entry.status === 'missing') {
    issues.push({
      code: 'MIGRATION_SOURCE_MISSING_KEY',
      key,
      severity: 'warning',
    })
    return []
  }
  if (!Array.isArray(entry.value)) {
    issues.push({
      code: 'MIGRATION_SOURCE_INVALID_TYPE',
      key,
      severity: 'error',
    })
    return []
  }
  return entry.value
}

const readActiveConversationId = (
  source: RawLegacyStorageSnapshot,
  issues: LegacyChromeStorageDtoIssue[],
): unknown => {
  const key = 'activeAiChatConversationId'
  const entry = source[key]
  if (entry.status === 'missing') {
    issues.push({
      code: 'MIGRATION_SOURCE_MISSING_KEY',
      key,
      severity: 'warning',
    })
    return ''
  }
  if (typeof entry.value !== 'string') {
    issues.push({
      code: 'MIGRATION_SOURCE_INVALID_TYPE',
      key,
      severity: 'error',
    })
    return ''
  }
  return entry.value
}

export const parseLegacyChromeStorage = (
  source: RawLegacyStorageSnapshot,
): LegacyChromeStorageParseResult => {
  const issues: LegacyChromeStorageDtoIssue[] = []
  const dto: LegacyChromeStorageDto = {
    activeAiChatConversationId: readActiveConversationId(source, issues),
    aiChatConversations: readArray(source, 'aiChatConversations', issues),
    customProjectOrder: readArray(source, 'customProjectOrder', issues),
    customProjects: readArray(source, 'customProjects', issues),
    domainCategoryMappings: readArray(source, 'domainCategoryMappings', issues),
    domainCategorySettings: readArray(source, 'domainCategorySettings', issues),
    parentCategories: readArray(source, 'parentCategories', issues),
    savedAnalyticsViews: readArray(source, 'savedAnalyticsViews', issues),
    savedTabs: readArray(source, 'savedTabs', issues),
    urls: readArray(source, 'urls', issues),
  }
  return {
    dto,
    issues: issues.toSorted((left, right) => left.key.localeCompare(right.key)),
  }
}
