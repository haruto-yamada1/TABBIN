import { createServer } from 'node:http'

import type { Page, Worker } from '@playwright/test'

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
} from './helpers/extension'
import { test } from './helpers/native-tab-title'
import { currentWorker, stopWorker } from './helpers/worker-lifecycle'

const sourceUrl = 'https://link-click.example.test/list'
const baseUrl = 'https://link-click.example.test/base/'
const shortcut = {
  code: 'KeyZ',
  key: 'z',
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
}
const fixtureHtml = `<!doctype html><meta charset="utf-8"><base href="/base/">
<title>Click capture fixture</title>
<style>body{font:16px system-ui;margin:40px}a{display:block;margin:10px;width:220px;min-height:30px}#rectangle{display:flex;gap:15px}#rectangle a{width:140px}img{width:30px;height:30px}</style>
<h1>Reading list</h1>
<a id="nested" href="new?sort=1#part"><span><strong>New article</strong></span></a>
<a id="image" href="image" aria-label="Illustration"><img alt="Image label" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="></a>
<a id="existing" href="existing">Page-provided replacement title</a>
<a id="excluded" href="excluded">Excluded article</a>
<a id="ordinary" href="ordinary">Ordinary navigation</a>
<div id="shadow"></div>
<div id="rectangle"><a href="rect-one">Rect one</a><a href="rect-two">Rect two</a></div>
<input aria-label="Editor">
<a id="contents" href="contents" style="display:contents"><span style="display:block;width:220px;height:30px;margin:10px">Contents child article</span></a>
<a id="positioned" href="positioned" style="width:0;height:0;min-height:0;margin:0"><span style="position:absolute;left:350px;top:70px;width:220px;height:30px">Positioned child article</span></a>
<a id="visible-child" href="visible-child" style="visibility:hidden"><span style="visibility:visible;display:block;width:220px;height:30px">Visible child article</span></a>
<div id="disabled-shadow" aria-disabled="true"></div>
<script>const disabledLink = document.querySelector('#disabled-shadow').attachShadow({mode:'open'}); disabledLink.innerHTML='<a href="disabled" style="display:block;width:220px;height:30px;margin:10px"><span>Disabled shadow link</span></a>'; disabledLink.querySelector('a').addEventListener('click', event => { document.body.dataset.disabledClickDefaultPrevented = String(event.defaultPrevented); event.preventDefault() });</script>
<script>document.querySelector('#shadow').attachShadow({mode:'open'}).innerHTML='<a href="shadow" style="display:block;width:220px;height:30px;margin:10px"><span>Shadow article</span></a>'</script>`

// Native modifier-opened tabs can issue their first request before Playwright
// attaches routing. Serve this navigation fixture on loopback so the browser's
// actual new-tab action does not depend on intercepting that first request.
const startNavigationFixture = async () => {
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
    throw new Error('Navigation fixture server unavailable')
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

const tabSnapshot = async (worker: Worker) =>
  worker.evaluate(async () =>
    (await chrome.tabs.query({}))
      .map(({ id, url, pinned }) => ({ id, url, pinned }))
      .toSorted((a, b) => (a.id ?? 0) - (b.id ?? 0)),
  )

const clickLink = async (page: Page, selector: string, key = 'z') => {
  await page.keyboard.down(key)
  await page.locator(selector).click()
  await page.keyboard.up(key)
}

const seed = (clickEnabled = true, enabled = false) => {
  const now = 1_700_000_000_000
  return {
    storage: createBaseSeed({
      linkCaptureSettings: {
        enabled,
        shortcut,
        clickEnabled,
        clickShortcut: shortcut,
      },
      userSettings: {
        ...defaultUserSettings,
        excludePatterns: [...defaultUserSettings.excludePatterns, '/excluded'],
      },
    }),
    persistence: {
      categories: [],
      collections: [
        createDomainCollectionFixture(
          'kept-domain',
          'link-click.example.test',
          now,
        ),
      ],
      groups: [],
      memberships: [
        {
          ...createMembershipFixture('kept-domain', 'kept-url', now),
          notes: 'Keep my note',
        },
      ],
      urls: [
        {
          ...createUrlFixture(
            'kept-url',
            `${baseUrl}existing`,
            'My edited title',
            now,
          ),
          isFavorite: true,
        },
      ],
    },
  }
}

test('click capture does not alter navigation without optional site access', async ({
  extensionContext,
  extensionId,
  page,
  serviceWorker,
}) => {
  await extensionContext.route(
    'https://link-click.example.test/**',
    async (route) =>
      route.fulfill({ contentType: 'text/html', body: fixtureHtml }),
  )
  await seedSavedTabsFixture(serviceWorker, seed())
  await page.goto(getExtensionUrl(extensionId, 'app.html#/options'))
  await expect(page.locator('#link-click-capture-enabled')).not.toBeChecked()
  const source = await extensionContext.newPage()
  await source.goto(sourceUrl)
  await clickLink(source, '#ordinary')
  await expect(source).toHaveURL(`${baseUrl}ordinary`)
  await expect(source.locator('[data-tabbin-link-capture]')).toHaveCount(0)
  expect((await readPersistenceV2SavedTabsSnapshot(page)).urls).toHaveLength(1)
})

test.describe('key plus click saving with optional access', () => {
  test.use({ pregrantNativeTitle: true })

  test('enables independently, extracts nested image and Shadow DOM links, preserves stored data and every tab', async ({
    extensionContext,
    extensionId,
    page,
    serviceWorker,
  }) => {
    await extensionContext.route(
      'https://link-click.example.test/**',
      async (route) =>
        route.fulfill({ contentType: 'text/html', body: fixtureHtml }),
    )
    const initial = seed(false)
    await seedSavedTabsFixture(serviceWorker, initial)
    await page.goto(getExtensionUrl(extensionId, 'app.html#/options'))
    const source = await extensionContext.newPage()
    await source.goto(sourceUrl)
    await expect(source.locator('[data-tabbin-link-capture]')).toHaveCount(0)
    const setting = page.locator('#link-click-capture-enabled')
    await expect(setting).not.toBeChecked()
    await setting.click()
    await expect(setting).toBeChecked()
    await expect(page.locator('#link-capture-enabled')).not.toBeChecked()
    await expect(source.locator('[data-tabbin-link-capture]')).toHaveCount(1)
    const before = await tabSnapshot(serviceWorker)
    await clickLink(source, '#nested strong')
    await expect(source.getByRole('status')).toContainText('Saved: 1')
    await clickLink(source, '#image img')
    await expect
      .poll(
        async () =>
          (await readPersistenceV2SavedTabsSnapshot(page)).urls.length,
      )
      .toBe(3)
    await clickLink(source, '#shadow a span')
    await expect
      .poll(
        async () =>
          (await readPersistenceV2SavedTabsSnapshot(page)).urls.length,
      )
      .toBe(4)
    await clickLink(source, '#existing')
    await expect(source.getByRole('status')).toContainText('Already saved: 1')
    await clickLink(source, '#excluded')
    await expect(source.getByRole('status')).toContainText('Excluded: 1')
    const saved = await readPersistenceV2SavedTabsSnapshot(page)
    expect(saved.urls.find(({ id }) => id === 'kept-url')).toEqual(
      initial.persistence.urls[0],
    )
    expect(saved.memberships.find(({ urlId }) => urlId === 'kept-url')).toEqual(
      initial.persistence.memberships[0],
    )
    expect(saved.urls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          url: `${baseUrl}new?sort=1#part`,
          title: 'New article',
        }),
        expect.objectContaining({
          url: `${baseUrl}image`,
          title: 'Illustration',
        }),
        expect.objectContaining({
          url: `${baseUrl}shadow`,
          title: 'Shadow article',
        }),
      ]),
    )
    expect(
      saved.memberships.filter(
        ({ collectionId }) => collectionId === 'kept-domain',
      ),
    ).toHaveLength(4)
    expect(
      saved.memberships.filter(
        ({ collectionId }) => collectionId === 'custom-uncategorized',
      ),
    ).toHaveLength(3)
    expect(saved.memberships).toHaveLength(7)
    expect(await tabSnapshot(serviceWorker)).toEqual(before)
    await expect(source).toHaveURL(sourceUrl)
    await page.reload()
    expect((await readPersistenceV2SavedTabsSnapshot(page)).urls).toEqual(
      saved.urls,
    )
    await page
      .getByRole('region', { name: 'Link saving gesture', exact: true })
      .screenshot({ path: 'docs/assets/issue-1048-options-en.png' })
    await page.evaluate(async () => {
      const { userSettings } = await chrome.storage.local.get('userSettings')
      await chrome.storage.local.set({
        userSettings: { ...userSettings, language: 'ja' },
      })
    })
    const japanese = page.getByRole('region', {
      name: 'リンク保存操作',
      exact: true,
    })
    await expect(japanese).toBeVisible()
    await japanese.screenshot({ path: 'docs/assets/issue-1048-options-ja.png' })
    await page.evaluate(async () =>
      chrome.storage.local.set({ 'tab-manager-theme': 'dark' }),
    )
    await expect(page.locator('html')).toHaveClass(/dark/u)
    await page.setViewportSize({ width: 390, height: 844 })
    await japanese.screenshot({
      path: 'docs/assets/issue-1048-options-ja-narrow-dark.png',
    })
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true)
  })

  test('click targets remain capturable without an anchor box and disabled Shadow hosts remain untouched', async ({
    extensionContext,
    extensionId,
    page,
    serviceWorker,
  }) => {
    await extensionContext.route(
      'https://link-click.example.test/**',
      async (route) =>
        route.fulfill({ contentType: 'text/html', body: fixtureHtml }),
    )
    await seedSavedTabsFixture(serviceWorker, seed())
    await page.goto(getExtensionUrl(extensionId, 'icon/128.png'))
    const source = await extensionContext.newPage()
    await source.goto(sourceUrl)
    await expect(source.locator('[data-tabbin-link-capture]')).toHaveCount(1)
    const before = await tabSnapshot(serviceWorker)
    await clickLink(source, '#contents span')
    await expect(source.getByRole('status')).toContainText('Saved: 1')
    await clickLink(source, '#positioned span')
    await expect
      .poll(
        async () =>
          (await readPersistenceV2SavedTabsSnapshot(page)).urls.length,
      )
      .toBe(3)
    await clickLink(source, '#visible-child span')
    await expect
      .poll(
        async () =>
          (await readPersistenceV2SavedTabsSnapshot(page)).urls.length,
      )
      .toBe(4)
    await clickLink(source, '#disabled-shadow a span')
    await expect(source.locator('body')).toHaveAttribute(
      'data-disabled-click-default-prevented',
      'false',
    )
    const saved = await readPersistenceV2SavedTabsSnapshot(page)
    expect(saved.urls).toHaveLength(4)
    expect(saved.urls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          url: `${baseUrl}contents`,
          title: 'Contents child article',
        }),
        expect.objectContaining({
          url: `${baseUrl}positioned`,
          title: 'Positioned child article',
        }),
        expect.objectContaining({
          url: `${baseUrl}visible-child`,
          title: 'Visible child article',
        }),
      ]),
    )
    expect(await tabSnapshot(serviceWorker)).toEqual(before)
    await expect(source).toHaveURL(sourceUrl)
  })

  test('ordinary clicks, unmatched keys, and modified native link actions still navigate', async ({
    extensionContext,
    extensionId,
    page,
    serviceWorker,
  }) => {
    const fixture = await startNavigationFixture()
    try {
      await seedSavedTabsFixture(serviceWorker, seed())
      await page.goto(getExtensionUrl(extensionId, 'icon/128.png'))
      const source = await extensionContext.newPage()
      await source.goto(`${fixture.origin}/list`)
      await expect(source.locator('[data-tabbin-link-capture]')).toHaveCount(1)
      const opened = extensionContext.waitForEvent('page')
      await source.keyboard.down('z')
      await source.locator('#ordinary').click({ modifiers: ['ControlOrMeta'] })
      await source.keyboard.up('z')
      const nativeTab = await opened
      await expect(nativeTab).toHaveURL(`${fixture.origin}/base/ordinary`)
      await nativeTab.close()
      await clickLink(source, '#ordinary', 'x')
      await expect(source).toHaveURL(`${fixture.origin}/base/ordinary`)
      await source.goto(`${fixture.origin}/list`)
      await source.locator('#ordinary').click()
      await expect(source).toHaveURL(`${fixture.origin}/base/ordinary`)
      expect(
        (await readPersistenceV2SavedTabsSnapshot(page)).urls,
      ).toHaveLength(1)
    } finally {
      await fixture.close()
    }
  })

  test('the shared key selects on drag without a second click save, then still saves a single click', async ({
    extensionContext,
    extensionId,
    page,
    serviceWorker,
  }) => {
    await extensionContext.route(
      'https://link-click.example.test/**',
      async (route) =>
        route.fulfill({ contentType: 'text/html', body: fixtureHtml }),
    )
    await seedSavedTabsFixture(serviceWorker, seed(true, true))
    await page.goto(getExtensionUrl(extensionId, 'icon/128.png'))
    const source = await extensionContext.newPage()
    await source.goto(sourceUrl)
    await expect(source.locator('[data-tabbin-link-capture]')).toHaveCount(1)
    const bounds = await source.locator('#rectangle').evaluate((element) => {
      const { x, y, width, height } = element.getBoundingClientRect()
      return { x, y, width, height }
    })
    const before = await tabSnapshot(serviceWorker)
    await source.keyboard.down('z')
    await source.mouse.move(bounds.x + 2, bounds.y + 2)
    await source.mouse.down()
    await source.mouse.move(bounds.x + 330, bounds.y + bounds.height - 2, {
      steps: 10,
    })
    await expect(source.locator('[data-tabbin-link-capture]')).toHaveAttribute(
      'data-selected-count',
      '2',
    )
    await source.mouse.up()
    await source.keyboard.up('z')
    await expect(source.getByRole('status')).toContainText('Saved: 2')
    await expect
      .poll(
        async () =>
          (await readPersistenceV2SavedTabsSnapshot(page)).urls.length,
      )
      .toBe(3)
    await source.getByRole('button', { name: 'Dismiss', exact: true }).click()
    await clickLink(source, '#nested strong')
    await expect(source.getByRole('status')).toContainText('Saved: 1')
    expect((await readPersistenceV2SavedTabsSnapshot(page)).urls).toHaveLength(
      4,
    )
    expect(await tabSnapshot(serviceWorker)).toEqual(before)
  })

  test('click-only saves wake the worker and follow live key changes, disable and revocation', async ({
    extensionContext,
    extensionId,
    page,
    serviceWorker,
  }) => {
    await extensionContext.route(
      'https://link-click.example.test/**',
      async (route) =>
        route.fulfill({ contentType: 'text/html', body: fixtureHtml }),
    )
    await seedSavedTabsFixture(serviceWorker, seed())
    await page.goto(getExtensionUrl(extensionId, 'app.html#/options'))
    const source = await extensionContext.newPage()
    await source.goto(sourceUrl)
    await expect(source.locator('[data-tabbin-link-capture]')).toHaveCount(1)
    const before = await tabSnapshot(serviceWorker)
    await serviceWorker.evaluate(() =>
      Object.assign(globalThis, {
        __tabbinWorkerLifetimeMarker: 'before-stop',
      }),
    )
    const cdp = await stopWorker(extensionContext, page, serviceWorker)
    try {
      await clickLink(source, '#nested strong')
      await expect(source.getByRole('status')).toContainText('Saved: 1')
      const worker = await currentWorker(extensionContext, serviceWorker.url())
      expect(await tabSnapshot(worker)).toEqual(before)
      await page.evaluate(
        async (settings) =>
          chrome.storage.local.set({ linkCaptureSettings: settings }),
        {
          enabled: false,
          shortcut,
          clickEnabled: true,
          clickShortcut: { ...shortcut, code: 'KeyQ', key: 'q' },
        },
      )
      await expect(
        page
          .locator('section')
          .filter({ has: page.locator('#link-click-capture-enabled') }),
      ).toContainText('KeyQ (q)')
      await clickLink(source, '#image img', 'q')
      await expect
        .poll(
          async () =>
            (await readPersistenceV2SavedTabsSnapshot(page)).urls.length,
        )
        .toBe(3)
      await page.locator('#link-click-capture-enabled').click()
      await expect(source.locator('[data-tabbin-link-capture]')).toHaveCount(0)
      await page.locator('#link-click-capture-enabled').click()
      await expect(source.locator('[data-tabbin-link-capture]')).toHaveCount(1)
      await page.evaluate(async () =>
        chrome.permissions.remove({ origins: ['http://*/*', 'https://*/*'] }),
      )
      await expect(source.locator('[data-tabbin-link-capture]')).toHaveCount(0)
      await clickLink(source, '#ordinary', 'q')
      await expect(source).toHaveURL(`${baseUrl}ordinary`)
      expect(
        (await readPersistenceV2SavedTabsSnapshot(page)).urls,
      ).toHaveLength(3)
    } finally {
      await cdp.detach()
    }
  })
})
