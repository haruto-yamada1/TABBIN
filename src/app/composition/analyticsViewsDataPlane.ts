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
import { logger } from '@/lib/logging/logger'
import { isJsonValue } from '@/lib/persistence/jsonValue'

type AnalyticsViewsDataPlane = {
  readonly readValues: () => Promise<readonly unknown[]>
  readonly replaceValues: (values: readonly unknown[]) => Promise<void>
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
  const reader = new IndexedDbPersistenceSnapshotReader(
    runtime.connectionManager,
    runtime.operationGate,
  )
  const unitOfWork = createNotifyingPersistenceV2UnitOfWork({
    changePort: createBroadcastChannelPersistenceChangeAdapter(),
    idGenerator: createSystemIdGenerator(),
    onNotificationFailure: (diagnostic) => {
      logger.error('persistence_notification_failed_after_commit', diagnostic)
    },
    unitOfWork: new IndexedDbPersistenceUnitOfWork(
      runtime.connectionManager,
      runtime.operationGate,
    ),
  })
  return createIndexedDbAnalyticsViewsDataPlane({ reader, unitOfWork })
}

let productionDataPlane: AnalyticsViewsDataPlane | undefined

const getAnalyticsViewsDataPlane = (): AnalyticsViewsDataPlane => {
  productionDataPlane ??= createProductionIndexedDbDataPlane()
  return productionDataPlane
}

const resetAnalyticsViewsDataPlaneForTesting = (): void => {
  productionDataPlane = undefined
}

export type { AnalyticsViewsDataPlane }
export {
  createIndexedDbAnalyticsViewsDataPlane,
  getAnalyticsViewsDataPlane,
  resetAnalyticsViewsDataPlaneForTesting,
}
