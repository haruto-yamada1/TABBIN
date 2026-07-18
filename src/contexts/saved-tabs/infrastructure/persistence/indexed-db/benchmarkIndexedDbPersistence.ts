import { IDBFactory } from 'fake-indexeddb'

import { checkPersistenceIntegrity } from '@/contexts/saved-tabs/domain/services/PersistenceIntegrityChecker'

import { IndexedDbConnectionManager } from './IndexedDbConnectionManager'
import { IndexedDbPersistenceSnapshotReader } from './IndexedDbPersistenceSnapshotReader'
import { IndexedDbPersistenceUnitOfWork } from './IndexedDbPersistenceUnitOfWork'
import { IndexedDbSavedTabsQueryAdapter } from './IndexedDbSavedTabsQueryAdapter'
import {
  createAiPersistenceBenchmarkFixture,
  createPersistenceBenchmarkFixture,
  PERSISTENCE_BENCHMARK_DEFAULT_CONVERSATION_COUNT,
  PERSISTENCE_BENCHMARK_DEFAULT_MESSAGE_COUNT,
  PERSISTENCE_BENCHMARK_DEFAULT_URL_COUNT,
} from './persistenceBenchmarkFixtures'

const readNumberOption = (name: string, fallback: number): number => {
  const argument = process.argv.find((value) => value.startsWith(`${name}=`))
  if (!argument) {
    return fallback
  }
  const value = Number(argument.slice(name.length + 1))
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive safe integer.`)
  }

  return value
}

const measure = async <Value>(
  operation: () => Value | Promise<Value>,
): Promise<{ readonly durationMs: number; readonly value: Value }> => {
  const startedAt = performance.now()
  const value = await operation()

  return { durationMs: performance.now() - startedAt, value }
}

const urlCount = readNumberOption(
  '--url-count',
  PERSISTENCE_BENCHMARK_DEFAULT_URL_COUNT,
)
const membershipMultiplier = readNumberOption('--membership-multiplier', 1)
const conversationCount = readNumberOption(
  '--conversation-count',
  PERSISTENCE_BENCHMARK_DEFAULT_CONVERSATION_COUNT,
)
const messageCount = readNumberOption(
  '--message-count',
  PERSISTENCE_BENCHMARK_DEFAULT_MESSAGE_COUNT,
)
const heapBefore = process.memoryUsage().heapUsed

const normalized = await measure(() => ({
  ai: createAiPersistenceBenchmarkFixture({
    conversationCount,
    messageCount,
  }),
  savedTabs: createPersistenceBenchmarkFixture({
    membershipMultiplier,
    urlCount,
  }),
}))
const serialized = JSON.stringify(normalized.value)
const parsed = await measure(() => {
  const value: unknown = JSON.parse(serialized)

  return value
})
const integrity = await measure(() =>
  checkPersistenceIntegrity(normalized.value.savedTabs),
)
if (!integrity.value.isHealthy) {
  throw new Error('Generated persistence benchmark fixture is not healthy.')
}

const manager = new IndexedDbConnectionManager({
  databaseName: `tabbin-persistence-benchmark-${crypto.randomUUID()}`,
  indexedDb: new IDBFactory(),
})
const unitOfWork = new IndexedDbPersistenceUnitOfWork(manager)
const write = await measure(async () =>
  unitOfWork.commit({
    collections: { put: normalized.value.savedTabs.collections },
    conversations: { put: normalized.value.ai.conversations },
    memberships: { put: normalized.value.savedTabs.memberships },
    messages: { put: normalized.value.ai.messages },
    urls: { put: normalized.value.savedTabs.urls },
  }),
)
const reader = new IndexedDbPersistenceSnapshotReader(manager)
const readBack = await measure(async () => reader.readConsistentSnapshot())
const query = new IndexedDbSavedTabsQueryAdapter(reader)
const initialLoad = await measure(async () => query.readInitialLoad())
const collectionOpen = await measure(async () =>
  query.findCollection('collection-0'),
)
const analyticsQuery = await measure(async () => query.readAnalyticsRecords())
const aiSavedUrlContext = await measure(async () =>
  query.findCollectionsForUrl('url-0'),
)
const heapAfter = process.memoryUsage().heapUsed
manager.close()

console.log(
  JSON.stringify(
    {
      counts: {
        collections: normalized.value.savedTabs.collections.length,
        conversations: normalized.value.ai.conversations.length,
        memberships: normalized.value.savedTabs.memberships.length,
        messages: normalized.value.ai.messages.length,
        urls: normalized.value.savedTabs.urls.length,
      },
      environment: {
        bun: process.versions.bun ?? 'unknown',
        runtime: 'fake-indexeddb',
      },
      measurementsMs: {
        aiSavedUrlContext: aiSavedUrlContext.durationMs,
        analyticsQuery: analyticsQuery.durationMs,
        collectionOpen: collectionOpen.durationMs,
        idbWrite: write.durationMs,
        initialLoad: initialLoad.durationMs,
        integrityCheck: integrity.durationMs,
        normalize: normalized.durationMs,
        parse: parsed.durationMs,
        readBack: readBack.durationMs,
      },
      observed: {
        aiContextCollections: aiSavedUrlContext.value.length,
        analyticsRecords: analyticsQuery.value.length,
        collectionOpenFound: collectionOpen.value !== undefined,
        heapDeltaBytes: Math.max(0, heapAfter - heapBefore),
        projectedCollections: initialLoad.value.collections.length,
        readBackConversations: readBack.value.conversations.length,
        readBackMessages: readBack.value.messages.length,
        readBackUrls: readBack.value.savedTabs.urls.length,
        revision: write.value.revision,
        serializedBytes: Buffer.byteLength(serialized),
      },
    },
    null,
    2,
  ),
)
