import { expect, getExtensionUrl, test } from './helpers/extension'
import { currentWorker, stopWorker } from './helpers/worker-lifecycle'

test('context menus survive an MV3 worker wake and recover a missing action without removeAll', async ({
  extensionContext,
  extensionId,
  page,
  serviceWorker,
}) => {
  await page.goto(getExtensionUrl(extensionId, 'app.html#/saved-tabs'))
  const ids = [
    'openSavedTabs',
    'sepOpenSavedTabs',
    'saveCurrentTab',
    'saveAllTabs',
    'saveSameDomainTabs',
    'saveAllWindowsTabs',
  ]
  await expect
    .poll(async () =>
      serviceWorker.evaluate(async (menuIds) => {
        const results = await Promise.all(
          menuIds.map(
            async (id) =>
              new Promise<boolean>((resolve) => {
                chrome.contextMenus.update(id, {}, () =>
                  resolve(!chrome.runtime.lastError),
                )
              }),
          ),
        )
        return results.every(Boolean)
      }, ids),
    )
    .toBe(true)
  expect(
    await serviceWorker.evaluate(() =>
      chrome.contextMenus.onClicked.hasListeners(),
    ),
  ).toBe(true)
  await serviceWorker.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      chrome.contextMenus.create(
        {
          id: 'worker-lifecycle-sentinel',
          title: 'Worker lifecycle sentinel',
          contexts: ['page'],
        },
        () => {
          if (chrome.runtime.lastError) {
            reject(new Error('Sentinel creation failed'))
          } else {
            resolve()
          }
        },
      )
    })
    await chrome.contextMenus.remove('saveCurrentTab')
    Object.assign(globalThis, { __tabbinWorkerLifetimeMarker: 'before-stop' })
  })
  const cdp = await stopWorker(extensionContext, page, serviceWorker)
  try {
    await page.evaluate(async () =>
      chrome.runtime.sendMessage({ action: 'getAlarmStatus' }),
    )
    const restarted = await currentWorker(extensionContext, serviceWorker.url())
    expect(
      await restarted.evaluate(() =>
        chrome.contextMenus.onClicked.hasListeners(),
      ),
    ).toBe(true)
    // A full removal/recreation on wake would also delete the sentinel. Checking
    // real browser IDs covers menu persistence without invoking a fake click.
    await expect
      .poll(async () =>
        restarted.evaluate(
          async (menuIds) => {
            const results = await Promise.all(
              menuIds.map(
                async (id) =>
                  new Promise<boolean>((resolve) => {
                    chrome.contextMenus.update(id, {}, () =>
                      resolve(!chrome.runtime.lastError),
                    )
                  }),
              ),
            )
            return results.every(Boolean)
          },
          [...ids, 'worker-lifecycle-sentinel'],
        ),
      )
      .toBe(true)
  } finally {
    await cdp.detach()
  }
})
