import type { Locator, Page } from '@playwright/test'

import {
  createCustomCollectionFixture,
  createMembershipFixture,
  createUrlFixture,
} from '@/test/fixtures/persistenceBrowserFixtures'

import {
  createBaseSeed,
  expect,
  getExtensionUrl,
  readPersistenceV2Store,
  seedSavedTabsFixture,
  test,
} from './helpers/extension'
import { verifyTouchDomainCategories } from './helpers/keyboard-dnd'

const createSeed = (extraCategories = 0) => {
  const now = Date.now()
  const category = (collectionId: string, name: string, sortOrder: number) => ({
    collectionId,
    createdAt: now,
    id: `${collectionId}:${name}`,
    keywords: [],
    name,
    sortOrder,
    updatedAt: now,
  })
  return {
    persistence: {
      collections: [
        createCustomCollectionFixture('source', 'Source project', now, 0),
        createCustomCollectionFixture('other', 'Other project', now, 1024),
      ],
      categories: [
        category('source', 'Alpha', 0),
        category('source', 'Beta', 1024),
        ...Array.from({ length: extraCategories }, (_, index) =>
          category('source', `Extra ${index}`, (index + 2) * 1024),
        ),
        category('other', 'Other category', 0),
      ],
      groups: [],
      memberships: [createMembershipFixture('source', 'url', now)],
      urls: [
        createUrlFixture('url', 'https://example.com/saved', 'Saved tab', now),
      ],
    },
    storage: createBaseSeed({ viewMode: 'custom' }),
  }
}

const boxFor = async (target: Locator) => {
  const box = await target.boundingBox()
  if (!box) {
    throw new Error('Drag target is not visible')
  }
  return box
}
const center = async (target: Locator) => {
  const box = await boxFor(target)
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

const categoryHandle = (page: Page) =>
  page.getByRole('button', {
    name: 'Drag to reorder category "Alpha"',
    exact: true,
  })

test('pointer category drag distinguishes candidates, keeps geometry, and clears on Escape', async ({
  page,
  extensionId,
  serviceWorker,
}, testInfo) => {
  await seedSavedTabsFixture(serviceWorker, createSeed())
  await page.goto(
    getExtensionUrl(extensionId, 'app.html#/saved-tabs?mode=custom'),
  )
  const source = page.locator('[data-category="Alpha"]')
  const destination = page.locator('[data-category="Beta"]')
  const forbidden = page.locator('[data-category="Other category"]')
  const before = await readPersistenceV2Store(
    serviceWorker,
    'collectionCategories',
  )
  const point = await center(categoryHandle(page))
  await page.mouse.move(point.x, point.y)
  await page.mouse.down()
  await page.mouse.move(point.x + 5, point.y + 5)
  await expect(source).toHaveAttribute('data-drop-state', 'source')
  await expect(destination).toHaveAttribute('data-drop-state', 'available')
  await expect(destination).toHaveCSS('outline-style', 'dashed')
  await expect(forbidden).toHaveAttribute('data-drop-state', 'unavailable')
  await expect(forbidden).toHaveCSS('outline-style', 'dotted')
  const sizeBefore = await destination.boundingBox()
  const next = await center(destination)
  await page.mouse.move(next.x, next.y, { steps: 10 })
  await expect(destination).toHaveAttribute('data-drop-state', 'over')
  await expect(destination).toHaveCSS('outline-style', 'solid')
  const sizeAfter = await destination.boundingBox()
  expect(sizeAfter?.width).toBe(sizeBefore?.width)
  expect(sizeAfter?.height).toBe(sizeBefore?.height)
  const screenshot = testInfo.outputPath('category-candidates.png')
  await page.screenshot({ path: screenshot, fullPage: true })
  await testInfo.attach('category-candidates', {
    path: screenshot,
    contentType: 'image/png',
  })
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await expect(
    page.locator(
      '[data-drop-state="available"], [data-drop-state="over"], [data-drop-state="unavailable"], [data-drop-state="source"]',
    ),
  ).toHaveCount(0)
  expect(
    await readPersistenceV2Store(serviceWorker, 'collectionCategories'),
  ).toEqual(before)
})

test('category candidates remain visible during automatic drag scrolling', async ({
  page,
  extensionId,
  serviceWorker,
}) => {
  await seedSavedTabsFixture(serviceWorker, createSeed(14))
  await page.goto(
    getExtensionUrl(extensionId, 'app.html#/saved-tabs?mode=custom'),
  )
  const point = await center(categoryHandle(page))
  await page.mouse.move(point.x, point.y)
  await page.mouse.down()
  await page.mouse.move(point.x + 5, point.y + 5)
  await expect(page.locator('[data-category="Beta"]')).toHaveAttribute(
    'data-drop-state',
    'available',
  )
  const pane = page.getByTestId('saved-tabs-left-pane')
  const bounds = await boxFor(pane)
  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height - 5,
    { steps: 10 },
  )
  await expect
    .poll(async () => pane.evaluate((node) => node.scrollTop))
    .toBeGreaterThan(100)
  await expect(page.locator('[data-category="Extra 13"]')).toHaveAttribute(
    'data-drop-state',
    /available|over/,
  )
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await expect(page.locator('[data-drop-state="available"]')).toHaveCount(0)
})

test('touch category drag keeps the same feedback and persists one reorder', async ({
  page,
  extensionId,
  serviceWorker,
}) => {
  await seedSavedTabsFixture(serviceWorker, createSeed())
  await page.goto(
    getExtensionUrl(extensionId, 'app.html#/saved-tabs?mode=custom'),
  )
  const source = page.locator('[data-category="Alpha"]')
  const destination = page.locator('[data-category="Beta"]')
  const session = await page.context().newCDPSession(page)
  const point = await center(categoryHandle(page))
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [point],
  })
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: point.x + 4, y: point.y + 4 }],
  })
  await expect(source).toHaveAttribute('data-drop-state', 'source')
  await expect(destination).toHaveAttribute('data-drop-state', 'available')
  const next = await center(destination)
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [next],
  })
  await expect(destination).toHaveAttribute('data-drop-state', 'over')
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  })
  await expect(destination).toHaveAttribute('data-drop-state', 'idle')
  await expect
    .poll(async () =>
      (
        await readPersistenceV2Store<{
          collectionId: string
          name: string
          sortOrder: number
        }>(serviceWorker, 'collectionCategories')
      )
        .filter((item) => item.collectionId === 'source')
        .toSorted((a, b) => a.sortOrder - b.sortOrder)
        .map(({ name }) => name),
    )
    .toEqual(['Beta', 'Alpha'])
  await page.reload()
  await expect(
    page.locator(
      '[data-project-id="source"][data-category][data-drop-state="idle"]',
    ),
  ).toHaveCount(2)
  await expect(
    page
      .locator('[data-drop-state][data-category]')
      .getByRole('heading', { level: 3 }),
  ).toHaveText(['Beta', 'Alpha', 'Other category'])
})

for (const parent of [false, true]) {
  test(`domain ${parent ? 'parent' : 'child'} category touch drag preserves feedback and confirmation`, async ({
    page,
    extensionId,
    serviceWorker,
  }) => {
    await verifyTouchDomainCategories({
      page,
      serviceWorker,
      parent,
      appUrl: getExtensionUrl(extensionId, 'app.html#/saved-tabs?mode=domain'),
    })
    await expect(page.locator('[data-drop-state="over"]')).toHaveCount(0)
  })
}
