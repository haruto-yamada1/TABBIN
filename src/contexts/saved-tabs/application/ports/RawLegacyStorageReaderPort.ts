export const MIGRATION_SOURCE_KEYS = [
  'urls',
  'savedTabs',
  'customProjects',
  'customProjectOrder',
  'parentCategories',
  'domainCategorySettings',
  'domainCategoryMappings',
  'aiChatConversations',
  'activeAiChatConversationId',
  'savedAnalyticsViews',
] as const

export type MigrationSourceKey = (typeof MIGRATION_SOURCE_KEYS)[number]

export type RawLegacyStorageValue =
  | { readonly status: 'missing' }
  | { readonly status: 'present'; readonly value: unknown }

export type RawLegacyStorageSnapshot = Readonly<
  Record<MigrationSourceKey, RawLegacyStorageValue>
>

export type MigrationSourceReadErrorCode =
  | 'MIGRATION_SOURCE_INVALID_TYPE'
  | 'MIGRATION_SOURCE_READ_FAILED'
  | 'MIGRATION_SOURCE_PARTIAL_READ'

export class MigrationSourceReadError extends Error {
  readonly code: MigrationSourceReadErrorCode

  constructor(code: MigrationSourceReadErrorCode, options?: ErrorOptions) {
    super(`Migration source read failed (${code}).`, options)
    this.name = 'MigrationSourceReadError'
    this.code = code
  }
}

export type RawLegacyStorageReaderPort = {
  readonly readSnapshot: () => Promise<RawLegacyStorageSnapshot>
}
