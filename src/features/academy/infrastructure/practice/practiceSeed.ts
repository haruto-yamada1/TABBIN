import { checkPersistenceIntegrity } from '@/contexts/saved-tabs/public-api'
import type { PersistenceV2Snapshot } from '@/contexts/saved-tabs/public-api'
import type { PracticeSeed } from '@/features/academy/application/dto/PracticeSessionDto'

const timestamp = 1_700_000_000_000
const sites = [
  'notes.academy.test',
  'market.academy.test',
  'learn.academy.test',
]

/** Local data only: .test names are fictional and are never fetched. */
export const createPracticeSeed = (
  seed: PracticeSeed,
): PersistenceV2Snapshot => {
  if (seed === 'empty') {
    return {
      categories: [],
      collections: [],
      groups: [],
      memberships: [],
      urls: [],
    }
  }
  const urls = sites.flatMap((domain, domainIndex) =>
    ['guide', 'reference'].map((page, index) => {
      const record = {
        id: `practice-url-${domainIndex}-${index}`,
        savedAt: timestamp,
        title: `${domain.split('.')[0] ?? domain} ${page}`,
        url: `https://${domain}/${page}`,
      }
      return {
        firstSavedAt: timestamp,
        firstSavedAtProvenance: 'exact' as const,
        id: record.id,
        lastSavedAt: timestamp,
        lastSavedAtProvenance: 'exact' as const,
        normalizedUrl: record.url,
        title: record.title,
        updatedAt: timestamp,
        url: record.url,
      }
    }),
  )
  const collections: PersistenceV2Snapshot['collections'] = [
    ...sites.map((domain, index) => ({
      createdAt: timestamp,
      definition: { domain, type: 'domain' as const },
      groupId: `practice-parent-${index % 2}`,
      id: `practice-domain-${index}`,
      name: domain,
      sortOrder: index,
      updatedAt: timestamp,
    })),
    {
      createdAt: timestamp,
      definition: {
        projectKeywords: {
          domainKeywords: [],
          titleKeywords: [],
          urlKeywords: [],
        },
        type: 'custom',
      },
      id: 'practice-project',
      name: 'Demo collection',
      sortOrder: 3,
      updatedAt: timestamp,
    },
  ]
  const categories = collections.flatMap((collection) =>
    ['Guides', 'References'].map((name, index) => ({
      collectionId: collection.id,
      createdAt: timestamp,
      id: `${collection.id}:category:${index}`,
      keywords: [index === 0 ? 'guide' : 'reference'],
      name,
      sortOrder: index,
      updatedAt: timestamp,
    })),
  )
  const memberships = sites.flatMap((_site, domainIndex) =>
    [0, 1].map((index) => ({
      addedAt: timestamp,
      addedAtProvenance: 'exact' as const,
      categoryId: `practice-domain-${domainIndex}:category:${index}`,
      collectionId: `practice-domain-${domainIndex}`,
      sortOrder: index,
      updatedAt: timestamp,
      urlId: `practice-url-${domainIndex}-${index}`,
    })),
  )
  const snapshot: PersistenceV2Snapshot = {
    categories,
    collections,
    groups: ['Demo workspace', 'Demo learning'].map((name, index) => ({
      createdAt: timestamp,
      id: `practice-parent-${index}`,
      name,
      sortOrder: index,
      updatedAt: timestamp,
    })),
    memberships: [
      ...memberships,
      ...[0, 1].map((index) => ({
        addedAt: timestamp,
        addedAtProvenance: 'exact' as const,
        categoryId: `practice-project:category:${index}`,
        collectionId: 'practice-project',
        sortOrder: index,
        updatedAt: timestamp,
        urlId: `practice-url-0-${index}`,
      })),
    ],
    urls,
  }
  if (
    checkPersistenceIntegrity(snapshot).issues.some(
      ({ severity }) => severity === 'error',
    )
  ) {
    throw new Error('Invalid Academy practice fixture')
  }
  return snapshot
}
