import {
  createCustomCollectionFixture,
  createMembershipFixture,
  createUrlFixture,
} from '@/test/fixtures/persistenceBrowserFixtures'

import {
  createBaseSeed,
  defaultUserSettings,
  expect,
  getExtensionUrl,
  readPersistenceV2Store,
  seedSavedTabsFixture,
  test,
} from './helpers/extension'

for (const language of ['en', 'ja'] as const) {
  test(`custom bulk confirmations match the filtered URLs (${language})`, async ({
    page,
    extensionContext,
    extensionId,
    serviceWorker,
  }, testInfo) => {
    const now = Date.now()
    const urls = Array.from({ length: 20 }, (_, index) =>
      createUrlFixture(
        `url-${index}`,
        `https://example.com/${index}`,
        index < 11 ? `quartzneedle ${index}` : `unrelated ${index}`,
        now,
      ),
    )
    await extensionContext.route('https://example.com/**', async (route) => {
      await route.fulfill({ body: '<title>Opened fixture</title>' })
    })
    await seedSavedTabsFixture(serviceWorker, {
      persistence: {
        categories: [],
        collections: [
          createCustomCollectionFixture('project-1', 'Research', now),
        ],
        groups: [],
        memberships: urls.map(({ id }, index) =>
          createMembershipFixture('project-1', id, now, index),
        ),
        urls,
      },
      storage: createBaseSeed({
        userSettings: {
          ...defaultUserSettings,
          confirmDeleteAll: true,
          language,
          removeTabAfterOpen: false,
        },
        viewMode: 'custom',
      }),
    })
    await page.goto(
      getExtensionUrl(extensionId, 'app.html#/saved-tabs?mode=custom'),
    )
    await expect(page.getByTestId('project-url-item')).toHaveCount(20)
    const search = page.getByPlaceholder(language === 'ja' ? '検索' : 'Search')
    await search.fill('quartzneedle')
    await expect(page.getByTestId('project-url-item')).toHaveCount(11)

    await page
      .getByRole('button', {
        name: language === 'ja' ? 'すべてのタブを開く' : 'Open all tabs',
        exact: true,
      })
      .click()
    const openDialog = page.getByRole('alertdialog')
    await expect(openDialog).toHaveAccessibleDescription(
      language === 'ja'
        ? '「Research」のタブ11件を開きます。続行しますか？'
        : 'Open 11 tabs for "Research". Continue?',
    )
    const openScreenshot = testInfo.outputPath(`custom-open-${language}.png`)
    await page.screenshot({
      animations: 'disabled',
      fullPage: true,
      path: openScreenshot,
    })
    await testInfo.attach(`custom-open-confirm-${language}`, {
      path: openScreenshot,
      contentType: 'image/png',
    })
    await openDialog
      .getByRole('button', {
        name: language === 'ja' ? '開く' : 'Open',
        exact: true,
      })
      .click()
    await expect
      .poll(() =>
        extensionContext
          .pages()
          .map((openedPage) => openedPage.url())
          .filter((url) => url.startsWith('https://example.com/'))
          .toSorted(),
      )
      .toEqual(
        urls
          .slice(0, 11)
          .map(({ url }) => url)
          .toSorted(),
      )

    await page
      .getByRole('button', {
        name: language === 'ja' ? 'すべて削除' : 'Delete all',
        exact: true,
      })
      .click()
    const deleteDialog = page.getByRole('alertdialog')
    await expect(deleteDialog).toHaveAccessibleDescription(
      language === 'ja'
        ? '「Research」のタブ11件をすべて削除します。この操作は元に戻せません。'
        : 'Delete all 11 tabs in "Research". This action cannot be undone.',
    )
    const deleteScreenshot = testInfo.outputPath(
      `custom-delete-${language}.png`,
    )
    await page.screenshot({
      animations: 'disabled',
      fullPage: true,
      path: deleteScreenshot,
    })
    await testInfo.attach(`custom-delete-confirm-${language}`, {
      path: deleteScreenshot,
      contentType: 'image/png',
    })
    await deleteDialog
      .getByRole('button', {
        name: language === 'ja' ? '削除' : 'Delete',
        exact: true,
      })
      .click()
    await expect
      .poll(async () => {
        const memberships = await readPersistenceV2Store<{ urlId: string }>(
          serviceWorker,
          'collectionMemberships',
        )
        return memberships.map(({ urlId }) => urlId).toSorted()
      })
      .toEqual(
        urls
          .slice(11)
          .map(({ id }) => id)
          .toSorted(),
      )

    await page.reload()
    await expect(page.getByTestId('project-url-item')).toHaveCount(9)
  })
}
