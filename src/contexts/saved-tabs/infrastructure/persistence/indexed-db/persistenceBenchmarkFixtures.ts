import type {
  PersistenceJsonRecord,
  PersistenceMessageRecord,
} from '@/contexts/saved-tabs/application/ports/PersistenceV2UnitOfWorkPort'
import { PERSISTENCE_V2_ORDERING_POLICY } from '@/contexts/saved-tabs/domain/entities/PersistenceModelV2'
import type { PersistenceV2Snapshot } from '@/contexts/saved-tabs/domain/entities/PersistenceModelV2'

export const PERSISTENCE_BENCHMARK_DEFAULT_URL_COUNT = 1_000
const MIGRATION_URL_COUNT_MEDIUM = 10_000
const MIGRATION_URL_COUNT_LARGE = 50_000
const MIGRATION_URL_COUNT_EXTRA_LARGE = 100_000
const MEMBERSHIP_MULTIPLIER_SINGLE = 1
const MEMBERSHIP_MULTIPLIER_TYPICAL = 3
const MEMBERSHIP_MULTIPLIER_DENSE = 10
export const PERSISTENCE_BENCHMARK_DEFAULT_CONVERSATION_COUNT = 10
export const PERSISTENCE_BENCHMARK_DEFAULT_MESSAGE_COUNT = 100
const MIGRATION_URL_COUNTS = [
  PERSISTENCE_BENCHMARK_DEFAULT_URL_COUNT,
  MIGRATION_URL_COUNT_MEDIUM,
  MIGRATION_URL_COUNT_LARGE,
  MIGRATION_URL_COUNT_EXTRA_LARGE,
]
const MIGRATION_MEMBERSHIP_MULTIPLIERS = [
  MEMBERSHIP_MULTIPLIER_SINGLE,
  MEMBERSHIP_MULTIPLIER_TYPICAL,
  MEMBERSHIP_MULTIPLIER_DENSE,
]

export const MIGRATION_PERSISTENCE_SCALE_CASES = MIGRATION_URL_COUNTS.flatMap(
  (urlCount) =>
    MIGRATION_MEMBERSHIP_MULTIPLIERS.map((membershipMultiplier) => ({
      membershipMultiplier,
      urlCount,
    })),
)

export const QUERY_PERSISTENCE_SCALE_CASES = [
  { membershipCount: 50_000, urlCount: 10_000 },
  { membershipCount: 250_000, urlCount: 50_000 },
  { membershipCount: 500_000, urlCount: 100_000 },
] as const

export const AI_PERSISTENCE_SCALE_CASES = [
  {
    conversationCount: PERSISTENCE_BENCHMARK_DEFAULT_CONVERSATION_COUNT,
    messageCount: PERSISTENCE_BENCHMARK_DEFAULT_MESSAGE_COUNT,
    name: 'small',
  },
  { conversationCount: 100, messageCount: 5_000, name: 'medium' },
  { conversationCount: 1_000, messageCount: 50_000, name: 'large' },
] as const

export type PersistenceAiBenchmarkFixture = {
  readonly conversations: readonly PersistenceJsonRecord[]
  readonly messages: readonly PersistenceMessageRecord[]
}

export const createAiPersistenceBenchmarkFixture = ({
  conversationCount,
  messageCount,
}: {
  readonly conversationCount: number
  readonly messageCount: number
}): PersistenceAiBenchmarkFixture => {
  if (!Number.isSafeInteger(conversationCount) || conversationCount <= 0) {
    throw new TypeError('conversationCount must be a positive safe integer.')
  }
  if (!Number.isSafeInteger(messageCount) || messageCount < 0) {
    throw new TypeError('messageCount must be a non-negative safe integer.')
  }

  const conversations = Array.from(
    { length: conversationCount },
    (_, conversationIndex) => ({
      id: `conversation-${conversationIndex}`,
      updatedAt: conversationIndex + 1,
      value: { title: `Conversation ${conversationIndex}` },
    }),
  )
  const messages = Array.from({ length: messageCount }, (_, messageIndex) => ({
    conversationId: `conversation-${messageIndex % conversationCount}`,
    createdAt: messageIndex + 1,
    id: `message-${messageIndex}`,
    value: { role: 'user', text: `Message ${messageIndex}` },
  }))

  return { conversations, messages }
}

export const createPersistenceBenchmarkFixture = ({
  membershipMultiplier,
  urlCount,
}: {
  readonly membershipMultiplier: number
  readonly urlCount: number
}): PersistenceV2Snapshot => {
  const collections = Array.from(
    { length: membershipMultiplier },
    (_, collectionIndex) => ({
      createdAt: 1,
      definition: {
        projectKeywords: {
          domainKeywords: [],
          titleKeywords: [],
          urlKeywords: [],
        },
        type: 'custom' as const,
      },
      id: `collection-${collectionIndex}`,
      name: `Collection ${collectionIndex}`,
      sortOrder:
        (collectionIndex + 1) * PERSISTENCE_V2_ORDERING_POLICY.initialGap,
      updatedAt: 1,
    }),
  )
  const urls = Array.from({ length: urlCount }, (_, urlIndex) => ({
    firstSavedAt: 1,
    id: `url-${urlIndex}`,
    lastSavedAt: 1,
    normalizedUrl: `https://example.com/${urlIndex}`,
    title: `URL ${urlIndex}`,
    updatedAt: 1,
    url: `https://example.com/${urlIndex}`,
  }))
  const memberships = collections.flatMap((collection) =>
    urls.map((url, urlIndex) => ({
      addedAt: 1,
      collectionId: collection.id,
      sortOrder: (urlIndex + 1) * PERSISTENCE_V2_ORDERING_POLICY.initialGap,
      updatedAt: 1,
      urlId: url.id,
    })),
  )

  return {
    categories: [],
    collections,
    groups: [],
    memberships,
    urls,
  }
}
