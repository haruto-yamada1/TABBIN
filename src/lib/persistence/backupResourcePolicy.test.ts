import { describe, expect, it } from 'vitest'

import {
  AI_CHAT_MAX_ATTACHMENTS,
  AI_CHAT_MAX_ATTACHMENT_SIZE_BYTES,
} from '@/constants/aiChatLimits'

import {
  BACKUP_MAX_SERIALIZED_SIZE_LABEL,
  BACKUP_RECOVERY_RETENTION_POLICY,
  BACKUP_RESOURCE_LIMITS,
  BackupResourceLimitError,
  assertBackupSerializedBytes,
  createEmptyBackupResourceUsage,
  validateBackupResourceUsage,
  validateBackupSerializedBytes,
} from './backupResourcePolicy'

const MEBIBYTE = 1024 * 1024

const topLevelLimitCases = [
  ['analyticsViews', 'maxAnalyticsViews'],
  ['attachments', 'maxAttachments'],
  ['categories', 'maxCategories'],
  ['chartDataPoints', 'maxChartDataPoints'],
  ['collections', 'maxCollections'],
  ['conversations', 'maxConversations'],
  ['groups', 'maxGroups'],
  ['memberships', 'maxMemberships'],
  ['messages', 'maxMessages'],
  ['toolTraces', 'maxToolTraces'],
  ['urls', 'maxUrls'],
] as const

const nestedLimitCases = [
  ['attachmentAggregateBytes', 'maxAttachmentAggregateBytes'],
  ['attachmentBytes', 'maxAttachmentBytes'],
  ['attachmentsPerMessage', 'maxAttachmentsPerMessage'],
  ['chartDataPointsPerChart', 'maxChartDataPointsPerChart'],
  ['keywordBytes', 'maxKeywordBytes'],
  ['keywordsPerEntity', 'maxKeywordsPerEntity'],
  ['messageContentBytes', 'maxMessageContentBytes'],
  ['messagesPerConversation', 'maxMessagesPerConversation'],
  ['nameBytes', 'maxNameBytes'],
  ['notesBytes', 'maxNotesBytes'],
  ['titleBytes', 'maxTitleBytes'],
  ['toolTraceAggregateBytes', 'maxToolTraceAggregateBytes'],
  ['toolTraceBytes', 'maxToolTraceBytes'],
  ['urlBytes', 'maxUrlBytes'],
] as const

describe('Backup resource policy', () => {
  it('defines the supported production envelope in one executable policy', () => {
    expect(BACKUP_RESOURCE_LIMITS).toEqual({
      maxAnalyticsViews: 10_000,
      maxAttachmentAggregateBytes: 32 * MEBIBYTE,
      maxAttachmentBytes: AI_CHAT_MAX_ATTACHMENT_SIZE_BYTES,
      maxAttachments: 100_000,
      maxAttachmentsPerMessage: AI_CHAT_MAX_ATTACHMENTS,
      maxCategories: 100_000,
      maxChartDataPoints: 500_000,
      maxChartDataPointsPerChart: 50_000,
      maxCollections: 10_000,
      maxConversations: 1_000,
      maxGroups: 10_000,
      maxKeywordBytes: 1024,
      maxKeywordsPerEntity: 1_000,
      maxMemberships: 500_000,
      maxMessageContentBytes: 4 * MEBIBYTE,
      maxMessages: 100_000,
      maxMessagesPerConversation: 10_000,
      maxNameBytes: 4 * 1024,
      maxNotesBytes: MEBIBYTE,
      maxSerializedBytes: 128 * MEBIBYTE,
      maxTitleBytes: 64 * 1024,
      maxToolTraceAggregateBytes: 8 * MEBIBYTE,
      maxToolTraceBytes: MEBIBYTE,
      maxToolTraces: 100_000,
      maxUrlBytes: 8 * 1024,
      maxUrls: 100_000,
    })
    expect(BACKUP_MAX_SERIALIZED_SIZE_LABEL).toBe('128 MiB')
  })

  it('accepts every resource at its exact supported maximum', () => {
    const usage = {
      ...createEmptyBackupResourceUsage(),
      analyticsViews: BACKUP_RESOURCE_LIMITS.maxAnalyticsViews,
      attachmentAggregateBytes:
        BACKUP_RESOURCE_LIMITS.maxAttachmentAggregateBytes,
      attachmentBytes: BACKUP_RESOURCE_LIMITS.maxAttachmentBytes,
      attachments: BACKUP_RESOURCE_LIMITS.maxAttachments,
      attachmentsPerMessage: BACKUP_RESOURCE_LIMITS.maxAttachmentsPerMessage,
      categories: BACKUP_RESOURCE_LIMITS.maxCategories,
      chartDataPoints: BACKUP_RESOURCE_LIMITS.maxChartDataPoints,
      chartDataPointsPerChart:
        BACKUP_RESOURCE_LIMITS.maxChartDataPointsPerChart,
      collections: BACKUP_RESOURCE_LIMITS.maxCollections,
      conversations: BACKUP_RESOURCE_LIMITS.maxConversations,
      groups: BACKUP_RESOURCE_LIMITS.maxGroups,
      keywordBytes: BACKUP_RESOURCE_LIMITS.maxKeywordBytes,
      keywordsPerEntity: BACKUP_RESOURCE_LIMITS.maxKeywordsPerEntity,
      memberships: BACKUP_RESOURCE_LIMITS.maxMemberships,
      messageContentBytes: BACKUP_RESOURCE_LIMITS.maxMessageContentBytes,
      messages: BACKUP_RESOURCE_LIMITS.maxMessages,
      messagesPerConversation:
        BACKUP_RESOURCE_LIMITS.maxMessagesPerConversation,
      nameBytes: BACKUP_RESOURCE_LIMITS.maxNameBytes,
      notesBytes: BACKUP_RESOURCE_LIMITS.maxNotesBytes,
      serializedBytes: BACKUP_RESOURCE_LIMITS.maxSerializedBytes,
      titleBytes: BACKUP_RESOURCE_LIMITS.maxTitleBytes,
      toolTraceAggregateBytes:
        BACKUP_RESOURCE_LIMITS.maxToolTraceAggregateBytes,
      toolTraceBytes: BACKUP_RESOURCE_LIMITS.maxToolTraceBytes,
      toolTraces: BACKUP_RESOURCE_LIMITS.maxToolTraces,
      urlBytes: BACKUP_RESOURCE_LIMITS.maxUrlBytes,
      urls: BACKUP_RESOURCE_LIMITS.maxUrls,
    }

    expect(validateBackupResourceUsage(usage)).toEqual({ success: true })
  })

  it('classifies the serialized-byte boundary separately from format errors', () => {
    expect(
      validateBackupSerializedBytes(
        BACKUP_RESOURCE_LIMITS.maxSerializedBytes + 1,
      ),
    ).toEqual({
      error: {
        code: 'BACKUP_FILE_TOO_LARGE',
        diagnostic: {
          actual: BACKUP_RESOURCE_LIMITS.maxSerializedBytes + 1,
          limit: BACKUP_RESOURCE_LIMITS.maxSerializedBytes,
          resource: 'serializedBytes',
        },
      },
      success: false,
    })
  })

  it('classifies every top-level count violation', () => {
    for (const [resource, limitKey] of topLevelLimitCases) {
      const limit = BACKUP_RESOURCE_LIMITS[limitKey]
      expect(
        validateBackupResourceUsage({
          ...createEmptyBackupResourceUsage(),
          [resource]: limit + 1,
        }),
      ).toEqual({
        error: {
          code: 'BACKUP_RESOURCE_LIMIT_EXCEEDED',
          diagnostic: {
            actual: limit + 1,
            limit,
            resource,
          },
        },
        success: false,
      })
    }
  })

  it('classifies every nested count and payload violation', () => {
    for (const [resource, limitKey] of nestedLimitCases) {
      const limit = BACKUP_RESOURCE_LIMITS[limitKey]
      expect(
        validateBackupResourceUsage({
          ...createEmptyBackupResourceUsage(),
          [resource]: limit + 1,
        }),
      ).toEqual({
        error: {
          code: 'BACKUP_NESTED_PAYLOAD_TOO_LARGE',
          diagnostic: {
            actual: limit + 1,
            limit,
            resource,
          },
        },
        success: false,
      })
    }
  })

  it('returns the first violation in deterministic policy order', () => {
    expect(
      validateBackupResourceUsage({
        ...createEmptyBackupResourceUsage(),
        urls: BACKUP_RESOURCE_LIMITS.maxUrls + 1,
        attachmentAggregateBytes:
          BACKUP_RESOURCE_LIMITS.maxAttachmentAggregateBytes + 1,
      }),
    ).toEqual({
      error: {
        code: 'BACKUP_RESOURCE_LIMIT_EXCEEDED',
        diagnostic: {
          actual: BACKUP_RESOURCE_LIMITS.maxUrls + 1,
          limit: BACKUP_RESOURCE_LIMITS.maxUrls,
          resource: 'urls',
        },
      },
      success: false,
    })
  })

  it('rejects invalid metrics without including user content in diagnostics', () => {
    const result = validateBackupResourceUsage({
      ...createEmptyBackupResourceUsage(),
      toolTraceBytes: Number.NaN,
    })

    expect(result).toEqual({
      error: {
        code: 'INVALID_BACKUP',
        diagnostic: {
          limit: BACKUP_RESOURCE_LIMITS.maxToolTraceBytes,
          resource: 'toolTraceBytes',
        },
      },
      success: false,
    })
    expect(JSON.stringify(result)).not.toContain('private user content')
  })

  it('throws a typed error for callers that require fail-fast preflight', () => {
    expect(() =>
      assertBackupSerializedBytes(
        BACKUP_RESOURCE_LIMITS.maxSerializedBytes + 1,
      ),
    ).toThrow(BackupResourceLimitError)

    let caughtError: unknown
    try {
      assertBackupSerializedBytes(BACKUP_RESOURCE_LIMITS.maxSerializedBytes + 1)
    } catch (error) {
      caughtError = error
    }
    expect(caughtError).toMatchObject({
      code: 'BACKUP_FILE_TOO_LARGE',
      diagnostic: { resource: 'serializedBytes' },
    })
  })

  it('bounds recovery retention by count, duration, and aggregate bytes', () => {
    expect(BACKUP_RECOVERY_RETENTION_POLICY).toEqual({
      maxAgeDays: 7,
      maxAggregateBytes: 2 * BACKUP_RESOURCE_LIMITS.maxSerializedBytes,
      maxSnapshots: 2,
    })
  })
})
