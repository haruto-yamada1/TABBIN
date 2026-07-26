import type {
  PersistenceV2Snapshot,
  PersistenceV2Url,
} from '@/contexts/saved-tabs/domain/entities/PersistenceModelV2'

const unsafeRank = Number.MAX_SAFE_INTEGER + 1

export const createHealthyPersistenceV2Snapshot =
  (): PersistenceV2Snapshot => ({
    categories: [
      {
        collectionId: 'collection-domain',
        createdAt: 10,
        id: 'category-domain',
        keywords: ['reference'],
        name: 'Reference',
        sortOrder: 1024,
        updatedAt: 20,
      },
    ],
    collections: [
      {
        createdAt: 10,
        definition: { domain: 'alpha.test', type: 'domain' },
        groupId: 'group-main',
        id: 'collection-domain',
        name: 'Alpha',
        sortOrder: 1024,
        updatedAt: 20,
      },
      {
        createdAt: 10,
        definition: {
          projectKeywords: {
            domainKeywords: [],
            titleKeywords: ['private-title-keyword'],
            urlKeywords: [],
          },
          type: 'custom',
        },
        id: 'collection-custom',
        name: 'Private custom collection',
        sortOrder: 2048,
        updatedAt: 20,
      },
    ],
    groups: [
      {
        createdAt: 10,
        id: 'group-main',
        name: 'Main',
        sortOrder: 1024,
        updatedAt: 20,
      },
    ],
    memberships: [
      {
        addedAt: 10,
        categoryId: 'category-domain',
        collectionId: 'collection-domain',
        notes: 'private membership note',
        sortOrder: 1024,
        updatedAt: 20,
        urlId: 'url-alpha',
      },
      {
        addedAt: 10,
        collectionId: 'collection-custom',
        sortOrder: 1024,
        updatedAt: 20,
        urlId: 'url-beta',
      },
    ],
    urls: [
      {
        firstSavedAt: 10,
        id: 'url-alpha',
        lastSavedAt: 20,
        normalizedUrl: 'https://alpha.test/private-path',
        title: 'Private Alpha Title',
        updatedAt: 15,
        url: 'https://alpha.test/private-path',
      },
      {
        firstSavedAt: 10,
        id: 'url-beta',
        lastSavedAt: 20,
        normalizedUrl: 'https://beta.test/private-path',
        title: 'Private Beta Title',
        updatedAt: 15,
        url: 'https://beta.test/private-path',
      },
    ],
  })

export const createCorruptedPersistenceV2Snapshot =
  (): PersistenceV2Snapshot => {
    const healthy = createHealthyPersistenceV2Snapshot()
    const [alphaUrl, betaUrl] = healthy.urls
    const [domainCollection, customCollection] = healthy.collections
    const [domainMembership, customMembership] = healthy.memberships
    const [domainCategory] = healthy.categories
    const [mainGroup] = healthy.groups

    const nonJsonSafeAlphaUrl = {
      ...alphaUrl,
      favIconUrl: undefined,
      firstSavedAt: 30,
    } as PersistenceV2Url

    return {
      categories: [
        { ...domainCategory, createdAt: 30, updatedAt: 20 },
        {
          collectionId: 'collection-missing-for-category',
          createdAt: 10,
          id: 'category-orphan',
          keywords: [],
          name: 'Orphan',
          sortOrder: unsafeRank,
          updatedAt: 20,
        },
      ],
      collections: [
        { ...domainCollection, createdAt: 30, updatedAt: 20 },
        customCollection,
        {
          createdAt: 10,
          definition: { domain: 'alpha.test', type: 'domain' },
          groupId: 'group-missing',
          id: 'collection-duplicate-domain',
          name: 'Duplicate domain',
          sortOrder: unsafeRank,
          updatedAt: 20,
        },
      ],
      groups: [
        {
          ...mainGroup,
          createdAt: 30,
          sortOrder: unsafeRank,
          updatedAt: 20,
        },
      ],
      memberships: [
        { ...domainMembership, addedAt: 30, updatedAt: 20 },
        customMembership,
        { ...domainMembership },
        {
          addedAt: 10,
          collectionId: 'collection-missing',
          sortOrder: 1024,
          updatedAt: 20,
          urlId: 'url-alpha',
        },
        {
          addedAt: 10,
          collectionId: 'collection-domain',
          sortOrder: 2048,
          updatedAt: 20,
          urlId: 'url-missing',
        },
        {
          addedAt: 10,
          categoryId: 'category-domain',
          collectionId: 'collection-custom',
          sortOrder: 2048,
          updatedAt: 20,
          urlId: 'url-beta',
        },
        {
          addedAt: 10,
          categoryId: 'category-missing',
          collectionId: 'collection-custom',
          sortOrder: unsafeRank,
          updatedAt: 20,
          urlId: 'url-duplicate-normalized',
        },
      ],
      urls: [
        nonJsonSafeAlphaUrl,
        betaUrl,
        {
          ...alphaUrl,
          normalizedUrl: 'https://duplicate-id.test/private-path',
          title: 'Private duplicate identifier title',
        },
        {
          ...betaUrl,
          id: 'url-duplicate-normalized',
          title: 'Private duplicate normalized title',
        },
        {
          ...betaUrl,
          id: 'url-orphan',
          normalizedUrl: 'https://orphan.test/private-path',
          title: 'Private orphan title',
          url: 'https://orphan.test/private-path',
        },
      ],
    }
  }
