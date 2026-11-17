import type { Page, Worker } from '@playwright/test'

import {
  createBaseSeed,
  expect,
  getExtensionUrl,
  readPersistenceV2SavedTabsSnapshot,
  seedSavedTabsFixture,
} from './helpers/extension'
import { test } from './helpers/native-tab-title'

const sourceUrl = 'https://link-capture-performance.example.test/list'
const shortcut = {
  code: 'KeyZ',
  key: 'z',
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
}
const seed = () => ({
  storage: createBaseSeed({ linkCaptureSettings: { enabled: true, shortcut } }),
  persistence: {
    categories: [],
    collections: [],
    groups: [],
    memberships: [],
    urls: [],
  },
})
const fixtureHtml = (
  count: number,
) => `<!doctype html><meta charset="utf-8"><title>Link capture performance</title>
<style>body{margin:0;font:16px system-ui}h1{margin:12px 40px;font-size:22px}#links{margin:30px 40px;display:grid;grid-template-columns:repeat(5,140px);gap:6px}a{height:24px}</style>
<h1>Local reading list</h1><div id="links">${Array.from({ length: count }, (_, index) => `<a id="link-${index}" href="/article/${index}">Article ${index}</a>`).join('')}</div>`
const tabs = async (worker: Worker) =>
  worker.evaluate(async () =>
    (await chrome.tabs.query({}))
      .map(({ id, url, pinned }) => ({ id, url, pinned }))
      .toSorted((left, right) => (left.id ?? 0) - (right.id ?? 0)),
  )
const fixtureBounds = async (page: Page) => {
  const first = await page.locator('#link-0').boundingBox()
  const last = await page.locator('#link-29').boundingBox()
  if (!first || !last) {
    throw new Error('Performance fixture links unavailable')
  }
  return { first, last }
}
const instrumentDrag = async (page: Page) =>
  page.evaluate(() => {
    let frame = 0
    let previousFrame = 0
    const sampleFrame = (timestamp: number) => {
      if (previousFrame) {
        performance.measure('capture-frame', {
          start: previousFrame,
          end: timestamp,
        })
      }
      previousFrame = timestamp
      frame = requestAnimationFrame(sampleFrame)
    }
    const recordTasks = (entries: readonly PerformanceEntry[]) => {
      for (const entry of entries) {
        performance.measure('capture-long-task', {
          start: entry.startTime,
          end: entry.startTime + entry.duration,
        })
      }
    }
    const observer = new PerformanceObserver((entries) =>
      recordTasks(entries.getEntries()),
    )
    window.addEventListener(
      'pointerdown',
      () => {
        performance.mark('capture-drag-start')
        if (PerformanceObserver.supportedEntryTypes.includes('longtask')) {
          observer.observe({ type: 'longtask' })
        }
        frame = requestAnimationFrame(sampleFrame)
      },
      { once: true },
    )
    window.addEventListener(
      'pointerup',
      () => {
        cancelAnimationFrame(frame)
        recordTasks(observer.takeRecords())
        observer.disconnect()
        performance.mark('capture-drag-end')
        performance.measure(
          'capture-drag-duration',
          'capture-drag-start',
          'capture-drag-end',
        )
      },
      { once: true },
    )
  })

test.use({ pregrantNativeTitle: true })

for (const candidateCount of [100, 500, 1000]) {
  test(`${candidateCount} link candidates keep selection responsive and cancellation leaves tabs/data untouched`, async ({
    extensionContext,
    extensionId,
    page,
    serviceWorker,
  }, testInfo) => {
    await extensionContext.route(
      'https://link-capture-performance.example.test/**',
      async (route) =>
        route.fulfill({
          contentType: 'text/html',
          body: fixtureHtml(candidateCount),
        }),
    )
    await seedSavedTabsFixture(serviceWorker, seed())
    await page.goto(getExtensionUrl(extensionId, 'icon/128.png'))
    const source = await extensionContext.newPage()
    await source.goto(sourceUrl)
    await expect(source.locator('[data-tabbin-link-capture]')).toHaveCount(1)
    const before = await tabs(serviceWorker)
    await instrumentDrag(source)
    const { first, last } = await fixtureBounds(source)
    await source.keyboard.down('z')
    await source.mouse.move(first.x - 8, first.y - 8)
    await source.mouse.down()
    await source.mouse.move(last.x + last.width + 2, last.y + last.height + 2, {
      steps: 50,
    })
    await expect(source.locator('[data-tabbin-link-capture]')).toHaveAttribute(
      'data-selected-count',
      '30',
    )
    await source.keyboard.up('z')
    await source.mouse.up()
    await expect(
      source.locator('[data-tabbin-link-capture]'),
    ).not.toHaveAttribute('data-selected-count', /.+/)
    expect(await tabs(serviceWorker)).toEqual(before)
    expect((await readPersistenceV2SavedTabsSnapshot(page)).urls).toHaveLength(
      0,
    )
    const samples = await source.evaluate(() => ({
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      frames: performance
        .getEntriesByName('capture-frame')
        .map(({ duration }) => duration)
        .toSorted((left, right) => left - right),
      longTasks: performance
        .getEntriesByName('capture-long-task')
        .map(({ duration }) => duration),
      dragDurationMs:
        performance.getEntriesByName('capture-drag-duration')[0]?.duration ?? 0,
    }))
    expect(samples.frames.length).toBeGreaterThan(1)
    expect(samples.dragDurationMs).toBeGreaterThan(0)
    const p95Index = Math.max(0, Math.ceil(samples.frames.length * 0.95) - 1)
    const result = {
      candidateCount,
      userAgent: samples.userAgent,
      platform: samples.platform,
      selectedCount: 30,
      rafSamples: samples.frames.length,
      dragDurationMs: samples.dragDurationMs,
      p95FrameIntervalMs: samples.frames[p95Index],
      maxFrameIntervalMs: samples.frames.at(-1),
      longTaskCount: samples.longTasks.length,
      longestTaskMs: Math.max(0, ...samples.longTasks),
    }
    await testInfo.attach(`capture-performance-${candidateCount}`, {
      body: JSON.stringify(result, null, 2),
      contentType: 'application/json',
    })
  })
}

test('a recorded Shift+S shortcut updates the live page and saves one focused link using only the keyboard', async ({
  extensionContext,
  extensionId,
  page,
  serviceWorker,
}) => {
  await extensionContext.route(
    'https://link-capture-performance.example.test/**',
    async (route) =>
      route.fulfill({ contentType: 'text/html', body: fixtureHtml(30) }),
  )
  await seedSavedTabsFixture(serviceWorker, seed())
  await page.goto(getExtensionUrl(extensionId, 'app.html#/options'))
  const source = await extensionContext.newPage()
  await source.goto(sourceUrl)
  await expect(source.locator('[data-tabbin-link-capture]')).toHaveCount(1)
  const before = await tabs(serviceWorker)
  const setting = page.locator('#link-capture-enabled')
  const section = page.locator('section').filter({ has: setting })
  await section.getByRole('button', { name: 'Change key', exact: true }).click()
  await page.keyboard.press('Shift+S')
  await expect(section.getByRole('status')).toContainText('Shift + KeyS')
  await section.getByRole('button', { name: 'Save key', exact: true }).click()
  await expect
    .poll(async () =>
      page.evaluate(
        async () =>
          (await chrome.storage.local.get('linkCaptureSettings'))
            .linkCaptureSettings,
      ),
    )
    .toMatchObject({ shortcut: { code: 'KeyS' } })
  await source.bringToFront()
  await source.locator('#link-0').focus()
  await source.keyboard.down('Shift')
  await source.keyboard.down('s')
  await source.keyboard.press('Enter')
  await source.keyboard.up('s')
  await source.keyboard.up('Shift')
  await expect(source.getByRole('status')).toContainText('Saved: 1')
  expect((await readPersistenceV2SavedTabsSnapshot(page)).urls).toEqual([
    expect.objectContaining({
      url: 'https://link-capture-performance.example.test/article/0',
    }),
  ])
  expect(await tabs(serviceWorker)).toEqual(before)
})
