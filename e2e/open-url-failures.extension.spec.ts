import { createServer } from 'node:http'

import type { Page } from '@playwright/test'

import {
  createDomainCollectionFixture,
  createMembershipFixture,
  createUrlFixture,
} from '@/test/fixtures/persistenceBrowserFixtures'

import {
  createBaseSeed,
  defaultUserSettings,
  expect,
  getExtensionUrl,
  readPersistenceV2SavedTabsSnapshot,
  seedSavedTabsFixture,
  test as extensionTest,
} from './helpers/extension'

type OpenFailureState = {
  rejectUrls: string[]
  rejectWindow: boolean
  tabCalls: string[]
  windowCalls: string[][]
}

type OpenFailureRuntime = typeof globalThis & {
  __tabbinOpenFailureTest: OpenFailureState
}

type StagedOpeningState = {
  released: boolean
  requested: string[]
  releasePending: (() => void)[]
}

type StagedOpeningRuntime = typeof globalThis & {
  __tabbinStagedOpeningTest: StagedOpeningState
}

const test = extensionTest.extend<{ localOrigin: string }>({
  localOrigin: async ({ extensionContext }, runFixture) => {
    void extensionContext
    const server = createServer((_request, response) => {
      response.setHeader('Content-Type', 'text/html')
      response.end(
        '<title>Opened saved URL</title><p>Local opening fixture</p>',
      )
    })
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })
    try {
      const address = server.address()
      if (!address || typeof address === 'string') {
        throw new Error('URL opening fixture did not bind a TCP port')
      }
      await runFixture(`http://127.0.0.1:${address.port}`)
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
        server.closeAllConnections()
      })
    }
  },
})

const createOpeningSeed = (
  urls: readonly string[],
  openAllInNewWindow = false,
) => {
  const now = Date.now()
  return {
    storage: createBaseSeed({
      userSettings: { ...defaultUserSettings, openAllInNewWindow },
    }),
    persistence: {
      categories: [],
      collections: [
        createDomainCollectionFixture('opening-domain', '127.0.0.1', now),
      ],
      groups: [],
      memberships: urls.map((_url, index) =>
        createMembershipFixture(
          'opening-domain',
          `opening-${index}`,
          now,
          index,
        ),
      ),
      urls: urls.map((url, index) =>
        createUrlFixture(
          `opening-${index}`,
          url,
          `Saved URL ${index + 1}`,
          now,
        ),
      ),
    },
  }
}

const installOpeningFailures = async (
  page: Page,
  rejectedUrls: readonly string[],
  rejectWindow = false,
  heldUrls: readonly string[] = [],
) => {
  await page.addInitScript(
    ({ rejectedUrls, rejectWindow, heldUrls }) => {
      const state: OpenFailureState = {
        rejectUrls: [...rejectedUrls],
        rejectWindow,
        tabCalls: [],
        windowCalls: [],
      }
      ;(globalThis as OpenFailureRuntime).__tabbinOpenFailureTest = state
      const staged: StagedOpeningState = {
        released: false,
        requested: [],
        releasePending: [],
      }
      ;(globalThis as StagedOpeningRuntime).__tabbinStagedOpeningTest = staged
      const createTab = chrome.tabs.create.bind(chrome.tabs)
      Object.defineProperty(chrome.tabs, 'create', {
        configurable: true,
        value: async (properties: chrome.tabs.CreateProperties) => {
          const url = properties.url ?? ''
          staged.requested.push(url)
          if (!staged.released && heldUrls.includes(url)) {
            await new Promise<void>((resolve) =>
              staged.releasePending.push(resolve),
            )
          }
          state.tabCalls.push(url)
          if (state.rejectUrls.includes(url)) {
            throw new Error('Permission denied while opening the saved URL')
          }
          return createTab(properties)
        },
      })
      const createWindow = chrome.windows.create.bind(chrome.windows)
      Object.defineProperty(chrome.windows, 'create', {
        configurable: true,
        value: async (properties: chrome.windows.CreateData) => {
          const urls =
            typeof properties.url === 'string'
              ? [properties.url]
              : (properties.url ?? [])
          state.windowCalls.push(urls)
          if (state.rejectWindow) {
            throw new Error('The browser could not confirm window creation')
          }
          return createWindow(properties)
        },
      })
    },
    { rejectedUrls, rejectWindow, heldUrls },
  )
}

const allowRetry = async (page: Page) =>
  page.evaluate(() => {
    const state = (globalThis as OpenFailureRuntime).__tabbinOpenFailureTest
    state.rejectUrls = []
    state.rejectWindow = false
  })

const readOpeningCalls = async (page: Page) =>
  page.evaluate(() => {
    const state = (globalThis as OpenFailureRuntime).__tabbinOpenFailureTest
    return {
      tabCalls: state.tabCalls,
      windowCalls: state.windowCalls,
    }
  })

const openSavedTabs = async (page: Page, extensionId: string) =>
  page.goto(getExtensionUrl(extensionId, 'app.html#/saved-tabs?mode=domain'))

const expectNoOpeningResult = async (page: Page) => {
  await expect(
    page.getByRole('region', { name: 'URL opening result' }),
  ).toHaveCount(0)
  await expect(page.getByRole('progressbar')).toHaveCount(0)
  await expect(
    page.getByRole('button', {
      name: /^(Cancel opening|Retry failed URLs|Resume unopened URLs)$/,
    }),
  ).toHaveCount(0)
}

test('a single failure keeps the URL saved and can be retried from the list without a result panel', async ({
  extensionContext,
  extensionId,
  localOrigin,
  page,
  serviceWorker,
}) => {
  const savedUrl = `${localOrigin.replace('http://', 'http://saved-user:private-password@')}/single?token=private-query#section`
  await seedSavedTabsFixture(serviceWorker, createOpeningSeed([savedUrl]))
  const original = await readPersistenceV2SavedTabsSnapshot(serviceWorker)
  await installOpeningFailures(page, [savedUrl])
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await openSavedTabs(page, extensionId)
  const savedLink = page.getByRole('link', { name: 'Saved URL 1', exact: true })
  await savedLink.click()
  const failureMessage = page.getByText(
    'Could not open the URL. It remains saved.',
    { exact: true },
  )
  await expect(failureMessage).toBeVisible()
  await expectNoOpeningResult(page)
  await expect(page.locator('body')).not.toContainText('private-password')
  await expect(page.locator('body')).not.toContainText(
    'Permission denied while opening the saved URL',
  )
  expect(await readPersistenceV2SavedTabsSnapshot(serviceWorker)).toEqual(
    original,
  )
  await page.reload()
  await expect(savedLink).toBeVisible()
  expect(await readPersistenceV2SavedTabsSnapshot(serviceWorker)).toEqual(
    original,
  )
  await savedLink.click()
  await expect(failureMessage).toBeVisible()
  await allowRetry(page)
  const openedPromise = extensionContext.waitForEvent('page')
  await savedLink.click()
  const opened = await openedPromise
  await expect(opened).toHaveTitle('Opened saved URL')
  await expect(savedLink).toBeHidden()
  await expect
    .poll(
      async () =>
        (await readPersistenceV2SavedTabsSnapshot(serviceWorker)).urls,
    )
    .toEqual([])
  await expectNoOpeningResult(page)
  expect((await readOpeningCalls(page)).tabCalls).toEqual([savedUrl, savedUrl])
  expect(pageErrors).toEqual([])
})

test('bulk opening removes confirmed successes and opens the remaining saved URL through the normal action', async ({
  extensionContext,
  extensionId,
  localOrigin,
  page,
  serviceWorker,
}) => {
  const openedUrl = `${localOrigin}/bulk-opened`
  const failedUrl = `${localOrigin}/bulk-failed`
  await seedSavedTabsFixture(
    serviceWorker,
    createOpeningSeed([openedUrl, failedUrl]),
  )
  await installOpeningFailures(page, [failedUrl])
  await openSavedTabs(page, extensionId)
  const openAll = page.getByRole('button', {
    name: 'Open all tabs for "127.0.0.1"',
    exact: true,
  })
  const firstOpenedPromise = extensionContext.waitForEvent('page')
  await openAll.click()
  const firstOpened = await firstOpenedPromise
  await expect(firstOpened).toHaveURL(openedUrl)
  await expect(
    page.getByText('Some URLs could not be opened. They remain saved.', {
      exact: true,
    }),
  ).toBeVisible()
  await expectNoOpeningResult(page)
  await expect(
    page.getByRole('link', { name: 'Saved URL 1', exact: true }),
  ).toBeHidden()
  await expect(
    page.getByRole('link', { name: 'Saved URL 2', exact: true }),
  ).toBeVisible()
  await expect
    .poll(async () => {
      const snapshot = await readPersistenceV2SavedTabsSnapshot(serviceWorker)
      return {
        urlIds: snapshot.urls.map(({ id }) => id),
        membershipUrlIds: snapshot.memberships.map(({ urlId }) => urlId),
      }
    })
    .toEqual({ urlIds: ['opening-1'], membershipUrlIds: ['opening-1'] })
  await allowRetry(page)
  const retriedPromise = extensionContext.waitForEvent('page')
  await openAll.click()
  const retried = await retriedPromise
  await expect(retried).toHaveURL(failedUrl)
  await expect
    .poll(
      async () =>
        (await readPersistenceV2SavedTabsSnapshot(serviceWorker)).urls,
    )
    .toEqual([])
  await expectNoOpeningResult(page)
  expect((await readOpeningCalls(page)).tabCalls).toEqual([
    openedUrl,
    failedUrl,
    failedUrl,
  ])
})

test('a rejected new window retains every saved URL and membership after reload without a result panel', async ({
  extensionId,
  localOrigin,
  page,
  serviceWorker,
}) => {
  const urls = [`${localOrigin}/window-first`, `${localOrigin}/window-second`]
  await seedSavedTabsFixture(serviceWorker, createOpeningSeed(urls, true))
  const original = await readPersistenceV2SavedTabsSnapshot(serviceWorker)
  await installOpeningFailures(page, [], true)
  await openSavedTabs(page, extensionId)
  await page
    .getByRole('button', {
      name: 'Open all tabs for "127.0.0.1"',
      exact: true,
    })
    .click()
  await expect(
    page.getByText('Some URLs could not be opened. They remain saved.', {
      exact: true,
    }),
  ).toBeVisible()
  await expectNoOpeningResult(page)
  expect(await readPersistenceV2SavedTabsSnapshot(serviceWorker)).toEqual(
    original,
  )
  expect(await readOpeningCalls(page)).toEqual({
    tabCalls: [],
    windowCalls: [urls],
  })
  await page.reload()
  await expect(
    page.getByRole('link', { name: 'Saved URL 1', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'Saved URL 2', exact: true }),
  ).toBeVisible()
  expect(await readPersistenceV2SavedTabsSnapshot(serviceWorker)).toEqual(
    original,
  )
})

test('bulk opening has no progress or result panel and preserves confirmation, bounded work, and Undo', async ({
  extensionId,
  localOrigin,
  page,
  serviceWorker,
}) => {
  const urls = Array.from(
    { length: 12 },
    (_, index) => `${localOrigin}/staged-${index}`,
  )
  await seedSavedTabsFixture(serviceWorker, createOpeningSeed(urls))
  await installOpeningFailures(page, [], false, urls.slice(2))
  await openSavedTabs(page, extensionId)
  await page
    .getByRole('button', {
      name: 'Open all tabs for "127.0.0.1"',
      exact: true,
    })
    .click()
  const preview = page.getByRole('alertdialog', { name: 'Open all tabs?' })
  await expect(preview).toHaveAccessibleDescription(
    'Open 12 tabs for "127.0.0.1". Continue?',
  )
  await preview.getByRole('button', { name: 'Open', exact: true }).click()
  const requested = async () =>
    page.evaluate(
      () =>
        (globalThis as StagedOpeningRuntime).__tabbinStagedOpeningTest
          .requested,
    )
  await expect.poll(requested).toEqual(urls.slice(0, 7))
  await expectNoOpeningResult(page)
  expect(
    (await readPersistenceV2SavedTabsSnapshot(serviceWorker)).urls,
  ).toHaveLength(12)
  await page.evaluate(() => {
    const state = (globalThis as StagedOpeningRuntime).__tabbinStagedOpeningTest
    state.released = true
    for (const resolve of state.releasePending.splice(0)) {
      resolve()
    }
  })
  await expect.poll(requested).toEqual(urls)
  await expect
    .poll(
      async () =>
        (await readPersistenceV2SavedTabsSnapshot(serviceWorker)).urls,
    )
    .toEqual([])
  await expectNoOpeningResult(page)
  expect((await readOpeningCalls(page)).tabCalls).toEqual(urls)
  const undo = page.getByRole('button', { name: 'Undo', exact: true })
  await expect(undo).toHaveCount(1)
  await undo.click()
  await expect
    .poll(
      async () =>
        (await readPersistenceV2SavedTabsSnapshot(serviceWorker)).urls.length,
    )
    .toBe(12)
  await page.reload()
  await expect(
    page.getByRole('link', { name: 'Saved URL 1', exact: true }),
  ).toBeVisible()
  expect(
    (await readPersistenceV2SavedTabsSnapshot(serviceWorker)).urls,
  ).toHaveLength(12)
})
