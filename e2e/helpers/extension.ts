/* eslint-disable */
/* eslint-disable typescript/no-misused-promises, typescript/no-floating-promises, typescript/no-unsafe-argument, typescript/TS7006 */
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { test as base, chromium, expect } from '@playwright/test'
import type { BrowserContext, Page, Request, Worker } from '@playwright/test'

import { getUnexpectedPlaywrightExtensionOutboundRequest } from './network-policy'

type ExtensionFixtures = {
  extensionContext: BrowserContext
  extensionId: string
  serviceWorker: Worker
  page: Page
}

const extensionPath =
  process.env.TABBIN_E2E_EXTENSION_PATH ??
  path.join(process.cwd(), '.output', 'chrome-mv3')

export const test = base.extend<ExtensionFixtures>({
  extensionContext: async ({ browserName }, runFixture) => {
    void browserName
    const userDataDir = await mkdtemp(
      path.join(os.tmpdir(), 'tabbin-extension-e2e-'),
    )

    const extensionContext = await chromium.launchPersistentContext(
      userDataDir,
      {
        channel: 'chromium',
        args: [
          '--enable-unsafe-extension-debugging',
          `--disable-extensions-except=${extensionPath}`,
          `--load-extension=${extensionPath}`,
        ],
      },
    )
    const violations = new Set<string>()
    const handleRequest = (request: Request) => {
      const violation = getUnexpectedPlaywrightExtensionOutboundRequest(request)
      if (violation !== null) {
        violations.add(violation)
      }
    }
    extensionContext.on('request', handleRequest)

    try {
      await runFixture(extensionContext)
    } finally {
      extensionContext.off('request', handleRequest)
      await extensionContext.close()
      await rm(userDataDir, {
        force: true,
        recursive: true,
      })
    }

    expect(
      [...violations],
      'unexpected outbound request from an extension page or service worker',
    ).toEqual([])
  },
  extensionId: async ({ serviceWorker }, runFixture) => {
    const extensionId = new URL(serviceWorker.url()).host
    await runFixture(extensionId)
  },
  page: async ({ extensionContext }, runFixture) => {
    const page = await extensionContext.newPage()
    await runFixture(page).finally(async () => {
      await page.close()
    })
  },
  serviceWorker: async ({ extensionContext }, runFixture) => {
    let [serviceWorker] = extensionContext.serviceWorkers()

    if (!serviceWorker) {
      serviceWorker = await extensionContext.waitForEvent('serviceworker')
    }

    await runFixture(serviceWorker)
  },
})

export { expect }

export const defaultUserSettings = {
  autoDeletePeriod: 'never',
  clickBehavior: 'saveSameDomainTabs',
  colors: {},
  confirmDeleteAll: false,
  confirmDeleteEach: false,
  enableCategories: true,
  excludePatterns: ['chrome-extension://', 'chrome://'],
  excludePinnedTabs: true,
  language: 'en',
  ollamaModel: '',
  openAllInNewWindow: false,
  openUrlInBackground: true,
  removeTabAfterExternalDrop: true,
  removeTabAfterOpen: true,
  showSavedTime: false,
}

export const createBaseSeed = (overrides?: Record<string, unknown>) => ({
  'tab-manager-theme': 'system',
  userSettings: { ...defaultUserSettings },
  viewMode: 'domain',
  ...overrides,
})

export const getExtensionUrl = (extensionId: string, pathname: string) =>
  `chrome-extension://${extensionId}/${pathname}`

export const seedStorage = async (
  serviceWorker: Pick<Worker, 'evaluate'>,
  seed: Record<string, unknown>,
) => {
  await serviceWorker.evaluate(async (value) => {
    await chrome.storage.local.clear()
    await chrome.storage.local.set(value)
  }, seed)
}

export type PersistenceV2SavedTabsSeed = {
  categories: readonly Record<string, unknown>[]
  collections: readonly Record<string, unknown>[]
  groups: readonly Record<string, unknown>[]
  memberships: readonly Record<string, unknown>[]
  urls: readonly Record<string, unknown>[]
}

export const seedPersistenceV2SavedTabs = async (
  serviceWorker: Pick<Worker, 'evaluate'>,
  seed: PersistenceV2SavedTabsSeed,
) => {
  await waitForPersistenceV2Ready(serviceWorker)
  await serviceWorker.evaluate(async (value) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('tabbin-persistence-v2', 1)
      request.addEventListener('success', () => resolve(request.result))
      request.addEventListener('error', () =>
        reject(request.error ?? new Error('Failed to open persistence v2.')),
      )
    })
    const storeNames = [
      'collectionCategories',
      'collections',
      'collectionGroups',
      'collectionMemberships',
      'metadata',
      'urls',
    ]
    const transaction = database.transaction(storeNames, 'readwrite')
    const transactionComplete = new Promise<void>((resolve, reject) => {
      transaction.addEventListener('complete', () => resolve())
      transaction.addEventListener('abort', () =>
        reject(
          transaction.error ?? new Error('Persistence v2 seed was aborted.'),
        ),
      )
      transaction.addEventListener('error', () =>
        reject(transaction.error ?? new Error('Persistence v2 seed failed.')),
      )
    })

    transaction.objectStore('collectionCategories').clear()
    transaction.objectStore('collections').clear()
    transaction.objectStore('collectionGroups').clear()
    transaction.objectStore('collectionMemberships').clear()
    transaction.objectStore('urls').clear()
    for (const category of value.categories) {
      transaction.objectStore('collectionCategories').put(category)
    }
    for (const collection of value.collections) {
      transaction.objectStore('collections').put(collection)
    }
    for (const group of value.groups) {
      transaction.objectStore('collectionGroups').put(group)
    }
    for (const membership of value.memberships) {
      transaction.objectStore('collectionMemberships').put(membership)
    }
    for (const url of value.urls) {
      transaction.objectStore('urls').put(url)
    }
    transaction.objectStore('metadata').put({ key: 'revision', value: 1 })

    try {
      await transactionComplete
    } finally {
      database.close()
    }
  }, seed)
}

export const seedSavedTabsFixture = async (
  serviceWorker: Pick<Worker, 'evaluate'>,
  seed: {
    storage: Record<string, unknown>
    persistence: PersistenceV2SavedTabsSeed
  },
) => {
  await seedStorage(serviceWorker, seed.storage)
  await seedPersistenceV2SavedTabs(serviceWorker, seed.persistence)
}

export const readStorage = async <T>(
  serviceWorker: Pick<Worker, 'evaluate'>,
  keys?: string | string[],
) =>
  serviceWorker.evaluate(async (value) => {
    // eslint-disable-line
    const getItems = (
      query?: Record<string, unknown> | string | string[],
    ): Promise<Record<string, unknown>> =>
      new Promise((resolve) => {
        if (query === undefined) {
          chrome.storage.local.get((items: Record<string, unknown>) => {
            // eslint-disable-line typescript/TS7006
            resolve(items)
          })
          return
        }

        chrome.storage.local.get(query, (items) => {
          resolve(items)
        })
      })

    if (value === undefined) {
      return getItems()
    }

    return getItems(value)
  }, keys) as Promise<T>

type PersistenceV2SavedTabsStoreName =
  | 'collectionCategories'
  | 'collectionGroups'
  | 'collectionMemberships'
  | 'collections'
  | 'urls'

export const readPersistenceV2Store = async <T>(
  serviceWorker: Pick<Worker, 'evaluate'>,
  storeName: PersistenceV2SavedTabsStoreName,
): Promise<T[]> =>
  serviceWorker.evaluate(async (value) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('tabbin-persistence-v2', 1)
      request.addEventListener('success', () => resolve(request.result))
      request.addEventListener('error', () =>
        reject(request.error ?? new Error('Failed to open persistence v2.')),
      )
    })
    const transaction = database.transaction(value, 'readonly')
    const request = transaction.objectStore(value).getAll()

    try {
      return await new Promise<T[]>((resolve, reject) => {
        request.addEventListener('success', () => resolve(request.result))
        request.addEventListener('error', () =>
          reject(
            request.error ?? new Error(`Failed to read ${value} records.`),
          ),
        )
      })
    } finally {
      database.close()
    }
  }, storeName)

export const readPersistenceV2SavedTabsSnapshot = async (
  serviceWorker: Pick<Worker, 'evaluate'>,
) =>
  serviceWorker.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('tabbin-persistence-v2', 1)
      request.addEventListener('success', () => resolve(request.result))
      request.addEventListener('error', () =>
        reject(request.error ?? new Error('Failed to open persistence v2.')),
      )
    })
    const storeNames = [
      'collectionCategories',
      'collections',
      'collectionGroups',
      'collectionMemberships',
      'metadata',
      'urls',
    ]
    const transaction = database.transaction(storeNames, 'readonly')
    const categories = transaction.objectStore('collectionCategories').getAll()
    const collections = transaction.objectStore('collections').getAll()
    const groups = transaction.objectStore('collectionGroups').getAll()
    const memberships = transaction
      .objectStore('collectionMemberships')
      .getAll()
    const revision = transaction.objectStore('metadata').get('revision')
    const urls = transaction.objectStore('urls').getAll()

    try {
      await new Promise<void>((resolve, reject) => {
        transaction.addEventListener('complete', () => resolve())
        transaction.addEventListener('abort', () =>
          reject(
            transaction.error ??
              new Error('Persistence v2 snapshot read was aborted.'),
          ),
        )
        transaction.addEventListener('error', () =>
          reject(
            transaction.error ??
              new Error('Persistence v2 snapshot read failed.'),
          ),
        )
      })
      return {
        categories: categories.result,
        collections: collections.result,
        groups: groups.result,
        memberships: memberships.result,
        revision: (revision.result as { value?: unknown } | undefined)?.value,
        urls: urls.result,
      }
    } finally {
      database.close()
    }
  })

export const waitForPersistenceV2Ready = async (
  serviceWorker: Pick<Worker, 'evaluate'>,
): Promise<void> => {
  await expect
    .poll(async () => {
      return serviceWorker.evaluate(async () => {
        const databases = await indexedDB.databases()
        return databases.some(
          ({ name, version }) =>
            name === 'tabbin-persistence-v2' && version === 1,
        )
      })
    })
    .toBe(true)
}

export const triggerToolbarAction = async (
  context: BrowserContext,
  page: Page,
  extensionId: string,
) => {
  const browser = context.browser()
  if (!browser) {
    throw new Error('The Chromium browser is unavailable.')
  }
  const cdp = await browser.newBrowserCDPSession()
  try {
    const { targetInfos } = await cdp.send('Target.getTargets', {
      filter: [{ type: 'tab' }, { exclude: true }],
    })
    const targets = targetInfos.filter(
      ({ type, url }) => type === 'tab' && url === page.url(),
    )
    expect(targets).toHaveLength(1)
    const [target] = targets
    if (!target) {
      throw new Error('The save target tab is unavailable.')
    }
    await cdp.send('Extensions.triggerAction', {
      id: extensionId,
      targetId: target.targetId,
    })
  } finally {
    await cdp.detach()
  }
}
