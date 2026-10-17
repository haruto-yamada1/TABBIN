/* eslint-disable no-restricted-imports -- opt-in native browser measurement exercises real adapters and IndexedDB */
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

export type StagedOpeningMeasurement = {
  readonly count: number
  readonly mode: 'backgroundTabs' | 'newWindow'
  readonly durationMs: number
  readonly firstProgressMs: number | null
  readonly peakPendingCreates: number
  readonly largestWindowBatch: number
  readonly timerTicks: number
  readonly maxTimerGapMs: number
  readonly createdTabs: number
  readonly createdWindows: number
  readonly opened: number
  readonly failed: number
  readonly removed: number
  readonly remaining: number
}

const queryTabs = async (): Promise<readonly chrome.tabs.Tab[]> =>
  new Promise((resolve, reject) => {
    chrome.tabs.query({}, (tabs) => {
      const error = chrome.runtime.lastError
      if (error) {
        reject(new Error(error.message))
      } else {
        resolve(tabs)
      }
    })
  })

const removeTabs = async (ids: readonly number[]): Promise<void> => {
  if (ids.length === 0) {
    return
  }
  await new Promise<void>((resolve, reject) => {
    chrome.tabs.remove([...ids], () => {
      const error = chrome.runtime.lastError
      if (error) {
        reject(new Error(error.message))
      } else {
        resolve()
      }
    })
  })
}

const measure = async (
  count: number,
  mode: StagedOpeningMeasurement['mode'],
): Promise<StagedOpeningMeasurement> => {
  const databaseName = `issue-899-measurement-${count}-${mode}`
  const bootstrap = createPersistenceBootstrapRuntime({
    connectionManager: new IndexedDbConnectionManager({ databaseName }),
  })
  await bootstrap.bootstrap.ready()
  const database = await bootstrap.connectionManager.open()
  const urls = Array.from(
    { length: count },
    (_, index) => `about:blank#issue-899-${count}-${mode}-${index}`,
  )
  const transaction = database.transaction(
    ['collections', 'collectionMemberships', 'urls', 'metadata'],
    'readwrite',
  )
  transaction
    .objectStore('collections')
    .put(createCustomCollectionFixture('measurement', 'Measurement', 1))
  for (const [index, url] of urls.entries()) {
    const id = `measurement-${index}`
    transaction.objectStore('urls').put(createUrlFixture(id, url, id, 1))
    transaction
      .objectStore('collectionMemberships')
      .put(createMembershipFixture('measurement', id, 1, index))
  }
  transaction.objectStore('metadata').put({ key: 'revision', value: 1 })
  await waitForIndexedDbTransaction(transaction)
  // Creation can settle before a browser exposes the requested navigation URL.
  const initialIds = new Set((await queryTabs()).map(({ id }) => id))
  const runtime = createNativeIndexedDbSavedTabsRuntime({
    connectionManager: bootstrap.connectionManager,
    operationGate: bootstrap.operationGate,
    presentationOptions: { resolveActive: () => false },
  })
  let pending = 0
  let peakPendingCreates = 0
  let largestWindowBatch = 0
  const track = async <Result>(
    operation: () => Promise<Result>,
  ): Promise<Result> => {
    pending += 1
    peakPendingCreates = Math.max(peakPendingCreates, pending)
    try {
      return await operation()
    } finally {
      pending -= 1
    }
  }
  const deps = {
    ...runtime.deps,
    browserTabPort: {
      open: async (
        input: Parameters<typeof runtime.deps.browserTabPort.open>[0],
      ) => track(async () => runtime.deps.browserTabPort.open(input)),
    },
    browserWindowPort: {
      openWithUrls: async (
        input: Parameters<
          typeof runtime.deps.browserWindowPort.openWithUrls
        >[0],
      ) => {
        largestWindowBatch = Math.max(largestWindowBatch, input.urls.length)
        return track(async () =>
          runtime.deps.browserWindowPort.openWithUrls(input),
        )
      },
    },
  }
  let timerTicks = 0
  let maxTimerGapMs = 0
  let lastTick = performance.now()
  let firstProgressMs: number | null = null
  const started = performance.now()
  const interval = setInterval(() => {
    const now = performance.now()
    timerTicks += 1
    maxTimerGapMs = Math.max(maxTimerGapMs, now - lastTick)
    lastTick = now
  }, 10)
  try {
    const result = await runtime.session.run(async (state) =>
      createOpenAllSavedUrlsUseCase(
        createNativeSavedTabsPersistenceAdapters(state, deps),
      )(
        {
          mode,
          removeTabAfterOpen: true,
          urls,
        },
        {
          onProgress: ({ opened, failed }) => {
            if (firstProgressMs === null && opened + failed > 0) {
              firstProgressMs = performance.now() - started
            }
          },
        },
      ),
    )
    const finished = performance.now()
    const durationMs = finished - started
    clearInterval(interval)
    maxTimerGapMs = Math.max(maxTimerGapMs, finished - lastTick)
    const created = (await queryTabs()).filter(({ id }) => !initialIds.has(id))
    const snapshot = await new IndexedDbPersistenceSnapshotReader(
      bootstrap.connectionManager,
      bootstrap.operationGate,
    ).readVerifiedSavedTabsSnapshot()
    return {
      count,
      mode,
      durationMs,
      firstProgressMs,
      peakPendingCreates,
      largestWindowBatch,
      timerTicks,
      maxTimerGapMs,
      createdTabs: created.length,
      createdWindows: new Set(created.map(({ windowId }) => windowId)).size,
      opened: result.openedUrls.length,
      failed: result.failedUrls.length,
      removed: result.removedUrlRecordIds.length,
      remaining: snapshot.savedTabs.urls.length,
    }
  } finally {
    clearInterval(interval)
    bootstrap.connectionManager.close()
    await removeTabs(
      (await queryTabs()).flatMap(({ id }) =>
        id !== undefined && !initialIds.has(id) ? [id] : [],
      ),
    )
  }
}

export const runStagedOpeningMeasurements = async (): Promise<
  readonly StagedOpeningMeasurement[]
> => {
  const results: StagedOpeningMeasurement[] = []
  for (const count of [10, 100, 500]) {
    for (const mode of ['backgroundTabs', 'newWindow'] as const) {
      console.info(`[staged-opening] Starting ${count} ${mode}`)
      // eslint-disable-next-line no-await-in-loop -- each measurement owns and closes its native tabs
      const result = await measure(count, mode)
      results.push(result)
      console.info(`[staged-opening] Finished ${JSON.stringify(result)}`)
    }
  }
  return results
}

Object.assign(globalThis, {
  __tabbinStagedOpeningMeasurements: { runStagedOpeningMeasurements },
})
