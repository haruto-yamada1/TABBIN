import { describe, expect, it } from 'vitest'

import type {
  PersistenceLogicalSnapshot,
  PersistenceV2Snapshot,
} from '@/contexts/saved-tabs/public-api'
import type { UserSettings } from '@/types/storage'

import { BackupMapper } from './BackupMapper'
import {
  BACKUP_V2_SCHEMA_VERSION,
  BackupDataV2Schema,
  BackupEnvelopeV2Schema,
  PersistenceJsonRecordSchema,
  PersistenceMessageRecordSchema,
  PersistenceV2CollectionCategorySchema,
  PersistenceV2CollectionGroupSchema,
  PersistenceV2CollectionMembershipSchema,
  PersistenceV2CollectionSchema,
  PersistenceV2UrlSchema,
} from './BackupV2Schema'

const userSettings = {
  clickBehavior: 'saveCurrentTab',
  confirmDeleteAll: true,
  confirmDeleteEach: true,
  enableCategories: true,
  excludePatterns: ['z.example', 'a.example'],
  excludePinnedTabs: false,
  openAllInNewWindow: false,
  openUrlInBackground: false,
  removeTabAfterExternalDrop: false,
  removeTabAfterOpen: false,
  showSavedTime: true,
} satisfies UserSettings

const createSavedTabs = (reverse = false): PersistenceV2Snapshot => {
  const urls = [
    {
      firstSavedAt: 10,
      firstSavedAtProvenance: 'legacy-fallback' as const,
      id: 'url-z',
      lastSavedAt: 20,
      lastSavedAtProvenance: 'exact' as const,
      normalizedUrl: 'https://z.example/',
      title: 'Z title',
      updatedAt: 20,
      url: 'https://z.example/',
    },
    {
      firstSavedAt: 10,
      firstSavedAtProvenance: 'legacy-fallback' as const,
      id: 'url-a',
      lastSavedAt: 20,
      lastSavedAtProvenance: 'exact' as const,
      normalizedUrl: 'https://a.example/',
      title: 'A title',
      updatedAt: 20,
      url: 'https://a.example/',
    },
  ] as const
  const memberships = urls.map(({ id }, index) => ({
    addedAt: 10,
    addedAtProvenance: 'exact' as const,
    collectionId: 'collection-1',
    notes: id,
    sortOrder: (index + 1) * 1024,
    updatedAt: 20,
    urlId: id,
  }))

  return {
    categories: [
      {
        collectionId: 'collection-1',
        createdAt: 10,
        id: 'category-1',
        keywords: reverse ? ['zeta', 'alpha'] : ['alpha', 'zeta'],
        name: 'Category',
        sortOrder: 1024,
        updatedAt: 20,
      },
    ],
    collections: [
      {
        createdAt: 10,
        definition: { domain: 'example.test', type: 'domain' },
        groupId: 'group-1',
        id: 'collection-1',
        name: 'Collection',
        sortOrder: 1024,
        updatedAt: 20,
      },
    ],
    groups: [
      {
        createdAt: 10,
        id: 'group-1',
        name: 'Group',
        sortOrder: 1024,
        updatedAt: 20,
      },
    ],
    memberships: reverse ? memberships.toReversed() : memberships,
    urls: reverse ? urls.toReversed() : urls,
  }
}

const createLogicalSnapshot = (reverse = false): PersistenceLogicalSnapshot => {
  const conversations = [
    {
      id: 'conversation-z',
      updatedAt: 20,
      value: reverse
        ? { nested: { z: 1, a: 2 }, title: 'Z' }
        : { title: 'Z', nested: { a: 2, z: 1 } },
    },
    {
      id: 'conversation-a',
      updatedAt: 20,
      value: { title: 'A' },
    },
  ] as const
  const messages = [
    {
      conversationId: 'conversation-z',
      createdAt: 20,
      id: 'message-z',
      value: reverse
        ? { role: 'assistant', content: 'Z' }
        : { content: 'Z', role: 'assistant' },
    },
    {
      conversationId: 'conversation-a',
      createdAt: 10,
      id: 'message-a',
      value: { content: 'A', role: 'user' },
    },
  ] as const
  const analyticsViews = [
    {
      id: 'view-z',
      updatedAt: 20,
      value: reverse ? { z: 1, a: 2 } : { a: 2, z: 1 },
    },
    { id: 'view-a', updatedAt: 10, value: { name: 'A' } },
  ] as const

  return {
    analyticsViews: reverse ? analyticsViews.toReversed() : analyticsViews,
    conversations: reverse ? conversations.toReversed() : conversations,
    messages: reverse ? messages.toReversed() : messages,
    revision: reverse ? 99 : 1,
    savedTabs: createSavedTabs(reverse),
  }
}

describe('Backup V2 schemas', () => {
  it('separates schema and app versions and round-trips JSON', () => {
    const data = BackupMapper.toBackupData(
      createLogicalSnapshot(),
      userSettings,
    )
    const envelope = BackupEnvelopeV2Schema.parse({
      appVersion: '2026.7.28',
      data,
      exportedAt: '2026-07-28T00:00:00.000Z',
      schemaVersion: BACKUP_V2_SCHEMA_VERSION,
    })

    expect(envelope.schemaVersion).toBe(2)
    expect(envelope.appVersion).toBe('2026.7.28')
    const serialized = JSON.stringify(envelope)
    const parsed: unknown = JSON.parse(serialized)
    expect(BackupEnvelopeV2Schema.parse(parsed)).toEqual(envelope)
  })

  it('rejects unknown internal and legacy fields at every public boundary', () => {
    const data = BackupMapper.toBackupData(
      createLogicalSnapshot(),
      userSettings,
    )
    const envelope = {
      appVersion: '2026.7.28',
      data,
      exportedAt: '2026-07-28T00:00:00.000Z',
      schemaVersion: 2,
    }

    expect(
      BackupEnvelopeV2Schema.safeParse({ ...envelope, revision: 1 }).success,
    ).toBe(false)
    expect(
      BackupDataV2Schema.safeParse({ ...data, recoverySnapshots: [] }).success,
    ).toBe(false)
    expect(
      BackupDataV2Schema.safeParse({
        ...data,
        savedTabs: { ...data.savedTabs, urlIds: [] },
      }).success,
    ).toBe(false)
    expect(
      BackupDataV2Schema.safeParse({
        ...data,
        savedTabs: {
          ...data.savedTabs,
          collections: [{ ...data.savedTabs.collections[0], urls: [] }],
        },
      }).success,
    ).toBe(false)
    expect(
      BackupDataV2Schema.safeParse({
        ...data,
        userSettings: { ...data.userSettings, legacySetting: true },
      }).success,
    ).toBe(false)
  })

  it('uses isJsonValue semantics for persistence record values', () => {
    const data = BackupMapper.toBackupData(
      createLogicalSnapshot(),
      userSettings,
    )

    expect(
      BackupDataV2Schema.safeParse({
        ...data,
        conversations: [
          {
            id: 'conversation-invalid',
            updatedAt: 1,
            value: { invalid: Number.POSITIVE_INFINITY },
          },
        ],
      }).success,
    ).toBe(false)
  })

  it.each([
    {
      fields: ['firstSavedAt', 'lastSavedAt', 'updatedAt'],
      name: 'saved URL',
      record: createSavedTabs().urls[0],
      schema: PersistenceV2UrlSchema,
    },
    {
      fields: ['createdAt', 'updatedAt'],
      name: 'collection',
      record: createSavedTabs().collections[0],
      schema: PersistenceV2CollectionSchema,
    },
    {
      fields: ['addedAt', 'updatedAt'],
      name: 'membership',
      record: createSavedTabs().memberships[0],
      schema: PersistenceV2CollectionMembershipSchema,
    },
    {
      fields: ['createdAt', 'updatedAt'],
      name: 'category',
      record: createSavedTabs().categories[0],
      schema: PersistenceV2CollectionCategorySchema,
    },
    {
      fields: ['createdAt', 'updatedAt'],
      name: 'group',
      record: createSavedTabs().groups[0],
      schema: PersistenceV2CollectionGroupSchema,
    },
    {
      fields: ['updatedAt'],
      name: 'JSON record',
      record: createLogicalSnapshot().conversations[0],
      schema: PersistenceJsonRecordSchema,
    },
    {
      fields: ['createdAt'],
      name: 'message record',
      record: createLogicalSnapshot().messages[0],
      schema: PersistenceMessageRecordSchema,
    },
  ])(
    'rejects invalid epoch milliseconds for $name',
    ({ fields, record, schema }) => {
      const invalidValues = [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, -0] as const

      for (const field of fields) {
        for (const value of invalidValues) {
          expect(
            schema.safeParse({ ...record, [field]: value }).success,
            `${field} accepted ${Object.is(value, -0) ? '-0' : value}`,
          ).toBe(false)
        }
      }
    },
  )

  it.each(['createdAt', 'updatedAt'] as const)(
    'rejects invalid epoch milliseconds for AI prompt %s',
    (field) => {
      const invalidValues = [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, -0] as const

      for (const value of invalidValues) {
        expect(
          BackupDataV2Schema.shape.userSettings.safeParse({
            ...userSettings,
            aiSystemPrompts: [
              {
                createdAt: 1,
                id: 'prompt-1',
                name: 'Prompt',
                template: 'Template',
                updatedAt: 2,
                [field]: value,
              },
            ],
          }).success,
          `${field} accepted ${Object.is(value, -0) ? '-0' : value}`,
        ).toBe(false)
      }
    },
  )
})

describe('BackupMapper', () => {
  it('omits revision and canonicalizes unordered containers and JSON keys', () => {
    const forward = BackupMapper.toBackupData(
      createLogicalSnapshot(),
      userSettings,
    )
    const reversed = BackupMapper.toBackupData(createLogicalSnapshot(true), {
      ...userSettings,
      excludePatterns: userSettings.excludePatterns.toReversed(),
    })

    expect(forward).not.toHaveProperty('revision')
    expect(JSON.stringify(forward)).toBe(JSON.stringify(reversed))
    expect(forward.savedTabs.urls.map(({ id }) => id)).toEqual([
      'url-a',
      'url-z',
    ])
    expect(forward.savedTabs.categories[0]?.keywords).toEqual(['alpha', 'zeta'])
    expect(forward.conversations.map(({ id }) => id)).toEqual([
      'conversation-a',
      'conversation-z',
    ])
  })

  it('injects import revision explicitly instead of reading backup metadata', () => {
    const data = BackupMapper.toBackupData(
      createLogicalSnapshot(),
      userSettings,
    )
    const snapshot = BackupMapper.toLogicalSnapshot(data, 42)

    expect(snapshot.revision).toBe(42)
    expect(snapshot.savedTabs).toEqual(data.savedTabs)
    expect(snapshot.conversations).toEqual(data.conversations)
    expect(() => BackupMapper.toLogicalSnapshot(data, -1)).toThrow('revision')
  })

  it('preserves the semantic order of AI system prompts', () => {
    const settingsWithPrompts = {
      ...userSettings,
      aiSystemPrompts: [
        {
          createdAt: 1,
          id: 'prompt-z',
          name: 'First',
          template: 'First template',
          updatedAt: 2,
        },
        {
          createdAt: 3,
          id: 'prompt-a',
          name: 'Second',
          template: 'Second template',
          updatedAt: 4,
        },
      ],
    } satisfies UserSettings

    const mapped = BackupMapper.toBackupData(
      createLogicalSnapshot(),
      settingsWithPrompts,
    )

    expect(mapped.userSettings.aiSystemPrompts?.map(({ id }) => id)).toEqual([
      'prompt-z',
      'prompt-a',
    ])
  })
})
