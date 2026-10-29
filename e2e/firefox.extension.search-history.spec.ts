/* eslint-disable playwright/expect-expect -- shared scenario checks UI and persistence */
import { getFirefoxExtensionUrl, test } from './helpers/firefox-extension'
import { verifySearchHistory } from './helpers/search-history'

for (const mode of ['domain', 'custom'] as const) {
  test(`Firefox ${mode} search history follows input and survives reload`, async ({
    firefoxExtensionPage: page,
    firefoxExtensionUuid,
  }, testInfo) => {
    await page.goto(
      getFirefoxExtensionUrl(firefoxExtensionUuid, 'options.html'),
    )
    await verifySearchHistory(
      {
        page,
        serviceWorker: page,
        appUrl: getFirefoxExtensionUrl(firefoxExtensionUuid, 'app.html'),
      },
      mode,
      testInfo,
    )
  })
}
