/* eslint-disable no-restricted-imports -- browser regression exercises production Backup V2 and native persistence */

import { checkPersistenceIntegrity } from '@/contexts/saved-tabs/domain/services/PersistenceIntegrityChecker'
import { IndexedDbConnectionManager } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbConnectionManager'
import { IndexedDbPersistenceRecoverySnapshotRepository } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceRecoverySnapshotRepository'
import { IndexedDbPersistenceReplacementAdapter } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceReplacementAdapter'
import { IndexedDbPersistenceSnapshotReader } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceSnapshotReader'
import type {
  PersistenceLogicalSnapshot,
  PersistenceV2ReplacementTarget,
} from '@/contexts/saved-tabs/public-api'
import { assertProductionImportAllowed } from '@/features/options/lib/import-export/productionImportGate'
import { collectBackupV2ResourceUsage } from '@/features/options/lib/import-export/v2/BackupV2ResourceUsage'
import type { BackupEnvelopeV2 } from '@/features/options/lib/import-export/v2/BackupV2Schema'
import { createImportBackupV2UseCase } from '@/features/options/lib/import-export/v2/ImportBackupV2UseCase'
import { createPreImportRecoverySnapshotService } from '@/features/options/lib/import-export/v2/PreImportRecoverySnapshotService'
import {
  BACKUP_RESOURCE_LIMITS,
  assertBackupSerializedBytes,
} from '@/lib/persistence/backupResourcePolicy'
import { defaultSettings } from '@/lib/storage/settings'
import {
  createDomainCollectionFixture,
  createMembershipFixture,
  createUrlFixture,
} from '@/test/fixtures/persistenceBrowserFixtures'

export type LargeBackupScenario =
  | 'near-byte-limit'
  | 'url-limit'
  | 'too-many-urls'
  | 'truncated'
  | 'invalid-structure'

const PRIVATE_MARKER = 'private-backup-marker'
const COLLECTION_ID = 'large-backup-collection'
const ABORT_AFTER_URLS = 5_000

const createBackup = (count: number) =>
  ({
    appVersion: 'large-backup-regression',
    data: {
      analyticsViews: [],
      conversations: [],
      messages: [],
      savedTabs: {
        categories: [],
        collections: [
          {
            ...createDomainCollectionFixture(
              COLLECTION_ID,
              'backup.example.test',
              1,
            ),
            definition: {
              domain: 'backup.example.test',
              type: 'domain' as const,
            },
          },
        ],
        groups: [],
        memberships: Array.from({ length: count }, (_, index) => ({
          ...createMembershipFixture(COLLECTION_ID, `url-${index}`, 1, index),
          addedAtProvenance: 'exact' as const,
          notes: `${PRIVATE_MARKER} 日本語`,
        })),
        urls: Array.from({ length: count }, (_, index) => ({
          ...createUrlFixture(
            `url-${index}`,
            `https://backup.example.test/${index}`,
            `${PRIVATE_MARKER} title ${index}`,
            1,
          ),
          firstSavedAtProvenance: 'exact' as const,
          lastSavedAtProvenance: 'exact' as const,
        })),
      },
      userSettings: { ...defaultSettings, showSavedTime: false },
    },
    exportedAt: '2026-01-01T00:00:00.000Z',
    schemaVersion: 2,
  }) satisfies BackupEnvelopeV2

const createFile = (scenario: LargeBackupScenario): File => {
  const count =
    scenario === 'near-byte-limit'
      ? 128
      : BACKUP_RESOURCE_LIMITS.maxUrls + (scenario === 'too-many-urls' ? 1 : 0)
  const backup = createBackup(count)
  if (scenario === 'near-byte-limit') {
    // Fill real, individually legal notes. Do not use whitespace padding or
    // mock File.size: the entire payload must pass schema/resource validation.
    const baseBytes = new Blob([JSON.stringify(backup)]).size
    const padding = BACKUP_RESOURCE_LIMITS.maxSerializedBytes - 1 - baseBytes
    const perNote = Math.floor(padding / count)
    for (const [
      index,
      membership,
    ] of backup.data.savedTabs.memberships.entries()) {
      membership.notes += 'x'.repeat(
        perNote + (index === 0 ? padding % count : 0),
      )
    }
  }
  let serialized = JSON.stringify(backup)
  if (scenario === 'truncated') {
    serialized = serialized.slice(0, -1)
  }
  if (scenario === 'invalid-structure') {
    // Put the invalid record last, after parsing/validating the large prefix.
    serialized = serialized.replace(
      `"title":"${PRIVATE_MARKER} title ${count - 1}"`,
      '"title":42',
    )
  }
  return new File([serialized], 'synthetic-backup.json', {
    type: 'application/json',
  })
}

const readFile = async (file: File): Promise<string> => {
  assertBackupSerializedBytes(file.size)
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
      } else {
        reject(new Error('The synthetic file was not read as text.'))
      }
    })
    reader.addEventListener('error', () => {
      reject(reader.error ?? new Error('Synthetic file reading failed.'))
    })
    reader.readAsText(file) // eslint-disable-line unicorn/prefer-blob-reading-methods -- exercise the production UI's native reader
  })
}

export const createLargeBackupHarness = (databaseName: string) => {
  let settings = { ...defaultSettings }
  const manager = new IndexedDbConnectionManager({ databaseName })
  const gate = {
    runIndexedDbRead: async <T>(operation: () => Promise<T>) => operation(),
    runIndexedDbWrite: async <T>(operation: () => Promise<T>) => operation(),
  }
  const reader = new IndexedDbPersistenceSnapshotReader(manager, gate)
  const replacement = new IndexedDbPersistenceReplacementAdapter(manager, gate)
  const notifications: unknown[] = []
  const deps = {
    changePort: {
      publish: async (event: unknown) => {
        notifications.push(event)
        await Promise.resolve()
      },
      subscribe: () => () => {},
    },
    clock: { now: () => 1 },
    estimateStorage: async () => {
      await Promise.resolve()
      return { quota: 1024 ** 3, usage: 0 }
    },
    idGenerator: { generate: () => crypto.randomUUID() },
    normalizeUserSettings: (value: typeof settings) => value,
    readUserSettings: async () => {
      await Promise.resolve()
      return settings
    },
    replacement,
    repository: new IndexedDbPersistenceRecoverySnapshotRepository(
      manager,
      gate,
    ),
    snapshotReader: reader,
    writeUserSettings: async (value: typeof settings) => {
      settings = value
      await Promise.resolve()
    },
  }
  let failedReplacementSnapshot: PersistenceLogicalSnapshot | undefined
  const recovery = createPreImportRecoverySnapshotService(deps)
  const importBackup = createImportBackupV2UseCase({
    ...deps,
    replacement: {
      replaceAll: async (target: PersistenceV2ReplacementTarget) => {
        try {
          return await replacement.replaceAll(target)
        } catch (error) {
          // Observe native rollback BEFORE recovery can conceal a partial write.
          manager.close()
          failedReplacementSnapshot = await reader.readConsistentSnapshot()
          throw error
        }
      },
    },
    recovery: {
      captureBeforeOverwrite: recovery.captureBeforeOverwrite,
      restore: async (value) => {
        if (
          typeof value !== 'object' ||
          value === null ||
          !('id' in value) ||
          typeof value.id !== 'string'
        ) {
          throw new Error('Missing recovery identifier.')
        }
        await recovery.restore(value.id)
      },
    },
  })

  return {
    limits: BACKUP_RESOURCE_LIMITS,
    seed: async () => {
      const { data } = createBackup(2)
      await replacement.replaceAll({
        ...data,
        analyticsViews: [
          { id: 'seed-view', updatedAt: 1, value: { label: PRIVATE_MARKER } },
        ],
        conversations: [
          {
            id: 'seed-conversation',
            updatedAt: 1,
            value: { title: PRIVATE_MARKER },
          },
        ],
        messages: [
          {
            id: 'seed-message',
            conversationId: 'seed-conversation',
            createdAt: 1,
            value: { content: PRIVATE_MARKER },
          },
        ],
        savedTabs: {
          ...data.savedTabs,
          categories: [
            {
              id: 'seed-category',
              collectionId: COLLECTION_ID,
              name: PRIVATE_MARKER,
              keywords: [],
              sortOrder: 0,
              createdAt: 1,
              updatedAt: 1,
            },
          ],
          groups: [
            {
              id: 'seed-group',
              name: PRIVATE_MARKER,
              sortOrder: 0,
              createdAt: 1,
              updatedAt: 1,
            },
          ],
          collections: data.savedTabs.collections.map((collection) => ({
            ...collection,
            groupId: 'seed-group',
          })),
          memberships: data.savedTabs.memberships.map((membership) => ({
            ...membership,
            categoryId: 'seed-category',
          })),
        },
      })
      notifications.length = 0
    },
    snapshot: async () => {
      manager.close()
      const snapshot = await reader.readConsistentSnapshot()
      return {
        ...snapshot,
        settings,
        integrity: checkPersistenceIntegrity(snapshot.savedTabs),
      }
    },
    notifications: () => notifications,
    failedReplacementSnapshot: () => failedReplacementSnapshot,
    run: async (
      scenario: LargeBackupScenario,
      overwrite = false,
      abort = false,
    ) => {
      const file = createFile(scenario)
      const timings: Record<string, number> = {}
      let phase = 'read'
      let started = performance.now()
      let completedUrlWrites = 0
      let aborted = false
      // eslint-disable-next-line typescript/unbound-method -- Reflect.apply preserves the native object store receiver
      const nativePut = IDBObjectStore.prototype.put
      if (abort) {
        IDBObjectStore.prototype.put = function put(...args) {
          const request = Reflect.apply(nativePut, this, args)
          if (this.name === 'urls') {
            const transaction = this.transaction
            request.addEventListener('success', () => {
              completedUrlWrites += 1
              if (!aborted && completedUrlWrites === ABORT_AFTER_URLS) {
                aborted = true
                transaction.abort()
              }
            })
          }
          return request
        }
      }
      try {
        const text = await readFile(file)
        timings.readMs = performance.now() - started
        phase = 'parse-schema'
        started = performance.now()
        const { inspection } = assertProductionImportAllowed(text)
        timings.parseSchemaMs = performance.now() - started
        phase = 'resource'
        started = performance.now()
        collectBackupV2ResourceUsage(inspection.data, file.size)
        timings.resourceMs = performance.now() - started
        if (overwrite) {
          phase = 'overwrite'
          started = performance.now()
          await importBackup(inspection)
          timings.overwriteMs = performance.now() - started
        }
        return {
          bytes: file.size,
          counts: inspection.preview.entityCounts,
          status: 'fulfilled',
          timings,
        }
      } catch (error) {
        timings.failedPhaseMs = performance.now() - started
        return {
          aborted,
          bytes: file.size,
          code:
            error instanceof Error && 'code' in error ? error.code : 'UNKNOWN',
          completedUrlWrites,
          phase,
          status: 'rejected',
          timings,
        }
      } finally {
        IDBObjectStore.prototype.put = nativePut
      }
    },
  }
}

declare global {
  // eslint-disable-next-line typescript/consistent-type-definitions -- ambient Window extension requires interface merging
  interface Window {
    __largeBackup: ReturnType<typeof createLargeBackupHarness>
    __initializeLargeBackup: (databaseName: string) => void
  }
}

Object.assign(globalThis, {
  __initializeLargeBackup: (databaseName: string) => {
    window.__largeBackup = createLargeBackupHarness(databaseName)
  },
})
