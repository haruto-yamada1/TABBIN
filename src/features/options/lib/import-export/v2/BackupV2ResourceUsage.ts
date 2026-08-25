import {
  BackupResourceLimitError,
  assertBackupSerializedBytes,
  createEmptyBackupResourceUsage,
  validateBackupResourceUsage,
} from '@/lib/persistence/backupResourcePolicy'
import type {
  BackupResourceName,
  BackupResourceUsage,
} from '@/lib/persistence/backupResourcePolicy'

import type { BackupDataV2 } from './BackupV2Schema'

type MutableBackupResourceUsage = {
  -readonly [Key in keyof BackupResourceUsage]: BackupResourceUsage[Key]
}

type JsonRecord = Record<string, unknown>

const BASE64_BLOCK_LENGTH = 4
const BASE64_BYTES_PER_BLOCK = 3
const BASE64_DOUBLE_PADDING_LENGTH = 2
const BASE64_SINGLE_PADDING_LENGTH = 1
const textEncoder = new TextEncoder()

const isJsonRecord = (value: unknown): value is JsonRecord =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

const readString = (
  value: JsonRecord,
  property: string,
): string | undefined => {
  const candidate = value[property]
  return typeof candidate === 'string' ? candidate : undefined
}

const utf8Bytes = (value: string): number =>
  textEncoder.encode(value).byteLength

const createInvalidMetricError = (
  resource: Exclude<BackupResourceName, 'serializedBytes'>,
): BackupResourceLimitError => {
  const result = validateBackupResourceUsage({
    ...createEmptyBackupResourceUsage(),
    [resource]: Number.NaN,
  })
  if (result.success) {
    throw new Error(`Missing backup resource policy for ${resource}`)
  }
  return new BackupResourceLimitError(result.error)
}

const safeAdd = (
  left: number,
  right: number,
  resource: Exclude<BackupResourceName, 'serializedBytes'>,
): number => {
  if (
    !Number.isSafeInteger(left) ||
    left < 0 ||
    !Number.isSafeInteger(right) ||
    right < 0 ||
    left > Number.MAX_SAFE_INTEGER - right
  ) {
    throw createInvalidMetricError(resource)
  }
  return left + right
}

const observeUtf8Maximum = (
  usage: MutableBackupResourceUsage,
  resource:
    | 'keywordBytes'
    | 'messageContentBytes'
    | 'nameBytes'
    | 'notesBytes'
    | 'titleBytes'
    | 'urlBytes',
  value: string,
): void => {
  usage[resource] = Math.max(usage[resource], utf8Bytes(value))
}

const getDecodedBase64Bytes = (value: string): number | null => {
  const match = /^data:[^,]*;base64,(?<payload>[A-Za-z0-9+/]*={0,2})$/u.exec(
    value,
  )
  const payload = match?.groups?.payload
  if (
    payload === undefined ||
    payload.length % BASE64_BLOCK_LENGTH === BASE64_SINGLE_PADDING_LENGTH
  ) {
    return null
  }

  let padding = 0
  if (payload.endsWith('==')) {
    padding = BASE64_DOUBLE_PADDING_LENGTH
  } else if (payload.endsWith('=')) {
    padding = BASE64_SINGLE_PADDING_LENGTH
  }
  const decodedBytes =
    Math.floor(
      (payload.length * BASE64_BYTES_PER_BLOCK) / BASE64_BLOCK_LENGTH,
    ) - padding
  return Number.isSafeInteger(decodedBytes) && decodedBytes >= 0
    ? decodedBytes
    : null
}

const getAttachmentBytes = (attachment: JsonRecord): number | null => {
  const content = readString(attachment, 'content')
  const kind = readString(attachment, 'kind')
  if (content === undefined || (kind !== 'image' && kind !== 'text')) {
    return null
  }
  if (kind === 'image') {
    return getDecodedBase64Bytes(content) ?? utf8Bytes(content)
  }
  return utf8Bytes(content)
}

const isRecognizableToolTrace = (value: unknown): value is JsonRecord => {
  if (!isJsonRecord(value) || !Object.hasOwn(value, 'input')) {
    return false
  }
  return ['state', 'title', 'toolCallId', 'toolName', 'type'].every(
    (property) => readString(value, property) !== undefined,
  )
}

const getToolTracePayloadBytes = (toolTrace: JsonRecord): number => {
  const getSerializedBytes = (value: unknown): number => {
    const serialized: unknown = JSON.stringify(value)
    if (typeof serialized !== 'string') {
      throw createInvalidMetricError('toolTraceBytes')
    }
    return utf8Bytes(serialized)
  }

  const inputBytes = getSerializedBytes(toolTrace.input)
  if (!Object.hasOwn(toolTrace, 'output')) {
    return inputBytes
  }
  return safeAdd(
    inputBytes,
    getSerializedBytes(toolTrace.output),
    'toolTraceBytes',
  )
}

const collectKeywords = (
  usage: MutableBackupResourceUsage,
  keywords: readonly string[],
): void => {
  usage.keywordsPerEntity = Math.max(usage.keywordsPerEntity, keywords.length)
  for (const keyword of keywords) {
    observeUtf8Maximum(usage, 'keywordBytes', keyword)
  }
}

const collectMessageResources = (
  usage: MutableBackupResourceUsage,
  value: unknown,
): void => {
  if (!isJsonRecord(value)) {
    return
  }

  const content = readString(value, 'content')
  if (content !== undefined) {
    observeUtf8Maximum(usage, 'messageContentBytes', content)
  }

  const attachments = value.attachments
  if (Array.isArray(attachments)) {
    let recognizedAttachments = 0
    for (const attachment of attachments) {
      if (!isJsonRecord(attachment)) {
        continue
      }
      const bytes = getAttachmentBytes(attachment)
      if (bytes === null) {
        continue
      }
      recognizedAttachments = safeAdd(
        recognizedAttachments,
        1,
        'attachmentsPerMessage',
      )
      usage.attachments = safeAdd(usage.attachments, 1, 'attachments')
      usage.attachmentBytes = Math.max(usage.attachmentBytes, bytes)
      usage.attachmentAggregateBytes = safeAdd(
        usage.attachmentAggregateBytes,
        bytes,
        'attachmentAggregateBytes',
      )
    }
    usage.attachmentsPerMessage = Math.max(
      usage.attachmentsPerMessage,
      recognizedAttachments,
    )
  }

  const charts = value.charts
  if (Array.isArray(charts)) {
    for (const chart of charts) {
      if (!isJsonRecord(chart) || !Array.isArray(chart.data)) {
        continue
      }
      const dataPoints = chart.data.length
      usage.chartDataPoints = safeAdd(
        usage.chartDataPoints,
        dataPoints,
        'chartDataPoints',
      )
      usage.chartDataPointsPerChart = Math.max(
        usage.chartDataPointsPerChart,
        dataPoints,
      )
    }
  }

  const toolTraces = value.toolTraces
  if (Array.isArray(toolTraces)) {
    for (const toolTrace of toolTraces) {
      if (!isRecognizableToolTrace(toolTrace)) {
        continue
      }
      const bytes = getToolTracePayloadBytes(toolTrace)
      usage.toolTraces = safeAdd(usage.toolTraces, 1, 'toolTraces')
      usage.toolTraceBytes = Math.max(usage.toolTraceBytes, bytes)
      usage.toolTraceAggregateBytes = safeAdd(
        usage.toolTraceAggregateBytes,
        bytes,
        'toolTraceAggregateBytes',
      )
    }
  }
}

/**
 * Collects the numeric Backup V2 policy metrics without retaining user content.
 *
 * `serializedBytes` is supplied by the compact envelope serializer so callers
 * validate the exact representation that will be written.
 */
export const collectBackupV2ResourceUsage = (
  data: BackupDataV2,
  serializedBytes: number,
): BackupResourceUsage => {
  const usage: MutableBackupResourceUsage = {
    ...createEmptyBackupResourceUsage(),
    analyticsViews: data.analyticsViews.length,
    categories: data.savedTabs.categories.length,
    collections: data.savedTabs.collections.length,
    conversations: data.conversations.length,
    groups: data.savedTabs.groups.length,
    memberships: data.savedTabs.memberships.length,
    messages: data.messages.length,
    serializedBytes: 0,
    urls: data.savedTabs.urls.length,
  }

  for (const url of data.savedTabs.urls) {
    observeUtf8Maximum(usage, 'urlBytes', url.url)
    observeUtf8Maximum(usage, 'urlBytes', url.normalizedUrl)
    if (url.favIconUrl !== undefined) {
      observeUtf8Maximum(usage, 'urlBytes', url.favIconUrl)
    }
    observeUtf8Maximum(usage, 'titleBytes', url.title)
  }

  for (const collection of data.savedTabs.collections) {
    observeUtf8Maximum(usage, 'nameBytes', collection.name)
    if (collection.definition.type === 'custom') {
      collectKeywords(usage, [
        ...collection.definition.projectKeywords.domainKeywords,
        ...collection.definition.projectKeywords.titleKeywords,
        ...collection.definition.projectKeywords.urlKeywords,
      ])
    }
  }

  for (const category of data.savedTabs.categories) {
    observeUtf8Maximum(usage, 'nameBytes', category.name)
    collectKeywords(usage, category.keywords)
  }

  for (const group of data.savedTabs.groups) {
    observeUtf8Maximum(usage, 'nameBytes', group.name)
  }

  for (const membership of data.savedTabs.memberships) {
    if (membership.notes !== undefined) {
      observeUtf8Maximum(usage, 'notesBytes', membership.notes)
    }
  }

  const messagesByConversation = new Map<string, number>()
  for (const message of data.messages) {
    const count = safeAdd(
      messagesByConversation.get(message.conversationId) ?? 0,
      1,
      'messagesPerConversation',
    )
    messagesByConversation.set(message.conversationId, count)
    usage.messagesPerConversation = Math.max(
      usage.messagesPerConversation,
      count,
    )
    collectMessageResources(usage, message.value)
  }

  const validation = validateBackupResourceUsage(usage)
  if (!validation.success) {
    throw new BackupResourceLimitError(validation.error)
  }
  assertBackupSerializedBytes(serializedBytes)
  return { ...usage, serializedBytes }
}
