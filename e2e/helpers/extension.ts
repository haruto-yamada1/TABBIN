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
