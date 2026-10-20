/* eslint-disable no-restricted-imports -- browser benchmark exercises the production IndexedDB session and opening use case */
import { BrowserOpenError } from '@/contexts/saved-tabs/application/errors/BrowserOpenError'
import type { BrowserTabPort } from '@/contexts/saved-tabs/application/ports/BrowserTabPort'
import { createOpenAllSavedUrlsUseCase } from '@/contexts/saved-tabs/application/use-cases/OpenAllSavedUrlsUseCase'
import { createNativeIndexedDbSavedTabsRuntime } from '@/contexts/saved-tabs/infrastructure/composition/createIndexedDbSavedTabsUseCases'
import { createNativeSavedTabsPersistenceAdapters } from '@/contexts/saved-tabs/infrastructure/composition/NativeSavedTabsPersistenceAdapters'
import { createPersistenceBootstrapRuntime } from '@/contexts/saved-tabs/infrastructure/composition/persistenceBootstrapRuntime'
import { IndexedDbConnectionManager } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbConnectionManager'
import { IndexedDbPersistenceSnapshotReader } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceSnapshotReader'
import { waitForIndexedDbTransaction } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbTransaction'
import {
  createCustomCollectionFixture,
  createMembershipFixture,
  createUrlFixture,
} from '@/test/fixtures/persistenceBrowserFixtures'

export type BudgetOpeningMeasurement = {
  readonly durationMs: number
  readonly work: {
    readonly peakPendingCreates: number
    readonly createdTabs: number
    readonly opened: number
    readonly failed: number
    readonly remaining: number
    readonly pendingOperations: number
  }
}

declare global {
  // eslint-disable-next-line typescript/consistent-type-definitions -- merge the browser global
  interface Window {
    tabbinBudgetOpening: typeof measureBudgetOpening
  }
}

const requireCondition = (condition: boolean, message: string): void => {
  if (!condition) {
    throw new Error(`Bulk opening budget contract: ${message}`)
  }
}

const sameStrings = (actual: readonly string[], expected: readonly string[]) =>
  actual.length === expected.length &&
  actual.every((value, index) => value === expected[index])

const deleteMeasurementDatabase = async (databaseName: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(databaseName)
    request.addEventListener('success', () => {
      resolve()
    })
    request.addEventListener('error', () => {
      reject(request.error ?? new Error('Measurement database cleanup failed'))
    })
    request.addEventListener('blocked', () => {
      reject(new Error('Measurement database cleanup was blocked'))
    })
  })

// Recording happens at the browser port boundary: no native tabs are created.
// Real tasks keep creates in flight so the production bounded pool is observed.
const createRecordingTabPort = (rejectedUrl?: string) => {
  const requested: string[] = []
  const confirmed: string[] = []
  let pending = 0
  let peakPendingCreates = 0
  const port: BrowserTabPort = {
    open: async ({ url }) => {
      requested.push(url)
      pending += 1
      peakPendingCreates = Math.max(peakPendingCreates, pending)
      try {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 0)
        })
        if (url === rejectedUrl) {
          throw new BrowserOpenError('tabLimit')
        }
        confirmed.push(url)
        return { url }
      } finally {
        pending -= 1
      }
    },
  }
  return {
    port,
    requested,
    confirmed,
    pending: () => pending,
    peakPendingCreates: () => peakPendingCreates,
  }
}

export const measureBudgetOpening = async (
  size: 1_000 | 10_000,
): Promise<BudgetOpeningMeasurement> => {
  const supportedSizes: readonly number[] = [1_000, 10_000]
  requireCondition(supportedSizes.includes(size), 'unsupported fixture size')
  const databaseName = `tabbin-performance-budget-opening-${crypto.randomUUID()}`
  const bootstrap = createPersistenceBootstrapRuntime({
    connectionManager: new IndexedDbConnectionManager({ databaseName }),
  })
  const urls = Array.from(
    { length: size },
    (_, index) => `https://opening-budget.example/item/${index}`,
  )
  const records = urls.map((url, index) =>
    createUrlFixture(`opening-${index}`, url, `Synthetic ${index}`, 1),
  )
  const memberships = records.map(({ id }, index) =>
    createMembershipFixture('opening-budget', id, 1, index),
  )
  try {
    await bootstrap.bootstrap.ready()
    const database = await bootstrap.connectionManager.open()
    const transaction = database.transaction(
      ['collections', 'collectionMemberships', 'urls', 'metadata'],
      'readwrite',
    )
    transaction
      .objectStore('collections')
      .put(createCustomCollectionFixture('opening-budget', 'Opening budget', 1))
    for (const record of records) {
      transaction.objectStore('urls').put(record)
    }
    for (const membership of memberships) {
      transaction.objectStore('collectionMemberships').put(membership)
    }
    transaction.objectStore('metadata').put({ key: 'revision', value: 1 })
    await waitForIndexedDbTransaction(transaction)

    const reader = new IndexedDbPersistenceSnapshotReader(
      bootstrap.connectionManager,
      bootstrap.operationGate,
    )
    const before = await reader.readVerifiedSavedTabsSnapshot()
    const expectedUrls = new Map(records.map((record) => [record.id, record]))
    const expectedMemberships = new Map(
      memberships.map((membership) => [membership.urlId, membership]),
    )
    requireCondition(
      before.savedTabs.urls.length === size &&
        before.savedTabs.urls.every(
          (record) =>
            JSON.stringify(record) ===
            JSON.stringify(expectedUrls.get(record.id)),
        ),
      'seeded URL identities differ',
    )
    requireCondition(
      before.savedTabs.memberships.length === size &&
        before.savedTabs.memberships.every(
          (membership) =>
            JSON.stringify(membership) ===
            JSON.stringify(expectedMemberships.get(membership.urlId)),
        ),
      'seeded membership identities differ',
    )
    const runtime = createNativeIndexedDbSavedTabsRuntime({
      connectionManager: bootstrap.connectionManager,
      operationGate: bootstrap.operationGate,
    })
    const run = async (rejectedUrl?: string) => {
      const recording = createRecordingTabPort(rejectedUrl)
      const deps = {
        ...runtime.deps,
        browserTabPort: recording.port,
        browserWindowPort: {
          openWithUrls: async () => {
            await Promise.resolve()
            throw new Error('Unexpected window creation in tab budget')
          },
        },
      }
      let pendingSessions = 1
      const startedAt = performance.now()
      const result = await runtime.session
        .run(async (state) =>
          createOpenAllSavedUrlsUseCase(
            createNativeSavedTabsPersistenceAdapters(state, deps),
          )({ mode: 'backgroundTabs', removeTabAfterOpen: false, urls }),
        )
        .finally(() => {
          pendingSessions -= 1
        })
      const durationMs = performance.now() - startedAt
      const expectedOpened = urls.filter((url) => url !== rejectedUrl)
      requireCondition(
        sameStrings(recording.requested, urls),
        'requested URL identities or order differ',
      )
      requireCondition(
        sameStrings(result.openedUrls, expectedOpened) &&
          sameStrings(
            recording.confirmed.toSorted(),
            expectedOpened.toSorted(),
          ),
        'confirmed URL identities differ',
      )
      requireCondition(
        result.removedUrlRecordIds.length === 0 &&
          result.removedUrlRecords.length === 0 &&
          result.snapshot === null &&
          (result.cancelledUrls?.length ?? 0) === 0,
        'keep-after-open changed saved data or cancelled requests',
      )
      requireCondition(
        recording.peakPendingCreates() === 5 && recording.pending() === 0,
        'creation pool did not settle at its five-request bound',
      )
      requireCondition(
        result.failedUrls.length === (rejectedUrl === undefined ? 0 : 1) &&
          (rejectedUrl === undefined ||
            (result.failedUrls[0]?.url === rejectedUrl &&
              result.failedUrls[0].reason === 'tabLimit')),
        'browser rejection was not reported accurately',
      )
      // Reopen before readback to prove that persistence retained the full fixture.
      bootstrap.connectionManager.close()
      const after = await reader.readVerifiedSavedTabsSnapshot()
      requireCondition(
        JSON.stringify(after) === JSON.stringify(before),
        'URL or membership persistence changed after opening',
      )
      return {
        durationMs,
        work: {
          peakPendingCreates: recording.peakPendingCreates(),
          createdTabs: recording.confirmed.length,
          opened: result.openedUrls.length,
          failed: result.failedUrls.length,
          remaining: after.savedTabs.urls.length,
          pendingOperations: pendingSessions + recording.pending(),
        },
      }
    }
    const successfulSample = await run()
    // The rejection exercise has its own counters and timer; it is excluded from
    // the successful work/latency sample returned to the comparative report.
    await run(urls[Math.floor(size / 2)])
    return successfulSample
  } finally {
    bootstrap.connectionManager.close()
    await deleteMeasurementDatabase(databaseName)
  }
}

Reflect.set(globalThis, 'tabbinBudgetOpening', measureBudgetOpening)
