/* eslint-disable playwright/expect-expect -- shared scenario asserts full URL, copy, keyboard focus, links and unchanged persistence */
import { getFirefoxExtensionUrl, test } from './helpers/firefox-extension'
import { verifySavedUrlDetails } from './helpers/saved-url-details'

test('Firefox saved URL details support keyboard, copying and narrow screens in both modes', async ({
  firefoxExtensionPage,
  firefoxExtensionUuid,
}, testInfo) => {
  await verifySavedUrlDetails(
    firefoxExtensionPage,
    getFirefoxExtensionUrl(firefoxExtensionUuid, 'app.html'),
    testInfo,
  )
})
