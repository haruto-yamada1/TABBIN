import { describe, expect, it } from 'vitest'

import {
  INDEXEDDB_MIGRATION_NOTICE_ID,
  NOTICE_DISMISSALS_STORAGE_KEY,
  createPersistenceMigrationNoticeController,
} from './persistenceMigrationNoticeController'

type StoredValues = Record<string, unknown>

const createStorage = (initial: StoredValues = {}) => {
  const values = { ...initial }

  return {
    get: async (key: string) => ({ [key]: values[key] }),
    set: async (next: StoredValues) => {
      Object.assign(values, next)
    },
    values,
  }
}

const completedMigration = {
  migrationId: 'migration-1',
  persistenceGeneration: 2 as const,
  status: 'indexeddb' as const,
}

describe('createPersistenceMigrationNoticeController', () => {
  it('shows the versioned notice only after IndexedDB migration completed', async () => {
    const storage = createStorage()
    const controller = createPersistenceMigrationNoticeController({
      now: () => 123,
      readMigrationState: async () => completedMigration,
      storage,
    })

    await expect(controller.shouldShow()).resolves.toBe(true)
  })

  it('does not show the success notice when migration failed', async () => {
    const controller = createPersistenceMigrationNoticeController({
      now: () => 123,
      readMigrationState: async () => ({
        errorCode: 'PERSISTENCE_MIGRATION_FAILED' as const,
        status: 'failed' as const,
      }),
      storage: createStorage(),
    })

    await expect(controller.shouldShow()).resolves.toBe(false)
  })

  it('persists a versioned dismissal across a controller recreation', async () => {
    const storage = createStorage()
    const firstController = createPersistenceMigrationNoticeController({
      now: () => 456,
      readMigrationState: async () => completedMigration,
      storage,
    })

    await firstController.dismiss()

    expect(storage.values[NOTICE_DISMISSALS_STORAGE_KEY]).toEqual({
      [INDEXEDDB_MIGRATION_NOTICE_ID]: {
        dismissedAt: 456,
        noticeId: INDEXEDDB_MIGRATION_NOTICE_ID,
      },
    })

    const reopenedController = createPersistenceMigrationNoticeController({
      now: () => 789,
      readMigrationState: async () => completedMigration,
      storage,
    })

    await expect(reopenedController.shouldShow()).resolves.toBe(false)
  })

  it('keeps dismissal state separate for a future notice ID', async () => {
    const storage = createStorage({
      [NOTICE_DISMISSALS_STORAGE_KEY]: {
        'backup-format-v3': {
          dismissedAt: 456,
          noticeId: 'backup-format-v3',
        },
      },
    })
    const controller = createPersistenceMigrationNoticeController({
      now: () => 789,
      readMigrationState: async () => completedMigration,
      storage,
    })

    await expect(controller.shouldShow()).resolves.toBe(true)
  })
})
