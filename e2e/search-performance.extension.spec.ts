import { expect, getExtensionUrl, test } from './helpers/extension'
import { benchmarkSavedTabsSearch } from './helpers/search-performance'

for (const { size, initiallyCollapsed } of [
  { size: 120, initiallyCollapsed: false },
  { size: 1_000, initiallyCollapsed: true },
  { size: 10_000, initiallyCollapsed: true },
]) {
  for (const mode of ['domain', 'custom'] as const) {
    test(`${mode} search latency with ${size} synthetic URLs`, async ({
      extensionId,
      page,
    }, testInfo) => {
      test.setTimeout(180_000)
      await benchmarkSavedTabsSearch(
        page,
        getExtensionUrl(extensionId, 'app.html'),
        { size, mode, initiallyCollapsed },
        testInfo,
      )
      await expect(
        page.getByRole('link', { name: '深緑渓谷 RiverSong' }),
      ).toBeVisible()
    })
  }
}
