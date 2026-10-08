import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createReadyPersistenceOperationGateStub } from '@/contexts/saved-tabs/application/testing/PersistenceOperationGateStub'
import { createHealthyPersistenceV2Snapshot } from '@/contexts/saved-tabs/domain/testing/persistenceV2IntegrityFixtures'
import { IndexedDbConnectionManager } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbConnectionManager'
import { IndexedDbPersistenceRecoverySnapshotRepository } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceRecoverySnapshotRepository'
import { IndexedDbPersistenceReplacementAdapter } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceReplacementAdapter'
import { IndexedDbPersistenceSnapshotReader } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceSnapshotReader'
import { normalizeAiSystemPromptSettings } from '@/features/ai-chat/lib/systemPromptPresets'
import { BackupMapper } from '@/features/options/lib/import-export/v2/BackupMapper'
import { inspectBackupV2 } from '@/features/options/lib/import-export/v2/BackupV2Inspector'
import { createExportBackupV2UseCase } from '@/features/options/lib/import-export/v2/ExportBackupV2UseCase'
import { createImportBackupV2UseCase } from '@/features/options/lib/import-export/v2/ImportBackupV2UseCase'
import { createPreImportRecoverySnapshotService } from '@/features/options/lib/import-export/v2/PreImportRecoverySnapshotService'
import { BACKUP_RECOVERY_RETENTION_POLICY } from '@/lib/persistence/backupResourcePolicy'
import { isJsonValue } from '@/lib/persistence/jsonValue'
import {
  defaultSettings,
  normalizeUserSettingsForStorage,
  readUserSettingsWithoutRepair,
  saveUserSettings,
} from '@/lib/storage/settings'
import { canonicalUserSettings } from '@/test/arbitraries/persistence/backupArbitrary'
import type { UserSettings } from '@/types/storage'

import {
  getOptionsBackupRecoveryRuntime,
  resetOptionsBackupRecoveryRuntimeForTesting,
} from './optionsBackupRecovery'

const createRuntime = (corruptImportedSettings = false) => {
  let storedSettings: unknown
  vi.stubGlobal('chrome', {
    i18n: { getUILanguage: () => 'en' },
    storage: {
      local: {
        get: async () => ({ userSettings: structuredClone(storedSettings) }),
        set: async ({ userSettings }: { userSettings: UserSettings }) => {
          storedSettings = structuredClone(
            corruptImportedSettings && userSettings.language === 'ja'
              ? {
                  ...userSettings,
                  confirmDeleteAll: !userSettings.confirmDeleteAll,
                }
              : userSettings,
          )
        },
      },
    },
  })
  const connectionOptions = { indexedDb: new IDBFactory() }
  const manager = new IndexedDbConnectionManager(connectionOptions)
  const gate = createReadyPersistenceOperationGateStub()
  const snapshotReader = new IndexedDbPersistenceSnapshotReader(manager, gate)
  const replacement = new IndexedDbPersistenceReplacementAdapter(manager, gate)
  const repository = new IndexedDbPersistenceRecoverySnapshotRepository(
    manager,
    gate,
  )
  let nextId = 0
  const runtime = getOptionsBackupRecoveryRuntime({
    changePort: { publish: async () => undefined, subscribe: () => () => {} },
    clock: { now: () => 1_000 },
    createConnectionManager: () => manager,
    createImportUseCase: createImportBackupV2UseCase,
    createRecoveryRepository: () => repository,
    createRecoveryService: createPreImportRecoverySnapshotService,
    createReplacement: () => replacement,
    createSnapshotReader: () => snapshotReader,
    estimateStorage: async () => ({ quota: 512 * 1024 * 1024, usage: 0 }),
    getBootstrap: () => ({ ready: async () => undefined }),
    getOperationGate: () => gate,
    idGenerator: { generate: () => `settings-recovery-${++nextId}` },
    normalizeUserSettings: normalizeUserSettingsForStorage,
    readUserSettings: readUserSettingsWithoutRepair,
    writeUserSettings: saveUserSettings,
  })
  const reopen = async () => {
    manager.close()
    return snapshotReader.readConsistentSnapshot()
  }
  return { reopen, replacement, repository, runtime, snapshotReader }
}

const createInspection = async (settings: UserSettings) => {
  const envelope = await createExportBackupV2UseCase({
    getAppVersion: () => '2026.10.8',
    now: () => new Date('2026-10-08T00:00:00.000Z'),
    readUserSettings: async () => settings,
    snapshotReader: {
      readConsistentSnapshot: async () => ({
        analyticsViews: [],
        conversations: [],
        messages: [],
        revision: 0,
        savedTabs: createHealthyPersistenceV2Snapshot(),
      }),
    },
  })()
  return inspectBackupV2(JSON.stringify(envelope))
}

const createSettingsForScenario = (scenario: string): UserSettings => {
  if (scenario === 'optional defaults') {
    return { ...canonicalUserSettings, language: 'ja' }
  }
  if (scenario === 'exclude patterns') {
    return {
      ...defaultSettings,
      excludePatterns: [' custom.example ', 'custom.example', ''],
      language: 'ja',
    }
  }
  if (scenario === 'localized prompt') {
    return {
      ...defaultSettings,
      aiSystemPrompts: normalizeAiSystemPromptSettings({
        ...defaultSettings,
        language: 'en',
      }).aiSystemPrompts,
      language: 'ja',
    }
  }
  return {
    ...defaultSettings,
    activeAiSystemPromptId: 'custom-prompt',
    aiSystemPrompts: [
      {
        createdAt: 1,
        id: 'custom-prompt',
        name: ' Custom prompt ',
        template: ' Custom instructions ',
        updatedAt: 1,
      },
    ],
    language: 'ja',
  }
}

describe('Backup V2 with production settings storage', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    resetOptionsBackupRecoveryRuntimeForTesting()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it.each([
    {
      scenario: 'optional defaults',
      extraPatterns: ['a.example', 'z.example'],
    },
    { scenario: 'exclude patterns', extraPatterns: ['custom.example'] },
    { scenario: 'localized prompt', extraPatterns: [] },
    { scenario: 'custom prompt whitespace', extraPatterns: [] },
  ])(
    'imports and reopens a valid backup requiring $scenario normalization',
    async ({ scenario, extraPatterns }) => {
      const { reopen, runtime } = createRuntime()
      await saveUserSettings(defaultSettings)
      const previousSettings = await readUserSettingsWithoutRepair()
      const inspection = await createInspection(
        createSettingsForScenario(scenario),
      )

      await expect(runtime.importBackupV2(inspection)).resolves.toMatchObject({
        entityCounts: inspection.preview.entityCounts,
      })
      const imported = await reopen()
      expect(imported.savedTabs).toStrictEqual(inspection.data.savedTabs)
      const readbackSettings = await readUserSettingsWithoutRepair()
      expect(readbackSettings).toMatchObject({
        autoDeletePeriod: 'never',
        colors: {},
        fontSizePercent: 100,
        language: 'ja',
      })
      expect(readbackSettings.excludePatterns).toEqual([
        'about:',
        'chrome-extension://',
        'chrome://',
        ...extraPatterns,
      ])
      expect(readbackSettings.aiSystemPrompts).toEqual(
        scenario === 'custom prompt whitespace'
          ? [
              {
                createdAt: 1,
                id: 'custom-prompt',
                name: 'Custom prompt',
                template: 'Custom instructions',
                updatedAt: 1,
              },
            ]
          : normalizeAiSystemPromptSettings({
              ...defaultSettings,
              language: 'ja',
            }).aiSystemPrompts,
      )

      const [recovery] = await runtime.listRecoverySnapshots()
      expect(recovery).toBeDefined()
      await runtime.restoreRecoverySnapshot(recovery?.id ?? '')
      expect((await reopen()).savedTabs.urls).toEqual([])
      expect(await readUserSettingsWithoutRepair()).toStrictEqual(
        previousSettings,
      )
    },
  )

  it('rejects a genuine settings mismatch and restores the previous tabs and settings', async () => {
    const { reopen, replacement, runtime } = createRuntime(true)
    await saveUserSettings(defaultSettings)
    const previousSettings = await readUserSettingsWithoutRepair()
    const inspection = await createInspection({
      ...canonicalUserSettings,
      language: 'ja',
    })
    const previous = BackupMapper.toLogicalSnapshot(inspection.data, 0)
    const previousSavedTabs = {
      ...previous.savedTabs,
      urls: previous.savedTabs.urls.map((url) => ({
        ...url,
        title: 'Previous saved title',
      })),
    }
    await replacement.replaceAll({ ...previous, savedTabs: previousSavedTabs })

    await expect(runtime.importBackupV2(inspection)).rejects.toMatchObject({
      code: 'READBACK_MISMATCH',
    })
    expect((await reopen()).savedTabs).toStrictEqual(previousSavedTabs)
    expect(await readUserSettingsWithoutRepair()).toStrictEqual(
      previousSettings,
    )
  })

  it('restores an existing recovery snapshot whose settings need current defaults', async () => {
    const { reopen, repository, runtime } = createRuntime()
    await saveUserSettings(defaultSettings)
    const inspection = await createInspection({
      ...canonicalUserSettings,
      language: 'ja',
    })
    if (!isJsonValue(inspection.data)) {
      throw new Error('Expected JSON-safe backup data')
    }
    await repository.saveWithRetention(
      {
        backupSchemaVersion: 2,
        createdAt: 1_000,
        data: inspection.data,
        expiresAt: 2_000,
        id: 'existing-recovery',
        serializedBytes: new TextEncoder().encode(
          JSON.stringify(inspection.data),
        ).byteLength,
        sourceRevision: 0,
      },
      { ...BACKUP_RECOVERY_RETENTION_POLICY, now: 1_000 },
    )

    await expect(
      runtime.restoreRecoverySnapshot('existing-recovery'),
    ).resolves.toMatchObject({
      notification: { kind: 'committed_and_published' },
    })
    const restored = await reopen()
    expect(restored.savedTabs).toStrictEqual(
      BackupMapper.toLogicalSnapshot(inspection.data, 0).savedTabs,
    )
    expect(await readUserSettingsWithoutRepair()).toMatchObject({
      fontSizePercent: 100,
      language: 'ja',
    })
  })
})
