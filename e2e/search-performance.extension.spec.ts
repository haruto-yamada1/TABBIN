import { expect, getExtensionUrl, test } from './helpers/extension'
import { benchmarkSavedTabsSearch } from './helpers/search-performance'

for (const size of [1_000, 10_000]) {
  for (const mode of ['domain', 'custom'] as const) {
    test(`${mode} search latency with ${size} synthetic URLs`, async ({
      extensionId,
      page,
    }, testInfo) => {
      test.setTimeout(180_000)
      await benchmarkSavedTabsSearch(
        page,
        getExtensionUrl(extensionId, 'app.html'),
        size,
        mode,
        testInfo,
      )
      await expect(
        page.getByRole('link', { name: '深緑渓谷 RiverSong' }),
      ).toBeVisible()
    })
  }
}
