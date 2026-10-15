import { createEmptyPersistenceFixture } from '@/test/fixtures/persistenceBrowserFixtures'

import {
  verifyCrossContextSync,
  verifyMissedNotificationRecovery,
} from './helpers/cross-context-sync'
import {
  createBaseSeed,
  defaultUserSettings,
  expect,
  getExtensionUrl,
  readPersistenceV2SavedTabsSnapshot,
  seedSavedTabsFixture,
  test,
  triggerToolbarAction,
} from './helpers/extension'

test('open Saved Tabs views follow background delete and Options import without reload', async ({
  extensionContext,
  extensionId,
  page,
}, testInfo) => {
  const appUrl = getExtensionUrl(extensionId, 'app.html')
  await page.goto(`${appUrl}#/options`)
  const { domain } = await verifyCrossContextSync(
    extensionContext,
    page,
    appUrl,
  )
  await expect(domain.getByText('Imported Home', { exact: true })).toBeVisible()
  await domain.screenshot({
    path: testInfo.outputPath('imported-saved-tabs.png'),
  })
})

test('focus repairs a missed persistence notification without reload', async ({
  extensionContext,
  extensionId,
  page,
}) => {
  const appUrl = getExtensionUrl(extensionId, 'app.html')
  await page.goto(`${appUrl}#/options`)
  const domain = await verifyMissedNotificationRecovery(
    extensionContext,
    page,
    appUrl,
  )
  await expect(domain.getByText('Example Home', { exact: true })).toBeHidden()
})

test('reversed duplicate deliveries converge to the imported projection', async ({
  extensionContext,
  extensionId,
  page,
}) => {
  const appUrl = getExtensionUrl(extensionId, 'app.html')
  await page.goto(`${appUrl}#/options`)
  const { domain } = await verifyCrossContextSync(
    extensionContext,
    page,
    appUrl,
    'reversed',
  )
  await expect(domain.getByText('Imported Home', { exact: true })).toBeVisible()
})

test('toolbar save refreshes two open Saved Tabs pages while Options stays open', async ({
  extensionContext,
  extensionId,
  page,
  serviceWorker,
}) => {
  await seedSavedTabsFixture(serviceWorker, {
    persistence: createEmptyPersistenceFixture(),
    storage: createBaseSeed({
      userSettings: { ...defaultUserSettings, clickBehavior: 'saveCurrentTab' },
    }),
  })
  const savedTabsUrl = getExtensionUrl(extensionId, 'app.html#/saved-tabs')
  await page.goto(savedTabsUrl)
  const second = await extensionContext.newPage()
  const options = await extensionContext.newPage()
  await second.goto(savedTabsUrl)
  await options.goto(getExtensionUrl(extensionId, 'app.html#/options'))
  await expect(page.getByText('No saved tabs', { exact: true })).toBeVisible()
  await expect(second.getByText('No saved tabs', { exact: true })).toBeVisible()
  await extensionContext.route('https://sync.test/**', async (route) => {
    await route.fulfill({
      contentType: 'text/html',
      body: '<title>Saved through toolbar</title>',
    })
  })
  const external = await extensionContext.newPage()
  await external.goto('https://sync.test/saved')
  await external.bringToFront()
  await triggerToolbarAction(extensionContext, external, extensionId)
  await expect(
    page.getByText('Saved through toolbar', { exact: true }),
  ).toBeVisible()
  await expect(
    second.getByText('Saved through toolbar', { exact: true }),
  ).toBeVisible()
  await expect(options.getByRole('button', { name: /export/i })).toBeVisible()
  expect(
    (await readPersistenceV2SavedTabsSnapshot(serviceWorker)).urls,
  ).toMatchObject([{ url: 'https://sync.test/saved' }])
})
