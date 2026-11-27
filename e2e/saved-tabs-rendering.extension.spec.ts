import type { Locator, Page } from '@playwright/test'

import { assertNoAxeViolations } from './helpers/axe'
import {
  createBaseSeed,
  defaultUserSettings,
  expect,
  getExtensionUrl,
  readPersistenceV2Store,
  seedSavedTabsFixture,
  test,
} from './helpers/extension'
import { createRenderingFixture } from './helpers/rendering-performance'

test('domain cards retain their URLs when reopening management and collapsing', async ({
  extensionId,
  page,
}) => {
  test.setTimeout(120_000)
  const appUrl = getExtensionUrl(extensionId, 'app.html')
  const fixture = createRenderingFixture(1_000)
  await page.goto(`${appUrl}#/options`)
  await seedSavedTabsFixture(page, fixture)
  await page.goto(`${appUrl}#/saved-tabs?mode=domain`)
  const rows = page.locator('a[href^="https://rendering-benchmark-"]')
  const card = page.locator('[data-saved-tabs-scroll-target="domain"]').filter({
    has: page.getByText('rendering-benchmark-0.example', { exact: true }),
  })
  const manage = card.getByRole('button', { name: /Manage subcategories/u })
  const modal = page.getByRole('dialog', {
    name: 'Manage subcategories for "rendering-benchmark-0.example"',
  })
  await manage.click()
  await expect(modal).toBeVisible()
  await modal.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(modal).toBeHidden()
  await manage.click()
  await expect(modal).toBeVisible()
  await modal.getByRole('button', { name: 'Close', exact: true }).click()
  await card.getByRole('button', { name: /Expand/u }).click()
  await expect(rows).toHaveCount(50)
  await card.getByRole('button', { name: /Collapse/u }).click()
  await expect(rows).toHaveCount(0)
  await card.getByRole('button', { name: /Expand/u }).click()
  await expect
    .poll(async () =>
      rows.evaluateAll((links) =>
        links.map((link) => link.getAttribute('href') ?? '').toSorted(),
      ),
    )
    .toEqual(
      fixture.persistence.urls
        .map((url) => url.url)
        .filter((url) =>
          url.startsWith('https://rendering-benchmark-0.example/'),
        )
        .toSorted(),
    )
  const stored = await readPersistenceV2Store<{ url: string }>(page, 'urls')
  expect(stored.map((url) => url.url).toSorted()).toEqual(
    fixture.persistence.urls.map((url) => url.url).toSorted(),
  )
})

const scenarios = [
  {
    mode: 'domain',
    cardType: 'domain',
    name: 'rendering-benchmark-19.example',
    cardCount: 20,
    urlCount: 50,
  },
  {
    mode: 'custom',
    cardType: 'project',
    name: 'Synthetic project 4',
    cardCount: 5,
    urlCount: 200,
  },
] as const

const tabToLink = async (page: Page, link: Locator) => {
  const focusOrder: string[] = []
  for (let stop = 0; stop < 20; stop += 1) {
    // Each key advances from the focus assigned by the previous key.
    // eslint-disable-next-line no-await-in-loop
    await page.keyboard.press('Tab')
    // eslint-disable-next-line no-await-in-loop
    const focused = await link.evaluate((node) => ({
      reached: node === document.activeElement,
      label:
        document.activeElement?.getAttribute('aria-label') ??
        document.activeElement?.getAttribute('href') ??
        document.activeElement?.tagName ??
        '',
    }))
    if (focused.reached) {
      return
    }
    focusOrder.push(focused.label)
  }
  await expect(link, `Tab focus order: ${focusOrder.join(' → ')}`).toBeFocused()
}

for (const { mode, cardType, name, cardCount, urlCount } of scenarios) {
  for (const size of [299, 300]) {
    test(`${mode} list has the expected display at ${size} saved URLs`, async ({
      extensionId,
      page,
      serviceWorker,
    }) => {
      await seedSavedTabsFixture(serviceWorker, createRenderingFixture(size))
      await page.goto(
        getExtensionUrl(extensionId, `app.html#/saved-tabs?mode=${mode}`),
      )
      await expect(
        page.getByRole('button', {
          name: `${size === 299 ? 'Collapse' : 'Expand'} "${name}"`,
          expanded: size === 299,
        }),
      ).toHaveCount(1)
      await expect(
        page.locator('a[href^="https://rendering-benchmark-"]'),
      ).toHaveCount(size === 299 ? size : 0)
    })
  }

  test(`large ${mode} lists expose search results and keyboard-accessible card contents`, async ({
    extensionId,
    page,
    serviceWorker,
  }, testInfo) => {
    const fixture = createRenderingFixture(1_000)
    const searchTitle = 'Strawberry lighthouse'
    fixture.persistence.urls = fixture.persistence.urls.map((url) =>
      url.id === 'url-999' ? { ...url, title: searchTitle } : url,
    )
    await seedSavedTabsFixture(serviceWorker, fixture)
    await page.goto(
      getExtensionUrl(extensionId, `app.html#/saved-tabs?mode=${mode}`),
    )
    const cards = page.locator(`[data-saved-tabs-scroll-target="${cardType}"]`)
    const card = cards.filter({ has: page.getByText(name, { exact: true }) })
    const rows = page.locator('a[href^="https://rendering-benchmark-"]')
    const expand = card.getByRole('button', {
      name: `Expand "${name}"`,
      expanded: false,
    })
    const collapse = card.getByRole('button', {
      name: /Collapse/u,
      expanded: true,
    })
    await expect(expand).toHaveCount(1)
    await expect(rows).toHaveCount(0)
    await assertNoAxeViolations(page, `large ${mode} list`)
    await page.screenshot({
      path: testInfo.outputPath('collapsed-saved-tabs.png'),
    })

    const search = page.getByRole('textbox', { name: 'Search', exact: true })
    await search.fill(searchTitle)
    const result = card.getByRole('link', { name: searchTitle })
    await expect(result).toBeVisible()
    await expect(rows).toHaveCount(1)
    await collapse.click()
    await expect(expand).toBeVisible()
    await expect(rows).toHaveCount(0)

    await search.clear()
    await expect(cards).toHaveCount(cardCount)
    await search.fill(searchTitle)
    await expect(result).toBeVisible()
    await expect(rows).toHaveCount(1)
    await search.clear()
    await expect(expand).toHaveCount(1)
    await expect(rows).toHaveCount(0)

    await card.getByRole('button', { name: /Default/u }).focus()
    await page.keyboard.press('Shift+Tab')
    await expect(expand).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(collapse).toBeFocused()
    const links = card.getByRole('link')
    // Custom can still show its cached search row while browse URLs load.
    await expect(links).toHaveCount(urlCount)
    await tabToLink(page, links.first())
    await collapse.press('Space')
    await expect(expand).toBeFocused()
    await expect(rows).toHaveCount(0)
  })
}

test('large domain lists still filter search results with parent categories hidden', async ({
  extensionId,
  page,
  serviceWorker,
}) => {
  const fixture = createRenderingFixture(1_000)
  await seedSavedTabsFixture(serviceWorker, {
    ...fixture,
    storage: createBaseSeed({
      userSettings: { ...defaultUserSettings, enableCategories: false },
    }),
  })
  await page.goto(
    getExtensionUrl(extensionId, 'app.html#/saved-tabs?mode=domain'),
  )
  await expect(
    page.getByRole('button', {
      name: 'Expand "rendering-benchmark-0.example"',
      expanded: false,
    }),
  ).toBeVisible()
  const search = page.getByRole('textbox', { name: 'Search', exact: true })
  await search.fill('Synthetic document 999')
  await expect(
    page.getByRole('link', { name: 'Synthetic document 999', exact: true }),
  ).toBeVisible()
  await expect(
    page.locator('a[href^="https://rendering-benchmark-"]'),
  ).toHaveCount(1)
})
