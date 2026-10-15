import {
  verifyCrossContextSync,
  verifyMissedNotificationRecovery,
} from './helpers/cross-context-sync'
import {
  expect,
  getFirefoxExtensionUrl,
  test,
} from './helpers/firefox-extension'

test('Firefox open Saved Tabs views follow background delete and Options import without reload', async ({
  firefoxExtensionContext,
  firefoxExtensionPage,
  firefoxExtensionUuid,
}) => {
  const appUrl = getFirefoxExtensionUrl(firefoxExtensionUuid, 'app.html')
  await firefoxExtensionPage.goto(`${appUrl}#/options`)
  const { domain } = await verifyCrossContextSync(
    firefoxExtensionContext,
    firefoxExtensionPage,
    appUrl,
  )
  await expect(domain.getByText('Imported Home', { exact: true })).toBeVisible()
})

test('Firefox focus repairs a missed persistence notification without reload', async ({
  firefoxExtensionContext,
  firefoxExtensionPage,
  firefoxExtensionUuid,
}) => {
  const appUrl = getFirefoxExtensionUrl(firefoxExtensionUuid, 'app.html')
  await firefoxExtensionPage.goto(`${appUrl}#/options`)
  const domain = await verifyMissedNotificationRecovery(
    firefoxExtensionContext,
    firefoxExtensionPage,
    appUrl,
  )
  await expect(domain.getByText('Example Home', { exact: true })).toBeHidden()
})

test('Firefox reversed duplicate deliveries converge to the imported projection', async ({
  firefoxExtensionContext,
  firefoxExtensionPage,
  firefoxExtensionUuid,
}) => {
  const appUrl = getFirefoxExtensionUrl(firefoxExtensionUuid, 'app.html')
  await firefoxExtensionPage.goto(`${appUrl}#/options`)
  const { domain } = await verifyCrossContextSync(
    firefoxExtensionContext,
    firefoxExtensionPage,
    appUrl,
    'reversed',
  )
  await expect(domain.getByText('Imported Home', { exact: true })).toBeVisible()
})
