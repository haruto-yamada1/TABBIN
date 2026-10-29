import { IDBFactory } from 'fake-indexeddb'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createBackgroundSavedTabsIndexedDbDataPlane } from '@/app/composition/backgroundSavedTabsIndexedDbDataPlane'
import { PersistenceRevisionConflictError } from '@/contexts/saved-tabs/application/ports/PersistenceV2UnitOfWorkPort'
import { createReadyPersistenceOperationGateStub } from '@/contexts/saved-tabs/application/testing/PersistenceOperationGateStub'
import { checkPersistenceIntegrity } from '@/contexts/saved-tabs/domain/services/PersistenceIntegrityChecker'
import { IndexedDbSavedTabsSessionService } from '@/contexts/saved-tabs/infrastructure/composition/IndexedDbSavedTabsSessionService'
import { inspectBackupV2 } from '@/features/options/lib/import-export/v2/BackupV2Inspector'
import { createExportBackupV2UseCase } from '@/features/options/lib/import-export/v2/ExportBackupV2UseCase'
import { createImportBackupV2UseCase } from '@/features/options/lib/import-export/v2/ImportBackupV2UseCase'
import { defaultSettings } from '@/lib/storage/settings'

import { IndexedDbConnectionManager } from './indexed-db/IndexedDbConnectionManager'
import { IndexedDbPersistenceReplacementAdapter } from './indexed-db/IndexedDbPersistenceReplacementAdapter'
import { IndexedDbPersistenceSnapshotReader } from './indexed-db/IndexedDbPersistenceSnapshotReader'
import { IndexedDbPersistenceUnitOfWork } from './indexed-db/IndexedDbPersistenceUnitOfWork'

const SOURCE = 'https://synthetic.example/source'
const LATER = 'https://synthetic.example/later'
const IMPORTED = 'https://imported.example/backup'
const managers: IndexedDbConnectionManager[] = []
afterEach(() => {
  vi.restoreAllMocks()
  for (const manager of managers.splice(0)) {
    manager.close()
  }
})

const createContext = (indexedDb: IDBFactory, name: string) => {
  const manager = new IndexedDbConnectionManager({
    indexedDb,
    databaseName: 'synthetic-concurrency',
  })
  managers.push(manager)
  const gate = createReadyPersistenceOperationGateStub()
  const unit = new IndexedDbPersistenceUnitOfWork(manager, gate)
  const reader = new IndexedDbPersistenceSnapshotReader(manager, gate)
  const session = new IndexedDbSavedTabsSessionService({
    snapshotReaderPort: reader,
    unitOfWorkPort: unit,
  })
  let id = 0
  const dataPlane = createBackgroundSavedTabsIndexedDbDataPlane({
    idGenerator: () => `${name}-${++id}`,
    now: () => 1000,
    readSnapshot: async () => reader.readVerifiedSavedTabsSnapshot(),
    session,
  })
  return {
    dataPlane,
    manager,
    reader,
    unit,
    replacement: new IndexedDbPersistenceReplacementAdapter(manager, gate),
  }
}

// Pause only scheduling: the original commit still performs the real IndexedDB
// transaction, CAS check, and rollback. No timer or probabilistic interleaving.
const holdNextCommit = (unit: IndexedDbPersistenceUnitOfWork) => {
  const entered = Promise.withResolvers<undefined>()
  const released = Promise.withResolvers<undefined>()
  const commit = unit.commit.bind(unit)
  vi.spyOn(unit, 'commit').mockImplementationOnce(async (plan, options) => {
    entered.resolve(undefined)
    await released.promise
    return commit(plan, options)
  })
  return {
    entered: entered.promise,
    release: () => released.resolve(undefined),
  }
}

const readHealthy = async (context: ReturnType<typeof createContext>) => {
  const snapshot = await context.reader.readConsistentSnapshot()
  expect(checkPersistenceIntegrity(snapshot.savedTabs).issues).toEqual([])
  return snapshot
}

const save = async (
  context: ReturnType<typeof createContext>,
  url: string,
  title = 'Synthetic',
) => context.dataPlane.saveTabs([{ url, title }])

const rejectedConflict = async (operation: Promise<unknown>) => {
  const settled = await Promise.allSettled([operation])
  expect(settled).toHaveLength(1)
  const result = settled[0]
  expect(result?.status).toBe('rejected')
  if (result?.status !== 'rejected') {
    throw new Error('Expected CAS rejection')
  }
  expect(result.reason).toBeInstanceOf(PersistenceRevisionConflictError)
  if (!(result.reason instanceof PersistenceRevisionConflictError)) {
    throw new TypeError('Unexpected rejection')
  }
  return result.reason
}

describe('concurrent persistence operations across independent connections', () => {
  it('rejects one same-revision save, then retries from current exact-url identity', async () => {
    const indexedDb = new IDBFactory()
    const background = createContext(indexedDb, 'background')
    const page = createContext(indexedDb, 'page')
    const first = holdNextCommit(background.unit)
    const second = holdNextCommit(page.unit)
    const saved = save(background, SOURCE, 'First')
    const stale = save(page, SOURCE, 'Second')
    const conflict = rejectedConflict(stale)
    await Promise.all([first.entered, second.entered])
    first.release()
    await saved
    const winner = await readHealthy(background)
    second.release()
    expect(await conflict).toMatchObject({
      expectedRevision: 0,
      actualRevision: 1,
    })
    expect(await readHealthy(page)).toEqual(winner)

    await save(page, SOURCE, 'Second')
    const retried = await readHealthy(page)
    expect(retried.revision).toBe(2)
    expect(retried.savedTabs.urls).toEqual([
      { ...winner.savedTabs.urls[0], title: 'Second' },
    ])
    expect(retried.savedTabs.memberships).toHaveLength(2)
    expect(retried.savedTabs.collections).toHaveLength(2)
  })

  it.each(['delete', 'undo'] as const)(
    '%s rejects a stale plan without partially overwriting another save',
    async (kind) => {
      const indexedDb = new IDBFactory()
      const background = createContext(indexedDb, 'background')
      const page = createContext(indexedDb, 'page')
      await save(background, SOURCE)
      const undo = await background.dataPlane.readUndoSnapshot()
      if (kind === 'undo') {
        await background.dataPlane.removeUrl(SOURCE)
      }
      const baseline = await readHealthy(page)
      const paused = holdNextCommit(page.unit)
      const operation = async () =>
        kind === 'delete'
          ? page.dataPlane.removeUrl(SOURCE)
          : page.dataPlane.restoreUndoSnapshot(undo)
      const stale = operation()
      const conflict = rejectedConflict(stale)
      await paused.entered
      await save(background, LATER)
      const winner = await readHealthy(background)
      paused.release()
      expect(await conflict).toMatchObject({
        expectedRevision: baseline.revision,
        actualRevision: winner.revision,
      })
      expect(await readHealthy(page)).toEqual(winner)

      await operation()
      const retried = await readHealthy(page)
      expect(retried.revision).toBe(winner.revision + 1)
      // Undo explicitly restores the full snapshot; delete preserves later saves.
      expect({
        restored: kind === 'undo' ? retried.savedTabs : undefined,
        urls: retried.savedTabs.urls.map(({ url }) => url),
      }).toEqual({
        restored: kind === 'undo' ? undo.savedTabs : undefined,
        urls: kind === 'undo' ? [SOURCE] : [LATER],
      })
    },
  )

  it('Import atomically replaces data before a stale save is rejected and retried', async () => {
    const seed = createContext(new IDBFactory(), 'seed')
    let backup
    try {
      await seed.dataPlane.saveTabs([{ url: IMPORTED, title: 'Imported' }])
      backup = await createExportBackupV2UseCase({
        snapshotReader: seed.reader,
        readUserSettings: async () => structuredClone(defaultSettings),
        now: () => new Date(1000),
        getAppVersion: () => '2.0.8',
      })()
    } finally {
      seed.manager.close()
    }
    const indexedDb = new IDBFactory()
    const background = createContext(indexedDb, 'background')
    const options = createContext(indexedDb, 'options')
    await save(background, SOURCE)
    const before = await readHealthy(background)
    const paused = holdNextCommit(background.unit)
    const stale = save(background, LATER)
    const conflict = rejectedConflict(stale)
    await paused.entered
    let settings = backup.data.userSettings
    const importBackup = createImportBackupV2UseCase({
      changePort: { publish: async () => undefined, subscribe: () => () => {} },
      idGenerator: { generate: () => 'import-change' },
      normalizeUserSettings: (value) => value,
      readUserSettings: async () => settings,
      writeUserSettings: async (value) => {
        settings = value
      },
      snapshotReader: options.reader,
      replacement: options.replacement,
      recovery: {
        captureBeforeOverwrite: async () => before,
        restore: async () => {
          await options.replacement.replaceAll(before)
        },
      },
    })
    const result = await importBackup(inspectBackupV2(backup))
    const imported = await readHealthy(options)
    expect(result.revision).toBe(before.revision + 1)
    expect(imported.savedTabs).toEqual(backup.data.savedTabs)
    paused.release()
    expect(await conflict).toMatchObject({
      expectedRevision: before.revision,
      actualRevision: imported.revision,
    })
    expect(await readHealthy(background)).toEqual(imported)
    await save(background, LATER)
    const retried = await readHealthy(background)
    expect(retried.revision).toBe(imported.revision + 1)
    expect(retried.savedTabs.urls.map(({ url }) => url).toSorted()).toEqual(
      [IMPORTED, LATER].toSorted(),
    )
  })

  it('rolls back a failed multi-store transaction while a healthy save is pending, then permits retry after reconnect', async () => {
    const indexedDb = new IDBFactory()
    const background = createContext(indexedDb, 'background')
    const page = createContext(indexedDb, 'page')
    await save(background, SOURCE)
    const before = await readHealthy(page)
    const paused = holdNextCommit(background.unit)
    const saved = save(background, LATER)
    await paused.entered
    const original = before.savedTabs.collections.find(
      ({ definition }) => definition.type === 'domain',
    )
    if (!original) {
      throw new Error('Missing synthetic domain')
    }
    const plan = {
      // PLAN_KEYS queues categories before collections. This valid request must
      // roll back after the later unique-domain collection request fails.
      categories: {
        put: [
          {
            id: 'rolled-back-category',
            collectionId: original.id,
            name: 'Synthetic category',
            keywords: [],
            createdAt: 1000,
            updatedAt: 1000,
            sortOrder: 0,
          },
        ],
      },
      groups: {
        put: [
          {
            id: 'rolled-back',
            name: 'Synthetic group',
            createdAt: 1000,
            updatedAt: 1000,
            sortOrder: 0,
          },
        ],
      },
      collections: { put: [{ ...original, id: 'conflicting-domain' }] },
      urls: { delete: before.savedTabs.urls.map(({ id }) => id) },
    }
    await expect(
      page.unit.commit(plan, { expectedRevision: before.revision }),
    ).rejects.toMatchObject({ name: 'ConstraintError' })
    expect(await readHealthy(page)).toEqual(before)
    paused.release()
    await saved
    const committed = await readHealthy(background)
    expect(committed.revision).toBe(before.revision + 1)
    expect(committed.savedTabs.groups).toEqual([])
    background.manager.close()
    page.manager.close()
    const restarted = createContext(indexedDb, 'restarted')
    expect(await readHealthy(restarted)).toEqual(committed)
    await restarted.unit.commit(
      { groups: plan.groups },
      { expectedRevision: committed.revision },
    )
    const retried = await readHealthy(restarted)
    expect(retried.revision).toBe(committed.revision + 1)
    expect(retried.savedTabs.urls).toEqual(committed.savedTabs.urls)
    expect(retried.savedTabs.groups).toEqual(plan.groups.put)
  })
})
