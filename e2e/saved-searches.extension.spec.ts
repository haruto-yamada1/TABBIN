/* eslint-disable playwright/expect-expect -- shared scenario checks UI and persistence */
import {
  expect,
  getExtensionUrl,
  seedSavedTabsFixture,
  test,
} from './helpers/extension'
import {
  createSavedSearchFixture,
  verifySavedSearches,
} from './helpers/saved-searches'

for (const mode of ['domain', 'custom'] as const) {
  test(`${mode} saved search survives reload and can be applied, renamed, and deleted`, async ({
    extensionId,
    page,
    serviceWorker,
  }, testInfo) => {
    await verifySavedSearches(
      { appUrl: getExtensionUrl(extensionId, 'app.html'), page, serviceWorker },
      testInfo,
      mode,
    )
  })
}

test('simultaneous saves from two pages preserve both searches', async ({
  extensionContext,
  extensionId,
  page,
  serviceWorker,
}) => {
  await seedSavedTabsFixture(serviceWorker, createSavedSearchFixture())
  const second = await extensionContext.newPage()
  const url = getExtensionUrl(extensionId, 'app.html#/saved-tabs?mode=domain')
  await Promise.all([page.goto(url), second.goto(url)])
  await Promise.all(
    (
      [
        [page, 'Alpha', 'First'],
        [second, 'Beta', 'Second'],
      ] as const
    ).map(async ([view, query, name]) => {
      await view
        .getByRole('textbox', { name: 'Search', exact: true })
        .fill(query)
      await view
        .getByRole('button', { name: 'Saved searches', exact: true })
        .click()
      await view.getByRole('textbox', { name: 'Search name' }).fill(name)
    }),
  )
  await Promise.all(
    [page, second].map(async (view) => {
      await view
        .getByRole('button', { name: 'Save search', exact: true })
        .click()
    }),
  )
  await Promise.all(
    [page, second].map(async (view) => {
      await expect(
        view.getByRole('button', { name: 'Apply First', exact: true }),
      ).toBeVisible()
      await expect(
        view.getByRole('button', { name: 'Apply Second', exact: true }),
      ).toBeVisible()
    }),
  )
  await page.reload()
  await page
    .getByRole('button', { name: 'Saved searches', exact: true })
    .click()
  await expect(
    page.getByRole('button', { name: 'Apply First', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Apply Second', exact: true }),
  ).toBeVisible()
})
