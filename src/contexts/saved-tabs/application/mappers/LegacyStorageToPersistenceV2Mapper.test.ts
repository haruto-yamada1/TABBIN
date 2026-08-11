import { describe, expect, it } from 'vitest'

import { MIGRATION_SOURCE_KEYS } from '@/contexts/saved-tabs/application/ports/RawLegacyStorageReaderPort'
import type {
  MigrationSourceKey,
  RawLegacyStorageSnapshot,
} from '@/contexts/saved-tabs/application/ports/RawLegacyStorageReaderPort'

import {
  analyzeLegacyMigrationPreflight,
  mapLegacyStorageToPersistenceV2,
} from './LegacyStorageToPersistenceV2Mapper'

const arraySourceKeys = MIGRATION_SOURCE_KEYS.filter(
  (key) => key !== 'activeAiChatConversationId',
)

const createEmptySnapshot = (): RawLegacyStorageSnapshot => {
  const entries = Object.fromEntries(
    MIGRATION_SOURCE_KEYS.map((key) => [
      key,
      {
        status: 'present',
        value: key === 'activeAiChatConversationId' ? '' : [],
      },
    ]),
  )
  return entries as RawLegacyStorageSnapshot
}

const withSource = (
  snapshot: RawLegacyStorageSnapshot,
  key: MigrationSourceKey,
  value: unknown,
): RawLegacyStorageSnapshot => ({
  ...snapshot,
  [key]: { status: 'present', value },
})

describe('analyzeLegacyMigrationPreflight', () => {
  it('uses the dedicated pure legacy-to-v2 mapper as the preflight source of truth', () => {
    const source = createEmptySnapshot()

    expect(analyzeLegacyMigrationPreflight(source)).toStrictEqual(
      mapLegacyStorageToPersistenceV2(source),
    )
  })

  it('treats present empty sources as a healthy empty snapshot', () => {
    const result = analyzeLegacyMigrationPreflight(createEmptySnapshot())

    expect(result.issueCodes).toEqual([])
    expect(result.collisionCount).toBe(0)
    expect(result.entityCounts).toEqual({
      analyticsViews: 0,
      attachments: 0,
      categories: 0,
      collections: 0,
      conversations: 0,
      groups: 0,
      memberships: 0,
      messages: 0,
      settings: 0,
      urls: 0,
    })
    expect(result.snapshot).toEqual({
      categories: [],
      collections: [],
      groups: [],
      memberships: [],
      urls: [],
    })
    expect(result.approximateSourceBytes).toBeGreaterThan(0)
    expect(result.targetSerializedBytes).toBeGreaterThan(0)
  })

  it('reports non-JSON-safe target values without throwing', () => {
    const source = withSource(createEmptySnapshot(), 'savedAnalyticsViews', [
      1n,
    ])

    const result = analyzeLegacyMigrationPreflight(source)

    expect(result.issueCodes).toContain('NON_JSON_SAFE_VALUE')
    expect(result.approximateSourceBytes).toBe(0)
    expect(result.targetSerializedBytes).toBe(0)
  })

  it('distinguishes a missing key from an invalid stored value', () => {
    const source = {
      ...createEmptySnapshot(),
      savedTabs: { status: 'missing' },
      urls: { status: 'present', value: { invalid: true } },
    } satisfies RawLegacyStorageSnapshot

    const result = analyzeLegacyMigrationPreflight(source)

    expect(result.issues).toEqual(
      expect.arrayContaining([
        {
          code: 'MIGRATION_SOURCE_MISSING_KEY',
          occurrenceCount: 1,
          severity: 'warning',
        },
        {
          code: 'MIGRATION_SOURCE_INVALID_TYPE',
          occurrenceCount: 1,
          severity: 'error',
        },
      ]),
    )
  })

  it('reports duplicate identities and dangling mixed URL references without merging', () => {
    let source = createEmptySnapshot()
    source = withSource(source, 'urls', [
      {
        id: 'url-1',
        savedAt: 10,
        title: 'first title',
        url: 'https://example.com/path',
      },
      {
        id: 'url-1',
        savedAt: 20,
        title: 'second title',
        url: 'https://example.com/path',
      },
    ])
    source = withSource(source, 'savedTabs', [
      {
        domain: 'https://example.com',
        id: 'group-1',
        urlIds: ['missing-url'],
        urls: [
          {
            id: 'url-1',
            title: 'nested title',
            url: 'https://example.com/path',
          },
        ],
      },
    ])

    const result = analyzeLegacyMigrationPreflight(source)

    expect(result.issueCodes).toEqual(
      expect.arrayContaining([
        'DUPLICATE_URL_ID',
        'URL_IDENTITY_COLLISION',
        'LEGACY_URL_REFERENCE_CONFLICT',
      ]),
    )
    expect(result.collisionCount).toBeGreaterThan(0)
    expect(result.collisionKinds).toEqual(
      expect.arrayContaining(['duplicate-id', 'duplicate-exact-url']),
    )
    expect(result.snapshot.urls).toHaveLength(2)
  })

  it('blocks a nested URL whose canonical id points to different content', () => {
    let source = createEmptySnapshot()
    source = withSource(source, 'urls', [
      {
        id: 'url-1',
        savedAt: 10,
        title: 'Canonical title',
        url: 'https://example.com/canonical',
      },
    ])
    source = withSource(source, 'savedTabs', [
      {
        domain: 'example.com',
        id: 'group-1',
        urlIds: ['url-1'],
        urls: [
          {
            id: 'url-1',
            title: 'Nested title',
            url: 'https://example.com/different',
          },
        ],
      },
    ])

    const result = analyzeLegacyMigrationPreflight(source)

    expect(result.issueCodes).toContain('LEGACY_URL_REFERENCE_CONFLICT')
    expect(result.snapshot.urls).toHaveLength(1)
  })

  it('preserves membership metadata that exists only on nested legacy URLs', () => {
    let source = createEmptySnapshot()
    source = withSource(source, 'savedTabs', [
      {
        domain: 'example.com',
        id: 'group-1',
        savedAt: 1,
        subCategories: ['docs'],
        urls: [
          {
            savedAt: 2,
            subCategory: 'docs',
            title: 'Domain nested',
            url: 'https://example.com/domain',
          },
        ],
      },
    ])
    source = withSource(source, 'customProjects', [
      {
        categories: ['research'],
        categoryOrder: ['research'],
        createdAt: 3,
        id: 'project-1',
        name: 'Project',
        updatedAt: 4,
        urls: [
          {
            category: 'research',
            notes: 'private note',
            savedAt: 5,
            title: 'Custom nested',
            url: 'https://example.com/custom',
          },
        ],
      },
    ])
    source = withSource(source, 'customProjectOrder', ['project-1'])

    const result = analyzeLegacyMigrationPreflight(source)

    expect(result.snapshot.memberships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          categoryId: 'group-1:category:0',
          collectionId: 'group-1',
        }),
        expect.objectContaining({
          categoryId: 'project-1:category:0',
          collectionId: 'project-1',
          notes: 'private note',
        }),
      ]),
    )
  })

  it('blocks conflicting top-level and nested membership metadata', () => {
    let source = createEmptySnapshot()
    source = withSource(source, 'urls', [
      {
        id: 'url-1',
        savedAt: 1,
        title: 'Custom',
        url: 'https://example.com/custom',
      },
    ])
    source = withSource(source, 'customProjects', [
      {
        categories: ['docs', 'news'],
        categoryOrder: ['docs', 'news'],
        createdAt: 1,
        id: 'project-1',
        name: 'Project',
        updatedAt: 1,
        urlIds: ['url-1'],
        urlMetadata: {
          'url-1': { category: 'docs', notes: 'top-level note' },
        },
        urls: [
          {
            category: 'news',
            id: 'url-1',
            notes: 'nested note',
            savedAt: 1,
            title: 'Custom',
            url: 'https://example.com/custom',
          },
        ],
      },
    ])
    source = withSource(source, 'customProjectOrder', ['project-1'])

    const result = analyzeLegacyMigrationPreflight(source)

    expect(result.issueCodes).toContain('LEGACY_URL_REFERENCE_CONFLICT')
    expect(result.snapshot.memberships).toContainEqual(
      expect.objectContaining({
        categoryId: 'project-1:category:0',
        notes: 'top-level note',
      }),
    )
  })

  it('blocks incomplete custom category order without dropping categories', () => {
    let source = createEmptySnapshot()
    source = withSource(source, 'customProjects', [
      {
        categories: ['docs', 'news'],
        categoryOrder: ['docs'],
        createdAt: 1,
        id: 'project-1',
        name: 'Project',
        updatedAt: 1,
        urlIds: [],
      },
    ])
    source = withSource(source, 'customProjectOrder', ['project-1'])

    const result = analyzeLegacyMigrationPreflight(source)

    expect(result.issueCodes).toContain('LEGACY_CUSTOM_PROJECT_ORDER_CONFLICT')
    expect(result.snapshot.categories.map(({ name }) => name)).toEqual([
      'docs',
      'news',
    ])
  })

  it('blocks urlSubCategories that reference a missing collection category', () => {
    let source = createEmptySnapshot()
    source = withSource(source, 'urls', [
      {
        id: 'url-1',
        savedAt: 10,
        title: 'Title',
        url: 'https://example.com/path',
      },
    ])
    source = withSource(source, 'savedTabs', [
      {
        domain: 'example.com',
        id: 'group-1',
        subCategories: ['docs'],
        urlIds: ['url-1'],
        urlSubCategories: { 'url-1': 'missing-category' },
      },
    ])

    const result = analyzeLegacyMigrationPreflight(source)

    expect(result.issueCodes).toContain('LEGACY_URL_REFERENCE_CONFLICT')
  })

  it('validates custom-project category metadata values and references', () => {
    let source = createEmptySnapshot()
    source = withSource(source, 'urls', [
      {
        id: 'url-1',
        savedAt: 10,
        title: 'Title',
        url: 'https://example.com/path',
      },
    ])
    source = withSource(source, 'customProjects', [
      {
        categories: ['docs'],
        createdAt: 1,
        id: 'project-1',
        name: 'Project',
        updatedAt: 1,
        urlIds: ['url-1'],
        urlMetadata: {
          'url-1': { category: 'missing-category' },
        },
      },
      {
        categories: [],
        createdAt: 1,
        id: 'project-2',
        name: 'Invalid metadata',
        updatedAt: 1,
        urlIds: [],
        urlMetadata: {
          'url-2': { notes: 42 },
        },
      },
    ])
    source = withSource(source, 'customProjectOrder', [
      'project-1',
      'project-2',
    ])

    const result = analyzeLegacyMigrationPreflight(source)

    expect(result.issueCodes).toEqual(
      expect.arrayContaining([
        'LEGACY_URL_REFERENCE_CONFLICT',
        'MIGRATION_SOURCE_INVALID_TYPE',
      ]),
    )
  })

  it('validates the inner domain category settings schema', () => {
    const source = withSource(createEmptySnapshot(), 'domainCategorySettings', [
      {
        categoryKeywords: [{ categoryName: 'docs', keywords: ['valid', 42] }],
        domain: 'example.com',
        subCategories: ['docs'],
      },
    ])

    const result = analyzeLegacyMigrationPreflight(source)

    expect(result.issueCodes).toContain('MIGRATION_SOURCE_INVALID_TYPE')
  })

  it('maps valid domain category settings instead of silently dropping them', () => {
    let source = createEmptySnapshot()
    source = withSource(source, 'savedTabs', [
      { domain: 'example.com', id: 'group-1', urlIds: [] },
    ])
    source = withSource(source, 'domainCategorySettings', [
      {
        categoryKeywords: [
          { categoryName: 'docs', keywords: ['guide', 'reference'] },
        ],
        domain: 'example.com',
        subCategories: ['docs'],
      },
    ])

    const result = analyzeLegacyMigrationPreflight(source)

    expect(result.issueCodes).not.toContain('MIGRATION_SOURCE_INVALID_TYPE')
    expect(result.snapshot.categories).toEqual([
      expect.objectContaining({
        collectionId: 'group-1',
        keywords: ['guide', 'reference'],
        name: 'docs',
      }),
    ])
  })

  it('preserves legacy domain subCategoryOrder in category sortOrder', () => {
    const source = withSource(createEmptySnapshot(), 'savedTabs', [
      {
        domain: 'example.com',
        id: 'group-1',
        savedAt: 1,
        subCategories: ['docs', 'news'],
        subCategoryOrder: ['news', 'docs'],
        urlIds: [],
      },
    ])

    const result = analyzeLegacyMigrationPreflight(source)

    expect(result.snapshot.categories).toEqual([
      expect.objectContaining({ name: 'news', sortOrder: 0 }),
      expect.objectContaining({ name: 'docs', sortOrder: 1024 }),
    ])
  })

  it('blocks duplicate or incomplete legacy domain category order', () => {
    const source = withSource(createEmptySnapshot(), 'savedTabs', [
      {
        domain: 'example.com',
        id: 'group-1',
        savedAt: 1,
        subCategories: ['docs', 'news'],
        subCategoryOrder: ['docs', 'docs'],
        urlIds: [],
      },
    ])

    const result = analyzeLegacyMigrationPreflight(source)

    expect(result.issueCodes).toContain(
      'LEGACY_DOMAIN_CATEGORY_MAPPING_CONFLICT',
    )
  })

  it.each([
    {
      categoryKeywords: [
        { categoryName: 'docs', keywords: ['first'] },
        { categoryName: 'docs', keywords: ['second'] },
      ],
      label: 'duplicate keyword definitions',
      subCategories: ['docs'],
    },
    {
      categoryKeywords: [{ categoryName: 'docs', keywords: ['reference'] }],
      label: 'duplicate category names',
      subCategories: ['docs', 'docs'],
    },
  ])(
    'blocks $label in domain category settings',
    ({ categoryKeywords, subCategories }) => {
      let source = createEmptySnapshot()
      source = withSource(source, 'savedTabs', [
        {
          domain: 'example.com',
          id: 'group-1',
          savedAt: 1,
          urlIds: [],
        },
      ])
      source = withSource(source, 'domainCategorySettings', [
        { categoryKeywords, domain: 'example.com', subCategories },
      ])

      const result = analyzeLegacyMigrationPreflight(source)

      expect(result.issueCodes).toContain(
        'LEGACY_DOMAIN_CATEGORY_MAPPING_CONFLICT',
      )
    },
  )

  it('reports parent, mapping, and custom project order conflicts', () => {
    let source = createEmptySnapshot()
    source = withSource(source, 'savedTabs', [
      {
        domain: 'https://example.com',
        id: 'group-1',
        parentCategoryId: 'missing-parent',
        urlIds: [],
      },
    ])
    source = withSource(source, 'domainCategoryMappings', [
      { categoryId: 'category-1', domain: 'https://example.com' },
      { categoryId: 'category-2', domain: 'https://example.com' },
    ])
    source = withSource(source, 'customProjects', [
      { id: 'project-1', name: 'Project', urlIds: [] },
    ])
    source = withSource(source, 'customProjectOrder', [
      'unknown-project',
      'project-1',
      'project-1',
    ])

    const result = analyzeLegacyMigrationPreflight(source)

    expect(result.issueCodes).toEqual(
      expect.arrayContaining([
        'LEGACY_PARENT_CATEGORY_CONFLICT',
        'LEGACY_DOMAIN_CATEGORY_MAPPING_CONFLICT',
        'LEGACY_CUSTOM_PROJECT_ORDER_CONFLICT',
      ]),
    )
  })

  it('cross-checks collection parent ids against parent and mapping sources', () => {
    let source = createEmptySnapshot()
    source = withSource(source, 'parentCategories', [
      {
        domains: ['group-1'],
        domainNames: ['https://example.com'],
        id: 'parent-a',
        name: 'Parent A',
      },
    ])
    source = withSource(source, 'savedTabs', [
      {
        domain: 'https://example.com',
        id: 'group-1',
        parentCategoryId: 'parent-a',
        urlIds: [],
      },
    ])
    source = withSource(source, 'domainCategoryMappings', [
      { categoryId: 'parent-b', domain: 'https://example.com' },
    ])

    const result = analyzeLegacyMigrationPreflight(source)

    expect(result.issueCodes).toContain('LEGACY_PARENT_CATEGORY_CONFLICT')
  })

  it('keeps missing timestamp provenance explicit instead of using current time', () => {
    const source = withSource(createEmptySnapshot(), 'customProjects', [
      { id: 'project-1', name: 'Project', urlIds: [] },
    ])

    const result = analyzeLegacyMigrationPreflight(source)

    expect(result.issueCodes).toContain('MISSING_TIMESTAMP_PROVENANCE')
    expect(result.snapshot.collections).toEqual([
      expect.objectContaining({
        createdAt: 0,
        id: 'project-1',
        updatedAt: 0,
      }),
    ])
  })

  it('maps AI history and analytics views into the logical v2 target without inventing timestamps', () => {
    let source = createEmptySnapshot()
    source = withSource(source, 'aiChatConversations', [
      {
        createdAt: 10,
        id: 'conversation-1',
        messages: [
          {
            content: 'private prompt',
            id: 'message-1',
            role: 'user',
          },
        ],
        title: 'Conversation',
        updatedAt: 20,
      },
    ])
    source = withSource(source, 'savedAnalyticsViews', [
      {
        createdAt: 30,
        id: 'analytics-1',
        name: 'Recent',
        query: { dateRange: 'all' },
        updatedAt: 40,
      },
    ])

    const result = analyzeLegacyMigrationPreflight(source)

    expect(result.target).toEqual({
      analyticsViews: [
        {
          id: 'analytics-1',
          updatedAt: 40,
          value: {
            createdAt: 30,
            id: 'analytics-1',
            name: 'Recent',
            query: { dateRange: 'all' },
            updatedAt: 40,
          },
        },
      ],
      conversations: [
        {
          id: 'conversation-1',
          updatedAt: 20,
          value: {
            createdAt: 10,
            title: 'Conversation',
          },
        },
      ],
      messages: [
        {
          conversationId: 'conversation-1',
          createdAt: 10,
          id: 'message-1',
          value: {
            content: 'private prompt',
            id: 'message-1',
            role: 'user',
          },
        },
      ],
      savedTabs: result.snapshot,
    })
  })

  it('reports duplicate AI entity identifiers with a dedicated typed issue', () => {
    const source = withSource(createEmptySnapshot(), 'aiChatConversations', [
      {
        createdAt: 10,
        id: 'conversation-1',
        messages: [
          {
            content: 'first',
            id: 'message-1',
            role: 'user',
          },
          {
            content: 'duplicate',
            id: 'message-1',
            role: 'assistant',
          },
        ],
        title: 'First',
        updatedAt: 20,
      },
      {
        createdAt: 30,
        id: 'conversation-1',
        messages: [],
        title: 'Duplicate',
        updatedAt: 40,
      },
    ])

    const result = analyzeLegacyMigrationPreflight(source)

    expect(result.issueCodes).toContain('LEGACY_AI_ENTITY_ID_COLLISION')
    expect(result.issueCodes).not.toContain('MIGRATION_SOURCE_INVALID_TYPE')
  })

  it('returns only safe aggregate issues and does not mutate raw user content', () => {
    let source = createEmptySnapshot()
    source = withSource(source, 'urls', [
      {
        id: 'url-secret',
        savedAt: 1,
        title: 'private title',
        url: 'https://secret.example/private',
      },
    ])
    source = withSource(source, 'customProjects', [
      {
        id: 'project-1',
        name: 'Private project',
        projectKeywords: {
          domainKeywords: ['secret-domain'],
          titleKeywords: ['secret-title'],
          urlKeywords: ['secret-url'],
        },
        urlIds: ['missing-url'],
        urlMetadata: {
          'missing-url': { notes: 'private notes' },
        },
      },
    ])
    source = withSource(source, 'aiChatConversations', [
      {
        id: 'conversation-1',
        messages: [
          {
            attachments: [{ content: 'private attachment' }],
            content: 'private prompt',
          },
        ],
      },
    ])
    for (const key of arraySourceKeys) {
      const entry = source[key]
      if (entry.status === 'present' && Array.isArray(entry.value)) {
        Object.freeze(entry.value)
      }
    }

    const result = analyzeLegacyMigrationPreflight(source)
    const safeIssues = JSON.stringify(result.issues)

    expect(safeIssues).not.toContain('secret.example')
    expect(safeIssues).not.toContain('private title')
    expect(safeIssues).not.toContain('private notes')
    expect(safeIssues).not.toContain('private prompt')
    expect(safeIssues).not.toContain('private attachment')
    expect(safeIssues).not.toContain('secret-title')
  })
})
