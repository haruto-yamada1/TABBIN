/* eslint-disable no-restricted-imports -- native browser regression exercises production persistence and recovery UI */
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'

import { PersistenceRecoveryNotice } from '@/app/composition/PersistenceRecoveryNotice'
import { createIndexedDbSavedTabsUseCases } from '@/contexts/saved-tabs/infrastructure/composition/createIndexedDbSavedTabsUseCases'
import { createPersistenceBootstrapRuntime } from '@/contexts/saved-tabs/infrastructure/composition/persistenceBootstrapRuntime'
import { IndexedDbConnectionManager } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbConnectionManager'
import { IndexedDbPersistenceRecoverySnapshotRepository } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceRecoverySnapshotRepository'
import { IndexedDbPersistenceReplacementAdapter } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceReplacementAdapter'
import { IndexedDbPersistenceSnapshotReader } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceSnapshotReader'
import { I18nProvider } from '@/features/i18n/context/I18nProvider'
import { inspectBackupV2 } from '@/features/options/lib/import-export/v2/BackupV2Inspector'
import { createExportBackupV2UseCase } from '@/features/options/lib/import-export/v2/ExportBackupV2UseCase'
import { createImportBackupV2UseCase } from '@/features/options/lib/import-export/v2/ImportBackupV2UseCase'
import { createPreImportRecoverySnapshotService } from '@/features/options/lib/import-export/v2/PreImportRecoverySnapshotService'
import { defaultSettings } from '@/lib/storage/settings'

export type StorageFailureOperation =
  | 'save'
  | 'restore'
  | 'import'
  | 'import-replace'

const observe = async (operation: () => Promise<unknown>) => {
  try {
    await operation()
    return { status: 'fulfilled' } as const
  } catch (error) {
    return {
      code: error instanceof Error && 'code' in error ? error.code : undefined,
      message: error instanceof Error ? error.message : 'Unknown error',
      status: 'rejected',
    } as const
  }
}

export const initializeStorageFailureHarness = (databaseName: string) => {
  // Only settings/browser edges are substituted. All domain storage, transactions,
  // recovery capture, replacement and UI below are production implementations.
  let settings = { ...defaultSettings, language: 'en' as const }
  Object.assign(globalThis, {
    chrome: {
      i18n: { getUILanguage: () => 'en' },
      storage: {
        local: {
          get: async () => {
            await Promise.resolve()
            return { userSettings: settings }
          },
        },
        onChanged: { addListener: () => {}, removeListener: () => {} },
      },
    },
  })
  const manager = new IndexedDbConnectionManager({ databaseName })
  const runtime = createPersistenceBootstrapRuntime({
    connectionManager: manager,
  })
  const reader = new IndexedDbPersistenceSnapshotReader(
    manager,
    runtime.operationGate,
  )
  const replacement = new IndexedDbPersistenceReplacementAdapter(
    manager,
    runtime.operationGate,
  )
  const useCases = createIndexedDbSavedTabsUseCases({
    connectionManager: manager,
    operationGate: runtime.operationGate,
  })
  const notifications: unknown[] = []
  const deps = {
    changePort: {
      publish: async (event: unknown) => {
        notifications.push(event)
        await Promise.resolve()
      },
      subscribe: () => () => {},
    },
    clock: { now: () => Date.now() },
    estimateStorage: async () => {
      await Promise.resolve()
      return { quota: 512 * 1024 * 1024, usage: 0 }
    },
    idGenerator: { generate: () => crypto.randomUUID() },
    normalizeUserSettings: (value: typeof defaultSettings) => value,
    readUserSettings: async () => {
      await Promise.resolve()
      return settings
    },
    replacement,
    repository: new IndexedDbPersistenceRecoverySnapshotRepository(
      manager,
      runtime.operationGate,
    ),
    snapshotReader: reader,
    writeUserSettings: async (value: typeof defaultSettings) => {
      settings = { ...value, language: 'en' }
      await Promise.resolve()
    },
  }
  const recovery = createPreImportRecoverySnapshotService(deps)
  const importBackup = createImportBackupV2UseCase({
    ...deps,
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
  const exportBackup = createExportBackupV2UseCase({
    getAppVersion: () => 'storage-failure-regression',
    now: () => new Date(0),
    readUserSettings: deps.readUserSettings,
    snapshotReader: reader,
  })
  let projectId = ''
  let recoveryId = ''
  let inspection: ReturnType<typeof inspectBackupV2>
  let restorePut: (() => void) | undefined

  const container = document.createElement('main')
  document.body.append(container)
  const root = createRoot(container)
  root.render(
    createElement(
      I18nProvider,
      null,
      createElement(PersistenceRecoveryNotice, { recovery: runtime.recovery }),
    ),
  )

  return {
    close: () => {
      restorePut?.()
      root.unmount()
      manager.close()
    },
    initialize: async () =>
      observe(async () => reader.readConsistentSnapshot()),
    recoveryState: () => runtime.recovery.getSnapshot(),
    retry: async () => observe(runtime.recovery.retry),
    snapshot: async () => {
      manager.close()
      return reader.readConsistentSnapshot()
    },
    notifications: () => notifications,
    seed: async () => {
      const { project } = await useCases.createCustomProject({
        name: 'Private project title',
      })
      projectId = project.id
      await useCases.addUrlToCustomProject({
        projectId,
        url: 'https://private.example.test/sensitive',
        title: 'Private saved title',
        notes: 'Private saved note',
      })
      recoveryId = (await recovery.captureBeforeOverwrite()).id
      inspection = inspectBackupV2(JSON.stringify(await exportBackup()))
      await useCases.addUrlToCustomProject({
        projectId,
        url: 'https://private.example.test/later',
        title: 'Later saved title',
      })
      notifications.length = 0
    },
    injectQuota: (
      operation: StorageFailureOperation,
      timing: 'queue' | 'abort',
    ) => {
      // eslint-disable-next-line typescript/unbound-method -- invoked with the original object store receiver through Reflect.apply
      const nativePut = IDBObjectStore.prototype.put
      const storeName = operation === 'import' ? 'recoverySnapshots' : 'urls'
      IDBObjectStore.prototype.put = function put(...args) {
        const request = Reflect.apply(nativePut, this, args)
        if (this.name === storeName && this.transaction.mode === 'readwrite') {
          // Queue a real write first: the production abort must roll it back.
          const failure = new DOMException(
            'Private quota path /profile/private.example.test',
            'QuotaExceededError',
          )
          if (timing === 'queue') {
            throw failure
          }
          const transaction = this.transaction
          request.addEventListener(
            'success',
            () => {
              // Real browser transaction lifecycle with an injected quota cause;
              // filling the user's disk is neither deterministic nor appropriate.
              Object.defineProperty(transaction, 'error', { value: failure })
              transaction.abort()
            },
            { once: true },
          )
        }
        return request
      }
      restorePut = () => {
        IDBObjectStore.prototype.put = nativePut
      }
    },
    clearFault: () => {
      restorePut?.()
      restorePut = undefined
    },
    run: async (operation: StorageFailureOperation) =>
      observe(async () => {
        if (operation === 'save') {
          await useCases.addUrlToCustomProject({
            projectId,
            url: 'https://private.example.test/new',
            title: 'New saved title',
          })
        } else if (operation === 'restore') {
          await recovery.restore(recoveryId)
        } else {
          await importBackup(inspection)
        }
      }),
  }
}

declare global {
  // eslint-disable-next-line typescript/consistent-type-definitions -- ambient Window requires interface merging
  interface Window {
    __storageFailure: ReturnType<typeof initializeStorageFailureHarness>
    __initializeStorageFailure: (databaseName: string) => void
  }
}

Object.assign(globalThis, {
  __initializeStorageFailure: (databaseName: string) => {
    window.__storageFailure = initializeStorageFailureHarness(databaseName)
  },
})
