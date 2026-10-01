export const createUrlFixture = (
  id: string,
  url: string,
  title: string,
  savedAt: number,
) => ({
  firstSavedAt: savedAt,
  firstSavedAtProvenance: 'exact',
  id,
  lastSavedAt: savedAt,
  lastSavedAtProvenance: 'exact',
  normalizedUrl: url,
  title,
  updatedAt: savedAt,
  url,
})

export const createDomainCollectionFixture = (
  id: string,
  domain: string,
  createdAt: number,
  sortOrder = 0,
) => ({
  createdAt,
  definition: { domain, type: 'domain' },
  id,
  name: domain,
  sortOrder,
  updatedAt: createdAt,
})

export const createMembershipFixture = (
  collectionId: string,
  urlId: string,
  addedAt: number,
  sortOrder = 0,
) => ({
  addedAt,
  addedAtProvenance: 'exact',
  collectionId,
  sortOrder,
  updatedAt: addedAt,
  urlId,
})

export const createCustomCollectionFixture = (
  id: string,
  name: string,
  createdAt: number,
  sortOrder = 0,
) => ({
  createdAt,
  definition: {
    projectKeywords: { domainKeywords: [], titleKeywords: [], urlKeywords: [] },
    type: 'custom',
  },
  id,
  name,
  sortOrder,
  updatedAt: createdAt,
})

export const createEmptyPersistenceFixture = () => ({
  categories: [],
  collections: [],
  groups: [],
  memberships: [],
  urls: [],
})

export const createExamplePersistenceFixture = (now = Date.now()) => ({
  categories: [],
  collections: [
    createDomainCollectionFixture('group-example', 'example.com', now),
  ],
  groups: [],
  memberships: [createMembershipFixture('group-example', 'url-example', now)],
  urls: [
    createUrlFixture(
      'url-example',
      'https://example.com/',
      'Example Home',
      now,
    ),
  ],
})

// These obsolete values deliberately disagree with the IndexedDB fixture.
// They remain inert after removal of installed-data migration.
export const obsoletePersistenceStorageFixture = {
  savedTabs: [{ id: 'obsolete-group', domain: 'obsolete.example' }],
  urls: [{ id: 'obsolete-url', url: 'https://obsolete.example/' }],
  'tabbin:migrationPreflight:v1': { status: 'blocked' },
  'tabbin:persistenceControlState:v2': {
    errorCode: 'PERSISTENCE_MIGRATION_FAILED',
    migrationId: 'obsolete-migration',
    status: 'failed',
  },
}
