import { describe, expect, it, vi } from 'vitest'

import { LEGACY_BACKUP_ADVISORY } from '@/features/options/lib/import-export/compatibility/legacyBackupPolicy'
import { BACKUP_RESOURCE_LIMITS } from '@/lib/persistence/backupResourcePolicy'
import type { UserSettings } from '@/types/storage'

import { BackupMapper } from './BackupMapper'
import type { BackupV2Inspection } from './BackupV2Inspector'
import {
  BackupV2ImportError,
  createImportBackupV2UseCase,
} from './ImportBackupV2UseCase'
import type {
  ImportBackupV2UseCaseDeps,
  OverwriteRecoveryCapability,
} from './ImportBackupV2UseCase'

type PersistenceLogicalSnapshot = Parameters<
  typeof BackupMapper.toBackupData
>[0]

const SECRET_VALUES = [
  'https://secret.example.test/private',
  'private title',
  'private membership note',
  'private system prompt',
] as const

const createUserSettings = (): UserSettings => ({
  activeAiSystemPromptId: 'prompt-secret',
  aiSystemPrompts: [
    {
      createdAt: 1,
      id: 'prompt-secret',
      name: 'Private prompt',
      template: SECRET_VALUES[3],
      updatedAt: 1,
    },
  ],
  clickBehavior: 'saveCurrentTab',
  confirmDeleteAll: true,
  confirmDeleteEach: false,
  enableCategories: true,
  excludePatterns: ['*.internal.example', '*.private.example'],
  excludePinnedTabs: false,
  openAllInNewWindow: false,
  openUrlInBackground: true,
  removeTabAfterExternalDrop: false,
  removeTabAfterOpen: false,
  showSavedTime: true,
})

const createSnapshot = (revision = 12): PersistenceLogicalSnapshot => ({
  analyticsViews: [
    {
      id: 'analytics-b',
      updatedAt: 2,
      value: { title: 'secondary' },
    },
    {
      id: 'analytics-a',
      updatedAt: 1,
      value: { title: 'primary' },
    },
  ],
  conversations: [
    {
      id: 'conversation-b',
      updatedAt: 2,
      value: { title: 'secondary conversation' },
    },
    {
      id: 'conversation-a',
      updatedAt: 1,
      value: { title: SECRET_VALUES[1] },
    },
  ],
  messages: [
    {
      conversationId: 'conversation-b',
      createdAt: 2,
      id: 'message-b',
      value: { content: 'secondary message' },
    },
    {
      conversationId: 'conversation-a',
      createdAt: 1,
      id: 'message-a',
      value: { content: 'private message' },
    },
  ],
  revision,
  savedTabs: {
    categories: [],
    collections: [
      {
        createdAt: 1,
        definition: {
          domain: 'secret.example.test',
          type: 'domain',
        },
        id: 'collection-secret',
        name: 'Private collection',
        sortOrder: 1024,
        updatedAt: 1,
      },
    ],
    groups: [],
    memberships: [
      {
        addedAt: 1,
        collectionId: 'collection-secret',
        notes: SECRET_VALUES[2],
        sortOrder: 1024,
        updatedAt: 1,
        urlId: 'url-secret',
      },
    ],
    urls: [
      {
        firstSavedAt: 1,
        id: 'url-secret',
        lastSavedAt: 1,
        normalizedUrl: SECRET_VALUES[0],
        title: SECRET_VALUES[1],
        updatedAt: 1,
        url: SECRET_VALUES[0],
      },
    ],
  },
})

const countSnapshotEntities = (snapshot: PersistenceLogicalSnapshot) => ({
  analyticsViews: snapshot.analyticsViews.length,
  categories: snapshot.savedTabs.categories.length,
  collections: snapshot.savedTabs.collections.length,
  conversations: snapshot.conversations.length,
  groups: snapshot.savedTabs.groups.length,
  memberships: snapshot.savedTabs.memberships.length,
  messages: snapshot.messages.length,
  urls: snapshot.savedTabs.urls.length,
})

const createInspection = (
  formatKind: 'current-v2' | 'legacy' = 'current-v2',
): BackupV2Inspection => {
  const snapshot = createSnapshot()
  const data = BackupMapper.toBackupData(snapshot, createUserSettings())
  const previewBase = {
    appVersion: '2.0.0',
    entityCounts: countSnapshotEntities(snapshot),
    exportedAt: '2026-07-28T00:00:00.000Z',
    warnings: [],
  }

  return {
    data,
    preview:
      formatKind === 'current-v2'
        ? {
            ...previewBase,
            formatKind,
            schemaVersion: 2,
          }
        : {
            ...previewBase,
            advisory: LEGACY_BACKUP_ADVISORY,
            formatKind,
            schemaVersion: null,
          },
  }
}

type DepsOverrides = Partial<ImportBackupV2UseCaseDeps> & {
  readonly readbackSnapshot?: PersistenceLogicalSnapshot
  readonly readbackSettings?: UserSettings
}

const createDeps = (
  events: string[],
  overrides: DepsOverrides = {},
): ImportBackupV2UseCaseDeps => {
  const inspection = createInspection()
  const canonicalSnapshot = BackupMapper.toLogicalSnapshot(inspection.data, 77)
  const recovery: OverwriteRecoveryCapability = {
    captureBeforeOverwrite: vi.fn(async () => {
      events.push('capture')
      return 'recovery-opaque-id'
    }),
    restore: vi.fn(async (recoveryId) => {
      events.push(`restore:${String(recoveryId)}`)
    }),
  }

  return {
    readUserSettings: vi.fn(async () => {
      events.push('read-settings')
      return structuredClone(
        overrides.readbackSettings ?? inspection.data.userSettings,
      )
    }),
    recovery,
    replacement: {
      replaceAll: vi.fn(async () => {
        events.push('replace')
        return { revision: 77 }
      }),
    },
    snapshotReader: {
      readConsistentSnapshot: vi.fn(async () => {
        events.push('read-snapshot')
        return structuredClone(overrides.readbackSnapshot ?? canonicalSnapshot)
      }),
    },
    writeUserSettings: vi.fn(async () => {
      events.push('write-settings')
    }),
    ...overrides,
  }
}

const captureImportError = async (
  action: () => Promise<unknown>,
): Promise<BackupV2ImportError> => {
  try {
    await action()
  } catch (error) {
    if (error instanceof BackupV2ImportError) {
      return error
    }
  }
  throw new Error('Expected BackupV2ImportError')
}

describe('createImportBackupV2UseCase', () => {
  it.each(['current-v2', 'legacy'] as const)(
    'imports a normalized %s inspection and verifies readback',
    async (formatKind) => {
      const events: string[] = []
      const deps = createDeps(events)
      const inspection = createInspection(formatKind)

      const result = await createImportBackupV2UseCase(deps)(inspection)

      expect(result).toEqual({
        entityCounts: inspection.preview.entityCounts,
        revision: 77,
      })
      expect(events).toEqual([
        'capture',
        'replace',
        'write-settings',
        'read-snapshot',
        'read-settings',
      ])
      expect(deps.replacement.replaceAll).toHaveBeenCalledOnce()
      expect(deps.replacement.replaceAll).toHaveBeenCalledWith(
        expect.not.objectContaining({ revision: expect.anything() }),
      )
      expect(deps.recovery?.restore).not.toHaveBeenCalled()
    },
  )

  it('accepts readback whose unordered records use a different order', async () => {
    const events: string[] = []
    const inspection = createInspection()
    const readback = BackupMapper.toLogicalSnapshot(inspection.data, 77)
    const reversedReadback: PersistenceLogicalSnapshot = {
      analyticsViews: readback.analyticsViews.toReversed(),
      conversations: readback.conversations.toReversed(),
      messages: readback.messages.toReversed(),
      revision: readback.revision,
      savedTabs: {
        categories: readback.savedTabs.categories.toReversed(),
        collections: readback.savedTabs.collections.toReversed(),
        groups: readback.savedTabs.groups.toReversed(),
        memberships: readback.savedTabs.memberships.toReversed(),
        urls: readback.savedTabs.urls.toReversed(),
      },
    }
    const deps = createDeps(events, {
      readbackSettings: {
        ...inspection.data.userSettings,
        excludePatterns:
          inspection.data.userSettings.excludePatterns.toReversed(),
      },
      readbackSnapshot: reversedReadback,
    })

    await expect(
      createImportBackupV2UseCase(deps)(inspection),
    ).resolves.toMatchObject({ revision: 77 })
  })

  it('fails closed before mutation when recovery is unavailable', async () => {
    const events: string[] = []
    const deps = createDeps(events, { recovery: undefined })

    const error = await captureImportError(async () =>
      createImportBackupV2UseCase(deps)(createInspection()),
    )

    expect(error.code).toBe('OVERWRITE_RECOVERY_UNAVAILABLE')
    expect(events).toEqual([])
    expect(deps.replacement.replaceAll).not.toHaveBeenCalled()
    expect(deps.writeUserSettings).not.toHaveBeenCalled()
  })

  it('does not mutate or restore when recovery capture fails', async () => {
    const events: string[] = []
    const deps = createDeps(events, {
      recovery: {
        captureBeforeOverwrite: vi.fn(async () => {
          events.push('capture')
          throw new Error(SECRET_VALUES[0])
        }),
        restore: vi.fn(async () => {
          events.push('restore')
        }),
      },
    })

    const error = await captureImportError(async () =>
      createImportBackupV2UseCase(deps)(createInspection()),
    )

    expect(error.code).toBe('RECOVERY_CAPTURE_FAILED')
    expect(events).toEqual(['capture'])
    expect(deps.replacement.replaceAll).not.toHaveBeenCalled()
    expect(deps.recovery?.restore).not.toHaveBeenCalled()
  })

  it('restores once when atomic replacement fails', async () => {
    const events: string[] = []
    const deps = createDeps(events, {
      replacement: {
        replaceAll: vi.fn(async () => {
          events.push('replace')
          throw new Error(SECRET_VALUES[1])
        }),
      },
    })

    const error = await captureImportError(async () =>
      createImportBackupV2UseCase(deps)(createInspection()),
    )

    expect(error.code).toBe('PERSISTENCE_REPLACEMENT_FAILED')
    expect(events).toEqual(['capture', 'replace', 'restore:recovery-opaque-id'])
    expect(deps.recovery?.restore).toHaveBeenCalledOnce()
  })

  it('restores once when the separate settings write fails', async () => {
    const events: string[] = []
    const deps = createDeps(events, {
      writeUserSettings: vi.fn(async () => {
        events.push('write-settings')
        throw new Error(SECRET_VALUES[3])
      }),
    })

    const error = await captureImportError(async () =>
      createImportBackupV2UseCase(deps)(createInspection()),
    )

    expect(error.code).toBe('SETTINGS_WRITE_FAILED')
    expect(events).toEqual([
      'capture',
      'replace',
      'write-settings',
      'restore:recovery-opaque-id',
    ])
    expect(deps.recovery?.restore).toHaveBeenCalledOnce()
  })

  it('restores once when the consistent snapshot readback fails', async () => {
    const events: string[] = []
    const deps = createDeps(events, {
      snapshotReader: {
        readConsistentSnapshot: vi.fn(async () => {
          events.push('read-snapshot')
          throw new Error(SECRET_VALUES[2])
        }),
      },
    })

    const error = await captureImportError(async () =>
      createImportBackupV2UseCase(deps)(createInspection()),
    )

    expect(error.code).toBe('READBACK_FAILED')
    expect(events).toEqual([
      'capture',
      'replace',
      'write-settings',
      'read-snapshot',
      'restore:recovery-opaque-id',
    ])
    expect(deps.readUserSettings).not.toHaveBeenCalled()
  })

  it('restores once when canonical readback does not match', async () => {
    const events: string[] = []
    const unchangedSnapshot = createSnapshot(77)
    const firstUrl = unchangedSnapshot.savedTabs.urls[0]
    if (firstUrl === undefined) {
      throw new Error('Missing test URL')
    }
    const changedSnapshot: PersistenceLogicalSnapshot = {
      ...unchangedSnapshot,
      savedTabs: {
        ...unchangedSnapshot.savedTabs,
        urls: [{ ...firstUrl, title: 'different title' }],
      },
    }
    const deps = createDeps(events, { readbackSnapshot: changedSnapshot })

    const error = await captureImportError(async () =>
      createImportBackupV2UseCase(deps)(createInspection()),
    )

    expect(error.code).toBe('READBACK_MISMATCH')
    expect(events).toEqual([
      'capture',
      'replace',
      'write-settings',
      'read-snapshot',
      'read-settings',
      'restore:recovery-opaque-id',
    ])
  })

  it('surfaces a fixed restore failure code without the prior failure', async () => {
    const events: string[] = []
    const deps = createDeps(events, {
      recovery: {
        captureBeforeOverwrite: vi.fn(async () => {
          events.push('capture')
          return 'recovery-opaque-id'
        }),
        restore: vi.fn(async () => {
          events.push('restore')
          throw new Error(`${SECRET_VALUES[0]} ${SECRET_VALUES[3]}`)
        }),
      },
      replacement: {
        replaceAll: vi.fn(async () => {
          events.push('replace')
          throw new Error(SECRET_VALUES[1])
        }),
      },
    })

    const error = await captureImportError(async () =>
      createImportBackupV2UseCase(deps)(createInspection()),
    )

    expect(error.code).toBe('RECOVERY_RESTORE_FAILED')
    expect(events).toEqual(['capture', 'replace', 'restore'])
  })

  it('rejects logical resource excess before recovery capture', async () => {
    const events: string[] = []
    const inspection = createInspection()
    const collection = inspection.data.savedTabs.collections[0]
    if (collection === undefined) {
      throw new Error('Missing test collection')
    }
    const oversizedInspection: BackupV2Inspection = {
      ...inspection,
      data: {
        ...inspection.data,
        savedTabs: {
          ...inspection.data.savedTabs,
          collections: [
            {
              ...collection,
              name: 'x'.repeat(BACKUP_RESOURCE_LIMITS.maxNameBytes + 1),
            },
          ],
        },
      },
    }
    const deps = createDeps(events)

    const error = await captureImportError(async () =>
      createImportBackupV2UseCase(deps)(oversizedInspection),
    )

    expect(error.code).toBe('BACKUP_RESOURCE_REJECTED')
    expect(events).toEqual([])
  })

  it('rejects unhealthy saved-tab relations before recovery capture', async () => {
    const events: string[] = []
    const inspection = createInspection()
    const membership = inspection.data.savedTabs.memberships[0]
    if (membership === undefined) {
      throw new Error('Missing test membership')
    }
    const unhealthyInspection: BackupV2Inspection = {
      ...inspection,
      data: {
        ...inspection.data,
        savedTabs: {
          ...inspection.data.savedTabs,
          memberships: [{ ...membership, urlId: 'missing-url-id' }],
        },
      },
    }
    const deps = createDeps(events)

    const error = await captureImportError(async () =>
      createImportBackupV2UseCase(deps)(unhealthyInspection),
    )

    expect(error.code).toBe('BACKUP_INTEGRITY_FAILED')
    expect(events).toEqual([])
  })

  it('strictly rejects internal envelope data before recovery capture', async () => {
    const events: string[] = []
    const inspection = createInspection()
    Object.assign(inspection.data, { internalRevision: 999 })
    const deps = createDeps(events)

    const error = await captureImportError(async () =>
      createImportBackupV2UseCase(deps)(inspection),
    )

    expect(error.code).toBe('INVALID_BACKUP')
    expect(events).toEqual([])
  })

  it('never exposes imported content through typed errors', async () => {
    const events: string[] = []
    const deps = createDeps(events, {
      replacement: {
        replaceAll: vi.fn(async () => {
          throw new Error(SECRET_VALUES.join(' '))
        }),
      },
    })

    const error = await captureImportError(async () =>
      createImportBackupV2UseCase(deps)(createInspection()),
    )
    const serializedError = JSON.stringify(error)

    for (const secret of SECRET_VALUES) {
      expect(error.message).not.toContain(secret)
      expect(serializedError).not.toContain(secret)
    }
  })

  it('treats a mismatched committed revision as a readback mismatch', async () => {
    const events: string[] = []
    const deps = createDeps(events, {
      readbackSnapshot: createSnapshot(76),
    })

    const error = await captureImportError(async () =>
      createImportBackupV2UseCase(deps)(createInspection()),
    )

    expect(error.code).toBe('READBACK_MISMATCH')
    expect(deps.recovery?.restore).toHaveBeenCalledOnce()
  })
})
