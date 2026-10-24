import { expect } from '@playwright/test'
import type { BrowserContext, Page } from '@playwright/test'

import {
  createCustomCollectionFixture,
  createDomainCollectionFixture,
  createMembershipFixture,
  createUrlFixture,
} from '@/test/fixtures/persistenceBrowserFixtures'

import {
  createBaseSeed,
  defaultUserSettings,
  readPersistenceV2SavedTabsSnapshot,
  seedSavedTabsFixture,
} from './extension'

declare global {
  // eslint-disable-next-line typescript/consistent-type-definitions -- test-only browser probe
  interface Window {
    __openTabsQueryCount: number
  }
}

const firstUrl = 'https://open-tabs.example.test/article'
const secondUrl = 'https://open-tabs.example.test/other'
const hashUrl = `${firstUrl}#section`

const createOpenTabsFixture = () => {
  const now = Date.now()
  const urls = [
    createUrlFixture('open-first', firstUrl, 'Saved article', now),
    createUrlFixture('open-second', secondUrl, 'Other saved article', now),
    createUrlFixture('open-hash', hashUrl, 'Article section', now),
  ]
  return {
    storage: createBaseSeed({
      userSettings: { ...defaultUserSettings, removeTabAfterOpen: false },
    }),
    persistence: {
      categories: [],
      collections: [
        createDomainCollectionFixture(
          'open-domain',
          'open-tabs.example.test',
          now,
        ),
        createCustomCollectionFixture('open-project', 'Reading queue', now),
      ],
      groups: [],
      memberships: urls.flatMap((url, index) => [
        createMembershipFixture('open-domain', url.id, now, index),
        createMembershipFixture('open-project', url.id, now, index),
      ]),
      urls,
    },
  }
}

const row = (page: Page, title: string) =>
  page.getByRole('listitem').filter({
    has: page.getByRole('link', { name: title, exact: true }),
  })

export const verifyOpenTabs = async ({
  page,
  context,
  appUrl,
  mode,
  screenshots,
}: {
  page: Page
  context: BrowserContext
  appUrl: string
  mode: 'domain' | 'custom'
  screenshots?: { desktop: string; narrow: string }
}) => {
  await context.route('https://open-tabs.example.test/**', async (route) => {
    await route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>Local tab fixture</title><h1>Article</h1>',
    })
  })
  await page.goto(`${appUrl}#/options`)
  await seedSavedTabsFixture(page, createOpenTabsFixture())
  const persistenceBefore = await readPersistenceV2SavedTabsSnapshot(page)
  await page.addInitScript(() => {
    window.__openTabsQueryCount = 0
    const browserApi: unknown = Reflect.get(globalThis, 'browser')
    const api = browserApi ?? chrome
    if (typeof api !== 'object' || !('tabs' in api)) {
      return
    }
    const tabs: unknown = api.tabs
    if (
      typeof tabs !== 'object' ||
      tabs === null ||
      !('query' in tabs) ||
      typeof tabs.query !== 'function'
    ) {
      return
    }
    const query = tabs.query
    Object.defineProperty(tabs, 'query', {
      value: (...args: unknown[]) => {
        window.__openTabsQueryCount += 1
        const result: unknown = Reflect.apply(query, tabs, args)
        return result
      },
    })
  })

  // Init scripts run on document loads, not same-document hash navigation.
  await page.reload()
  const existing = await context.newPage()
  await existing.goto(firstUrl)
  await page.goto(`${appUrl}#/saved-tabs?mode=${mode}`)
  const firstRow = row(page, 'Saved article')
  const secondRow = row(page, 'Other saved article')
  const hashRow = row(page, 'Article section')
  await expect(firstRow.getByText('Open now', { exact: true })).toBeVisible()
  await expect(secondRow.getByText('Open now', { exact: true })).toBeHidden()
  await expect(hashRow.getByText('Open now', { exact: true })).toBeHidden()
  expect(await page.evaluate(() => window.__openTabsQueryCount)).toBe(1)

  // A second matching browser tab keeps the badge after either tab is closed.
  const duplicate = await context.newPage()
  await duplicate.goto(firstUrl)
  await existing.close()
  await expect(firstRow.getByText('Open now', { exact: true })).toBeVisible()
  await duplicate.close()
  await expect(firstRow.getByText('Open now', { exact: true })).toBeHidden()

  const live = await context.newPage()
  await live.goto(firstUrl)
  await expect(firstRow.getByText('Open now', { exact: true })).toBeVisible()
  await live.goto(secondUrl)
  await expect(firstRow.getByText('Open now', { exact: true })).toBeHidden()
  await expect(secondRow.getByText('Open now', { exact: true })).toBeVisible()
  await live.goto(hashUrl)
  await expect(secondRow.getByText('Open now', { exact: true })).toBeHidden()
  await expect(hashRow.getByText('Open now', { exact: true })).toBeVisible()
  await expect(firstRow.getByText('Open now', { exact: true })).toBeHidden()
  // Neither title/status events nor membership changes re-query every tab.
  await live.evaluate(() => {
    document.title = 'Updated article title'
  })
  expect(await page.evaluate(() => window.__openTabsQueryCount)).toBe(1)

  await page.reload()
  await expect(hashRow.getByText('Open now', { exact: true })).toBeVisible()
  await expect(firstRow.getByText('Open now', { exact: true })).toBeHidden()
  expect(await page.evaluate(() => window.__openTabsQueryCount)).toBe(1)

  if (screenshots) {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.screenshot({ path: screenshots.desktop })
    await page.evaluate(async () => {
      const { userSettings } = await chrome.storage.local.get('userSettings')
      await chrome.storage.local.set({
        userSettings: { ...userSettings, language: 'ja' },
      })
    })
    await page.setViewportSize({ width: 420, height: 900 })
    await expect(
      hashRow.getByText('開いています', { exact: true }),
    ).toBeVisible()
    await page.screenshot({ path: screenshots.narrow })
  }

  await live.close()
  await expect(hashRow.getByText(/^(Open now|開いています)$/u)).toBeHidden()
  expect(await readPersistenceV2SavedTabsSnapshot(page)).toEqual(
    persistenceBefore,
  )
}
