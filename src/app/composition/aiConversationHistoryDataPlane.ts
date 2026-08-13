import { PersistenceUnavailableError } from '@/contexts/saved-tabs/application/errors/PersistenceUnavailableError'
import type {
  PersistenceDataPlaneRouterPort,
  PersistenceOperationGatePort,
} from '@/contexts/saved-tabs/application/ports/PersistenceBootstrapPort'
import type { PersistenceV2SnapshotReaderPort } from '@/contexts/saved-tabs/application/ports/PersistenceV2SnapshotReaderPort'
import type {
  PersistenceJsonRecord,
  PersistenceMessageRecord,
  PersistenceV2UnitOfWorkPort,
} from '@/contexts/saved-tabs/application/ports/PersistenceV2UnitOfWorkPort'
import { createBroadcastChannelPersistenceChangeAdapter } from '@/contexts/saved-tabs/infrastructure/browser/BroadcastChannelPersistenceChangeAdapter'
import { createSystemIdGenerator } from '@/contexts/saved-tabs/infrastructure/browser/SystemIdGeneratorAdapter'
import { createNotifyingPersistenceV2UnitOfWork } from '@/contexts/saved-tabs/infrastructure/composition/createNotifyingPersistenceV2UnitOfWork'
import { getPersistenceBootstrapRuntime } from '@/contexts/saved-tabs/infrastructure/composition/persistenceBootstrapRuntime'
import { IndexedDbPersistenceSnapshotReader } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceSnapshotReader'
import { IndexedDbPersistenceUnitOfWork } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceUnitOfWork'
import { getChromeStorageLocal } from '@/lib/browser/chrome-storage'
import { logger } from '@/lib/logging/logger'
import { isJsonValue } from '@/lib/persistence/jsonValue'

const ACTIVE_CONVERSATION_ID_KEY = 'activeAiChatConversationId'
const CONVERSATIONS_KEY = 'aiChatConversations'

type AiConversationHistoryData = {
  readonly activeConversationId: unknown
  readonly conversations: readonly unknown[]
}

type AiConversationHistoryDataPlane = {
  readonly read: () => Promise<AiConversationHistoryData>
  readonly replace: (data: AiConversationHistoryData) => Promise<void>
}

type AiConversationHistoryStorage = {
  readonly get: (
    keys: string | readonly string[],
  ) => Promise<Record<string, unknown>>
  readonly set: (values: Record<string, unknown>) => Promise<void>
}

type RecordLike = Record<string, unknown>

const isRecord = (value: unknown): value is RecordLike =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isTimestamp = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

const createRouteAwareAiConversationHistoryDataPlane = ({
  indexeddb,
  legacy,
  router,
}: {
  readonly indexeddb: AiConversationHistoryDataPlane
  readonly legacy: AiConversationHistoryDataPlane
  readonly router: PersistenceDataPlaneRouterPort
}): AiConversationHistoryDataPlane => ({
  read: async () =>
    router.read({ indexeddb: indexeddb.read, legacy: legacy.read }),
  replace: async (data) =>
    router.write({
      indexeddb: async () => indexeddb.replace(data),
      legacy: async () => legacy.replace(data),
    }),
})

const createLegacyAiConversationHistoryDataPlane = (
  getStorage: () => AiConversationHistoryStorage,
  setStorage: (values: Record<string, unknown>) => Promise<void> = async (
    values,
  ) => getStorage().set(values),
): AiConversationHistoryDataPlane => ({
  read: async () => {
    const stored = await getStorage().get([
      ACTIVE_CONVERSATION_ID_KEY,
      CONVERSATIONS_KEY,
    ])
    return {
      activeConversationId: stored[ACTIVE_CONVERSATION_ID_KEY],
      conversations: Array.isArray(stored[CONVERSATIONS_KEY])
        ? stored[CONVERSATIONS_KEY]
        : [],
    }
  },
  replace: async ({ activeConversationId, conversations }) => {
    await setStorage({
      [ACTIVE_CONVERSATION_ID_KEY]: activeConversationId,
      [CONVERSATIONS_KEY]: [...conversations],
    })
  },
})

const readOptionalMessageIds = (
  value: unknown,
): readonly string[] | undefined => {
  if (value === undefined) {
    return undefined
  }
  if (!Array.isArray(value)) {
    throw new TypeError('AI conversation record is invalid.')
  }
  const messageIds: string[] = []
  for (const id of value) {
    if (typeof id !== 'string') {
      throw new TypeError('AI conversation record is invalid.')
    }
    messageIds.push(id)
  }
  if (new Set(messageIds).size !== messageIds.length) {
    throw new TypeError('AI conversation record is invalid.')
  }
  return messageIds
}

const readConversationValue = (
  record: PersistenceJsonRecord,
): {
  readonly createdAt: number
  readonly messageIds?: readonly string[]
  readonly title: string
} => {
  if (
    !isRecord(record.value) ||
    !isTimestamp(record.value.createdAt) ||
    typeof record.value.title !== 'string'
  ) {
    throw new TypeError('AI conversation record is invalid.')
  }
  const messageIds = readOptionalMessageIds(record.value.messageIds)
  return {
    createdAt: record.value.createdAt,
    ...(messageIds ? { messageIds } : {}),
    title: record.value.title,
  }
}

const readMessageValue = (record: PersistenceMessageRecord): RecordLike => {
  if (
    !isRecord(record.value) ||
    record.value.id !== record.id ||
    typeof record.value.content !== 'string' ||
    (record.value.role !== 'assistant' && record.value.role !== 'user')
  ) {
    throw new TypeError('AI conversation message record is invalid.')
  }
  return record.value
}

const materializeConversations = (
  conversations: readonly PersistenceJsonRecord[],
  messages: readonly PersistenceMessageRecord[],
): readonly unknown[] => {
  const messagesByConversation = new Map<string, PersistenceMessageRecord[]>()
  for (const message of messages) {
    const current = messagesByConversation.get(message.conversationId) ?? []
    current.push(message)
    messagesByConversation.set(message.conversationId, current)
  }
  return conversations.map((record) => {
    const value = readConversationValue(record)
    const storedMessages = messagesByConversation.get(record.id) ?? []
    let orderedMessages: readonly PersistenceMessageRecord[]
    if (value.messageIds) {
      const messagesById = new Map(
        storedMessages.map((message) => [message.id, message]),
      )
      if (
        messagesById.size !== storedMessages.length ||
        value.messageIds.length !== storedMessages.length
      ) {
        throw new TypeError('AI conversation message order is invalid.')
      }
      orderedMessages = value.messageIds.map((id) => {
        const message = messagesById.get(id)
        if (!message) {
          throw new TypeError('AI conversation message order is invalid.')
        }
        return message
      })
    } else {
      orderedMessages = storedMessages.toSorted(
        (left, right) =>
          left.createdAt - right.createdAt || left.id.localeCompare(right.id),
      )
    }
    const conversationMessages = orderedMessages.map(readMessageValue)
    return {
      createdAt: value.createdAt,
      id: record.id,
      messages: conversationMessages,
      title: value.title,
      updatedAt: record.updatedAt,
    }
  })
}

const normalizeJsonValue = (
  value: RecordLike,
): PersistenceMessageRecord['value'] => {
  try {
    const serialized = JSON.stringify(value)
    const normalized: unknown = JSON.parse(serialized)
    if (isJsonValue(normalized)) {
      return normalized
    }
  } catch {
    throw new TypeError('AI conversation message is not JSON-safe.')
  }
  throw new TypeError('AI conversation message is not JSON-safe.')
}

const readConversationInput = (value: unknown) => {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.title !== 'string' ||
    !isTimestamp(value.createdAt) ||
    !isTimestamp(value.updatedAt) ||
    !Array.isArray(value.messages)
  ) {
    throw new TypeError('AI conversation is not JSON-safe or valid.')
  }
  return {
    createdAt: value.createdAt,
    id: value.id,
    messages: value.messages,
    title: value.title,
    updatedAt: value.updatedAt,
  }
}

const readConversationMessageInput = (message: unknown) => {
  if (
    !isRecord(message) ||
    typeof message.id !== 'string' ||
    typeof message.content !== 'string' ||
    (message.role !== 'assistant' && message.role !== 'user')
  ) {
    throw new TypeError('AI conversation message is invalid.')
  }
  const normalizedMessage = normalizeJsonValue(message)
  if (
    !isRecord(normalizedMessage) ||
    typeof normalizedMessage.id !== 'string' ||
    typeof normalizedMessage.content !== 'string' ||
    (normalizedMessage.role !== 'assistant' &&
      normalizedMessage.role !== 'user')
  ) {
    throw new TypeError('AI conversation message is invalid.')
  }
  return { id: normalizedMessage.id, value: normalizedMessage }
}

const toPersistenceRecords = (
  values: readonly unknown[],
  currentMessages: ReadonlyMap<string, PersistenceMessageRecord>,
) => {
  const conversations: PersistenceJsonRecord[] = []
  const messages: PersistenceMessageRecord[] = []
  const conversationIds = new Set<string>()
  const messageIds = new Set<string>()
  for (const value of values) {
    const conversation = readConversationInput(value)
    if (conversationIds.has(conversation.id)) {
      throw new TypeError('AI conversation IDs must be unique.')
    }
    const conversationId = conversation.id
    const conversationCreatedAt = conversation.createdAt
    conversationIds.add(conversationId)
    const conversationMessageIds: string[] = []
    for (const message of conversation.messages) {
      const normalizedMessage = readConversationMessageInput(message)
      if (messageIds.has(normalizedMessage.id)) {
        throw new TypeError('AI conversation message IDs must be unique.')
      }
      messageIds.add(normalizedMessage.id)
      conversationMessageIds.push(normalizedMessage.id)
      messages.push({
        conversationId,
        createdAt:
          currentMessages.get(normalizedMessage.id)?.createdAt ??
          conversationCreatedAt,
        id: normalizedMessage.id,
        value: normalizedMessage.value,
      })
    }
    conversations.push({
      id: conversationId,
      updatedAt: conversation.updatedAt,
      value: {
        createdAt: conversation.createdAt,
        messageIds: conversationMessageIds,
        title: conversation.title,
      },
    })
  }
  return { conversations, messages }
}

const collectMissingRecordIds = (
  records: readonly { readonly id: string }[],
  nextIds: ReadonlySet<string>,
): string[] => {
  const missingIds: string[] = []
  for (const { id } of records) {
    if (!nextIds.has(id)) {
      missingIds.push(id)
    }
  }
  return missingIds
}

const recordsEqual = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right)

const createIndexedDbAiConversationHistoryDataPlane = ({
  reader,
  selectionStorage,
  unitOfWork,
}: {
  readonly reader: Pick<
    PersistenceV2SnapshotReaderPort,
    'readConsistentSnapshot'
  >
  readonly selectionStorage: AiConversationHistoryStorage
  readonly unitOfWork: Pick<PersistenceV2UnitOfWorkPort, 'commit'>
}): AiConversationHistoryDataPlane => ({
  read: async () => {
    const [snapshot, selection] = await Promise.all([
      reader.readConsistentSnapshot(),
      selectionStorage.get(ACTIVE_CONVERSATION_ID_KEY),
    ])
    return {
      activeConversationId: selection[ACTIVE_CONVERSATION_ID_KEY],
      conversations: materializeConversations(
        snapshot.conversations,
        snapshot.messages,
      ),
    }
  },
  replace: async ({ activeConversationId, conversations }) => {
    const snapshot = await reader.readConsistentSnapshot()
    const currentConversations = new Map(
      snapshot.conversations.map((record) => [record.id, record]),
    )
    const currentMessages = new Map(
      snapshot.messages.map((record) => [record.id, record]),
    )
    const next = toPersistenceRecords(conversations, currentMessages)
    const nextConversationIds = new Set(next.conversations.map(({ id }) => id))
    const nextMessageIds = new Set(next.messages.map(({ id }) => id))
    const deleteConversations = collectMissingRecordIds(
      snapshot.conversations,
      nextConversationIds,
    )
    const deleteMessages = collectMissingRecordIds(
      snapshot.messages,
      nextMessageIds,
    )
    const putConversations = next.conversations.filter(
      (record) => !recordsEqual(currentConversations.get(record.id), record),
    )
    const putMessages = next.messages.filter(
      (record) => !recordsEqual(currentMessages.get(record.id), record),
    )
    if (
      deleteConversations.length > 0 ||
      deleteMessages.length > 0 ||
      putConversations.length > 0 ||
      putMessages.length > 0
    ) {
      await unitOfWork.commit(
        {
          conversations: {
            ...(deleteConversations.length > 0
              ? { delete: deleteConversations }
              : {}),
            ...(putConversations.length > 0 ? { put: putConversations } : {}),
          },
          messages: {
            ...(deleteMessages.length > 0 ? { delete: deleteMessages } : {}),
            ...(putMessages.length > 0 ? { put: putMessages } : {}),
          },
        },
        { expectedRevision: snapshot.revision },
      )
    }
    await selectionStorage.set({
      [ACTIVE_CONVERSATION_ID_KEY]: activeConversationId,
    })
  },
})

const selectedIndexedDbGate: PersistenceOperationGatePort = {
  runIndexedDbRead: async (operation) => operation(),
  runIndexedDbWrite: async (operation) => operation(),
  // eslint-disable-next-line typescript/require-await -- the outer router selected IndexedDB
  runLegacyRead: async () => {
    throw new PersistenceUnavailableError('PERSISTENCE_ROUTE_MISMATCH')
  },
  // eslint-disable-next-line typescript/require-await -- the outer router selected IndexedDB
  runLegacyWrite: async () => {
    throw new PersistenceUnavailableError('PERSISTENCE_ROUTE_MISMATCH')
  },
}

const createProductionIndexedDbDataPlane = (
  storage: AiConversationHistoryStorage,
): AiConversationHistoryDataPlane => {
  const runtime = getPersistenceBootstrapRuntime()
  if (!runtime.connectionManager) {
    throw new PersistenceUnavailableError(
      'PERSISTENCE_CONTROL_STATE_UNAVAILABLE',
    )
  }
  return createIndexedDbAiConversationHistoryDataPlane({
    reader: new IndexedDbPersistenceSnapshotReader(
      runtime.connectionManager,
      selectedIndexedDbGate,
    ),
    selectionStorage: storage,
    unitOfWork: createNotifyingPersistenceV2UnitOfWork({
      changePort: createBroadcastChannelPersistenceChangeAdapter(),
      idGenerator: createSystemIdGenerator(),
      onNotificationFailure: (diagnostic) => {
        logger.error('persistence_notification_failed_after_commit', diagnostic)
      },
      unitOfWork: new IndexedDbPersistenceUnitOfWork(
        runtime.connectionManager,
        selectedIndexedDbGate,
      ),
    }),
  })
}

let productionDataPlane: AiConversationHistoryDataPlane | null | undefined
let productionIndexedDbDataPlane: AiConversationHistoryDataPlane | undefined

const getAiConversationHistoryDataPlane =
  (): AiConversationHistoryDataPlane | null => {
    if (productionDataPlane !== undefined) {
      return productionDataPlane
    }
    const storage = getChromeStorageLocal()
    if (!storage) {
      productionDataPlane = null
      return productionDataPlane
    }
    const legacy = createLegacyAiConversationHistoryDataPlane(
      () => storage,
      async (values) => storage.set(values),
    )
    productionDataPlane = createRouteAwareAiConversationHistoryDataPlane({
      indexeddb: {
        read: async () => {
          productionIndexedDbDataPlane ??=
            createProductionIndexedDbDataPlane(storage)
          return productionIndexedDbDataPlane.read()
        },
        replace: async (data) => {
          productionIndexedDbDataPlane ??=
            createProductionIndexedDbDataPlane(storage)
          await productionIndexedDbDataPlane.replace(data)
        },
      },
      legacy,
      router: getPersistenceBootstrapRuntime().dataPlaneRouter,
    })
    return productionDataPlane
  }

const resetAiConversationHistoryDataPlaneForTesting = (): void => {
  productionDataPlane = undefined
  productionIndexedDbDataPlane = undefined
}

export type { AiConversationHistoryData, AiConversationHistoryDataPlane }
export {
  createIndexedDbAiConversationHistoryDataPlane,
  createLegacyAiConversationHistoryDataPlane,
  createRouteAwareAiConversationHistoryDataPlane,
  getAiConversationHistoryDataPlane,
  resetAiConversationHistoryDataPlaneForTesting,
}
