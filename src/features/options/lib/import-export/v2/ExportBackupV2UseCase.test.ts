import { describe, expect, it, vi } from 'vitest'
import { ZodError } from 'zod'

import {
  BACKUP_RESOURCE_LIMITS,
  BackupResourceLimitError,
} from '@/lib/persistence/backupResourcePolicy'
import type { UserSettings } from '@/types/storage'

import type { BackupMapper } from './BackupMapper'
import { createExportBackupV2UseCase } from './ExportBackupV2UseCase'
import type { ExportBackupV2UseCaseDeps } from './ExportBackupV2UseCase'

type PersistenceLogicalSnapshot = Parameters<
  typeof BackupMapper.toBackupData
>[0]

const userSettings = {
  clickBehavior: 'saveCurrentTab',
  confirmDeleteAll: true,
  confirmDeleteEach: true,
  enableCategories: true,
  excludePatterns: ['z.example', 'a.example'],
  excludePinnedTabs: false,
  openAllInNewWindow: false,
  openUrlInBackground: false,
  removeTabAfterExternalDrop: false,
  removeTabAfterOpen: false,
  showSavedTime: true,
} satisfies UserSettings

const createLogicalSnapshot = (
  reverse = false,
  attachmentCount = 0,
): PersistenceLogicalSnapshot => {
  const urls = [
    {
      firstSavedAt: 1,
      id: 'url-z',
      lastSavedAt: 2,
      normalizedUrl: 'https://z.example/',
      title: 'Z',
      updatedAt: 2,
      url: 'https://z.example/',
    },
    {
      firstSavedAt: 1,
      id: 'url-a',
      lastSavedAt: 2,
      normalizedUrl: 'https://a.example/',
      title: 'A',
      updatedAt: 2,
      url: 'https://a.example/',
    },
  ]
  const messages = [
    {
      conversationId: 'conversation-1',
      createdAt: 1,
      id: 'message-1',
      value: {
        attachments: Array.from({ length: attachmentCount }, (_, index) => ({
          content: `attachment-${index}`,
          filename: `${index}.txt`,
          kind: 'text',
          mediaType: 'text/plain',
        })),
        content: 'message',
        role: 'user',
      },
    },
  ] as const

  return {
    analyticsViews: [{ id: 'view-1', updatedAt: 2, value: { kind: 'weekly' } }],
    conversations: [
      {
        id: 'conversation-1',
        updatedAt: 2,
        value: { title: 'Conversation' },
      },
    ],
    messages: reverse ? messages.toReversed() : messages,
    revision: 91,
    savedTabs: {
      categories: [],
      collections: [
        {
          createdAt: 1,
          definition: { domain: 'example.test', type: 'domain' },
          id: 'collection-1',
          name: 'Collection',
          sortOrder: 1024,
          updatedAt: 2,
        },
      ],
      groups: [],
      memberships: urls.map(({ id }, index) => ({
        addedAt: 1,
        collectionId: 'collection-1',
        sortOrder: (index + 1) * 1024,
        updatedAt: 2,
        urlId: id,
      })),
      urls: reverse ? urls.toReversed() : urls,
    },
  }
}

const createDeps = (
  snapshot: PersistenceLogicalSnapshot = createLogicalSnapshot(),
): {
  deps: ExportBackupV2UseCaseDeps
  getAppVersion: ReturnType<typeof vi.fn>
  now: ReturnType<typeof vi.fn>
  readConsistentSnapshot: ReturnType<typeof vi.fn>
  readUserSettings: ReturnType<typeof vi.fn>
} => {
  const readConsistentSnapshot = vi.fn().mockResolvedValue(snapshot)
  const readUserSettings = vi.fn().mockResolvedValue(userSettings)
  const getAppVersion = vi.fn().mockReturnValue('2026.7.28')
  const now = vi.fn().mockReturnValue(new Date('2026-07-28T03:04:05.000Z'))
  const snapshotReader = {
    readConsistentSnapshot,
  } satisfies ExportBackupV2UseCaseDeps['snapshotReader']

  return {
    deps: {
      getAppVersion,
      now,
      readUserSettings,
      snapshotReader,
    },
    getAppVersion,
    now,
    readConsistentSnapshot,
    readUserSettings,
  }
}

describe('createExportBackupV2UseCase', () => {
  it('reads every dependency once and returns a strict V2 envelope without internals', async () => {
    const context = createDeps()

    const envelope = await createExportBackupV2UseCase(context.deps)()

    expect(context.readConsistentSnapshot).toHaveBeenCalledTimes(1)
    expect(context.readUserSettings).toHaveBeenCalledTimes(1)
    expect(context.getAppVersion).toHaveBeenCalledTimes(1)
    expect(context.now).toHaveBeenCalledTimes(1)
    expect(envelope).toMatchObject({
      appVersion: '2026.7.28',
      exportedAt: '2026-07-28T03:04:05.000Z',
      schemaVersion: 2,
    })
    expect(JSON.stringify(envelope)).not.toContain('revision')
    expect(JSON.stringify(envelope)).not.toContain('recoverySnapshots')
  })

  it('is deterministic for equivalent snapshots except for exportedAt', async () => {
    const first = createDeps(createLogicalSnapshot())
    const second = createDeps(createLogicalSnapshot(true))
    second.now.mockReturnValue(new Date('2026-07-28T03:04:06.000Z'))

    const firstEnvelope = await createExportBackupV2UseCase(first.deps)()
    const secondEnvelope = await createExportBackupV2UseCase(second.deps)()

    expect(firstEnvelope.data).toEqual(secondEnvelope.data)
    expect(firstEnvelope.appVersion).toBe(secondEnvelope.appVersion)
    expect(firstEnvelope.exportedAt).not.toBe(secondEnvelope.exportedAt)
  })

  it('validates logical resources before serializing the envelope', async () => {
    const context = createDeps(
      createLogicalSnapshot(
        false,
        BACKUP_RESOURCE_LIMITS.maxAttachmentsPerMessage + 1,
      ),
    )
    const originalEncode = TextEncoder.prototype.encode.bind(new TextEncoder())
    let envelopeEncodeCalls = 0
    const encodeSpy = vi
      .spyOn(TextEncoder.prototype, 'encode')
      .mockImplementation((value) => {
        if (value?.includes('"schemaVersion":2') === true) {
          envelopeEncodeCalls += 1
          return {
            byteLength: BACKUP_RESOURCE_LIMITS.maxSerializedBytes + 1,
          } as Uint8Array<ArrayBuffer>
        }
        return originalEncode(value)
      })

    let caught: unknown
    try {
      await createExportBackupV2UseCase(context.deps)()
    } catch (error) {
      caught = error
    } finally {
      encodeSpy.mockRestore()
    }

    expect(caught).toBeInstanceOf(BackupResourceLimitError)
    expect(caught).toMatchObject({
      code: 'BACKUP_NESTED_PAYLOAD_TOO_LARGE',
      diagnostic: { resource: 'attachmentsPerMessage' },
    })
    expect(envelopeEncodeCalls).toBe(0)
    expect(JSON.stringify(caught)).not.toContain('attachment-')
  })

  it.each([
    {
      errorType: ZodError,
      label: 'empty app version',
      override: (deps: ExportBackupV2UseCaseDeps) => ({
        ...deps,
        getAppVersion: () => '',
      }),
    },
    {
      errorType: RangeError,
      label: 'invalid clock',
      override: (deps: ExportBackupV2UseCaseDeps) => ({
        ...deps,
        now: () => new Date(Number.NaN),
      }),
    },
  ])(
    'rejects $label instead of repairing the envelope',
    async ({ errorType, override }) => {
      const context = createDeps()

      await expect(
        createExportBackupV2UseCase(override(context.deps))(),
      ).rejects.toBeInstanceOf(errorType)
    },
  )

  it('propagates snapshot failures unchanged and does not continue', async () => {
    const context = createDeps()
    const failure = new Error('snapshot failed')
    context.readConsistentSnapshot.mockRejectedValue(failure)

    await expect(createExportBackupV2UseCase(context.deps)()).rejects.toBe(
      failure,
    )
    expect(context.readConsistentSnapshot).toHaveBeenCalledTimes(1)
    expect(context.readUserSettings).not.toHaveBeenCalled()
    expect(context.getAppVersion).not.toHaveBeenCalled()
    expect(context.now).not.toHaveBeenCalled()
  })
})
