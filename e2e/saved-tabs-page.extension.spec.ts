import {
  createBaseSeed,
  defaultUserSettings,
  expect,
  getExtensionUrl,
  seedStorage,
  test,
  triggerToolbarAction,
} from './helpers/extension'

const fixtureOrigin = 'https://saved-tabs-reuse.example.test'

for (const pathname of [
  'saved-tabs.html',
  'app.html#/saved-tabs?mode=custom',
]) {
  test(`toolbar reuses ${pathname} and leaves navigated and same-name web tabs alone`, async ({
    extensionContext,
    extensionId,
    serviceWorker,
  }) => {
    await extensionContext.route(`${fixtureOrigin}/**`, async (route) => {
      await route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><title>Saved Tabs reuse fixture</title>',
      })
    })
    await seedStorage(
      serviceWorker,
      createBaseSeed({
        userSettings: {
          ...defaultUserSettings,
          clickBehavior: 'saveWindowTabs',
          excludePatterns: [
            ...defaultUserSettings.excludePatterns,
            `${fixtureOrigin}/saved-tabs.html`,
            `${fixtureOrigin}/app.html`,
          ],
        },
      }),
    )

    const initial = await serviceWorker.evaluate(async () => {
      const tabs = await chrome.tabs.query({})
      const existing = tabs.find((tab) => {
        const url = tab.pendingUrl ?? tab.url
        if (!url) {
          return false
        }
        return (
          url.startsWith(chrome.runtime.getURL('saved-tabs.html')) ||
          url.startsWith(chrome.runtime.getURL('app.html#/saved-tabs'))
        )
      })
      if (existing?.id === undefined) {
        throw new Error('Installation did not open the initial Saved Tabs tab.')
      }
      return existing.id
    })
    const requestedUrl = getExtensionUrl(extensionId, pathname)
    const routeUrl = getExtensionUrl(
      extensionId,
      pathname === 'saved-tabs.html'
        ? 'app.html#/saved-tabs?mode=domain'
        : pathname,
    )
    await serviceWorker.evaluate(
      async ({ id, url }) => {
        await chrome.tabs.update(id, { url, pinned: false })
      },
      { id: initial, url: requestedUrl },
    )
    await expect
      .poll(async () =>
        serviceWorker.evaluate(
          async (id) => (await chrome.tabs.get(id)).url,
          initial,
        ),
      )
      .toBe(routeUrl)

    const saveAndOpen = async (name: string) => {
      const source = await extensionContext.newPage()
      await source.goto(`${fixtureOrigin}/capture-${name}`)
      const closed = source.waitForEvent('close')
      await triggerToolbarAction(extensionContext, source, extensionId)
      await closed
    }
    await saveAndOpen('reuse')
    expect(
      await serviceWorker.evaluate(async (id) => {
        const current = await chrome.tabs.get(id)
        return { id: current.id, pinned: current.pinned, url: current.url }
      }, initial),
    ).toEqual({ id: initial, pinned: true, url: routeUrl })

    // Keep the cached ID alive, but navigate it to a same-name HTTPS page.
    const navigatedUrl = `${fixtureOrigin}/saved-tabs.html`
    // Move through about:blank so the network guard observes this as a
    // navigation from a web tab rather than extension-origin network traffic.
    await serviceWorker.evaluate(async (id) => {
      await chrome.tabs.update(id, { pinned: false, url: 'about:blank' })
    }, initial)
    await expect
      .poll(async () =>
        serviceWorker.evaluate(
          async (id) => (await chrome.tabs.get(id)).url,
          initial,
        ),
      )
      .toBe('about:blank')
    await serviceWorker.evaluate(
      async ({ id, url }) => {
        await chrome.tabs.update(id, { url })
      },
      { id: initial, url: navigatedUrl },
    )
    const otherWebPage = await extensionContext.newPage()
    await otherWebPage.goto(`${fixtureOrigin}/app.html#/saved-tabs?mode=custom`)
    const valid = await extensionContext.newPage()
    await valid.goto(requestedUrl)
    await expect(valid).toHaveURL(routeUrl)
    const duplicate = await extensionContext.newPage()
    await duplicate.goto(getExtensionUrl(extensionId, 'saved-tabs.html'))
    const validId = await serviceWorker.evaluate(async (url) => {
      const tabs = await chrome.tabs.query({})
      const current = tabs.find((tab) => tab.url === url)
      if (current?.id === undefined) {
        throw new Error('Expected Saved Tabs candidate is unavailable.')
      }
      return current.id
    }, routeUrl)

    await saveAndOpen('navigation')
    await expect.poll(() => duplicate.isClosed()).toBe(true)
    expect(otherWebPage.isClosed()).toBe(false)
    expect(
      await serviceWorker.evaluate(
        async ({ initialId, mainId }) => {
          const navigated = await chrome.tabs.get(initialId)
          const main = await chrome.tabs.get(mainId)
          return {
            navigated: {
              id: navigated.id,
              url: navigated.url,
              pinned: navigated.pinned,
              active: navigated.active,
            },
            main: { id: main.id, url: main.url, pinned: main.pinned },
          }
        },
        { initialId: initial, mainId: validId },
      ),
    ).toEqual({
      navigated: {
        id: initial,
        url: navigatedUrl,
        pinned: false,
        active: false,
      },
      main: { id: validId, url: routeUrl, pinned: true },
    })
    await expect(valid).toHaveURL(routeUrl)
    await expect(otherWebPage).toHaveURL(
      `${fixtureOrigin}/app.html#/saved-tabs?mode=custom`,
    )
  })
}
