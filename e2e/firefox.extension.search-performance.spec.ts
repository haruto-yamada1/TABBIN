import {
  expect,
  getFirefoxExtensionUrl,
  test,
} from './helpers/firefox-extension'
import { benchmarkSavedTabsSearch } from './helpers/search-performance'

for (const size of [1_000, 10_000]) {
  for (const mode of ['domain', 'custom'] as const) {
    test(`Firefox ${mode} search latency with ${size} synthetic URLs`, async ({
      firefoxExtensionPage,
      firefoxExtensionUuid,
    }, testInfo) => {
      test.setTimeout(180_000)
      await benchmarkSavedTabsSearch(
        firefoxExtensionPage,
        getFirefoxExtensionUrl(firefoxExtensionUuid, 'app.html'),
        size,
        mode,
        testInfo,
      )
      await expect(
        firefoxExtensionPage.getByRole('link', { name: '深緑渓谷 RiverSong' }),
      ).toBeVisible()
    })
  }
}
