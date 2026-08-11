import { PersistenceUnavailableError } from '@/contexts/saved-tabs/application/errors/PersistenceUnavailableError'
import type {
  PersistenceDataPlaneRouterPort,
  PersistenceOperationGatePort,
} from '@/contexts/saved-tabs/application/ports/PersistenceBootstrapPort'
import type { PersistenceV2SnapshotReaderPort } from '@/contexts/saved-tabs/application/ports/PersistenceV2SnapshotReaderPort'
import type {
  PersistenceJsonRecord,
  PersistenceV2UnitOfWorkPort,
} from '@/contexts/saved-tabs/application/ports/PersistenceV2UnitOfWorkPort'
import { createBroadcastChannelPersistenceChangeAdapter } from '@/contexts/saved-tabs/infrastructure/browser/BroadcastChannelPersistenceChangeAdapter'
import { createSystemIdGenerator } from '@/contexts/saved-tabs/infrastructure/browser/SystemIdGeneratorAdapter'
import { createNotifyingPersistenceV2UnitOfWork } from '@/contexts/saved-tabs/infrastructure/composition/createNotifyingPersistenceV2UnitOfWork'
import { getPersistenceBootstrapRuntime } from '@/contexts/saved-tabs/infrastructure/composition/persistenceBootstrapRuntime'
import { IndexedDbPersistenceSnapshotReader } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceSnapshotReader'
import { IndexedDbPersistenceUnitOfWork } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceUnitOfWork'
import { getChromeStorageLocal } from '@/lib/browser/chrome-storage'
import { logger } from '@/lib/logging/logger'
import { isJsonValue } from '@/lib/persistence/jsonValue'

const SAVED_ANALYTICS_VIEWS_KEY = 'savedAnalyticsViews'

type AnalyticsViewsDataPlane = {
  readonly readValues: () => Promise<readonly unknown[]>
  readonly replaceValues: (values: readonly unknown[]) => Promise<void>
}

type AnalyticsViewsLegacyStorage = {
  readonly get: (key: string) => Promise<Record<string, unknown>>
  readonly set: (values: Record<string, unknown>) => Promise<void>
}

type CreateRouteAwareAnalyticsViewsDataPlaneOptions = {
  readonly indexeddb: AnalyticsViewsDataPlane
  readonly legacy: AnalyticsViewsDataPlane
  readonly router: PersistenceDataPlaneRouterPort
}

const createRouteAwareAnalyticsViewsDataPlane = ({
  indexeddb,
  legacy,
  router,
}: CreateRouteAwareAnalyticsViewsDataPlaneOptions): AnalyticsViewsDataPlane => ({
  readValues: async () =>
    router.read({
      indexeddb: indexeddb.readValues,
      legacy: legacy.readValues,
    }),
  replaceValues: async (values) =>
    router.write({
      indexeddb: async () => indexeddb.replaceValues(values),
      legacy: async () => legacy.replaceValues(values),
    }),
})

const selectedIndexedDbGate: PersistenceOperationGatePort = {
  runIndexedDbRead: async (operation) => operation(),
  runIndexedDbWrite: async (operation) => operation(),
  // eslint-disable-next-line typescript/require-await -- the outer router selected IndexedDB
  runLegacyRead: async () => {
    throw new PersistenceUnavailableError('PERSISTENCE_ROUTE_MISMATCH')
  },
  // eslint-disable-next-line typescript/require-await -- the outer router selected IndexedDB
  runLegacyWrite: async () => {
    throw new PersistenceUnavailableError('PERSISTENCE_ROUTE_MISMATCH')
  },
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const toPersistenceRecord = (value: unknown): PersistenceJsonRecord => {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.updatedAt !== 'number' ||
    !Number.isFinite(value.updatedAt) ||
    !isJsonValue(value)
  ) {
    throw new TypeError('Analytics view is not a valid persistence record.')
  }
  return {
    id: value.id,
    updatedAt: value.updatedAt,
    value,
  }
}

const createLegacyAnalyticsViewsDataPlane = (
  getChromeStorageLocal: () => AnalyticsViewsLegacyStorage,
): AnalyticsViewsDataPlane => ({
  readValues: async () => {
    const storageLocal = getChromeStorageLocal()
    const stored = await storageLocal.get(SAVED_ANALYTICS_VIEWS_KEY)
    const value = stored[SAVED_ANALYTICS_VIEWS_KEY]
    return Array.isArray(value) ? value.map((item: unknown) => item) : []
  },
  replaceValues: async (values) => {
    const storageLocal = getChromeStorageLocal()
    await storageLocal.set({ [SAVED_ANALYTICS_VIEWS_KEY]: [...values] })
  },
})

const createIndexedDbAnalyticsViewsDataPlane = ({
  reader,
  unitOfWork,
}: {
  reader: Pick<PersistenceV2SnapshotReaderPort, 'readConsistentSnapshot'>
  unitOfWork: Pick<PersistenceV2UnitOfWorkPort, 'commit'>
}): AnalyticsViewsDataPlane => ({
  readValues: async () => {
    const snapshot = await reader.readConsistentSnapshot()
    return snapshot.analyticsViews.map(({ value }) => value)
  },
  replaceValues: async (values) => {
    const snapshot = await reader.readConsistentSnapshot()
    const next = values.map(toPersistenceRecord)
    const nextIds = new Set(next.map(({ id }) => id))
    if (nextIds.size !== next.length) {
      throw new TypeError('Analytics view IDs must be unique.')
    }
    const currentById = new Map(
      snapshot.analyticsViews.map((record) => [record.id, record]),
    )
    const deleted = snapshot.analyticsViews.reduce<string[]>((ids, { id }) => {
      if (!nextIds.has(id)) {
        ids.push(id)
      }
      return ids
    }, [])
    const put = next.filter((record) => {
      const current = currentById.get(record.id)
      return (
        current === undefined ||
        JSON.stringify(current) !== JSON.stringify(record)
      )
    })
    if (deleted.length === 0 && put.length === 0) {
      return
    }
    await unitOfWork.commit(
      {
        analyticsViews: {
          ...(deleted.length > 0 ? { delete: deleted } : {}),
          ...(put.length > 0 ? { put } : {}),
        },
      },
      { expectedRevision: snapshot.revision },
    )
  },
})

const createProductionIndexedDbDataPlane = (): AnalyticsViewsDataPlane => {
  const runtime = getPersistenceBootstrapRuntime()
  if (!runtime.connectionManager) {
    throw new PersistenceUnavailableError(
      'PERSISTENCE_CONTROL_STATE_UNAVAILABLE',
    )
  }
  const reader = new IndexedDbPersistenceSnapshotReader(
    runtime.connectionManager,
    selectedIndexedDbGate,
  )
  const unitOfWork = createNotifyingPersistenceV2UnitOfWork({
    changePort: createBroadcastChannelPersistenceChangeAdapter(),
    idGenerator: createSystemIdGenerator(),
    onNotificationFailure: (diagnostic) => {
      logger.error('persistence_notification_failed_after_commit', diagnostic)
    },
    unitOfWork: new IndexedDbPersistenceUnitOfWork(
      runtime.connectionManager,
      selectedIndexedDbGate,
    ),
  })
  return createIndexedDbAnalyticsViewsDataPlane({ reader, unitOfWork })
}

let productionDataPlane: AnalyticsViewsDataPlane | null | undefined
let productionIndexedDbDataPlane: AnalyticsViewsDataPlane | undefined

const getProductionIndexedDbDataPlane = (): AnalyticsViewsDataPlane => {
  productionIndexedDbDataPlane ??= createProductionIndexedDbDataPlane()
  return productionIndexedDbDataPlane
}

const getAnalyticsViewsDataPlane = (): AnalyticsViewsDataPlane | null => {
  if (productionDataPlane !== undefined) {
    return productionDataPlane
  }
  const storage = getChromeStorageLocal()
  productionDataPlane = storage
    ? createRouteAwareAnalyticsViewsDataPlane({
        indexeddb: {
          readValues: async () =>
            getProductionIndexedDbDataPlane().readValues(),
          replaceValues: async (values) =>
            getProductionIndexedDbDataPlane().replaceValues(values),
        },
        legacy: createLegacyAnalyticsViewsDataPlane(() => storage),
        router: getPersistenceBootstrapRuntime().dataPlaneRouter,
      })
    : null
  return productionDataPlane
}

export type { AnalyticsViewsDataPlane }
export {
  createIndexedDbAnalyticsViewsDataPlane,
  createLegacyAnalyticsViewsDataPlane,
  createRouteAwareAnalyticsViewsDataPlane,
  getAnalyticsViewsDataPlane,
}
