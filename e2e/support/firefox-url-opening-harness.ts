/* eslint-disable no-restricted-imports -- browser-only regression exercises the real IndexedDB and browser API composition */
import { BrowserOpenError } from '@/contexts/saved-tabs/application/errors/BrowserOpenError'
import { createIndexedDbSavedTabsUseCases } from '@/contexts/saved-tabs/infrastructure/composition/createIndexedDbSavedTabsUseCases'
import { createPersistenceBootstrapRuntime } from '@/contexts/saved-tabs/infrastructure/composition/persistenceBootstrapRuntime'
import { IndexedDbConnectionManager } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbConnectionManager'
import { IndexedDbPersistenceSnapshotReader } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceSnapshotReader'
import { waitForIndexedDbTransaction } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbTransaction'
import {
  createCustomCollectionFixture,
  createMembershipFixture,
  createUrlFixture,
} from '@/test/fixtures/persistenceBrowserFixtures'

const databaseName = 'firefox-url-opening-smoke'
const records = [
  { id: 'opening-single', url: 'https://example.com/firefox-opening-single' },
  { id: 'opening-keep', url: 'https://example.com/firefox-opening-keep' },
  {
    id: 'opening-window-1',
    url: 'https://example.com/firefox-opening-window-1',
  },
  {
    id: 'opening-window-2',
    url: 'https://example.com/firefox-opening-window-2',
  },
  {
    id: 'opening-background-1',
    url: 'https://example.com/firefox-opening-background-1',
  },
  {
    id: 'opening-background-2',
    url: 'https://example.com/firefox-opening-background-2',
  },
  // eslint-disable-next-line no-script-url -- Firefox must reject this persisted URL without executing it or deleting the saved row
  { id: 'opening-rejected', url: 'javascript:void(0)' },
] as const

type OpeningOperationResult = {
  readonly openedUrls: readonly string[]
  readonly removedIds: readonly string[]
  readonly failureReasons: readonly string[]
}

type OpeningScenarioResult = OpeningOperationResult & {
  readonly createdTabCount: number
  readonly errorCode?: string
  readonly remainingIds: readonly string[]
}

export type FirefoxUrlOpeningSmokeResult = {
  readonly single: OpeningScenarioResult
  readonly keep: OpeningScenarioResult
  readonly newWindow: OpeningScenarioResult
  readonly backgroundTabs: OpeningScenarioResult
  readonly rejected: OpeningScenarioResult
  readonly retryAfterSuccess: OpeningScenarioResult
  readonly remainingAfterReconnect: readonly string[]
}

const createRuntime = () =>
  createPersistenceBootstrapRuntime({
    connectionManager: new IndexedDbConnectionManager({ databaseName }),
  })

const queryTabs = async (): Promise<readonly chrome.tabs.Tab[]> =>
  new Promise((resolve, reject) => {
    chrome.tabs.query({}, (tabs) => {
      const error = chrome.runtime.lastError
      if (error) {
        reject(new Error(error.message))
        return
      }
      resolve(tabs)
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
        return
      }
      resolve()
    })
  })
}

const seed = async (connectionManager: IndexedDbConnectionManager) => {
  const database = await connectionManager.open()
  const transaction = database.transaction(
    ['collections', 'collectionMemberships', 'urls', 'metadata'],
    'readwrite',
  )
  transaction
    .objectStore('collections')
    .put(
      createCustomCollectionFixture(
        'opening-project',
        'Firefox opening regression',
        1,
      ),
    )
  for (const [index, record] of records.entries()) {
    transaction
      .objectStore('urls')
      .put(createUrlFixture(record.id, record.url, record.id, 2))
    transaction
      .objectStore('collectionMemberships')
      .put(createMembershipFixture('opening-project', record.id, 2, index))
  }
  transaction.objectStore('metadata').put({ key: 'revision', value: 1 })
  await waitForIndexedDbTransaction(transaction)
}

const remainingIds = async (runtime: ReturnType<typeof createRuntime>) => {
  const { savedTabs } = await new IndexedDbPersistenceSnapshotReader(
    runtime.connectionManager,
    runtime.operationGate,
  ).readVerifiedSavedTabsSnapshot()
  return savedTabs.urls.map(({ id }) => id).toSorted()
}

const failureCode = (error: unknown): string => {
  if (error instanceof BrowserOpenError) {
    return error.reason
  }
  if (!(error instanceof Error)) {
    return 'NonErrorFailure'
  }
  if ('code' in error && typeof error.code === 'string') {
    return error.code
  }
  return error.name
}

const recordScenario = async (
  runtime: ReturnType<typeof createRuntime>,
  operation: () => Promise<OpeningOperationResult>,
): Promise<OpeningScenarioResult> => {
  const beforeIds = new Set((await queryTabs()).map(({ id }) => id))
  let result: OpeningOperationResult = {
    failureReasons: [],
    openedUrls: [],
    removedIds: [],
  }
  let errorCode: string | undefined
  try {
    result = await operation()
  } catch (error) {
    errorCode = failureCode(error)
  }
  const created = (await queryTabs()).filter(({ id }) => !beforeIds.has(id))
  return {
    ...result,
    createdTabCount: created.length,
    ...(errorCode ? { errorCode } : {}),
    remainingIds: await remainingIds(runtime),
  }
}

export const runFirefoxUrlOpeningSmoke =
  async (): Promise<FirefoxUrlOpeningSmokeResult> => {
    const runtime = createRuntime()
    await runtime.bootstrap.ready()
    await seed(runtime.connectionManager)
    const useCases = createIndexedDbSavedTabsUseCases({
      connectionManager: runtime.connectionManager,
      operationGate: runtime.operationGate,
      presentationOptions: { resolveActive: () => false },
    })
    const initialTabIds = new Set((await queryTabs()).map(({ id }) => id))
    const openSingle = async (
      urlRecordId: string,
      removeTabAfterOpen = true,
    ) => {
      const result = await useCases.openSavedUrl({
        origin: 'click',
        settings: { removeTabAfterExternalDrop: false, removeTabAfterOpen },
        urlRecordId,
      })
      return {
        failureReasons: [],
        openedUrls: [result.openedUrl],
        removedIds: result.removedUrlRecordId
          ? [result.removedUrlRecordId]
          : [],
      }
    }
    const openBatch = async (
      mode: 'newWindow' | 'backgroundTabs',
      ids: readonly string[],
    ) => {
      const result = await useCases.openAllSavedUrls({
        mode,
        removeTabAfterOpen: true,
        urls: records
          .filter(({ id }) => ids.includes(id))
          .map(({ url }) => url),
      })
      return {
        failureReasons: result.failedUrls.map(({ reason }) => reason),
        openedUrls: result.openedUrls,
        removedIds: result.removedUrlRecordIds,
      }
    }
    try {
      const single = await recordScenario(runtime, async () =>
        openSingle('opening-single'),
      )
      const retryAfterSuccess = await recordScenario(runtime, async () =>
        openSingle('opening-single'),
      )
      const keep = await recordScenario(runtime, async () =>
        openSingle('opening-keep', false),
      )
      const newWindow = await recordScenario(runtime, async () =>
        openBatch('newWindow', ['opening-window-1', 'opening-window-2']),
      )
      const backgroundTabs = await recordScenario(runtime, async () =>
        openBatch('backgroundTabs', [
          'opening-background-1',
          'opening-background-2',
        ]),
      )
      const rejected = await recordScenario(runtime, async () =>
        openSingle('opening-rejected'),
      )
      runtime.connectionManager.close()
      return {
        backgroundTabs,
        keep,
        newWindow,
        rejected,
        remainingAfterReconnect: await remainingIds(runtime),
        retryAfterSuccess,
        single,
      }
    } finally {
      runtime.connectionManager.close()
      const createdIds = (await queryTabs()).flatMap(({ id }) =>
        id !== undefined && !initialTabIds.has(id) ? [id] : [],
      )
      await removeTabs(createdIds)
    }
  }

export const verifyFirefoxUrlOpeningAfterRestart = async (): Promise<
  readonly string[]
> => {
  const runtime = createRuntime()
  try {
    return await remainingIds(runtime)
  } finally {
    runtime.connectionManager.close()
  }
}
