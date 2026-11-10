import {
  createBaseSeed,
  defaultUserSettings,
  expect,
  readPersistenceV2SavedTabsSnapshot,
  seedStorage,
  test,
  triggerToolbarAction,
} from './helpers/extension'

const behaviors = [
  'saveCurrentTab',
  'saveSameDomainTabs',
  'saveWindowTabs',
  'saveAllWindowsTabs',
] as const

for (const clickBehavior of behaviors) {
  for (const failure of ['settings', 'filter', 'persistence'] as const) {
    test(`capture safety: ${clickBehavior} preserves tabs on ${failure} failure and can retry`, async ({
      extensionContext,
      extensionId,
      serviceWorker,
    }) => {
      const origin = 'https://capture-safety.example.test'
      await extensionContext.route(`${origin}/**`, async (route) => {
        await route.fulfill({
          contentType: 'text/html',
          body: '<!doctype html><title>Capture safety fixture</title>',
        })
      })
      await seedStorage(
        serviceWorker,
        createBaseSeed({
          userSettings: {
            ...defaultUserSettings,
            clickBehavior,
            excludePatterns: [
              ...defaultUserSettings.excludePatterns,
              '/excluded',
            ],
          },
        }),
      )
      const pinned = await extensionContext.newPage()
      await pinned.goto(`${origin}/pinned`)
      const excluded = await extensionContext.newPage()
      await excluded.goto(`${origin}/excluded`)
      const source = await extensionContext.newPage()
      await source.goto(`${origin}/source`)
      await serviceWorker.evaluate(async (url) => {
        const [tab] = await chrome.tabs.query({ url })
        if (tab?.id === undefined) {
          throw new Error('Pinned fixture is unavailable')
        }
        await chrome.tabs.update(tab.id, { pinned: true })
      }, pinned.url())
      await source.bringToFront()
      const beforeTabs = await serviceWorker.evaluate(async () =>
        (await chrome.tabs.query({})).map(({ id, url, pinned }) => ({
          id,
          url,
          pinned,
        })),
      )
      const beforeSaved =
        await readPersistenceV2SavedTabsSnapshot(serviceWorker)
      const injection = await serviceWorker.evaluateHandle((kind) => {
        const originals = {
          get: chrome.storage.local.get,
          query: chrome.tabs.query,
          getAll: chrome.windows.getAll,
          transaction: IDBDatabase.prototype.transaction,
          notify: chrome.notifications.create,
          remove: chrome.tabs.remove,
        }
        const notifications: { title: string; message: string }[] = []
        let removals = 0
        let writes = 0
        Object.defineProperty(chrome.notifications, 'create', {
          configurable: true,
          value: async (options: chrome.notifications.NotificationOptions) => {
            notifications.push({
              title: options.title ?? '',
              message: options.message ?? '',
            })
            return 'capture-safety'
          },
        })
        Object.defineProperty(chrome.tabs, 'remove', {
          configurable: true,
          value: (...args: unknown[]) => {
            removals += 1
            return Reflect.apply(originals.remove, chrome.tabs, args)
          },
        })
        if (kind === 'settings') {
          Object.defineProperty(chrome.storage.local, 'get', {
            configurable: true,
            value: async () => {
              throw new Error('Injected settings failure')
            },
          })
        }
        if (kind === 'filter') {
          const failFiltering = (tabs: chrome.tabs.Tab[]) =>
            tabs.map((tab) =>
              Object.defineProperty(tab, 'pinned', {
                get: () => {
                  throw new Error('Injected filtering failure')
                },
              }),
            )
          Object.defineProperty(chrome.tabs, 'query', {
            configurable: true,
            value: async (query: chrome.tabs.QueryInfo) =>
              failFiltering(await originals.query(query)),
          })
          Object.defineProperty(chrome.windows, 'getAll', {
            configurable: true,
            value: async (options: chrome.windows.QueryOptions) =>
              (await originals.getAll(options)).map((window) => ({
                ...window,
                tabs: failFiltering(window.tabs ?? []),
              })),
          })
        }
        Object.defineProperty(IDBDatabase.prototype, 'transaction', {
          configurable: true,
          value(this: IDBDatabase, ...args: unknown[]) {
            const transaction: IDBTransaction = Reflect.apply(
              originals.transaction,
              this,
              args,
            )
            if (args[1] === 'readwrite') {
              writes += 1
              if (kind === 'persistence') {
                transaction.abort()
              }
            }
            return transaction
          },
        })
        return {
          notifications,
          inspect: () => ({ notifications, removals, writes }),
          restore: () => {
            Object.defineProperty(chrome.storage.local, 'get', {
              value: originals.get,
            })
            Object.defineProperty(chrome.tabs, 'query', {
              value: originals.query,
            })
            Object.defineProperty(chrome.windows, 'getAll', {
              value: originals.getAll,
            })
            Object.defineProperty(chrome.notifications, 'create', {
              value: originals.notify,
            })
            Object.defineProperty(chrome.tabs, 'remove', {
              value: originals.remove,
            })
            Object.defineProperty(IDBDatabase.prototype, 'transaction', {
              value: originals.transaction,
            })
          },
        }
      }, failure)
      try {
        await triggerToolbarAction(extensionContext, source, extensionId)
        await expect
          .poll(async () =>
            injection.evaluate((state) => state.notifications.length),
          )
          .toBe(1)
        const result = await injection.evaluate((state) => state.inspect())
        expect(result.removals).toBe(0)
        expect(result.writes).toBe(failure === 'persistence' ? 1 : 0)
        const titles = {
          settings: 'Settings could not be verified',
          filter: 'Tabs were not saved',
          persistence: 'Could not complete saving tabs',
        }
        expect(result.notifications[0]?.title).toBe(titles[failure])
      } finally {
        await injection.evaluate((state) => state.restore())
        await injection.dispose()
      }
      expect(
        await serviceWorker.evaluate(async () =>
          (await chrome.tabs.query({})).map(({ id, url, pinned }) => ({
            id,
            url,
            pinned,
          })),
        ),
      ).toEqual(beforeTabs)
      expect(await readPersistenceV2SavedTabsSnapshot(serviceWorker)).toEqual(
        beforeSaved,
      )

      const closed = source.waitForEvent('close')
      await triggerToolbarAction(extensionContext, source, extensionId)
      await closed
      expect(pinned.isClosed()).toBe(false)
      expect(excluded.isClosed()).toBe(false)
      const saved = await readPersistenceV2SavedTabsSnapshot(serviceWorker)
      expect(saved.urls.map(({ url }) => url)).toContain(`${origin}/source`)
      expect(saved.urls.map(({ url }) => url)).not.toContain(`${origin}/pinned`)
      expect(saved.urls.map(({ url }) => url)).not.toContain(
        `${origin}/excluded`,
      )
    })
  }
}
