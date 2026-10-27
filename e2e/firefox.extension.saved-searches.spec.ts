/* eslint-disable playwright/expect-expect -- shared scenario checks UI and persistence */
import { getFirefoxExtensionUrl, test } from './helpers/firefox-extension'
import { verifySavedSearches } from './helpers/saved-searches'

for (const mode of ['domain', 'custom'] as const) {
  test(`Firefox ${mode} saved search survives reload and can be applied, renamed, and deleted`, async ({
    firefoxExtensionPage: page,
    firefoxExtensionUuid,
  }, testInfo) => {
    await page.goto(
      getFirefoxExtensionUrl(firefoxExtensionUuid, 'options.html'),
    )
    await verifySavedSearches(
      {
        appUrl: getFirefoxExtensionUrl(firefoxExtensionUuid, 'app.html'),
        page,
        serviceWorker: page,
      },
      testInfo,
      mode,
    )
  })
}
