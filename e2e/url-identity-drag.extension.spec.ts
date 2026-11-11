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
  test,
} from './helpers/extension'
import { currentWorker, stopWorker } from './helpers/worker-lifecycle'

const variants = [
  { id: 'root', url: 'https://example.com' },
  { id: 'slash', url: 'https://example.com/' },
  { id: 'host-case', url: 'https://Example.com/' },
  { id: 'encoded', url: 'https://example.com/%7euser' },
  { id: 'decoded', url: 'https://example.com/~user' },
  { id: 'saved-route', url: 'https://example.com/page?mode=edit#/saved' },
  { id: 'other-route', url: 'https://example.com/page?mode=edit#/other' },
  { id: 'other-query', url: 'https://example.com/page?mode=view#/saved' },
] as const

const createIdentitySeed = () => ({
  storage: createBaseSeed(),
  persistence: {
    categories: [
      {
        collectionId: 'identity-domain',
        createdAt: 1,
        id: 'identity-category',
        keywords: [],
        name: 'Identity fixtures',
        sortOrder: 0,
        updatedAt: 1,
      },
    ],
    collections: [
      createDomainCollectionFixture('identity-domain', 'example.com', 1),
    ],
    groups: [],
    memberships: variants.map(({ id }, index) => ({
      ...createMembershipFixture('identity-domain', id, 1, index),
      categoryId: 'identity-category',
    })),
    urls: variants.map(({ id, url }) => createUrlFixture(id, url, id, 1)),
  },
})

type DragIdentity = {
  readonly url: string
  readonly urlRecordId?: string
  readonly dragId?: string
}

const sendDrop = async (
  page: Page,
  identity: DragIdentity,
  fromExternal = true,
) =>
  page.evaluate(
    async (message) =>
      chrome.runtime.sendMessage({ action: 'urlDropped', ...message }),
    { ...identity, fromExternal },
  )

const startDrag = async (page: Page, identity: DragIdentity) =>
  page.evaluate(
    async (message) =>
      chrome.runtime.sendMessage({ action: 'urlDragStarted', ...message }),
    identity,
  )

const rootDrag: DragIdentity = {
  url: variants[0].url,
  urlRecordId: variants[0].id,
  dragId: 'identity-root-drag',
}

const routeDrag: DragIdentity = {
  url: variants[5].url,
  urlRecordId: variants[5].id,
  dragId: 'identity-route-drag',
}

const replaceRootId = (id: string) => {
  const seed = createIdentitySeed()
  return {
    ...seed,
    persistence: {
      ...seed.persistence,
      memberships: seed.persistence.memberships.map((membership) =>
        membership.urlId === 'root' ? { ...membership, urlId: id } : membership,
      ),
      urls: seed.persistence.urls.map((url) =>
        url.id === 'root' ? { ...url, id } : url,
      ),
    },
  }
}

test.describe('exact URL identity across the drag and persistence boundary', () => {
  test('legacy URL deletion preserves slash, host case, encoding and route siblings', async ({
    extensionId,
    page,
    serviceWorker,
  }) => {
    const seed = createIdentitySeed()
    await seedSavedTabsFixture(serviceWorker, seed)
    await page.goto(getExtensionUrl(extensionId, 'app.html#/saved-tabs'))
    await expect(
      page.getByRole('link', { name: 'root', exact: true }),
    ).toBeVisible()

    for (const target of [variants[0], variants[2], variants[3], variants[5]]) {
      // eslint-disable-next-line no-await-in-loop -- Each baseline follows the preceding committed deletion.
      const before = await readPersistenceV2SavedTabsSnapshot(serviceWorker)
      // Each request must retain the original string, not the browser's href.
      // eslint-disable-next-line no-await-in-loop -- Deletions and their committed snapshots are observed in order.
      await page.evaluate(
        async (url) =>
          chrome.runtime.sendMessage({ action: 'removeUrlFromStorage', url }),
        target.url,
      )
      // eslint-disable-next-line no-await-in-loop -- The next deletion starts only after the previous transaction committed.
      const after = await readPersistenceV2SavedTabsSnapshot(serviceWorker)
      expect(after.urls).toEqual(
        before.urls.filter(({ id }) => id !== target.id),
      )
      expect(after.memberships).toEqual(
        before.memberships.filter(({ urlId }) => urlId !== target.id),
      )
      expect(after.categories).toEqual(before.categories)
      expect(after.collections).toEqual(before.collections)
      expect(after.groups).toEqual(before.groups)
    }
  })

  test('DOM drag deletes only the original saved URL and a duplicate drop preserves a re-saved record', async ({
    extensionId,
    page,
    serviceWorker,
  }) => {
    const seed = createIdentitySeed()
    await seedSavedTabsFixture(serviceWorker, seed)
    await page.goto(getExtensionUrl(extensionId, 'app.html#/saved-tabs'))
    const link = page.getByRole('link', { name: 'root', exact: true })
    await expect(link).toBeVisible()
    const before = await readPersistenceV2SavedTabsSnapshot(serviceWorker)
    const dataTransfer = await page.evaluateHandle(() => {
      const transfer = new DataTransfer()
      // Synthetic transfers have a read-only native drop effect; provide the external-drop fixture explicitly.
      Object.defineProperty(transfer, 'dropEffect', { value: 'copy' })
      return transfer
    })
    await link.dispatchEvent('dragstart', { dataTransfer })
    await link.dispatchEvent('dragend', { dataTransfer })
    await expect(link).toBeHidden()
    const after = await readPersistenceV2SavedTabsSnapshot(serviceWorker)
    expect(after.urls).toEqual(before.urls.filter(({ id }) => id !== 'root'))
    expect(after.memberships).toEqual(
      before.memberships.filter(({ urlId }) => urlId !== 'root'),
    )
    expect(after.categories).toEqual(before.categories)
    expect(after.collections).toEqual(before.collections)

    await seedSavedTabsFixture(serviceWorker, replaceRootId('root-resaved'))
    const resaved = await readPersistenceV2SavedTabsSnapshot(serviceWorker)
    expect(await sendDrop(page, rootDrag)).toMatchObject({
      status: 'skipped',
    })
    expect(await readPersistenceV2SavedTabsSnapshot(serviceWorker)).toEqual(
      resaved,
    )
  })

  test('currently open URL rows retain their persistence ID through the real DOM drag messages', async ({
    extensionContext,
    extensionId,
    page,
    serviceWorker,
  }) => {
    await extensionContext.route('https://example.com/**', async (route) => {
      await route.fulfill({
        contentType: 'text/html',
        body: '<title>Currently open saved route</title>',
      })
    })
    const seed = createIdentitySeed()
    await seedSavedTabsFixture(serviceWorker, {
      ...seed,
      storage: createBaseSeed({
        userSettings: { ...defaultUserSettings, showOpenTabs: true },
      }),
    })
    const opened = await extensionContext.newPage()
    try {
      await opened.goto(variants[5].url)
      await page.goto(getExtensionUrl(extensionId, 'app.html#/saved-tabs'))
      const target = page.getByTestId('open-tabs-section').getByRole('link', {
        name: 'saved-route',
        exact: true,
      })
      await expect(target).toBeVisible()
      const before = await readPersistenceV2SavedTabsSnapshot(serviceWorker)
      await serviceWorker.evaluate(() => {
        const messages: unknown[] = []
        Object.assign(globalThis, { __tabbinOpenTabsDragMessages: messages })
        chrome.runtime.onMessage.addListener((message: unknown) => {
          if (typeof message === 'object' && message !== null) {
            const action: unknown = Reflect.get(message, 'action')
            if (action === 'urlDragStarted' || action === 'urlDropped') {
              messages.push(message)
            }
          }
          return false
        })
      })
      const dataTransfer = await page.evaluateHandle(() => {
        const transfer = new DataTransfer()
        Object.defineProperty(transfer, 'dropEffect', { value: 'copy' })
        return transfer
      })
      await target.dispatchEvent('dragstart', { dataTransfer })
      await target.dispatchEvent('dragend', { dataTransfer })
      const readMessages = async () =>
        serviceWorker.evaluate(() => {
          const messages: unknown = Reflect.get(
            globalThis,
            '__tabbinOpenTabsDragMessages',
          )
          if (!Array.isArray(messages)) {
            throw new TypeError('Open-tabs drag event observer is unavailable.')
          }
          return messages.map((message: unknown) => {
            if (typeof message !== 'object' || message === null) {
              throw new TypeError('Open-tabs drag event is not an object.')
            }
            return {
              action: Reflect.get(message, 'action'),
              dragId: Reflect.get(message, 'dragId'),
              url: Reflect.get(message, 'url'),
              urlRecordId: Reflect.get(message, 'urlRecordId'),
            }
          })
        })
      await expect.poll(readMessages).toEqual([
        {
          action: 'urlDragStarted',
          dragId: expect.any(String),
          url: variants[5].url,
          urlRecordId: 'saved-route',
        },
        {
          action: 'urlDropped',
          dragId: expect.any(String),
          url: variants[5].url,
          urlRecordId: 'saved-route',
        },
      ])
      const messages = await readMessages()
      expect(messages[0]?.dragId).toBe(messages[1]?.dragId)
      await expect(target).toBeHidden()
      const after = await readPersistenceV2SavedTabsSnapshot(serviceWorker)
      expect(after.urls).toEqual(
        before.urls.filter(({ id }) => id !== 'saved-route'),
      )
      expect(after.memberships).toEqual(
        before.memberships.filter(({ urlId }) => urlId !== 'saved-route'),
      )
      expect(after.categories).toEqual(before.categories)
      expect(after.collections).toEqual(before.collections)
      expect(after.groups).toEqual(before.groups)
    } finally {
      await opened.close()
    }
  })

  test('a different hash or query in a DOM drop cannot remove the active drag target', async ({
    extensionId,
    page,
    serviceWorker,
  }) => {
    await seedSavedTabsFixture(serviceWorker, createIdentitySeed())
    await page.goto(getExtensionUrl(extensionId, 'app.html#/saved-tabs'))
    await expect(
      page.getByRole('link', { name: 'saved-route', exact: true }),
    ).toBeVisible()
    const before = await readPersistenceV2SavedTabsSnapshot(serviceWorker)
    await startDrag(page, routeDrag)
    expect(
      await sendDrop(page, { ...routeDrag, url: variants[6].url }),
    ).toMatchObject({
      status: 'skipped',
    })
    expect(
      await sendDrop(page, { ...routeDrag, url: variants[7].url }),
    ).toMatchObject({
      status: 'skipped',
    })
    expect(await readPersistenceV2SavedTabsSnapshot(serviceWorker)).toEqual(
      before,
    )
  })

  test('pending native tab events preserve data until the original DOM drop confirms the drag', async ({
    extensionContext,
    extensionId,
    page,
    serviceWorker,
  }) => {
    await extensionContext.route('https://example.com/**', async (route) => {
      await route.fulfill({
        contentType: 'text/html',
        body: '<title>Drag target</title>',
      })
    })
    await seedSavedTabsFixture(serviceWorker, createIdentitySeed())
    await page.goto(getExtensionUrl(extensionId, 'app.html#/saved-tabs'))
    const target = page.getByRole('link', { name: 'saved-route', exact: true })
    await expect(target).toBeVisible()
    const before = await readPersistenceV2SavedTabsSnapshot(serviceWorker)
    const dataTransfer = await page.evaluateHandle(() => {
      const transfer = new DataTransfer()
      Object.defineProperty(transfer, 'dropEffect', { value: 'copy' })
      return transfer
    })
    await target.dispatchEvent('dragstart', { dataTransfer })
    await page.evaluate(async (url) => {
      const source = await chrome.tabs.getCurrent()
      await chrome.tabs.create({ active: false, openerTabId: source?.id, url })
    }, variants[6].url)
    expect(await readPersistenceV2SavedTabsSnapshot(serviceWorker)).toEqual(
      before,
    )
    await page.evaluate(async (url) => {
      const source = await chrome.tabs.getCurrent()
      await chrome.tabs.create({ active: false, openerTabId: source?.id, url })
    }, variants[5].url)
    // Chromium exposes a pending URL without an opener in onCreated. Neither
    // browser-normalized event can authorize deleting an exact saved record.
    expect(await readPersistenceV2SavedTabsSnapshot(serviceWorker)).toEqual(
      before,
    )
    await target.dispatchEvent('dragend', { dataTransfer })
    await expect(target).toBeHidden()
    const after = await readPersistenceV2SavedTabsSnapshot(serviceWorker)
    expect(after.urls).toEqual(
      before.urls.filter(({ id }) => id !== 'saved-route'),
    )
    expect(after.memberships).toEqual(
      before.memberships.filter(({ urlId }) => urlId !== 'saved-route'),
    )
    expect(after.categories).toEqual(before.categories)
    expect(after.collections).toEqual(before.collections)
  })

  test('external drop OFF preserves data when click removal is ON and a matching native tab opens', async ({
    extensionContext,
    extensionId,
    page,
    serviceWorker,
  }) => {
    await extensionContext.route('https://example.com/**', async (route) => {
      await route.fulfill({
        contentType: 'text/html',
        body: '<title>Matching native tab</title>',
      })
    })
    await seedSavedTabsFixture(serviceWorker, {
      ...createIdentitySeed(),
      storage: createBaseSeed({
        userSettings: {
          ...defaultUserSettings,
          removeTabAfterExternalDrop: false,
          removeTabAfterOpen: true,
        },
      }),
    })
    await page.goto(getExtensionUrl(extensionId, 'app.html#/saved-tabs'))
    const target = page.getByRole('link', { name: 'saved-route', exact: true })
    await expect(target).toBeVisible()
    const before = await readPersistenceV2SavedTabsSnapshot(serviceWorker)
    const dataTransfer = await page.evaluateHandle(() => {
      const transfer = new DataTransfer()
      Object.defineProperty(transfer, 'dropEffect', { value: 'copy' })
      return transfer
    })
    await target.dispatchEvent('dragstart', { dataTransfer })
    const openedTabId = await page.evaluate(async (url) => {
      const source = await chrome.tabs.getCurrent()
      const tab = await chrome.tabs.create({
        active: false,
        openerTabId: source?.id,
        url,
      })
      if (tab.id === undefined) {
        throw new Error('The matching native tab has no ID.')
      }
      return tab.id
    }, variants[5].url)
    await expect
      .poll(async () =>
        serviceWorker.evaluate(async (id) => {
          const tab = await chrome.tabs.get(id)
          return { status: tab.status, url: tab.url }
        }, openedTabId),
      )
      .toEqual({ status: 'complete', url: variants[5].url })
    expect(await readPersistenceV2SavedTabsSnapshot(serviceWorker)).toEqual(
      before,
    )
    await target.dispatchEvent('dragend', { dataTransfer })
    expect(await sendDrop(page, routeDrag)).toMatchObject({
      status: 'skipped',
    })
    expect(await readPersistenceV2SavedTabsSnapshot(serviceWorker)).toEqual(
      before,
    )
    await expect(target).toBeVisible()
  })

  test('an explicit persistence ID must agree with the original URL', async ({
    extensionId,
    page,
    serviceWorker,
  }) => {
    await seedSavedTabsFixture(serviceWorker, createIdentitySeed())
    await page.goto(getExtensionUrl(extensionId, 'app.html#/saved-tabs'))
    const before = await readPersistenceV2SavedTabsSnapshot(serviceWorker)
    expect(
      await page.evaluate(async () =>
        chrome.runtime.sendMessage({
          action: 'removeUrlFromStorage',
          url: 'https://example.com',
          urlRecordId: 'slash',
        }),
      ),
    ).toMatchObject({ status: 'skipped', removedCount: 0 })
    expect(await readPersistenceV2SavedTabsSnapshot(serviceWorker)).toEqual(
      before,
    )
    expect(
      await page.evaluate(async () =>
        chrome.runtime.sendMessage({
          action: 'removeUrlFromStorage',
          url: 'https://example.com',
          urlRecordId: 'root',
        }),
      ),
    ).toMatchObject({ status: 'removed', removedCount: 1 })
    const after = await readPersistenceV2SavedTabsSnapshot(serviceWorker)
    expect(after.urls).toEqual(before.urls.filter(({ id }) => id !== 'root'))
    expect(after.memberships).toEqual(
      before.memberships.filter(({ urlId }) => urlId !== 'root'),
    )
  })

  test('a worker restart discards drag authority and preserves the exact snapshot', async ({
    extensionContext,
    extensionId,
    page,
    serviceWorker,
  }) => {
    await seedSavedTabsFixture(serviceWorker, createIdentitySeed())
    await page.goto(getExtensionUrl(extensionId, 'app.html#/saved-tabs'))
    await expect(
      page.getByRole('link', { name: 'root', exact: true }),
    ).toBeVisible()
    await startDrag(page, rootDrag)
    const before = await readPersistenceV2SavedTabsSnapshot(serviceWorker)
    await serviceWorker.evaluate(() => {
      Object.assign(globalThis, { __tabbinWorkerLifetimeMarker: 'active-drag' })
    })
    const cdp = await stopWorker(extensionContext, page, serviceWorker)
    try {
      expect(await sendDrop(page, rootDrag)).toMatchObject({
        status: 'skipped',
      })
      const restarted = await currentWorker(
        extensionContext,
        serviceWorker.url(),
      )
      expect(await readPersistenceV2SavedTabsSnapshot(restarted)).toEqual(
        before,
      )
    } finally {
      await cdp.detach()
    }
  })

  test('old external and internal drops cannot consume a new drag of the same saved URL', async ({
    extensionId,
    page,
    serviceWorker,
  }) => {
    await seedSavedTabsFixture(serviceWorker, createIdentitySeed())
    await page.goto(getExtensionUrl(extensionId, 'app.html#/saved-tabs'))
    await startDrag(page, rootDrag)
    expect(await sendDrop(page, rootDrag)).toMatchObject({ status: 'removed' })
    await seedSavedTabsFixture(serviceWorker, replaceRootId('root-resaved'))
    const nextDrag: DragIdentity = {
      ...rootDrag,
      urlRecordId: 'root-resaved',
      dragId: 'identity-root-next-drag',
    }
    const before = await readPersistenceV2SavedTabsSnapshot(serviceWorker)
    await startDrag(page, nextDrag)
    expect(await sendDrop(page, rootDrag)).toMatchObject({ status: 'skipped' })
    expect(await readPersistenceV2SavedTabsSnapshot(serviceWorker)).toEqual(
      before,
    )
    expect(await sendDrop(page, rootDrag, false)).toMatchObject({
      status: 'internal_operation',
    })
    expect(await readPersistenceV2SavedTabsSnapshot(serviceWorker)).toEqual(
      before,
    )
    expect(await sendDrop(page, nextDrag)).toMatchObject({ status: 'removed' })
    const after = await readPersistenceV2SavedTabsSnapshot(serviceWorker)
    expect(after.urls).toEqual(
      before.urls.filter(({ id }) => id !== 'root-resaved'),
    )
    expect(after.memberships).toEqual(
      before.memberships.filter(({ urlId }) => urlId !== 'root-resaved'),
    )
    expect(after.categories).toEqual(before.categories)
  })

  test('an old drop token cannot act on a newer drag of the same persistence ID', async ({
    extensionId,
    page,
    serviceWorker,
  }) => {
    await seedSavedTabsFixture(serviceWorker, createIdentitySeed())
    await page.goto(getExtensionUrl(extensionId, 'app.html#/saved-tabs'))
    const before = await readPersistenceV2SavedTabsSnapshot(serviceWorker)
    await startDrag(page, rootDrag)
    await sendDrop(page, rootDrag, false)
    const nextDrag = { ...rootDrag, dragId: 'identity-same-record-next-drag' }
    await startDrag(page, nextDrag)
    expect(await sendDrop(page, rootDrag)).toMatchObject({ status: 'skipped' })
    expect(await readPersistenceV2SavedTabsSnapshot(serviceWorker)).toEqual(
      before,
    )
    await sendDrop(page, rootDrag, false)
    expect(await sendDrop(page, nextDrag)).toMatchObject({ status: 'removed' })
  })

  test('another extension tab cannot consume a drag started by the original tab', async ({
    extensionContext,
    extensionId,
    page,
    serviceWorker,
  }) => {
    await seedSavedTabsFixture(serviceWorker, createIdentitySeed())
    await page.goto(getExtensionUrl(extensionId, 'app.html#/saved-tabs'))
    const other = await extensionContext.newPage()
    try {
      await other.goto(getExtensionUrl(extensionId, 'app.html#/saved-tabs'))
      const before = await readPersistenceV2SavedTabsSnapshot(serviceWorker)
      await startDrag(page, rootDrag)
      expect(await sendDrop(other, rootDrag)).toMatchObject({
        status: 'skipped',
      })
      expect(await sendDrop(other, rootDrag, false)).toMatchObject({
        status: 'internal_operation',
      })
      expect(await readPersistenceV2SavedTabsSnapshot(serviceWorker)).toEqual(
        before,
      )
      expect(await sendDrop(page, rootDrag)).toMatchObject({
        status: 'removed',
      })
      const after = await readPersistenceV2SavedTabsSnapshot(serviceWorker)
      expect(after.urls).toEqual(before.urls.filter(({ id }) => id !== 'root'))
      expect(after.memberships).toEqual(
        before.memberships.filter(({ urlId }) => urlId !== 'root'),
      )
    } finally {
      await other.close()
    }
  })

  test('a re-saved URL with a new persistence ID survives the original drag drop', async ({
    extensionId,
    page,
    serviceWorker,
  }) => {
    await seedSavedTabsFixture(serviceWorker, createIdentitySeed())
    await page.goto(getExtensionUrl(extensionId, 'app.html#/saved-tabs'))
    await startDrag(page, rootDrag)
    await page.evaluate(
      async (url) =>
        chrome.runtime.sendMessage({ action: 'removeUrlFromStorage', url }),
      rootDrag.url,
    )
    await seedSavedTabsFixture(serviceWorker, replaceRootId('root-replacement'))
    const before = await readPersistenceV2SavedTabsSnapshot(serviceWorker)
    expect(await sendDrop(page, rootDrag)).toMatchObject({ status: 'skipped' })
    expect(await readPersistenceV2SavedTabsSnapshot(serviceWorker)).toEqual(
      before,
    )
  })

  test('legacy drag messages without a drag ID remain accepted and preserve saved records', async ({
    extensionId,
    page,
    serviceWorker,
  }) => {
    await seedSavedTabsFixture(serviceWorker, createIdentitySeed())
    await page.goto(getExtensionUrl(extensionId, 'app.html#/saved-tabs'))
    const legacyDrag = { url: rootDrag.url }
    const before = await readPersistenceV2SavedTabsSnapshot(serviceWorker)
    expect(await startDrag(page, legacyDrag)).toMatchObject({ status: 'ok' })
    expect(await sendDrop(page, legacyDrag)).toMatchObject({
      status: 'skipped',
    })
    expect(await readPersistenceV2SavedTabsSnapshot(serviceWorker)).toEqual(
      before,
    )
  })
})
