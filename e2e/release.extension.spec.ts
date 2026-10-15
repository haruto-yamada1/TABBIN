import { createServer } from 'node:http'

import { createEmptyPersistenceFixture } from '@/test/fixtures/persistenceBrowserFixtures'

import {
  createBaseSeed,
  defaultUserSettings,
  expect,
  getExtensionUrl,
  readPersistenceV2SavedTabsSnapshot,
  seedSavedTabsFixture,
  test as extensionTest,
  triggerToolbarAction,
} from './helpers/extension'

const test = extensionTest.extend<{ savedUrl: string }>({
  savedUrl: async ({ extensionContext }, runFixture) => {
    void extensionContext
    const server = createServer((_request, response) => {
      response.setHeader('Content-Type', 'text/html')
      response.end(
        '<title>Release saved tab</title><p>Local release fixture</p>',
      )
    })
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })
    try {
      const address = server.address()
      if (!address || typeof address === 'string') {
        throw new Error('Release fixture server did not bind a TCP port')
      }
      await runFixture(`http://127.0.0.1:${address.port}/critical-flow`)
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
        server.closeAllConnections()
      })
    }
  },
})

test(
  'saved tab survives reload, search, and opening',
  { tag: '@release-saved-tabs' },
  async ({ extensionContext, extensionId, page, savedUrl, serviceWorker }) => {
    await seedSavedTabsFixture(serviceWorker, {
      persistence: createEmptyPersistenceFixture(),
      storage: createBaseSeed({
        userSettings: {
          ...defaultUserSettings,
          clickBehavior: 'saveCurrentTab',
        },
      }),
    })
    const source = await extensionContext.newPage()
    await source.goto(savedUrl)
    await source.bringToFront()
    await triggerToolbarAction(extensionContext, source, extensionId)
    await page.goto(
      getExtensionUrl(extensionId, 'app.html#/saved-tabs?mode=domain'),
    )
    const savedLink = page.getByRole('link', { name: 'Release saved tab' })
    await expect(savedLink).toBeVisible()
    await page.reload()
    await expect(savedLink).toBeVisible()
    const search = page.getByRole('textbox', { name: 'Search', exact: true })
    await search.fill('not-present-in-saved-tabs')
    await expect(savedLink).toBeHidden()
    await search.fill('critical-flow')
    await expect(savedLink).toBeVisible()
    const openedPromise = extensionContext.waitForEvent('page')
    await savedLink.click()
    const opened = await openedPromise
    await expect(opened).toHaveURL(savedUrl)
    await expect(opened).toHaveTitle('Release saved tab')
    // Default remove-after-open must persist the removal, including after reload.
    await expect(savedLink).toBeHidden()
    await expect
      .poll(
        async () =>
          (await readPersistenceV2SavedTabsSnapshot(serviceWorker)).urls,
      )
      .toEqual([])
    await page.reload()
    await expect(savedLink).toBeHidden()
  },
)
