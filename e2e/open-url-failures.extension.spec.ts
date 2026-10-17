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
  copiedUrls: string[]
  copyFailure: boolean
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
        copiedUrls: [],
        copyFailure: false,
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
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async (value: string) => {
            if (state.copyFailure) {
              throw new Error('Clipboard permission denied')
            }
            state.copiedUrls.push(value)
          },
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
      copiedUrls: state.copiedUrls,
      tabCalls: state.tabCalls,
      windowCalls: state.windowCalls,
    }
  })

const openSavedTabs = async (page: Page, extensionId: string) =>
  page.goto(getExtensionUrl(extensionId, 'app.html#/saved-tabs?mode=domain'))

test('a single failure preserves IndexedDB, exposes a safe copy fallback, and can be retried', async ({
  extensionContext,
  extensionId,
  localOrigin,
  page,
  serviceWorker,
}) => {
  const savedUrl = `${localOrigin.replace('http://', 'http://saved-user:private-password@')}/single?token=private-query#section`
  const displayUrl = `${localOrigin}/single?token=private-query#section`
  await seedSavedTabsFixture(serviceWorker, createOpeningSeed([savedUrl]))
  const original = await readPersistenceV2SavedTabsSnapshot(serviceWorker)
  await installOpeningFailures(page, [savedUrl])
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await openSavedTabs(page, extensionId)
  const savedLink = page.getByRole('link', { name: 'Saved URL 1', exact: true })
  await savedLink.click()
  const result = page.getByRole('region', { name: 'URL opening result' })
  await expect(result).toContainText('0 / 1 URLs opened')
  await expect(result).toContainText(
    'The browser denied permission to open this URL.',
  )
  const failedUrl = result.getByRole('textbox', {
    name: 'Failed URL',
    exact: true,
  })
  await expect(failedUrl).toHaveValue(displayUrl)
  await expect(failedUrl).toHaveAttribute('readonly')
  await expect(result).not.toContainText('private-password')
  await result.getByRole('button', { name: 'Copy URL', exact: true }).click()
  expect((await readOpeningCalls(page)).copiedUrls).toEqual([savedUrl])
  await page.evaluate(() => {
    ;(globalThis as OpenFailureRuntime).__tabbinOpenFailureTest.copyFailure =
      true
  })
  await result.getByRole('button', { name: 'Copy URL', exact: true }).click()
  await expect(
    page.getByText('Could not copy the URL. Select and copy it manually.', {
      exact: true,
    }),
  ).toBeVisible()
  await expect(failedUrl).toHaveValue(displayUrl)
  expect(await readPersistenceV2SavedTabsSnapshot(serviceWorker)).toEqual(
    original,
  )
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.screenshot({
    path: test.info().outputPath('single-url-opening-failure.png'),
    fullPage: true,
  })
  await page.reload()
  await expect(savedLink).toBeVisible()
  expect(await readPersistenceV2SavedTabsSnapshot(serviceWorker)).toEqual(
    original,
  )
  await savedLink.click()
  await expect(result).toContainText('0 / 1 URLs opened')
  await allowRetry(page)
  const openedPromise = extensionContext.waitForEvent('page')
  await result
    .getByRole('button', { name: 'Retry failed URLs', exact: true })
    .click()
  const opened = await openedPromise
  await expect(opened).toHaveTitle('Opened saved URL')
  await expect(result).toContainText('1 / 1 URLs opened')
  await expect(result.getByRole('textbox', { name: 'Failed URL' })).toHaveCount(
    0,
  )
  await expect(savedLink).toBeHidden()
  await expect
    .poll(
      async () =>
        (await readPersistenceV2SavedTabsSnapshot(serviceWorker)).urls,
    )
    .toEqual([])
  expect((await readOpeningCalls(page)).tabCalls).toEqual([savedUrl, savedUrl])
  expect(pageErrors).toEqual([])
})

test('bulk opening removes confirmed successes and retries only failed URLs', async ({
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
  const firstOpenedPromise = extensionContext.waitForEvent('page')
  await page
    .getByRole('button', {
      name: 'Open all tabs for "127.0.0.1"',
      exact: true,
    })
    .click()
  const firstOpened = await firstOpenedPromise
  await expect(firstOpened).toHaveURL(openedUrl)
  const result = page.getByRole('region', { name: 'URL opening result' })
  await expect(result).toContainText('1 / 2 URLs opened')
  await expect(result.getByRole('textbox', { name: 'Failed URL' })).toHaveValue(
    failedUrl,
  )
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
  await result
    .getByRole('button', { name: 'Retry failed URLs', exact: true })
    .click()
  const retried = await retriedPromise
  await expect(retried).toHaveURL(failedUrl)
  await expect(result.getByRole('textbox', { name: 'Failed URL' })).toHaveCount(
    0,
  )
  await expect
    .poll(
      async () =>
        (await readPersistenceV2SavedTabsSnapshot(serviceWorker)).urls,
    )
    .toEqual([])
  expect((await readOpeningCalls(page)).tabCalls).toEqual([
    openedUrl,
    failedUrl,
    failedUrl,
  ])
})

test('a rejected new window retains every saved URL and membership after reload', async ({
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
  const result = page.getByRole('region', { name: 'URL opening result' })
  await expect(result).toContainText('0 / 2 URLs opened')
  await expect(result).toContainText(
    'Could not confirm that the URL opened. Check your browser before retrying.',
  )
  await expect(result.getByRole('textbox', { name: 'Failed URL' })).toHaveCount(
    2,
  )
  expect(await readPersistenceV2SavedTabsSnapshot(serviceWorker)).toEqual(
    original,
  )
  expect(await readOpeningCalls(page)).toEqual({
    copiedUrls: [],
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

test('bulk progress can be cancelled, failed URLs retried, and unopened URLs resumed without duplicates', async ({
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
  const failedUrl = `${localOrigin}/staged-1`
  await installOpeningFailures(page, [failedUrl], false, urls.slice(2))
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
  const result = page.getByRole('region', { name: 'URL opening result' })
  await expect(result.getByRole('progressbar')).toHaveAttribute(
    'aria-valuenow',
    '2',
  )
  await expect(result).toContainText('1 opened, 1 failed')
  const requested = async () =>
    page.evaluate(
      () =>
        (globalThis as StagedOpeningRuntime).__tabbinStagedOpeningTest
          .requested,
    )
  await expect.poll(requested).toEqual(urls.slice(0, 7))
  await result
    .getByRole('button', { name: 'Cancel opening', exact: true })
    .click()
  await expect(
    result.getByRole('button', { name: 'Cancelling…', exact: true }),
  ).toBeDisabled()
  await page.evaluate(() => {
    const state = (globalThis as StagedOpeningRuntime).__tabbinStagedOpeningTest
    state.released = true
    for (const resolve of state.releasePending.splice(0)) {
      resolve()
    }
  })
  await expect(result.getByRole('progressbar')).toHaveCount(0)
  expect(await requested()).toEqual(urls.slice(0, 7))
  await expect
    .poll(async () =>
      (await readPersistenceV2SavedTabsSnapshot(serviceWorker)).urls
        .map(({ id }) => id)
        .toSorted((a, b) => a.localeCompare(b)),
    )
    .toEqual(
      [
        'opening-1',
        ...Array.from({ length: 5 }, (_, index) => `opening-${index + 7}`),
      ].toSorted(),
    )
  await page.setViewportSize({ width: 1280, height: 900 })
  const screenshot = test.info().outputPath('staged-opening-cancelled.png')
  await page.screenshot({ path: screenshot, fullPage: true })
  await test.info().attach('Staged opening cancelled', {
    path: screenshot,
    contentType: 'image/png',
  })
  await allowRetry(page)
  await result
    .getByRole('button', { name: 'Retry failed URLs', exact: true })
    .click()
  await expect.poll(requested).toEqual([...urls.slice(0, 7), failedUrl])
  await expect
    .poll(
      async () =>
        (await readPersistenceV2SavedTabsSnapshot(serviceWorker)).urls.length,
    )
    .toBe(5)
  await result
    .getByRole('button', { name: 'Resume unopened URLs', exact: true })
    .click()
  await expect
    .poll(requested)
    .toEqual([...urls.slice(0, 7), failedUrl, ...urls.slice(7)])
  await expect
    .poll(
      async () =>
        (await readPersistenceV2SavedTabsSnapshot(serviceWorker)).urls,
    )
    .toEqual([])
  expect((await readOpeningCalls(page)).tabCalls).toEqual([
    ...urls.slice(0, 7),
    failedUrl,
    ...urls.slice(7),
  ])
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
