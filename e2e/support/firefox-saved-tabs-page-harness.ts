import {
  openSavedTabsPage,
  resetSavedTabsPageId,
} from '@/lib/background/saved-tabs-page'

export type FirefoxSavedTabsPageSmokeResult = {
  readonly scenarios: readonly {
    readonly requestedPath: string
    readonly mainId: number
    readonly concurrentIds: readonly (number | null)[]
    readonly reusedId: number | null
    readonly mainPinned: boolean
    readonly duplicateRemoved: boolean
    readonly fakeUntouched: boolean
    readonly navigatedUntouched: boolean
    readonly replacementId: number | null
    readonly replacementIsSavedTabsPage: boolean
  }[]
}

const waitForRoute = async (id: number, expectedUrl: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const inspect = (tab: Pick<chrome.tabs.Tab, 'id' | 'url'>) => {
      if (tab.id === id && tab.url?.startsWith(expectedUrl)) {
        browser.tabs.onUpdated.removeListener(onUpdated)
        resolve()
      }
    }
    const onUpdated: Parameters<
      typeof browser.tabs.onUpdated.addListener
    >[0] = (tabId, _change, tab) => {
      if (tabId === id) {
        inspect(tab)
      }
    }
    browser.tabs.onUpdated.addListener(onUpdated)
    void browser.tabs
      .get(id)
      .then(inspect)
      .catch((error: unknown) => {
        browser.tabs.onUpdated.removeListener(onUpdated)
        reject(error instanceof Error ? error : new Error(String(error)))
      })
  })

export const runFirefoxSavedTabsPageSmoke =
  async (): Promise<FirefoxSavedTabsPageSmokeResult> => {
    const ownedIds = new Set<number>()
    const trackCreated = (tab: Pick<chrome.tabs.Tab, 'id'>) => {
      if (tab.id !== undefined) {
        ownedIds.add(tab.id)
      }
    }
    browser.tabs.onCreated.addListener(trackCreated)
    const create = async (url: string) => {
      // Firefox inserts a new inactive tab after the active tab by default.
      // Append fixtures explicitly so query order identifies the intended main.
      const index = (await browser.tabs.query({ currentWindow: true })).length
      const tab = await browser.tabs.create({ url, active: false, index })
      if (tab.id === undefined) {
        throw new Error('Firefox did not return a fixture tab ID.')
      }
      ownedIds.add(tab.id)
      return tab.id
    }
    const scenarios: FirefoxSavedTabsPageSmokeResult['scenarios'][number][] = []
    try {
      for (const requestedPath of [
        'saved-tabs.html',
        'app.html#/saved-tabs?mode=custom',
      ]) {
        // Each scenario owns and removes only the native tabs it creates.
        // eslint-disable-next-line eslint/no-await-in-loop -- Native tab lifecycle scenarios must run sequentially.
        const scenario = await (async () => {
          let stage = 'prepare'
          try {
            resetSavedTabsPageId()
            const fakeUrl = 'https://example.com/saved-tabs.html'
            stage = 'create fake'
            const fakeId = await create(fakeUrl)
            await waitForRoute(fakeId, fakeUrl)
            stage = 'create main'
            const mainId = await create(chrome.runtime.getURL(requestedPath))
            const route = chrome.runtime.getURL('app.html#/saved-tabs')
            await waitForRoute(mainId, route)
            stage = 'create duplicate'
            const duplicateId = await create(
              chrome.runtime.getURL(requestedPath),
            )
            await waitForRoute(duplicateId, route)
            stage = 'open concurrent'
            const concurrentIds = await Promise.all([
              openSavedTabsPage(),
              openSavedTabsPage(),
              openSavedTabsPage(),
            ])
            stage = 'reuse'
            const reusedId = await openSavedTabsPage()
            const tabs = await browser.tabs.query({})
            const fake = tabs.find((tab) => tab.id === fakeId)
            stage = 'read main'
            const main = await browser.tabs.get(mainId)
            const fakeUntouched =
              fake?.url === fakeUrl && !fake.pinned && !fake.active
            const duplicateRemoved = !tabs.some((tab) => tab.id === duplicateId)
            const navigatedUrl =
              'https://example.com/app.html#/saved-tabs?mode=custom'
            stage = 'navigate main'
            await browser.tabs.update(mainId, {
              url: navigatedUrl,
              pinned: false,
            })
            await waitForRoute(mainId, navigatedUrl)
            stage = 'open replacement'
            const replacementId = await openSavedTabsPage()
            if (replacementId !== null) {
              await waitForRoute(replacementId, route)
            }
            stage = 'read navigated'
            const navigated = await browser.tabs.get(mainId)
            stage = 'read replacement'
            const replacement =
              replacementId === null
                ? null
                : await browser.tabs.get(replacementId)
            return {
              requestedPath,
              mainId,
              concurrentIds,
              reusedId,
              mainPinned: main.pinned,
              duplicateRemoved,
              fakeUntouched,
              navigatedUntouched:
                navigated.url === navigatedUrl &&
                !navigated.pinned &&
                !navigated.active,
              replacementId,
              replacementIsSavedTabsPage:
                replacement?.url?.startsWith(
                  chrome.runtime.getURL('saved-tabs.html'),
                ) === true || replacement?.url?.startsWith(route) === true,
            }
          } catch (error) {
            const tabs = await browser.tabs.query({})
            throw new Error(
              `${requestedPath} ${stage}: ${String(error)}; tabs=${JSON.stringify(tabs.map(({ id, url, pinned }) => ({ id, url, pinned })))}`,
              { cause: error },
            )
          }
        })()
        scenarios.push(scenario)
        // eslint-disable-next-line eslint/no-await-in-loop -- Remove this scenario's owned tabs before the next lookup.
        await browser.tabs.remove(
          // eslint-disable-next-line eslint/no-await-in-loop -- Read live IDs so already-removed duplicates are not removed again.
          (await browser.tabs.query({})).flatMap((tab) =>
            tab.id !== undefined && ownedIds.has(tab.id) ? [tab.id] : [],
          ),
        )
      }
      return { scenarios }
    } finally {
      browser.tabs.onCreated.removeListener(trackCreated)
      resetSavedTabsPageId()
      const remaining = (await browser.tabs.query({})).flatMap((tab) =>
        tab.id !== undefined && ownedIds.has(tab.id) ? [tab.id] : [],
      )
      if (remaining.length > 0) {
        await browser.tabs.remove(remaining)
      }
    }
  }
