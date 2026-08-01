export { PERSISTENCE_DATABASE_VERSION } from '@/contexts/saved-tabs/application/services/PersistenceReleasePolicyService'

export const PERSISTENCE_DATABASE_NAME = 'tabbin-persistence-v2'

export const PERSISTENCE_STORE_NAMES = {
  analyticsViews: 'analyticsViews',
  categories: 'collectionCategories',
  collections: 'collections',
  conversations: 'conversations',
  groups: 'collectionGroups',
  memberships: 'collectionMemberships',
  messages: 'messages',
  metadata: 'metadata',
  recoverySnapshots: 'recoverySnapshots',
  urls: 'urls',
} as const

export type PersistenceStoreName =
  (typeof PERSISTENCE_STORE_NAMES)[keyof typeof PERSISTENCE_STORE_NAMES]

const createVersionOneSchema = (database: IDBDatabase): void => {
  const urls = database.createObjectStore(PERSISTENCE_STORE_NAMES.urls, {
    keyPath: 'id',
  })
  // #725 requires collision preflight before this can become unique (#738).
  urls.createIndex('normalizedUrl', 'normalizedUrl')
  urls.createIndex('firstSavedAt', 'firstSavedAt')
  urls.createIndex('lastSavedAt', 'lastSavedAt')

  const collections = database.createObjectStore(
    PERSISTENCE_STORE_NAMES.collections,
    { keyPath: 'id' },
  )
  collections.createIndex('definitionType', 'definition.type')
  collections.createIndex('canonicalDomain', 'definition.domain', {
    unique: true,
  })
  collections.createIndex('groupId', 'groupId')
  collections.createIndex('createdAt', 'createdAt')
  collections.createIndex('updatedAt', 'updatedAt')
  collections.createIndex('groupOrder', ['groupId', 'sortOrder'])

  const memberships = database.createObjectStore(
    PERSISTENCE_STORE_NAMES.memberships,
    { keyPath: ['collectionId', 'urlId'] },
  )
  memberships.createIndex('collectionId', 'collectionId')
  memberships.createIndex('urlId', 'urlId')
  memberships.createIndex('collectionAndCategory', [
    'collectionId',
    'categoryId',
  ])
  memberships.createIndex('collectionOrder', ['collectionId', 'sortOrder'])
  memberships.createIndex('addedAt', 'addedAt')

  const categories = database.createObjectStore(
    PERSISTENCE_STORE_NAMES.categories,
    { keyPath: 'id' },
  )
  categories.createIndex('collectionId', 'collectionId')
  categories.createIndex('collectionOrder', ['collectionId', 'sortOrder'])

  const groups = database.createObjectStore(PERSISTENCE_STORE_NAMES.groups, {
    keyPath: 'id',
  })
  groups.createIndex('sortOrder', 'sortOrder')

  const conversations = database.createObjectStore(
    PERSISTENCE_STORE_NAMES.conversations,
    { keyPath: 'id' },
  )
  conversations.createIndex('updatedAt', 'updatedAt')

  const messages = database.createObjectStore(
    PERSISTENCE_STORE_NAMES.messages,
    { keyPath: 'id' },
  )
  messages.createIndex('conversationId', 'conversationId')
  messages.createIndex('conversationAndCreatedAt', [
    'conversationId',
    'createdAt',
  ])
  messages.createIndex('createdAt', 'createdAt')

  const analyticsViews = database.createObjectStore(
    PERSISTENCE_STORE_NAMES.analyticsViews,
    { keyPath: 'id' },
  )
  analyticsViews.createIndex('updatedAt', 'updatedAt')

  const recoverySnapshots = database.createObjectStore(
    PERSISTENCE_STORE_NAMES.recoverySnapshots,
    { keyPath: 'id' },
  )
  recoverySnapshots.createIndex('createdAt', 'createdAt')
  recoverySnapshots.createIndex('expiresAt', 'expiresAt')

  database.createObjectStore(PERSISTENCE_STORE_NAMES.metadata, {
    keyPath: 'key',
  })
}

export const upgradePersistenceDatabase = (
  database: IDBDatabase,
  oldVersion: number,
): void => {
  if (oldVersion < 1) {
    createVersionOneSchema(database)
  }
}
