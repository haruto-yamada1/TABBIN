import { describe, expect, it } from 'vitest'

import type { PersistenceV2Snapshot } from '@/contexts/saved-tabs/domain/entities/PersistenceModelV2'

import {
  mergeLegacyCompatibilityStorageRecord,
  projectPersistenceV2ToLegacyCompatibilityStorage,
} from './PersistenceV2LegacyCompatibilityMapper'

const snapshot: PersistenceV2Snapshot = {
  categories: [
    {
      collectionId: 'domain-example',
      createdAt: 10,
      id: 'domain-example:category:0',
      keywords: ['guide'],
      name: 'Docs',
      sortOrder: 0,
      updatedAt: 20,
    },
    {
      collectionId: 'project-research',
      createdAt: 30,
      id: 'project-research:category:0',
      keywords: [],
      name: 'Read',
      sortOrder: 0,
      updatedAt: 40,
    },
  ],
  collections: [
    {
      createdAt: 10,
      definition: { domain: 'example.com', type: 'domain' },
      groupId: 'group-work',
      id: 'domain-example',
      name: 'example.com',
      sortOrder: 0,
      updatedAt: 20,
    },
    {
      createdAt: 30,
      definition: {
        projectKeywords: {
          domainKeywords: ['example.com'],
          titleKeywords: ['research'],
          urlKeywords: ['/docs'],
        },
        type: 'custom',
      },
      id: 'project-research',
      name: 'Research',
      sortOrder: 0,
      updatedAt: 40,
    },
  ],
  groups: [
    {
      createdAt: 5,
      id: 'group-work',
      name: 'Work',
      sortOrder: 0,
      updatedAt: 25,
    },
  ],
  memberships: [
    {
      addedAt: 10,
      addedAtProvenance: 'exact',
      categoryId: 'domain-example:category:0',
      collectionId: 'domain-example',
      sortOrder: 0,
      updatedAt: 20,
      urlId: 'url-1',
    },
    {
      addedAt: 30,
      addedAtProvenance: 'exact',
      categoryId: 'project-research:category:0',
      collectionId: 'project-research',
      notes: 'important',
      sortOrder: 0,
      updatedAt: 40,
      urlId: 'url-1',
    },
  ],
  urls: [
    {
      firstSavedAt: 10,
      firstSavedAtProvenance: 'exact',
      id: 'url-1',
      lastSavedAt: 30,
      lastSavedAtProvenance: 'exact',
      normalizedUrl: 'https://example.com/docs',
      title: 'Docs',
      updatedAt: 40,
      url: 'https://example.com/docs',
    },
  ],
}

describe('PersistenceV2LegacyCompatibilityMapper', () => {
  it('projects Collection and Membership records at the infrastructure boundary', () => {
    const record = projectPersistenceV2ToLegacyCompatibilityStorage(snapshot)

    expect(record.savedTabs).toEqual([
      expect.objectContaining({
        domain: 'example.com',
        id: 'domain-example',
        parentCategoryId: 'group-work',
        subCategories: ['Docs'],
        urlIds: ['url-1'],
        urlSubCategories: { 'url-1': 'Docs' },
      }),
    ])
    expect(record.customProjects).toEqual([
      expect.objectContaining({
        categories: ['Read'],
        id: 'project-research',
        urlIds: ['url-1'],
        urlMetadata: {
          'url-1': { category: 'Read', notes: 'important' },
        },
      }),
    ])
    expect(record.parentCategories).toEqual([
      {
        domains: ['domain-example'],
        domainNames: ['example.com'],
        id: 'group-work',
        name: 'Work',
      },
    ])
  })

  it('round-trips mutations without losing v2 timestamp provenance', () => {
    const record = projectPersistenceV2ToLegacyCompatibilityStorage(snapshot)
    const savedTabs = record.savedTabs.map((group) =>
      group.id === 'domain-example'
        ? {
            ...group,
            urlIds: [] as string[],
            urls: [],
            urlSubCategories: {},
          }
        : group,
    )

    const next = mergeLegacyCompatibilityStorageRecord(snapshot, {
      ...record,
      savedTabs,
    })

    expect(next.groups[0]).toEqual(snapshot.groups[0])
    expect(next.collections.find(({ id }) => id === 'domain-example')).toEqual(
      expect.objectContaining({ createdAt: 10, updatedAt: 20 }),
    )
    expect(next.memberships).toEqual([
      expect.objectContaining({
        addedAt: 30,
        addedAtProvenance: 'exact',
        collectionId: 'project-research',
        urlId: 'url-1',
      }),
    ])
    expect(next.urls).toEqual([
      expect.objectContaining({
        firstSavedAtProvenance: 'exact',
        lastSavedAtProvenance: 'exact',
      }),
    ])
  })

  it('uses urlIds and the global URL store as the canonical compatibility write shape', () => {
    const record = projectPersistenceV2ToLegacyCompatibilityStorage(snapshot)
    const customProjects = record.customProjects.map((project) => ({
      ...project,
      urlIds: [...(project.urlIds ?? []), 'url-2'],
      urlMetadata: {
        ...project.urlMetadata,
        'url-2': { category: 'Read', notes: 'new note' },
      },
    }))

    const next = mergeLegacyCompatibilityStorageRecord(snapshot, {
      ...record,
      customProjects,
      urls: [
        ...record.urls,
        {
          id: 'url-2',
          savedAt: 50,
          title: 'New URL',
          url: 'https://example.com/new',
        },
      ],
    })

    expect(next.memberships).toContainEqual(
      expect.objectContaining({
        categoryId: 'project-research:category:0',
        collectionId: 'project-research',
        notes: 'new note',
        urlId: 'url-2',
      }),
    )
    expect(next.urls).toContainEqual(
      expect.objectContaining({
        id: 'url-2',
        url: 'https://example.com/new',
      }),
    )
  })

  it('rejects a compatibility mutation that would create an unhealthy graph', () => {
    const record = projectPersistenceV2ToLegacyCompatibilityStorage(snapshot)
    const customProjects = record.customProjects.map((project) => ({
      ...project,
      urlIds: ['missing-url'],
    }))

    expect(() =>
      mergeLegacyCompatibilityStorageRecord(snapshot, {
        ...record,
        customProjects,
      }),
    ).toThrow(/LEGACY_URL_REFERENCE_CONFLICT/)
  })
})
