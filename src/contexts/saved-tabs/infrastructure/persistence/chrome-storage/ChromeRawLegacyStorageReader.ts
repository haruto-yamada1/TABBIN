import {
  MIGRATION_SOURCE_KEYS,
  MigrationSourceReadError,
} from '@/contexts/saved-tabs/application/ports/RawLegacyStorageReaderPort'
import type {
  MigrationSourceKey,
  RawLegacyStorageReaderPort,
  RawLegacyStorageSnapshot,
  RawLegacyStorageValue,
} from '@/contexts/saved-tabs/application/ports/RawLegacyStorageReaderPort'

export type RawLegacyStorageArea = {
  readonly get: (keys: MigrationSourceKey[]) => Promise<unknown>
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const readValue = (
  result: Record<string, unknown>,
  key: MigrationSourceKey,
): RawLegacyStorageValue =>
  Object.hasOwn(result, key)
    ? { status: 'present', value: result[key] }
    : { status: 'missing' }

export class ChromeRawLegacyStorageReader implements RawLegacyStorageReaderPort {
  private readonly storage: RawLegacyStorageArea

  constructor(storage: RawLegacyStorageArea) {
    this.storage = storage
  }

  async readSnapshot(): Promise<RawLegacyStorageSnapshot> {
    let result: unknown
    try {
      result = await this.storage.get([...MIGRATION_SOURCE_KEYS])
    } catch (error) {
      throw new MigrationSourceReadError('MIGRATION_SOURCE_READ_FAILED', {
        cause: error,
      })
    }

    if (!isRecord(result)) {
      throw new MigrationSourceReadError('MIGRATION_SOURCE_PARTIAL_READ')
    }

    return {
      activeAiChatConversationId: readValue(
        result,
        'activeAiChatConversationId',
      ),
      aiChatConversations: readValue(result, 'aiChatConversations'),
      customProjectOrder: readValue(result, 'customProjectOrder'),
      customProjects: readValue(result, 'customProjects'),
      domainCategoryMappings: readValue(result, 'domainCategoryMappings'),
      domainCategorySettings: readValue(result, 'domainCategorySettings'),
      parentCategories: readValue(result, 'parentCategories'),
      savedAnalyticsViews: readValue(result, 'savedAnalyticsViews'),
      savedTabs: readValue(result, 'savedTabs'),
      urls: readValue(result, 'urls'),
    }
  }
}
