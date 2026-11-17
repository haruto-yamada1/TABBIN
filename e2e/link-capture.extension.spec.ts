import type { Page, Worker } from '@playwright/test'

import {
  createBaseSeed,
  expect,
  getExtensionUrl,
  readPersistenceV2SavedTabsSnapshot,
  seedSavedTabsFixture,
} from './helpers/extension'
import { test } from './helpers/native-tab-title'
import { currentWorker, stopWorker } from './helpers/worker-lifecycle'

const sourceUrl = 'https://link-capture.example.test/list'
const shortcut = {
  code: 'KeyZ',
  key: 'z',
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
}
const fixtureHtml = (
  count: number,
) => `<!doctype html><meta charset="utf-8"><title>Link capture fixture</title>
<style>body{margin:0;font:16px system-ui}h1{margin:12px 40px;font-size:22px}#links{margin:30px 40px;display:grid;grid-template-columns:repeat(5,140px);gap:6px}a{height:24px}input{position:absolute;left:850px;top:100px}</style>
<h1>Reading list</h1><input aria-label="Editor"><div id="links">${Array.from({ length: count }, (_, i) => `<a id="link-${i}" href="/article/${i}">Article ${i}</a>`).join('')}</div>
<a hidden href="/hidden">Hidden</a><a href="javascript:void(0)">Invalid</a>`
const tabs = async (worker: Worker) =>
  worker.evaluate(async () =>
    (await chrome.tabs.query({}))
      .map(({ id, url, pinned }) => ({ id, url, pinned }))
      .toSorted((a, b) => (a.id ?? 0) - (b.id ?? 0)),
  )
const beginDrag = async (page: Page, count: number) => {
  const first = await page.locator('#link-0').boundingBox()
  const last = await page.locator(`#link-${count - 1}`).boundingBox()
  if (!first || !last) {
    throw new Error('Fixture anchors unavailable')
  }
  await page.keyboard.down('z')
  await page.mouse.move(first.x - 8, first.y - 8)
  await page.mouse.down()
  await page.mouse.move(last.x + last.width + 2, last.y + last.height + 2, {
    steps: 12,
  })
  await expect(page.locator('[data-tabbin-link-capture]')).toHaveAttribute(
    'data-selected-count',
    String(count),
  )
}
const finishDrag = async (page: Page) => {
  await page.mouse.up()
  await page.keyboard.up('z')
}

const seed = (enabled = false) => ({
  storage: createBaseSeed({ linkCaptureSettings: { enabled, shortcut } }),
  persistence: {
    categories: [],
    collections: [],
    groups: [],
    memberships: [],
    urls: [],
  },
})

test('capture stays off without optional site access even if storage says enabled', async ({
  extensionContext,
  extensionId,
  page,
  serviceWorker,
}) => {
  await extensionContext.route(
    'https://link-capture.example.test/**',
    async (route) =>
      route.fulfill({ contentType: 'text/html', body: fixtureHtml(30) }),
  )
  await seedSavedTabsFixture(serviceWorker, seed(true))
  await page.goto(getExtensionUrl(extensionId, 'app.html#/options'))
  await expect(page.locator('#link-capture-enabled')).not.toBeChecked()
  const source = await extensionContext.newPage()
  await source.goto(sourceUrl)
  await source.keyboard.down('z')
  await source.mouse.move(30, 65)
  await source.mouse.down()
  await source.mouse.move(750, 260, { steps: 10 })
  await finishDrag(source)
  await expect(source.locator('[data-tabbin-link-capture]')).toHaveCount(0)
  expect((await readPersistenceV2SavedTabsSnapshot(page)).urls).toHaveLength(0)
})

test.describe('link capture with native optional permission grant', () => {
  test.use({ pregrantNativeTitle: true })

  test('rectangle capture saves 30 links without changing any browser tab, reloads persistence and cancels safely', async ({
    extensionContext,
    extensionId,
    page,
    serviceWorker,
  }, testInfo) => {
    await extensionContext.route(
      'https://link-capture.example.test/**',
      async (route) =>
        route.fulfill({ contentType: 'text/html', body: fixtureHtml(30) }),
    )
    await seedSavedTabsFixture(serviceWorker, seed())
    await page.goto(getExtensionUrl(extensionId, 'app.html#/options'))
    const source = await extensionContext.newPage()
    await source.goto(sourceUrl)
    const setting = page.locator('#link-capture-enabled')
    await expect(setting).not.toBeChecked()
    await setting.click()
    await expect(setting).toBeChecked()
    await expect(source.locator('[data-tabbin-link-capture]')).toHaveCount(1)
    const before = await tabs(serviceWorker)
    await beginDrag(source, 30)
    await source.screenshot({
      path: 'docs/assets/issue-1047-link-selection-en.png',
    })
    await finishDrag(source)
    await expect(source.getByRole('status')).toContainText('Saved: 30')
    expect(await tabs(serviceWorker)).toEqual(before)
    await expect
      .poll(
        async () =>
          (await readPersistenceV2SavedTabsSnapshot(page)).urls.length,
      )
      .toBe(30)
    await page.reload()
    expect((await readPersistenceV2SavedTabsSnapshot(page)).urls).toHaveLength(
      30,
    )
    await source.getByRole('button', { name: 'Dismiss', exact: true }).click()
    await beginDrag(source, 30)
    await source.keyboard.up('z')
    await source.mouse.up()
    await expect(
      source.locator('[data-tabbin-link-capture]'),
    ).not.toHaveAttribute('data-selected-count', /.+/)
    expect((await readPersistenceV2SavedTabsSnapshot(page)).urls).toHaveLength(
      30,
    )
    const section = page.locator('section').filter({ has: setting })
    await section.screenshot({ path: 'docs/assets/issue-1047-options-en.png' })
    await page.evaluate(async () => {
      const { userSettings } = await chrome.storage.local.get('userSettings')
      await chrome.storage.local.set({
        userSettings: { ...userSettings, language: 'ja' },
      })
    })
    await expect(section).toContainText('リンクの一括選択')
    await section.screenshot({ path: 'docs/assets/issue-1047-options-ja.png' })
    await page.evaluate(async () =>
      chrome.storage.local.set({ 'tab-manager-theme': 'dark' }),
    )
    await expect(page.locator('html')).toHaveClass(/dark/u)
    await page.setViewportSize({ width: 390, height: 844 })
    await section.screenshot({
      path: 'docs/assets/issue-1047-options-ja-narrow-dark.png',
    })
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true)
    await testInfo.attach('selection', {
      path: 'docs/assets/issue-1047-link-selection-en.png',
      contentType: 'image/png',
    })
    await setting.click()
    await expect(source.locator('[data-tabbin-link-capture]')).toHaveCount(0)
  })

  test('large batches preview existing versus new, keyboard can confirm and permission revocation removes monitoring', async ({
    extensionContext,
    extensionId,
    page,
    serviceWorker,
  }) => {
    await extensionContext.route(
      'https://link-capture.example.test/**',
      async (route) =>
        route.fulfill({ contentType: 'text/html', body: fixtureHtml(60) }),
    )
    await seedSavedTabsFixture(serviceWorker, seed(true))
    await page.goto(getExtensionUrl(extensionId, 'icon/128.png'))
    const source = await extensionContext.newPage()
    await source.goto(sourceUrl)
    await expect(source.locator('[data-tabbin-link-capture]')).toHaveCount(1)
    await beginDrag(source, 60)
    await finishDrag(source)
    await expect(source.getByRole('dialog')).toContainText('New: 60')
    expect((await readPersistenceV2SavedTabsSnapshot(page)).urls).toHaveLength(
      0,
    )
    await source
      .getByRole('button', { name: 'Save links', exact: true })
      .press('Enter')
    await expect(source.getByRole('status')).toContainText('Saved: 60')
    await source.getByRole('button', { name: 'Dismiss', exact: true }).click()
    await beginDrag(source, 60)
    await finishDrag(source)
    await expect(source.getByRole('dialog')).toContainText('Already saved: 60')
    await source.getByRole('button', { name: 'Cancel', exact: true }).click()
    expect((await readPersistenceV2SavedTabsSnapshot(page)).urls).toHaveLength(
      60,
    )
    await page.evaluate(async () =>
      chrome.permissions.remove({ origins: ['http://*/*', 'https://*/*'] }),
    )
    await expect(source.locator('[data-tabbin-link-capture]')).toHaveCount(0)
    expect(
      await page.evaluate(async () =>
        chrome.scripting.getRegisteredContentScripts({
          ids: ['tabbin-link-capture'],
        }),
      ),
    ).toEqual([])
  })

  test('a stopped MV3 worker wakes on selected-link save without losing registration or opening tabs', async ({
    extensionContext,
    extensionId,
    page,
    serviceWorker,
  }) => {
    await extensionContext.route(
      'https://link-capture.example.test/**',
      async (route) =>
        route.fulfill({ contentType: 'text/html', body: fixtureHtml(30) }),
    )
    await seedSavedTabsFixture(serviceWorker, seed(true))
    await page.goto(getExtensionUrl(extensionId, 'icon/128.png'))
    const source = await extensionContext.newPage()
    await source.goto(sourceUrl)
    await expect(source.locator('[data-tabbin-link-capture]')).toHaveCount(1)
    const before = await tabs(serviceWorker)
    await serviceWorker.evaluate(() =>
      Object.assign(globalThis, {
        __tabbinWorkerLifetimeMarker: 'before-stop',
      }),
    )
    const cdp = await stopWorker(extensionContext, page, serviceWorker)
    try {
      await beginDrag(source, 30)
      await finishDrag(source)
      await expect(source.getByRole('status')).toContainText('Saved: 30')
      const worker = await currentWorker(extensionContext, serviceWorker.url())
      expect(await tabs(worker)).toEqual(before)
      expect(
        (await readPersistenceV2SavedTabsSnapshot(page)).urls,
      ).toHaveLength(30)
    } finally {
      await cdp.detach()
    }
  })
})
