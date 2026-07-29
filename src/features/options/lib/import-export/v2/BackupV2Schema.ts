import { z } from 'zod'

import type {
  PersistenceJsonRecord,
  PersistenceMessageRecord,
  PersistenceV2Collection,
  PersistenceV2CollectionCategory,
  PersistenceV2CollectionGroup,
  PersistenceV2CollectionMembership,
  PersistenceV2Snapshot,
  PersistenceV2Url,
} from '@/contexts/saved-tabs/public-api'
import { isJsonValue } from '@/lib/persistence/jsonValue'
import type { JsonValue } from '@/lib/persistence/jsonValue'
import {
  aiSystemPromptPresetSchema,
  UserSettingsSchema,
} from '@/lib/storage/zod-storage'
import type { UserSettings } from '@/types/storage'

export const BACKUP_V2_SCHEMA_VERSION = 2 as const

export const BackupV2EpochMillisecondsSchema = z
  .number()
  .refine(
    (value) =>
      Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0),
    {
      error: 'Expected non-negative epoch milliseconds',
    },
  )

const jsonValueSchema = z.custom<JsonValue>(isJsonValue, {
  error: 'Expected a JSON-safe value',
})

const persistenceV2ProjectKeywordSettingsSchema = z.strictObject({
  domainKeywords: z.array(z.string()),
  titleKeywords: z.array(z.string()),
  urlKeywords: z.array(z.string()),
})

const persistenceV2CollectionDefinitionSchema = z.discriminatedUnion('type', [
  z.strictObject({
    domain: z.string(),
    type: z.literal('domain'),
  }),
  z.strictObject({
    projectKeywords: persistenceV2ProjectKeywordSettingsSchema,
    type: z.literal('custom'),
  }),
])

export const PersistenceV2UrlSchema: z.ZodType<PersistenceV2Url> =
  z.strictObject({
    favIconUrl: z.string().optional(),
    firstSavedAt: BackupV2EpochMillisecondsSchema,
    id: z.string(),
    lastSavedAt: BackupV2EpochMillisecondsSchema,
    normalizedUrl: z.string(),
    title: z.string(),
    updatedAt: BackupV2EpochMillisecondsSchema,
    url: z.string(),
  })

export const PersistenceV2CollectionSchema: z.ZodType<PersistenceV2Collection> =
  z.strictObject({
    createdAt: BackupV2EpochMillisecondsSchema,
    definition: persistenceV2CollectionDefinitionSchema,
    groupId: z.string().optional(),
    id: z.string(),
    name: z.string(),
    sortOrder: z.number(),
    updatedAt: BackupV2EpochMillisecondsSchema,
  })

export const PersistenceV2CollectionMembershipSchema: z.ZodType<PersistenceV2CollectionMembership> =
  z.strictObject({
    addedAt: BackupV2EpochMillisecondsSchema,
    categoryId: z.string().optional(),
    collectionId: z.string(),
    notes: z.string().optional(),
    sortOrder: z.number(),
    updatedAt: BackupV2EpochMillisecondsSchema,
    urlId: z.string(),
  })

export const PersistenceV2CollectionCategorySchema: z.ZodType<PersistenceV2CollectionCategory> =
  z.strictObject({
    collectionId: z.string(),
    createdAt: BackupV2EpochMillisecondsSchema,
    id: z.string(),
    keywords: z.array(z.string()),
    name: z.string(),
    sortOrder: z.number(),
    updatedAt: BackupV2EpochMillisecondsSchema,
  })

export const PersistenceV2CollectionGroupSchema: z.ZodType<PersistenceV2CollectionGroup> =
  z.strictObject({
    createdAt: BackupV2EpochMillisecondsSchema,
    id: z.string(),
    name: z.string(),
    sortOrder: z.number(),
    updatedAt: BackupV2EpochMillisecondsSchema,
  })

export const PersistenceV2SnapshotSchema: z.ZodType<PersistenceV2Snapshot> =
  z.strictObject({
    categories: z.array(PersistenceV2CollectionCategorySchema),
    collections: z.array(PersistenceV2CollectionSchema),
    groups: z.array(PersistenceV2CollectionGroupSchema),
    memberships: z.array(PersistenceV2CollectionMembershipSchema),
    urls: z.array(PersistenceV2UrlSchema),
  })

export const PersistenceJsonRecordSchema: z.ZodType<PersistenceJsonRecord> =
  z.strictObject({
    id: z.string(),
    updatedAt: BackupV2EpochMillisecondsSchema,
    value: jsonValueSchema,
  })

export const PersistenceMessageRecordSchema: z.ZodType<PersistenceMessageRecord> =
  z.strictObject({
    conversationId: z.string(),
    createdAt: BackupV2EpochMillisecondsSchema,
    id: z.string(),
    value: jsonValueSchema,
  })

const backupAiSystemPromptPresetSchema = z.strictObject({
  ...aiSystemPromptPresetSchema.shape,
  createdAt: BackupV2EpochMillisecondsSchema,
  updatedAt: BackupV2EpochMillisecondsSchema,
})

const BackupUserSettingsSchema: z.ZodType<UserSettings> = z
  .strictObject({
    ...UserSettingsSchema.shape,
    aiSystemPrompts: z.array(backupAiSystemPromptPresetSchema).optional(),
  })
  .refine(isJsonValue, {
    error: 'Expected JSON-safe user settings',
  })

export const BackupDataV2Schema = z.strictObject({
  analyticsViews: z.array(PersistenceJsonRecordSchema),
  conversations: z.array(PersistenceJsonRecordSchema),
  messages: z.array(PersistenceMessageRecordSchema),
  savedTabs: PersistenceV2SnapshotSchema,
  userSettings: BackupUserSettingsSchema,
})

export type BackupDataV2 = z.infer<typeof BackupDataV2Schema>

export const BackupEnvelopeV2Schema = z.strictObject({
  appVersion: z.string().min(1),
  data: BackupDataV2Schema,
  exportedAt: z.iso.datetime(),
  schemaVersion: z.literal(BACKUP_V2_SCHEMA_VERSION),
})

export type BackupEnvelopeV2 = z.infer<typeof BackupEnvelopeV2Schema>
