/* eslint-disable playwright/expect-expect -- shared scenario asserts live browser state, query count, exact URL matching, and persistence */
import { getFirefoxExtensionUrl, test } from './helpers/firefox-extension'
import { verifyOpenTabs } from './helpers/open-tabs'

for (const mode of ['domain', 'custom'] as const) {
  test(`Firefox ${mode} saved URLs follow live tabs and preserve saved data`, async ({
    firefoxExtensionContext,
    firefoxExtensionPage,
    firefoxExtensionUuid,
  }) => {
    await verifyOpenTabs({
      page: firefoxExtensionPage,
      context: firefoxExtensionContext,
      appUrl: getFirefoxExtensionUrl(firefoxExtensionUuid, 'app.html'),
      mode,
    })
  })
}
