import { createServer } from 'node:http'

import type { Worker } from '@playwright/test'

import {
  createBaseSeed,
  defaultUserSettings,
  expect,
  getExtensionUrl,
  readPersistenceV2SavedTabsSnapshot,
  seedStorage,
  test,
} from './helpers/extension'

const pathToken = 'ctx-link-1030'
const fixtureHtml = `<!doctype html><meta charset="utf-8">
<title>Link context menu fixture</title>
<a id="target" href="/${pathToken}/article?from=menu">Open article</a>`

const startFixtureServer = async () => {
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    response.end(fixtureHtml)
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Link fixture server unavailable')
  }
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: async () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
        server.closeAllConnections()
      }),
  }
}

const readTabs = async (worker: Worker) =>
  worker.evaluate(async () =>
    (await chrome.tabs.query({}))
      .map(({ id, pinned, url }) => ({ id, pinned, url }))
      .toSorted((left, right) => (left.id ?? 0) - (right.id ?? 0)),
  )

const dispatchSaveLink = async (
  worker: Worker,
  info: { linkUrl: string; pageUrl: string },
) =>
  worker.evaluate(async ({ linkUrl, pageUrl }) => {
    // Chromium exposes dispatch on extension events. It runs the real
    // listener registered by the built extension without native menu UI.
    const event = chrome.contextMenus.onClicked as unknown as {
      dispatch?: (
        data: chrome.contextMenus.OnClickData,
        tab?: chrome.tabs.Tab,
      ) => void
    }
    if (typeof event.dispatch !== 'function') {
      throw new TypeError('contextMenus.onClicked.dispatch is unavailable')
    }
    event.dispatch({
      editable: false,
      frameId: 0,
      linkUrl,
      menuItemId: 'saveLinkToTabbin',
      pageUrl,
    })
  }, info)

test('link context menu saves only the target URL and restores it after reload', async ({
  extensionId,
  page,
  serviceWorker,
}) => {
  const fixture = await startFixtureServer()
  try {
    await seedStorage(
      serviceWorker,
      createBaseSeed({
        userSettings: {
          ...defaultUserSettings,
          excludePatterns: [
            ...defaultUserSettings.excludePatterns,
            '/excluded',
          ],
        },
      }),
    )

    const pageUrl = `${fixture.origin}/${pathToken}/source`
    const linkUrl = `${fixture.origin}/${pathToken}/article?from=menu`
    const expectedTitle = `${fixture.origin.replace('http://', '')}/${pathToken}/article?from=menu`
    await page.goto(pageUrl)
    await expect(page.locator('#target')).toBeVisible()
    const tabsBefore = await readTabs(serviceWorker)

    await dispatchSaveLink(serviceWorker, { linkUrl, pageUrl })

    await expect
      .poll(async () =>
        (await readPersistenceV2SavedTabsSnapshot(serviceWorker)).urls.map(
          ({ url }) => url,
        ),
      )
      .toEqual([linkUrl])

    const snapshot = await readPersistenceV2SavedTabsSnapshot(serviceWorker)
    expect(snapshot.urls).toHaveLength(1)
    expect(snapshot.urls[0]).toMatchObject({
      title: expectedTitle,
      url: linkUrl,
    })
    expect(snapshot.urls.some(({ url }) => url === pageUrl)).toBe(false)
    expect(await readTabs(serviceWorker)).toEqual(tabsBefore)

    await page.goto(getExtensionUrl(extensionId, 'app.html#/saved-tabs'))
    await page.reload()
    const search = page.getByRole('textbox', { name: 'Search', exact: true })
    await search.fill(pathToken)
    const restored = page.getByRole('link', {
      name: expectedTitle,
      exact: true,
    })
    await expect(restored).toBeVisible()

    await restored.click()
    await expect
      .poll(async () =>
        serviceWorker.evaluate(
          async (url) =>
            (await chrome.tabs.query({})).some(
              (tab) => (tab.url ?? tab.pendingUrl) === url,
            ),
          linkUrl,
        ),
      )
      .toBe(true)
  } finally {
    await fixture.close()
  }
})
