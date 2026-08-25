import { readFileSync } from 'node:fs'

import { describe, expect, it, vi } from 'vitest'

import type { PersistenceLogicalSnapshot } from '@/contexts/saved-tabs/public-api'
import { checkPersistenceIntegrity } from '@/contexts/saved-tabs/public-api'
import { inspectBackupV2 } from '@/features/options/lib/import-export/v2/BackupV2Inspector'
import type { BackupPreviewEntityCounts } from '@/features/options/lib/import-export/v2/BackupV2Inspector'
import {
  BACKUP_RESOURCE_LIMITS,
  BackupResourceLimitError,
} from '@/lib/persistence/backupResourcePolicy'
import { defaultSettings } from '@/lib/storage/settings'

import { createImportLegacyBackupMergeUseCase } from './ImportLegacyBackupMergeUseCase'
import type {
  ImportLegacyBackupMergeDeps,
  LegacyBackupMergeInput,
} from './ImportLegacyBackupMergeUseCase'

const legacyFixture = readFileSync(
  new URL('../v2/fixtures/legacy-tab-group-nested-urls.json', import.meta.url),
  'utf8',
)

const createInput = (
  serializedBytes = new TextEncoder().encode(legacyFixture).byteLength,
): LegacyBackupMergeInput => {
  const inspection = inspectBackupV2(legacyFixture, {
    importDate: '2026-09-30',
  })
  if (inspection.preview.formatKind !== 'legacy') {
    throw new TypeError('Expected a legacy backup fixture')
  }
  return {
    inspection: {
      ...inspection,
      preview: inspection.preview,
    },
    serializedBytes,
    userSettingsPatch: {},
  } as LegacyBackupMergeInput
}

const createSnapshot = (
  input: LegacyBackupMergeInput,
): PersistenceLogicalSnapshot => ({
  ...structuredClone(input.inspection.data),
  revision: 1,
})

const createDeps = (
  snapshot: PersistenceLogicalSnapshot,
  hasBlockingSavedTabsIssues: ImportLegacyBackupMergeDeps['hasBlockingSavedTabsIssues'] = vi.fn(
    () => false,
  ),
) => {
  const commit = vi.fn(async () => ({ revision: 2 }))
  const readSnapshot = vi.fn(async () => snapshot)
  const readUserSettings = vi.fn(async () => defaultSettings)
  const writeUserSettings = vi.fn(async () => undefined)

  return {
    commit,
    deps: {
      commit,
      hasBlockingSavedTabsIssues,
      readSnapshot,
      readUserSettings,
      writeUserSettings,
    },
    readSnapshot,
    readUserSettings,
    writeUserSettings,
  }
}

describe('createImportLegacyBackupMergeUseCase', () => {
  it('rejects the actual serialized legacy payload size before persistence', async () => {
    const input = createInput(BACKUP_RESOURCE_LIMITS.maxSerializedBytes + 1)
    const context = createDeps(createSnapshot(input))

    const error = await createImportLegacyBackupMergeUseCase(context.deps)(
      input,
    ).catch((error: unknown) => error)

    expect(error).toBeInstanceOf(BackupResourceLimitError)
    expect(error).toMatchObject({ code: 'BACKUP_FILE_TOO_LARGE' })
    expect(context.readSnapshot).not.toHaveBeenCalled()
    expect(context.readUserSettings).not.toHaveBeenCalled()
    expect(context.commit).not.toHaveBeenCalled()
    expect(context.writeUserSettings).not.toHaveBeenCalled()
  })

  it('reports only groups and collections that are new to the snapshot', async () => {
    const input = createInput()
    const context = createDeps(createSnapshot(input))

    const result = await createImportLegacyBackupMergeUseCase(context.deps)(
      input,
    )

    expect(result.addedEntityCounts).toEqual({
      collections: 0,
      groups: 0,
    })
  })

  it('uses logical data rather than preview counts to decide whether to commit', async () => {
    const input = createInput()
    const emptyEntityCounts: BackupPreviewEntityCounts = {
      analyticsViews: 0,
      categories: 0,
      collections: 0,
      conversations: 0,
      groups: 0,
      memberships: 0,
      messages: 0,
      urls: 0,
    }
    const inputWithStalePreview = {
      ...input,
      inspection: {
        ...input.inspection,
        preview: {
          ...input.inspection.preview,
          entityCounts: emptyEntityCounts,
        },
      },
    }
    const context = createDeps(createSnapshot(input))

    await createImportLegacyBackupMergeUseCase(context.deps)(
      inputWithStalePreview,
    )

    expect(context.commit).toHaveBeenCalledOnce()
    expect(context.commit).toHaveBeenCalledWith(expect.anything(), {
      durability: 'strict',
      expectedRevision: 1,
    })
  })

  it('blocks a merge when two individually valid snapshots conflict after put semantics', async () => {
    const input = createInput()
    const currentSavedTabs = structuredClone(input.inspection.data.savedTabs)
    const currentSnapshot: PersistenceLogicalSnapshot = {
      analyticsViews: [],
      conversations: [],
      messages: [],
      revision: 1,
      savedTabs: {
        ...currentSavedTabs,
        memberships: currentSavedTabs.memberships.map((membership) => ({
          ...membership,
          urlId: `existing:${membership.urlId}`,
        })),
        urls: currentSavedTabs.urls.map((currentUrl) => ({
          ...currentUrl,
          id: `existing:${currentUrl.id}`,
        })),
      },
    }
    const hasBlockingSavedTabsIssues = vi.fn(
      (savedTabs: LegacyBackupMergeInput['inspection']['data']['savedTabs']) =>
        checkPersistenceIntegrity(savedTabs).issues.some(
          ({ severity }) => severity === 'error',
        ),
    )
    const context = createDeps(currentSnapshot, hasBlockingSavedTabsIssues)

    await expect(
      createImportLegacyBackupMergeUseCase(context.deps)(input),
    ).rejects.toMatchObject({ code: 'BACKUP_INTEGRITY_FAILED' })

    expect(hasBlockingSavedTabsIssues).toHaveBeenCalledTimes(2)
    expect(context.commit).not.toHaveBeenCalled()
    expect(context.writeUserSettings).not.toHaveBeenCalled()
  })
})
