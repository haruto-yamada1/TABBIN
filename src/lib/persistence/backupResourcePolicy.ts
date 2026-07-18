import {
  AI_CHAT_MAX_ATTACHMENTS,
  AI_CHAT_MAX_ATTACHMENT_SIZE_BYTES,
} from '@/constants/aiChatLimits'

const KIBIBYTE = 1024
const MEBIBYTE = KIBIBYTE * KIBIBYTE
const ATTACHMENT_AGGREGATE_MEBIBYTES = 32
const MESSAGE_CONTENT_MEBIBYTES = 4
const NAME_KIBIBYTES = 4
const SERIALIZED_BACKUP_MEBIBYTES = 128
const TITLE_KIBIBYTES = 64
const TOOL_TRACE_AGGREGATE_MEBIBYTES = 8
const URL_KIBIBYTES = 8

export const BACKUP_RESOURCE_LIMITS = {
  maxAnalyticsViews: 10_000,
  maxAttachmentAggregateBytes: ATTACHMENT_AGGREGATE_MEBIBYTES * MEBIBYTE,
  maxAttachmentBytes: AI_CHAT_MAX_ATTACHMENT_SIZE_BYTES,
  maxAttachments: 100_000,
  maxAttachmentsPerMessage: AI_CHAT_MAX_ATTACHMENTS,
  maxCategories: 100_000,
  maxChartDataPoints: 500_000,
  maxChartDataPointsPerChart: 50_000,
  maxCollections: 10_000,
  maxConversations: 1_000,
  maxGroups: 10_000,
  maxKeywordBytes: KIBIBYTE,
  maxKeywordsPerEntity: 1_000,
  maxMemberships: 500_000,
  maxMessageContentBytes: MESSAGE_CONTENT_MEBIBYTES * MEBIBYTE,
  maxMessages: 100_000,
  maxMessagesPerConversation: 10_000,
  maxNameBytes: NAME_KIBIBYTES * KIBIBYTE,
  maxNotesBytes: MEBIBYTE,
  maxSerializedBytes: SERIALIZED_BACKUP_MEBIBYTES * MEBIBYTE,
  maxTitleBytes: TITLE_KIBIBYTES * KIBIBYTE,
  maxToolTraceAggregateBytes: TOOL_TRACE_AGGREGATE_MEBIBYTES * MEBIBYTE,
  maxToolTraceBytes: MEBIBYTE,
  maxToolTraces: 100_000,
  maxUrlBytes: URL_KIBIBYTES * KIBIBYTE,
  maxUrls: 100_000,
} as const

export const BACKUP_MAX_SERIALIZED_SIZE_LABEL = `${
  BACKUP_RESOURCE_LIMITS.maxSerializedBytes / MEBIBYTE
} MiB`

export const BACKUP_RECOVERY_RETENTION_POLICY = {
  maxAgeDays: 7,
  maxAggregateBytes: 2 * BACKUP_RESOURCE_LIMITS.maxSerializedBytes,
  maxSnapshots: 2,
} as const

export type BackupImportErrorCode =
  | 'BACKUP_FILE_TOO_LARGE'
  | 'BACKUP_RESOURCE_LIMIT_EXCEEDED'
  | 'BACKUP_NESTED_PAYLOAD_TOO_LARGE'
  | 'INVALID_BACKUP'

export type BackupResourceUsage = {
  readonly analyticsViews: number
  readonly attachmentAggregateBytes: number
  readonly attachmentBytes: number
  readonly attachments: number
  readonly attachmentsPerMessage: number
  readonly categories: number
  readonly chartDataPoints: number
  readonly chartDataPointsPerChart: number
  readonly collections: number
  readonly conversations: number
  readonly groups: number
  readonly keywordBytes: number
  readonly keywordsPerEntity: number
  readonly memberships: number
  readonly messageContentBytes: number
  readonly messages: number
  readonly messagesPerConversation: number
  readonly nameBytes: number
  readonly notesBytes: number
  readonly serializedBytes: number
  readonly titleBytes: number
  readonly toolTraceAggregateBytes: number
  readonly toolTraceBytes: number
  readonly toolTraces: number
  readonly urlBytes: number
  readonly urls: number
}

export type BackupResourceName = keyof BackupResourceUsage

export type BackupResourceDiagnostic = {
  readonly actual?: number
  readonly limit: number
  readonly resource: BackupResourceName
}

export type BackupResourceViolation = {
  readonly code: BackupImportErrorCode
  readonly diagnostic: BackupResourceDiagnostic
}

export type BackupResourceValidationResult =
  | { readonly success: true }
  | {
      readonly error: BackupResourceViolation
      readonly success: false
    }

type BackupResourceLimitSpec = {
  readonly code:
    | 'BACKUP_FILE_TOO_LARGE'
    | 'BACKUP_NESTED_PAYLOAD_TOO_LARGE'
    | 'BACKUP_RESOURCE_LIMIT_EXCEEDED'
  readonly limit: number
  readonly resource: BackupResourceName
}

const backupSerializedBytesLimitSpec: BackupResourceLimitSpec = {
  code: 'BACKUP_FILE_TOO_LARGE',
  limit: BACKUP_RESOURCE_LIMITS.maxSerializedBytes,
  resource: 'serializedBytes',
}

const backupResourceLimitSpecs: readonly BackupResourceLimitSpec[] = [
  backupSerializedBytesLimitSpec,
  {
    code: 'BACKUP_RESOURCE_LIMIT_EXCEEDED',
    limit: BACKUP_RESOURCE_LIMITS.maxUrls,
    resource: 'urls',
  },
  {
    code: 'BACKUP_RESOURCE_LIMIT_EXCEEDED',
    limit: BACKUP_RESOURCE_LIMITS.maxCollections,
    resource: 'collections',
  },
  {
    code: 'BACKUP_RESOURCE_LIMIT_EXCEEDED',
    limit: BACKUP_RESOURCE_LIMITS.maxMemberships,
    resource: 'memberships',
  },
  {
    code: 'BACKUP_RESOURCE_LIMIT_EXCEEDED',
    limit: BACKUP_RESOURCE_LIMITS.maxCategories,
    resource: 'categories',
  },
  {
    code: 'BACKUP_RESOURCE_LIMIT_EXCEEDED',
    limit: BACKUP_RESOURCE_LIMITS.maxGroups,
    resource: 'groups',
  },
  {
    code: 'BACKUP_RESOURCE_LIMIT_EXCEEDED',
    limit: BACKUP_RESOURCE_LIMITS.maxConversations,
    resource: 'conversations',
  },
  {
    code: 'BACKUP_RESOURCE_LIMIT_EXCEEDED',
    limit: BACKUP_RESOURCE_LIMITS.maxMessages,
    resource: 'messages',
  },
  {
    code: 'BACKUP_RESOURCE_LIMIT_EXCEEDED',
    limit: BACKUP_RESOURCE_LIMITS.maxAttachments,
    resource: 'attachments',
  },
  {
    code: 'BACKUP_RESOURCE_LIMIT_EXCEEDED',
    limit: BACKUP_RESOURCE_LIMITS.maxAnalyticsViews,
    resource: 'analyticsViews',
  },
  {
    code: 'BACKUP_RESOURCE_LIMIT_EXCEEDED',
    limit: BACKUP_RESOURCE_LIMITS.maxChartDataPoints,
    resource: 'chartDataPoints',
  },
  {
    code: 'BACKUP_RESOURCE_LIMIT_EXCEEDED',
    limit: BACKUP_RESOURCE_LIMITS.maxToolTraces,
    resource: 'toolTraces',
  },
  {
    code: 'BACKUP_NESTED_PAYLOAD_TOO_LARGE',
    limit: BACKUP_RESOURCE_LIMITS.maxMessagesPerConversation,
    resource: 'messagesPerConversation',
  },
  {
    code: 'BACKUP_NESTED_PAYLOAD_TOO_LARGE',
    limit: BACKUP_RESOURCE_LIMITS.maxAttachmentsPerMessage,
    resource: 'attachmentsPerMessage',
  },
  {
    code: 'BACKUP_NESTED_PAYLOAD_TOO_LARGE',
    limit: BACKUP_RESOURCE_LIMITS.maxAttachmentBytes,
    resource: 'attachmentBytes',
  },
  {
    code: 'BACKUP_NESTED_PAYLOAD_TOO_LARGE',
    limit: BACKUP_RESOURCE_LIMITS.maxAttachmentAggregateBytes,
    resource: 'attachmentAggregateBytes',
  },
  {
    code: 'BACKUP_NESTED_PAYLOAD_TOO_LARGE',
    limit: BACKUP_RESOURCE_LIMITS.maxChartDataPointsPerChart,
    resource: 'chartDataPointsPerChart',
  },
  {
    code: 'BACKUP_NESTED_PAYLOAD_TOO_LARGE',
    limit: BACKUP_RESOURCE_LIMITS.maxToolTraceBytes,
    resource: 'toolTraceBytes',
  },
  {
    code: 'BACKUP_NESTED_PAYLOAD_TOO_LARGE',
    limit: BACKUP_RESOURCE_LIMITS.maxToolTraceAggregateBytes,
    resource: 'toolTraceAggregateBytes',
  },
  {
    code: 'BACKUP_NESTED_PAYLOAD_TOO_LARGE',
    limit: BACKUP_RESOURCE_LIMITS.maxKeywordsPerEntity,
    resource: 'keywordsPerEntity',
  },
  {
    code: 'BACKUP_NESTED_PAYLOAD_TOO_LARGE',
    limit: BACKUP_RESOURCE_LIMITS.maxKeywordBytes,
    resource: 'keywordBytes',
  },
  {
    code: 'BACKUP_NESTED_PAYLOAD_TOO_LARGE',
    limit: BACKUP_RESOURCE_LIMITS.maxUrlBytes,
    resource: 'urlBytes',
  },
  {
    code: 'BACKUP_NESTED_PAYLOAD_TOO_LARGE',
    limit: BACKUP_RESOURCE_LIMITS.maxNameBytes,
    resource: 'nameBytes',
  },
  {
    code: 'BACKUP_NESTED_PAYLOAD_TOO_LARGE',
    limit: BACKUP_RESOURCE_LIMITS.maxTitleBytes,
    resource: 'titleBytes',
  },
  {
    code: 'BACKUP_NESTED_PAYLOAD_TOO_LARGE',
    limit: BACKUP_RESOURCE_LIMITS.maxNotesBytes,
    resource: 'notesBytes',
  },
  {
    code: 'BACKUP_NESTED_PAYLOAD_TOO_LARGE',
    limit: BACKUP_RESOURCE_LIMITS.maxMessageContentBytes,
    resource: 'messageContentBytes',
  },
]

export const createEmptyBackupResourceUsage = (): BackupResourceUsage => ({
  analyticsViews: 0,
  attachmentAggregateBytes: 0,
  attachmentBytes: 0,
  attachments: 0,
  attachmentsPerMessage: 0,
  categories: 0,
  chartDataPoints: 0,
  chartDataPointsPerChart: 0,
  collections: 0,
  conversations: 0,
  groups: 0,
  keywordBytes: 0,
  keywordsPerEntity: 0,
  memberships: 0,
  messageContentBytes: 0,
  messages: 0,
  messagesPerConversation: 0,
  nameBytes: 0,
  notesBytes: 0,
  serializedBytes: 0,
  titleBytes: 0,
  toolTraceAggregateBytes: 0,
  toolTraceBytes: 0,
  toolTraces: 0,
  urlBytes: 0,
  urls: 0,
})

const isSafeNonNegativeInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

const validateBackupResourceLimit = (
  actual: number,
  spec: BackupResourceLimitSpec,
): BackupResourceValidationResult => {
  if (!isSafeNonNegativeInteger(actual)) {
    return {
      error: {
        code: 'INVALID_BACKUP',
        diagnostic: {
          limit: spec.limit,
          resource: spec.resource,
        },
      },
      success: false,
    }
  }
  if (actual > spec.limit) {
    return {
      error: {
        code: spec.code,
        diagnostic: {
          actual,
          limit: spec.limit,
          resource: spec.resource,
        },
      },
      success: false,
    }
  }
  return { success: true }
}

export const validateBackupResourceUsage = (
  usage: BackupResourceUsage,
): BackupResourceValidationResult => {
  for (const spec of backupResourceLimitSpecs) {
    const result = validateBackupResourceLimit(usage[spec.resource], spec)
    if (!result.success) {
      return result
    }
  }
  return { success: true }
}

export const validateBackupSerializedBytes = (
  serializedBytes: number,
): BackupResourceValidationResult =>
  validateBackupResourceLimit(serializedBytes, backupSerializedBytesLimitSpec)

export class BackupResourceLimitError extends Error {
  readonly code: BackupImportErrorCode
  readonly diagnostic: BackupResourceDiagnostic

  constructor(violation: BackupResourceViolation) {
    super(`${violation.code}: ${violation.diagnostic.resource}`)
    this.name = 'BackupResourceLimitError'
    this.code = violation.code
    this.diagnostic = violation.diagnostic
  }
}

export const assertBackupSerializedBytes = (serializedBytes: number): void => {
  const result = validateBackupSerializedBytes(serializedBytes)
  if (!result.success) {
    throw new BackupResourceLimitError(result.error)
  }
}
