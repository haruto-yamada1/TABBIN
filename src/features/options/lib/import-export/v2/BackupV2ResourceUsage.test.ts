import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  BACKUP_RESOURCE_LIMITS,
  BackupResourceLimitError,
} from '@/lib/persistence/backupResourcePolicy'
import type { JsonValue } from '@/lib/persistence/jsonValue'
import type { UserSettings } from '@/types/storage'

import { BackupMapper } from './BackupMapper'
import { collectBackupV2ResourceUsage } from './BackupV2ResourceUsage'

type PersistenceLogicalSnapshot = Parameters<
  typeof BackupMapper.toBackupData
>[0]

const utf8Bytes = (value: string): number =>
  new TextEncoder().encode(value).byteLength

const userSettings = {
  clickBehavior: 'saveCurrentTab',
  confirmDeleteAll: true,
  confirmDeleteEach: true,
  enableCategories: true,
  excludePatterns: [],
  excludePinnedTabs: false,
  openAllInNewWindow: false,
  openUrlInBackground: false,
  removeTabAfterExternalDrop: false,
  removeTabAfterOpen: false,
  showSavedTime: true,
} satisfies UserSettings

const createLogicalSnapshot = (
  values: readonly JsonValue[],
): PersistenceLogicalSnapshot => ({
  analyticsViews: [
    { id: 'analytics-1', updatedAt: 1, value: { name: 'view' } },
  ],
  conversations: [
    {
      id: 'conversation-1',
      updatedAt: 1,
      value: { title: '会話タイトル' },
    },
  ],
  messages: values.map((value, index) => ({
    conversationId: 'conversation-1',
    createdAt: index + 1,
    id: `message-${index + 1}`,
    value,
  })),
  revision: 42,
  savedTabs: {
    categories: [
      {
        collectionId: 'collection-1',
        createdAt: 1,
        id: 'category-1',
        keywords: ['猫', 'category-keyword'],
        name: '分類名',
        sortOrder: 1024,
        updatedAt: 1,
      },
    ],
    collections: [
      {
        createdAt: 1,
        definition: {
          projectKeywords: {
            domainKeywords: ['領域'],
            titleKeywords: ['題'],
            urlKeywords: ['URL🌐'],
          },
          type: 'custom',
        },
        groupId: 'group-1',
        id: 'collection-1',
        name: '収集名',
        sortOrder: 1024,
        updatedAt: 1,
      },
    ],
    groups: [
      {
        createdAt: 1,
        id: 'group-1',
        name: 'グループ名',
        sortOrder: 1024,
        updatedAt: 1,
      },
    ],
    memberships: [
      {
        addedAt: 1,
        categoryId: 'category-1',
        collectionId: 'collection-1',
        notes: 'メモ📝',
        sortOrder: 1024,
        updatedAt: 1,
        urlId: 'url-1',
      },
    ],
    urls: [
      {
        firstSavedAt: 1,
        id: 'url-1',
        lastSavedAt: 1,
        normalizedUrl: 'https://xn--r8jz45g.test/%F0%9F%8C%90',
        title: '題名🌐',
        updatedAt: 1,
        url: 'https://例え.test/🌐',
      },
    ],
  },
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('collectBackupV2ResourceUsage', () => {
  it('collects every resource family with UTF-8 and nested AI payload semantics', () => {
    const toolTrace1 = {
      input: { query: '猫' },
      output: { count: 1 },
      state: 'output-available',
      title: '検索',
      toolCallId: 'tool-1',
      toolName: 'search',
      type: 'dynamic-tool',
    }
    const toolTrace2 = {
      input: { query: '犬' },
      state: 'input-available',
      title: '検索2',
      toolCallId: 'tool-2',
      toolName: 'search',
      type: 'dynamic-tool',
    }
    const toolTrace3 = {
      input: { period: 'week' },
      output: { points: [1, 2] },
      state: 'output-available',
      title: '分析',
      toolCallId: 'tool-3',
      toolName: 'analytics',
      type: 'dynamic-tool',
    }
    const attachmentContents = [
      '添付テキスト',
      'data:image/png;base64,aGVsbG8=',
      '短い',
    ]
    const values = [
      {
        attachments: [
          {
            content: attachmentContents[0],
            filename: '資料.txt',
            kind: 'text',
            mediaType: 'text/plain',
          },
          {
            content: attachmentContents[1],
            filename: '画像.png',
            kind: 'image',
            mediaType: 'image/png',
          },
        ],
        charts: [
          {
            data: [{ label: 'a' }, { label: 'b' }],
            series: [],
            title: '図',
            type: 'bar',
          },
          {
            data: [{ x: 1 }, { x: 2 }, { x: 3 }],
            series: [],
            title: '図2',
            type: 'line',
          },
        ],
        content: 'こんにちは🌐',
        role: 'assistant',
        toolTraces: [toolTrace1, toolTrace2],
      },
      {
        attachments: [
          {
            content: attachmentContents[2],
            filename: '短.txt',
            kind: 'text',
            mediaType: 'text/plain',
          },
        ],
        charts: [],
        content: '短文',
        role: 'user',
        toolTraces: [toolTrace3],
      },
    ] satisfies JsonValue[]
    const data = BackupMapper.toBackupData(
      createLogicalSnapshot(values),
      userSettings,
    )
    const toolTraceBytes = [toolTrace1, toolTrace2, toolTrace3].map(
      (trace) =>
        utf8Bytes(JSON.stringify(trace.input)) +
        ('output' in trace ? utf8Bytes(JSON.stringify(trace.output)) : 0),
    )

    expect(collectBackupV2ResourceUsage(data, 321)).toEqual({
      analyticsViews: 1,
      attachmentAggregateBytes:
        utf8Bytes(attachmentContents[0]) + 5 + utf8Bytes(attachmentContents[2]),
      attachmentBytes: Math.max(
        utf8Bytes(attachmentContents[0]),
        5,
        utf8Bytes(attachmentContents[2]),
      ),
      attachments: 3,
      attachmentsPerMessage: 2,
      categories: 1,
      chartDataPoints: 5,
      chartDataPointsPerChart: 3,
      collections: 1,
      conversations: 1,
      groups: 1,
      keywordBytes: Math.max(
        ...['猫', 'category-keyword', '領域', '題', 'URL🌐'].map(utf8Bytes),
      ),
      keywordsPerEntity: 3,
      memberships: 1,
      messageContentBytes: utf8Bytes('こんにちは🌐'),
      messages: 2,
      messagesPerConversation: 2,
      nameBytes: Math.max(...['分類名', '収集名', 'グループ名'].map(utf8Bytes)),
      notesBytes: utf8Bytes('メモ📝'),
      serializedBytes: 321,
      titleBytes: utf8Bytes('題名🌐'),
      toolTraceAggregateBytes: toolTraceBytes.reduce(
        (total, bytes) => total + bytes,
        0,
      ),
      toolTraceBytes: Math.max(...toolTraceBytes),
      toolTraces: 3,
      urlBytes: Math.max(
        ...[
          'https://例え.test/🌐',
          'https://xn--r8jz45g.test/%F0%9F%8C%90',
        ].map(utf8Bytes),
      ),
      urls: 1,
    })
  })

  it('counts only structurally recognizable nested AI values', () => {
    const data = BackupMapper.toBackupData(
      createLogicalSnapshot([
        {
          attachments: ['private attachment', { content: 123 }],
          charts: [{ data: 'private chart datum' }, null],
          content: 123,
          toolTraces: ['private tool trace', null],
        },
      ]),
      userSettings,
    )

    const usage = collectBackupV2ResourceUsage(data, 100)

    expect(usage).toMatchObject({
      attachmentAggregateBytes: 0,
      attachmentBytes: 0,
      attachments: 0,
      attachmentsPerMessage: 0,
      chartDataPoints: 0,
      chartDataPointsPerChart: 0,
      messageContentBytes: 0,
      toolTraceAggregateBytes: 0,
      toolTraceBytes: 0,
      toolTraces: 0,
    })
  })

  it('reports logical overflow before simultaneous serialized overflow', () => {
    const data = BackupMapper.toBackupData(
      createLogicalSnapshot([
        {
          attachments: Array.from(
            { length: BACKUP_RESOURCE_LIMITS.maxAttachmentsPerMessage + 1 },
            (_, index) => ({
              content: `private-${index}`,
              filename: `${index}.txt`,
              kind: 'text',
              mediaType: 'text/plain',
            }),
          ),
          content: 'private message content',
        },
      ]),
      userSettings,
    )

    let caught: unknown
    try {
      collectBackupV2ResourceUsage(
        data,
        BACKUP_RESOURCE_LIMITS.maxSerializedBytes + 1,
      )
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(BackupResourceLimitError)
    expect(caught).toMatchObject({
      code: 'BACKUP_NESTED_PAYLOAD_TOO_LARGE',
      diagnostic: {
        actual: BACKUP_RESOURCE_LIMITS.maxAttachmentsPerMessage + 1,
        limit: BACKUP_RESOURCE_LIMITS.maxAttachmentsPerMessage,
        resource: 'attachmentsPerMessage',
      },
    })
    expect(JSON.stringify(caught)).not.toContain('private')
  })

  it('rejects unsafe serialized metrics and arithmetic overflow', () => {
    const data = BackupMapper.toBackupData(
      createLogicalSnapshot([
        {
          attachments: [
            {
              content: 'first private attachment',
              kind: 'text',
            },
            {
              content: 'second private attachment',
              kind: 'text',
            },
          ],
        },
      ]),
      userSettings,
    )

    expect(() =>
      collectBackupV2ResourceUsage(data, Number.MAX_SAFE_INTEGER + 1),
    ).toThrow(BackupResourceLimitError)

    vi.spyOn(TextEncoder.prototype, 'encode').mockReturnValue({
      byteLength: Number.MAX_SAFE_INTEGER,
    } as Uint8Array<ArrayBuffer>)

    let caught: unknown
    try {
      collectBackupV2ResourceUsage(data, 1)
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(BackupResourceLimitError)
    expect(caught).toMatchObject({
      code: 'INVALID_BACKUP',
      diagnostic: { resource: 'attachmentAggregateBytes' },
    })
    expect(JSON.stringify(caught)).not.toContain('private')
  })
})
