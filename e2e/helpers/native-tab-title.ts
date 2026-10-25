import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { chromium } from '@playwright/test'
import type { BrowserContext, Page, Request, Worker } from '@playwright/test'
import { z } from 'zod'

import {
  createCustomCollectionFixture,
  createDomainCollectionFixture,
  createMembershipFixture,
  createUrlFixture,
} from '@/test/fixtures/persistenceBrowserFixtures'

import {
  createBaseSeed,
  defaultUserSettings,
  expect,
  test as extensionTest,
} from './extension'
import { getUnexpectedPlaywrightExtensionOutboundRequest } from './network-policy'

export const nativeTitleUrls = {
  article: 'https://native-title.example.test/article',
  checkmark: 'https://native-title.example.test/site-checkmark',
  unsaved: 'https://native-title.example.test/unsaved',
} as const

export const createNativeTitleSeed = () => {
  const now = Date.now()
  const urls = [
    createUrlFixture('native-article', nativeTitleUrls.article, 'Article', now),
    createUrlFixture(
      'native-checkmark',
      nativeTitleUrls.checkmark,
      '✓ Site title',
      now,
    ),
  ]
  return {
    storage: createBaseSeed({
      userSettings: { ...defaultUserSettings, clickBehavior: 'saveCurrentTab' },
    }),
    persistence: {
      categories: [],
      collections: [
        createDomainCollectionFixture(
          'native-domain',
          'native-title.example.test',
          now,
        ),
        createCustomCollectionFixture('native-project', 'Reading', now),
      ],
      groups: [],
      memberships: urls.flatMap(({ id }, index) => [
        createMembershipFixture('native-domain', id, now, index),
        createMembershipFixture('native-project', id, now, index),
      ]),
      urls,
    },
  }
}

export const routeNativeTitlePages = async (context: BrowserContext) => {
  await context.route('https://native-title.example.test/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname
    const titles: Record<string, string> = {
      '/article': 'Article',
      '/site-checkmark': '✓ Site title',
      '/unsaved': 'Unsaved article',
    }
    await route.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: `<!doctype html><title>${titles[pathname] ?? 'Other article'}</title><h1>Local title fixture</h1>`,
    })
  })
}

export const expectNativeTitle = async (
  page: Page,
  worker: Worker,
  title: string,
) => {
  await expect(page).toHaveTitle(title)
  await expect
    .poll(async () =>
      worker.evaluate(async (url) => {
        const tabs = await chrome.tabs.query({})
        return tabs.find((tab) => tab.url === url)?.title
      }, page.url()),
    )
    .toBe(title)
}

export const readInjectedNativeTitle = async (worker: Worker, url: string) =>
  worker.evaluate(async (expectedUrl) => {
    const tabs = await chrome.tabs.query({})
    const tab = tabs.find((candidate) => candidate.url === expectedUrl)
    if (tab?.id === undefined) {
      throw new Error('Native title fixture tab is unavailable.')
    }
    try {
      const result: unknown = await chrome.tabs.sendMessage(
        tab.id,
        { action: 'tabbinNativeSavedTitle', command: 'read' },
        { frameId: 0 },
      )
      return result ?? null
    } catch {
      return null
    }
  }, url)

const manifestSchema = z
  .object({
    permissions: z.array(z.string()),
    host_permissions: z.array(z.string()),
    optional_permissions: z.array(z.string()),
    optional_host_permissions: z.array(z.string()),
  })
  .loose()

/**
 * Headless Chrome cannot approve the native optional-permission prompt.
 * The optional-access fixture installs a temporary required-access copy, closes
 * Chrome, restores that copy's exact production manifest, then relaunches the
 * same disposable profile. Chrome retains the grant as removable optional access.
 * All assertions run against the production manifest and native APIs; no API is
 * mocked, and the original .output artifact is never edited.
 */
export const test = extensionTest.extend<{ pregrantNativeTitle: boolean }>({
  pregrantNativeTitle: [false, { option: true }],
  extensionContext: async (
    { browserName, pregrantNativeTitle },
    runFixture,
  ) => {
    void browserName
    const temporaryRoot = await mkdtemp(
      path.join(os.tmpdir(), 'tabbin-native-title-'),
    )
    const original =
      process.env.TABBIN_E2E_EXTENSION_PATH ??
      path.join(process.cwd(), '.output', 'chrome-mv3')
    const artifact = pregrantNativeTitle
      ? path.join(temporaryRoot, 'extension')
      : original
    let context: BrowserContext | undefined
    const violations = new Set<string>()
    const handleRequest = (request: Request) => {
      const violation = getUnexpectedPlaywrightExtensionOutboundRequest(request)
      if (violation !== null) {
        violations.add(violation)
      }
    }
    try {
      let originalManifest: string | undefined
      const manifestPath = path.join(artifact, 'manifest.json')
      if (pregrantNativeTitle) {
        await cp(original, artifact, { recursive: true })
        originalManifest = await readFile(manifestPath, 'utf8')
        const manifest = manifestSchema.parse(JSON.parse(originalManifest))
        manifest.permissions = [
          ...new Set([
            ...manifest.permissions,
            ...manifest.optional_permissions,
          ]),
        ]
        manifest.host_permissions = [
          ...new Set([
            ...manifest.host_permissions,
            ...manifest.optional_host_permissions,
          ]),
        ]
        manifest.optional_permissions = []
        manifest.optional_host_permissions = []
        await writeFile(manifestPath, JSON.stringify(manifest))
      }
      const launch = async () =>
        chromium.launchPersistentContext(path.join(temporaryRoot, 'profile'), {
          channel: 'chromium',
          args: [
            '--enable-unsafe-extension-debugging',
            `--disable-extensions-except=${artifact}`,
            `--load-extension=${artifact}`,
          ],
        })
      context = await launch()
      context.on('request', handleRequest)
      if (originalManifest !== undefined) {
        const worker =
          context.serviceWorkers()[0] ??
          (await context.waitForEvent('serviceworker'))
        expect(
          await worker.evaluate(async () =>
            chrome.permissions.contains({
              permissions: ['scripting'],
              origins: ['http://*/*', 'https://*/*'],
            }),
          ),
        ).toBe(true)
        context.off('request', handleRequest)
        await context.close()
        context = undefined
        await writeFile(manifestPath, originalManifest)
        context = await launch()
        context.on('request', handleRequest)
      }
      await runFixture(context)
    } finally {
      context?.off('request', handleRequest)
      await context?.close()
      await rm(temporaryRoot, { force: true, recursive: true })
    }
    expect([...violations], 'unexpected extension outbound request').toEqual([])
  },
})
