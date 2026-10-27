import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createReadyPersistenceOperationGateStub } from '@/contexts/saved-tabs/application/testing/PersistenceOperationGateStub'
import { createHealthyPersistenceV2Snapshot } from '@/contexts/saved-tabs/domain/testing/persistenceV2IntegrityFixtures'
import { createChromeSavedSearchesAdapter } from '@/contexts/saved-tabs/infrastructure/browser/ChromeSavedSearchesAdapter'
import { IndexedDbConnectionManager } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbConnectionManager'
import { IndexedDbPersistenceRecoverySnapshotRepository } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceRecoverySnapshotRepository'
import { IndexedDbPersistenceReplacementAdapter } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceReplacementAdapter'
import { IndexedDbPersistenceSnapshotReader } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceSnapshotReader'
import type { PersistenceLogicalSnapshot } from '@/contexts/saved-tabs/public-api'
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
  replaceUserSettingsWhileLocked,
  saveUserSettings,
} from '@/lib/storage/settings'
import { withUserSettingsLock } from '@/lib/storage/userSettingsLock'
import { canonicalUserSettings } from '@/test/arbitraries/persistence/backupArbitrary'
import type { UserSettings } from '@/types/storage'

import {
  getOptionsBackupRecoveryRuntime,
  resetOptionsBackupRecoveryRuntimeForTesting,
} from './optionsBackupRecovery'

const createRuntime = (
  corruptImportedSettings = false,
  useRealLock = false,
) => {
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
  const writeUserSettings = vi.fn(replaceUserSettingsWhileLocked)
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
    runSettingsExclusive: useRealLock
      ? withUserSettingsLock
      : async (operation) => operation(),
    writeUserSettings,
  })
  const reopen = async () => {
    manager.close()
    return snapshotReader.readConsistentSnapshot()
  }
  return {
    reopen,
    replacement,
    repository,
    runtime,
    seedRawSettings: (value: unknown) => {
      storedSettings = structuredClone(value)
    },
    readRawSettings: () => structuredClone(storedSettings),
    snapshotReader,
    writeUserSettings,
  }
}

const createInspection = async (
  settings: UserSettings,
  snapshot: PersistenceLogicalSnapshot = {
    analyticsViews: [],
    conversations: [],
    messages: [],
    revision: 0,
    savedTabs: createHealthyPersistenceV2Snapshot(),
  },
) => {
  const envelope = await createExportBackupV2UseCase({
    getAppVersion: () => '2026.10.8',
    now: () => new Date('2026-10-08T00:00:00.000Z'),
    readUserSettings: async () => settings,
    snapshotReader: {
      readConsistentSnapshot: async () => snapshot,
    },
  })()
  return inspectBackupV2(JSON.stringify(envelope))
}

const createSelectionSnapshot = (label: string): PersistenceLogicalSnapshot => {
  const savedTabs = createHealthyPersistenceV2Snapshot()
  return {
    analyticsViews: [
      { id: `view-${label}`, updatedAt: 1, value: { title: label } },
    ],
    conversations: [
      { id: `conversation-${label}`, updatedAt: 1, value: { title: label } },
    ],
    messages: [
      {
        conversationId: `conversation-${label}`,
        createdAt: 1,
        id: `message-${label}`,
        value: { content: label },
      },
    ],
    revision: 0,
    savedTabs: {
      ...savedTabs,
      urls: savedTabs.urls.map((url) => ({ ...url, title: label })),
    },
  }
}

const withConcurrentSavedTab = (
  snapshot: PersistenceLogicalSnapshot,
): PersistenceLogicalSnapshot => {
  const {
    urls: [url],
    memberships: [membership],
  } = createHealthyPersistenceV2Snapshot()
  return {
    ...snapshot,
    savedTabs: {
      ...snapshot.savedTabs,
      urls: [
        ...snapshot.savedTabs.urls,
        {
          ...url,
          id: 'url-concurrent',
          normalizedUrl: 'https://alpha.test/concurrent',
          title: 'Concurrent saved tab',
          url: 'https://alpha.test/concurrent',
        },
      ],
      memberships: [
        ...snapshot.savedTabs.memberships,
        { ...membership, sortOrder: 3072, urlId: 'url-concurrent' },
      ],
    },
  }
}

const createSettingsForScenario = (scenario: string): UserSettings => {
  if (scenario === 'optional defaults') {
    return { ...canonicalUserSettings, language: 'ja' }
  }
  if (scenario === 'relative saved time') {
    return {
      ...defaultSettings,
      language: 'ja',
      showRelativeSavedTime: true,
      showSavedTime: false,
    }
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

  it('refuses import before overwriting malformed saved searches', async () => {
    const { runtime, seedRawSettings, readRawSettings } = createRuntime()
    const inspection = await createInspection(defaultSettings)
    const original = {
      ...defaultSettings,
      savedSearches: [{ id: 'damaged', name: 'Name', query: 42 }],
    }
    seedRawSettings(original)
    await expect(runtime.importBackupV2(inspection)).rejects.toBeInstanceOf(
      Error,
    )
    expect(readRawSettings()).toEqual(original)
    expect(await runtime.listRecoverySnapshots()).toHaveLength(0)
  })

  it('refuses recovery before overwriting malformed saved searches', async () => {
    const { runtime, seedRawSettings, readRawSettings } = createRuntime()
    await replaceUserSettingsWhileLocked(defaultSettings)
    await runtime.importBackupV2(await createInspection(defaultSettings))
    const [snapshot] = await runtime.listRecoverySnapshots()
    expect(snapshot).toBeDefined()
    const original = { ...defaultSettings, savedSearches: 'invalid' }
    seedRawSettings(original)
    await expect(
      runtime.restoreRecoverySnapshot(snapshot?.id ?? ''),
    ).rejects.toBeInstanceOf(Error)
    expect(readRawSettings()).toEqual(original)
  })

  it('does not overwrite a saved search created after the import preview', async () => {
    const { runtime } = createRuntime(false, true)
    await replaceUserSettingsWhileLocked(defaultSettings)
    const current = await runtime.readImportCurrent()
    const inspection = await createInspection({
      ...defaultSettings,
      language: 'ja',
    })
    const searches = createChromeSavedSearchesAdapter({
      createId: () => 'new-search',
    })
    let save!: Promise<unknown>
    let importing!: Promise<unknown>
    await withUserSettingsLock(async () => {
      save = searches.save('New', 'query')
      importing = runtime.importBackupV2(inspection, {
        current,
        selection: {
          userSettings: true,
          savedTabs: false,
          aiChat: false,
          analyticsViews: false,
        },
      })
      // Attach rejection handlers before releasing the lock.
      void importing.catch(() => {})
    })
    await expect(save).resolves.toEqual([
      { id: 'new-search', name: 'New', query: 'query' },
    ])
    await expect(importing).rejects.toMatchObject({
      code: 'IMPORT_PREVIEW_STALE',
    })
    expect(await searches.list()).toEqual([
      { id: 'new-search', name: 'New', query: 'query' },
    ])
  })

  it.each(['savedTabs', 'userSettings', 'aiChat', 'analyticsViews'] as const)(
    'imports only selected %s and preserves the other sections after reopening',
    async (selectedSection) => {
      const { reopen, replacement, runtime, writeUserSettings } =
        createRuntime()
      await replaceUserSettingsWhileLocked({
        ...defaultSettings,
        language: 'en',
        savedSearches: [{ id: 'current', name: 'Current', query: 'one' }],
      })
      await replacement.replaceAll(createSelectionSnapshot('current'))
      const current = await runtime.readImportCurrent()
      const inspection = await createInspection(
        {
          ...defaultSettings,
          language: 'ja',
          savedSearches: [{ id: 'incoming', name: 'Incoming', query: 'two' }],
        },
        createSelectionSnapshot('incoming'),
      )
      const selection = {
        aiChat: selectedSection === 'aiChat',
        analyticsViews: selectedSection === 'analyticsViews',
        savedTabs: selectedSection === 'savedTabs',
        userSettings: selectedSection === 'userSettings',
      }
      const expectedData = {
        analyticsViews: selection.analyticsViews
          ? inspection.data.analyticsViews
          : current.data.analyticsViews,
        conversations: selection.aiChat
          ? inspection.data.conversations
          : current.data.conversations,
        messages: selection.aiChat
          ? inspection.data.messages
          : current.data.messages,
        savedTabs: selection.savedTabs
          ? inspection.data.savedTabs
          : current.data.savedTabs,
        userSettings: selection.userSettings
          ? normalizeUserSettingsForStorage(inspection.data.userSettings)
          : current.data.userSettings,
      }

      await expect(
        runtime.importBackupV2(inspection, { current, selection }),
      ).resolves.toMatchObject({ revision: current.revision + 2 })
      const reopened = await reopen()
      expect(
        BackupMapper.toBackupData(
          reopened,
          await readUserSettingsWithoutRepair(),
        ),
      ).toStrictEqual(
        BackupMapper.toBackupData(
          BackupMapper.toLogicalSnapshot(
            { ...expectedData, userSettings: current.data.userSettings },
            reopened.revision,
          ),
          expectedData.userSettings,
        ),
      )
      expect(writeUserSettings).toHaveBeenCalledTimes(
        selection.userSettings ? 1 : 0,
      )
      expect(await runtime.listRecoverySnapshots()).toHaveLength(1)
    },
  )

  it.each(['revision', 'settings'] as const)(
    'rejects a preview after %s changes without capturing recovery or overwriting data',
    async (changedSection) => {
      const { reopen, replacement, runtime, writeUserSettings } =
        createRuntime()
      await saveUserSettings(defaultSettings)
      await replacement.replaceAll(createSelectionSnapshot('current'))
      const current = await runtime.readImportCurrent()
      const inspection = await createInspection(
        { ...defaultSettings, language: 'ja' },
        createSelectionSnapshot('incoming'),
      )
      if (changedSection === 'revision') {
        await replacement.replaceAll(createSelectionSnapshot('concurrent'))
      } else {
        await saveUserSettings({ ...defaultSettings, confirmDeleteAll: true })
      }
      const concurrent = await runtime.readImportCurrent()

      await expect(
        runtime.importBackupV2(inspection, {
          current,
          selection: {
            aiChat: true,
            analyticsViews: true,
            savedTabs: true,
            userSettings: true,
          },
        }),
      ).rejects.toMatchObject({ code: 'IMPORT_PREVIEW_STALE' })

      expect((await reopen()).revision).toBe(concurrent.revision)
      expect(await runtime.readImportCurrent()).toStrictEqual(concurrent)
      expect(await runtime.listRecoverySnapshots()).toEqual([])
      expect(writeUserSettings).not.toHaveBeenCalled()
    },
  )

  it('keeps a concurrent change after recovery capture when replacement CAS fails', async () => {
    const { reopen, replacement, repository, runtime, writeUserSettings } =
      createRuntime()
    await saveUserSettings(defaultSettings)
    await replacement.replaceAll(createSelectionSnapshot('current'))
    const current = await runtime.readImportCurrent()
    const inspection = await createInspection(
      { ...defaultSettings, language: 'ja' },
      createSelectionSnapshot('incoming'),
    )
    const saveRecovery = repository.saveWithRetention.bind(repository)
    const concurrent = createSelectionSnapshot('concurrent')
    vi.spyOn(repository, 'saveWithRetention').mockImplementationOnce(
      async (...args) => {
        const saved = await saveRecovery(...args)
        await replacement.replaceAll(concurrent, {
          expectedRevision: saved.revision,
        })
        return saved
      },
    )

    await expect(
      runtime.importBackupV2(inspection, {
        current,
        selection: {
          aiChat: true,
          analyticsViews: true,
          savedTabs: true,
          userSettings: true,
        },
      }),
    ).rejects.toMatchObject({ code: 'IMPORT_PREVIEW_STALE' })

    const expectedConcurrent = BackupMapper.toLogicalSnapshot(
      BackupMapper.toBackupData(concurrent, current.data.userSettings),
      current.revision + 2,
    )
    expect(await reopen()).toStrictEqual(expectedConcurrent)
    expect((await runtime.readImportCurrent()).data.userSettings).toStrictEqual(
      current.data.userSettings,
    )
    expect(writeUserSettings).not.toHaveBeenCalled()
    expect(await runtime.listRecoverySnapshots()).toHaveLength(1)
  })

  it.each([
    'success',
    'replacement failure',
    'readback failure',
    'recovery readback failure',
  ] as const)(
    'preserves unselected settings changed during replacement on %s',
    async (outcome) => {
      const {
        reopen,
        replacement,
        runtime,
        snapshotReader,
        writeUserSettings,
      } = createRuntime()
      await saveUserSettings(defaultSettings)
      await replacement.replaceAll(createSelectionSnapshot('current'))
      const current = await runtime.readImportCurrent()
      const inspection = await createInspection(
        { ...defaultSettings, language: 'ja' },
        createSelectionSnapshot('incoming'),
      )
      const concurrentSettings = normalizeUserSettingsForStorage({
        ...defaultSettings,
        confirmDeleteAll: !defaultSettings.confirmDeleteAll,
      })
      const replace = replacement.replaceAll.bind(replacement)
      const readSnapshot =
        snapshotReader.readConsistentSnapshot.bind(snapshotReader)
      let failReadback = false
      let replacementCalls = 0
      vi.spyOn(replacement, 'replaceAll').mockImplementation(
        async (...args) => {
          replacementCalls += 1
          if (replacementCalls === 1 && outcome === 'replacement failure') {
            await saveUserSettings(concurrentSettings)
            throw new Error('Simulated atomic replacement failure')
          }
          const result = await replace(...args)
          if (replacementCalls === 1) {
            await saveUserSettings(concurrentSettings)
            failReadback =
              outcome === 'readback failure' ||
              outcome === 'recovery readback failure'
          } else if (
            replacementCalls === 2 &&
            outcome === 'recovery readback failure'
          ) {
            failReadback = true
          }
          return result
        },
      )
      vi.spyOn(snapshotReader, 'readConsistentSnapshot').mockImplementation(
        async () => {
          if (failReadback) {
            failReadback = false
            throw new Error('Simulated readback failure')
          }
          return readSnapshot()
        },
      )

      const importing = runtime.importBackupV2(inspection, {
        current,
        selection: {
          aiChat: false,
          analyticsViews: false,
          savedTabs: true,
          userSettings: false,
        },
      })
      const result = await importing.then(
        (value) => ({ value }),
        (error: unknown) => ({ error }),
      )
      const expectedErrors = {
        'replacement failure': 'PERSISTENCE_REPLACEMENT_FAILED',
        'readback failure': 'READBACK_FAILED',
        'recovery readback failure': 'RECOVERY_RESTORE_FAILED',
      }
      expect(result).toMatchObject(
        outcome === 'success'
          ? { value: { revision: current.revision + 2 } }
          : { error: { code: expectedErrors[outcome] } },
      )

      const reopened = await reopen()
      expect(
        BackupMapper.toBackupData(reopened, concurrentSettings).savedTabs,
      ).toStrictEqual(
        outcome === 'success' || outcome === 'recovery readback failure'
          ? inspection.data.savedTabs
          : current.data.savedTabs,
      )
      expect(await readUserSettingsWithoutRepair()).toStrictEqual(
        concurrentSettings,
      )
      expect(writeUserSettings).not.toHaveBeenCalled()
      expect(await runtime.listRecoverySnapshots()).toHaveLength(1)
    },
  )

  it('keeps a saved tab added after a settings-only import commits and reports the concurrent change', async () => {
    const { reopen, replacement, runtime, writeUserSettings } = createRuntime()
    await saveUserSettings(defaultSettings)
    await replacement.replaceAll(createSelectionSnapshot('current'))
    const current = await runtime.readImportCurrent()
    const inspection = await createInspection(
      { ...defaultSettings, language: 'ja' },
      createSelectionSnapshot('incoming'),
    )
    const concurrent = withConcurrentSavedTab(
      BackupMapper.toLogicalSnapshot(current.data, current.revision),
    )
    writeUserSettings.mockImplementationOnce(async (settings) => {
      await saveUserSettings(settings)
      await replacement.replaceAll(concurrent)
    })

    await expect(
      runtime.importBackupV2(inspection, {
        current,
        selection: {
          aiChat: false,
          analyticsViews: false,
          savedTabs: false,
          userSettings: true,
        },
      }),
    ).resolves.toMatchObject({ concurrentChange: true })

    const reopened = await reopen()
    expect(
      BackupMapper.toBackupData(reopened, defaultSettings).savedTabs,
    ).toStrictEqual(
      BackupMapper.toBackupData(concurrent, defaultSettings).savedTabs,
    )
    expect((await readUserSettingsWithoutRepair()).language).toBe('ja')
    expect(writeUserSettings).toHaveBeenCalledTimes(1)
  })

  it('does not roll back a concurrent saved tab when selected settings fail to write', async () => {
    const { reopen, replacement, runtime, writeUserSettings } = createRuntime()
    await saveUserSettings(defaultSettings)
    await replacement.replaceAll(createSelectionSnapshot('current'))
    const current = await runtime.readImportCurrent()
    const inspection = await createInspection(
      { ...defaultSettings, language: 'ja' },
      createSelectionSnapshot('incoming'),
    )
    const concurrent = withConcurrentSavedTab(
      BackupMapper.toLogicalSnapshot(current.data, current.revision),
    )
    writeUserSettings.mockImplementationOnce(async () => {
      await replacement.replaceAll(concurrent)
      throw new Error('Simulated settings write failure after concurrent save')
    })

    await expect(
      runtime.importBackupV2(inspection, {
        current,
        selection: {
          aiChat: false,
          analyticsViews: false,
          savedTabs: false,
          userSettings: true,
        },
      }),
    ).rejects.toMatchObject({ code: 'RECOVERY_RESTORE_FAILED' })

    const reopened = await reopen()
    expect(
      BackupMapper.toBackupData(reopened, defaultSettings).savedTabs,
    ).toStrictEqual(
      BackupMapper.toBackupData(concurrent, defaultSettings).savedTabs,
    )
    expect((await readUserSettingsWithoutRepair()).language).toBe(
      defaultSettings.language,
    )
    expect(writeUserSettings).toHaveBeenCalledTimes(1)
  })

  it('rejects a selected-settings mismatch after a concurrent save without overwriting the saved tab', async () => {
    const { reopen, replacement, runtime, writeUserSettings } =
      createRuntime(true)
    await saveUserSettings(defaultSettings)
    await replacement.replaceAll(createSelectionSnapshot('current'))
    const current = await runtime.readImportCurrent()
    const inspection = await createInspection(
      { ...defaultSettings, language: 'ja' },
      createSelectionSnapshot('incoming'),
    )
    const concurrent = withConcurrentSavedTab(
      BackupMapper.toLogicalSnapshot(current.data, current.revision),
    )
    writeUserSettings.mockImplementationOnce(async (settings) => {
      await saveUserSettings(settings)
      await replacement.replaceAll(concurrent)
    })

    await expect(
      runtime.importBackupV2(inspection, {
        current,
        selection: {
          aiChat: false,
          analyticsViews: false,
          savedTabs: false,
          userSettings: true,
        },
      }),
    ).rejects.toMatchObject({ code: 'RECOVERY_RESTORE_FAILED' })

    const reopened = await reopen()
    expect(
      BackupMapper.toBackupData(reopened, defaultSettings).savedTabs,
    ).toStrictEqual(
      BackupMapper.toBackupData(concurrent, defaultSettings).savedTabs,
    )
    expect(writeUserSettings).toHaveBeenCalledTimes(1)
  })

  it.each([
    {
      scenario: 'optional defaults',
      extraPatterns: ['a.example', 'z.example'],
    },
    { scenario: 'relative saved time', extraPatterns: [] },
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
        showRelativeSavedTime: scenario === 'relative saved time',
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
