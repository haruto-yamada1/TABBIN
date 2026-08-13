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

const extensionPath = path.join(process.cwd(), '.output', 'chrome-mv3')

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
  customProjectOrder: [],
  customProjects: [],
  domainCategoryMappings: [],
  domainCategorySettings: [],
  parentCategories: [],
  savedTabs: [],
  'tab-manager-theme': 'system',
  urls: [],
  userSettings: { ...defaultUserSettings },
  viewMode: 'domain',
  ...overrides,
})

export const getExtensionUrl = (extensionId: string, pathname: string) =>
  `chrome-extension://${extensionId}/${pathname}`

export const seedStorage = async (
  serviceWorker: Worker,
  seed: Record<string, unknown>,
) => {
  await serviceWorker.evaluate(async (value) => {
    await chrome.storage.local.clear()
    await chrome.storage.local.set(value)
  }, seed)
}

type PersistenceV2SavedTabsSeed = {
  categories: readonly Record<string, unknown>[]
  collections: readonly Record<string, unknown>[]
  groups: readonly Record<string, unknown>[]
  memberships: readonly Record<string, unknown>[]
  urls: readonly Record<string, unknown>[]
}

export const seedPersistenceV2SavedTabs = async (
  serviceWorker: Worker,
  seed: PersistenceV2SavedTabsSeed,
) => {
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

export const readStorage = async <T>(
  serviceWorker: Worker,
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
  serviceWorker: Worker,
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

export const waitForPersistenceV2Ready = async (
  serviceWorker: Worker,
): Promise<void> => {
  await expect
    .poll(async () => {
      const state = await readStorage<
        Record<string, { issueCodes?: string[]; status?: string }>
      >(serviceWorker, [
        'tabbin:migrationPreflight:v1',
        'tabbin:persistenceControlState:v2',
      ])
      return {
        control: state['tabbin:persistenceControlState:v2']?.status,
        issueCodes: state['tabbin:migrationPreflight:v1']?.issueCodes,
        preflight: state['tabbin:migrationPreflight:v1']?.status,
      }
    })
    .toEqual({
      control: 'indexeddb',
      issueCodes: undefined,
      preflight: 'healthy',
    })
}
