import {
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
  await expect(rows).toHaveCount(1_000, { timeout: 60_000 })
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
  await card.getByRole('button', { name: /Collapse/u }).click()
  await expect(rows).toHaveCount(950)
  await card.getByRole('button', { name: /Expand/u }).click()
  await expect
    .poll(async () =>
      rows.evaluateAll((links) =>
        links.map((link) => link.getAttribute('href') ?? '').toSorted(),
      ),
    )
    .toEqual(fixture.persistence.urls.map((url) => url.url).toSorted())
  const stored = await readPersistenceV2Store<{ url: string }>(page, 'urls')
  expect(stored.map((url) => url.url).toSorted()).toEqual(
    fixture.persistence.urls.map((url) => url.url).toSorted(),
  )
})
