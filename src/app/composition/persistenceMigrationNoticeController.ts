import type { PersistenceControlState } from '@/contexts/saved-tabs/application/ports/PersistenceBootstrapPort'
import { getPersistenceBootstrapRuntime } from '@/contexts/saved-tabs/infrastructure/composition/persistenceBootstrapRuntime'
import { getChromeStorageLocal } from '@/lib/browser/chrome-storage'

export const INDEXEDDB_MIGRATION_NOTICE_ID = 'indexeddb-migration-v1'
export const NOTICE_DISMISSALS_STORAGE_KEY = 'tabbin:noticeDismissals:v1'

type NoticeDismissal = {
  readonly dismissedAt: number
  readonly noticeId: string
}

type NoticeDismissalStorage = {
  readonly get: (key: string) => Promise<Record<string, unknown>>
  readonly set: (values: Record<string, unknown>) => Promise<void>
}

export type PersistenceMigrationNoticeControllerPort = {
  readonly dismiss: () => Promise<void>
  readonly shouldShow: () => Promise<boolean>
}

export type PersistenceMigrationNoticeControllerOptions = {
  readonly now: () => number
  readonly readMigrationState: () => Promise<PersistenceControlState>
  readonly storage: NoticeDismissalStorage | null
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isNoticeDismissal = (
  value: unknown,
  noticeId: string,
): value is NoticeDismissal =>
  isRecord(value) &&
  value.noticeId === noticeId &&
  typeof value.dismissedAt === 'number' &&
  Number.isFinite(value.dismissedAt)

const readDismissals = (value: unknown): Record<string, NoticeDismissal> => {
  if (!isRecord(value)) {
    return {}
  }

  return Object.entries(value).reduce<Record<string, NoticeDismissal>>(
    (dismissals, [noticeId, dismissal]) => {
      if (isNoticeDismissal(dismissal, noticeId)) {
        dismissals[noticeId] = dismissal
      }
      return dismissals
    },
    {},
  )
}

const readStoredDismissals = async (
  storage: NoticeDismissalStorage,
): Promise<Record<string, NoticeDismissal>> => {
  const stored = await storage.get(NOTICE_DISMISSALS_STORAGE_KEY)
  return readDismissals(stored[NOTICE_DISMISSALS_STORAGE_KEY])
}

export const createPersistenceMigrationNoticeController = ({
  now,
  readMigrationState,
  storage,
}: PersistenceMigrationNoticeControllerOptions): PersistenceMigrationNoticeControllerPort => ({
  dismiss: async () => {
    if (!storage) {
      return
    }
    const dismissals = await readStoredDismissals(storage)
    await storage.set({
      [NOTICE_DISMISSALS_STORAGE_KEY]: {
        ...dismissals,
        [INDEXEDDB_MIGRATION_NOTICE_ID]: {
          dismissedAt: now(),
          noticeId: INDEXEDDB_MIGRATION_NOTICE_ID,
        },
      },
    })
  },
  shouldShow: async () => {
    if (!storage) {
      return false
    }
    const state = await readMigrationState()
    if (state.status !== 'indexeddb') {
      return false
    }
    const dismissals = await readStoredDismissals(storage)
    return !Object.hasOwn(dismissals, INDEXEDDB_MIGRATION_NOTICE_ID)
  },
})

let controller: PersistenceMigrationNoticeControllerPort | undefined

export const getPersistenceMigrationNoticeController =
  (): PersistenceMigrationNoticeControllerPort => {
    controller ??= createPersistenceMigrationNoticeController({
      now: Date.now,
      readMigrationState: getPersistenceBootstrapRuntime().bootstrap.readState,
      storage: getChromeStorageLocal(),
    })
    return controller
  }

export const resetPersistenceMigrationNoticeControllerForTesting = (): void => {
  controller = undefined
}
